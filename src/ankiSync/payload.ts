import { Card } from "src/Card";
import { CardType, QuestionText } from "src/Question";
import { CardListType, Deck } from "src/Deck";
import { TrackedFile, TrackedItem } from "src/dataStore/trackedFile";
import { CardQueue, RepetitionItem } from "src/dataStore/repetitionItem";
import { SRSettings } from "src/settings";
import { cyrb53, findLineIndexOfSearchStringIgnoringWs } from "src/util/utils";
import {
    AnkiModelKind,
    AnkiMediaFieldName,
    AnkiMediaReferenceCandidate,
    AnkiSyncItemState,
    BuiltSyroCardSnapshot,
    DEFAULT_ANKI_BASIC_MODEL_NAME,
    DEFAULT_ANKI_CLOZE_MODEL_NAME,
    DEFAULT_ANKI_MODEL_NAME,
    ReviewSnapshot,
    SyroAnkiCardPayload,
    SyroAnkiRenderSource,
} from "src/ankiSync/types";

const DEFAULT_FACTOR = 2500;
const SYRO_ANKI_DECK_ROOT = "Syro";
const DEFAULT_ANKI_DECK_SEGMENT = "default";
const HTML_IMG_SRC_REGEX = /<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/giu;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\((.+?)\)/gu;
const WIKILINK_IMAGE_REGEX = /!\[\[(.+?)\]\]/gu;

export interface AnkiPayloadTrackedFileStore {
    getTrackedFile(path: string): TrackedFile | null;
    getFileByID(fileID: string): TrackedFile | null;
}

export interface AnkiPayloadBuildContext {
    settings?: SRSettings;
    store?: AnkiPayloadTrackedFileStore | null;
    fileTextByPath?: Map<string, string> | null;
    vaultName?: string | null;
    hasAdvancedUri?: boolean;
}

interface RenderedPayloadFields {
    front: string;
    back: string;
    context: string;
    breadcrumb: string;
    source: string;
    openLink: string;
    exactLink: string;
    lineNo: number | null;
    warnings: string[];
    renderSource: SyroAnkiRenderSource;
}

type AnkiPayloadModelNames =
    | string
    | Partial<Record<AnkiModelKind, string>>;

interface BlockRenderContext {
    displayBlock: string;
    activeStart: number;
    activeEnd: number;
    cleanOffset: number;
    filePath: string;
    lineNo: number | null;
}

function normalizeText(value: string | null | undefined): string {
    return (value ?? "").trim();
}

function decodeHtmlAttribute(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function normalizeMediaTarget(value: string): string {
    const trimmed = normalizeText(value);
    if (!trimmed) {
        return "";
    }

    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
        return normalizeText(trimmed.slice(1, -1));
    }

    const titled = trimmed.match(/^(.*?)(?:\s+["'][^"']*["'])$/u);
    return normalizeText(titled?.[1] ?? trimmed);
}

function normalizeWikilinkTarget(value: string): string {
    return normalizeMediaTarget(value.split("|")[0] ?? "");
}

function normalizeDeckSegments(value: string | null | undefined): string[] {
    const raw = normalizeText(value).replace(/^#+/, "").replace(/\//g, "::");
    if (!raw) {
        return [];
    }

    return raw
        .split("::")
        .map((segment) => segment.trim())
        .filter(Boolean);
}

function buildSyroDeckName(segments: string[]): string {
    const normalizedSegments = segments.length > 0 ? [...segments] : [DEFAULT_ANKI_DECK_SEGMENT];
    while (
        normalizedSegments.length > 0 &&
        normalizedSegments[0].toLowerCase() === SYRO_ANKI_DECK_ROOT.toLowerCase()
    ) {
        normalizedSegments.shift();
    }

    return [
        SYRO_ANKI_DECK_ROOT,
        ...(normalizedSegments.length > 0 ? normalizedSegments : [DEFAULT_ANKI_DECK_SEGMENT]),
    ].join("::");
}

function buildDeckName(card: Card): string {
    const topicPath = card.question?.topicPathList?.list?.[0];
    if (topicPath?.path?.length) {
        return buildSyroDeckName(topicPath.path.flatMap((part) => normalizeDeckSegments(part)));
    }

    return buildSyroDeckName(normalizeDeckSegments(card.repetitionItem?.deckName));
}

function resolveFactor(item: RepetitionItem, itemState?: AnkiSyncItemState): number | null {
    if (!item) {
        return DEFAULT_FACTOR;
    }

    if (!item.isFsrs) {
        const rawEase = Number((item.data as Record<string, unknown>)?.ease ?? item.ease ?? 2.5);
        if (!Number.isNaN(rawEase) && rawEase > 0) {
            return Math.round(rawEase * 1000);
        }
    }

    return itemState?.lastRemoteSnapshot?.factor ?? DEFAULT_FACTOR;
}

function resolveInterval(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const scheduledDays = Number((item.data as Record<string, unknown>)?.scheduled_days ?? 0);
        return Number.isNaN(scheduledDays) ? 0 : scheduledDays;
    }

    return item.interval;
}

function resolveLapses(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const lapses = Number((item.data as Record<string, unknown>)?.lapses ?? 0);
        return Number.isNaN(lapses) ? 0 : lapses;
    }

    return Math.max(item.timesReviewed - item.timesCorrect, 0);
}

function resolveReps(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const reps = Number((item.data as Record<string, unknown>)?.reps ?? item.timesReviewed ?? 0);
        return Number.isNaN(reps) ? item.timesReviewed ?? 0 : reps;
    }

    return item.timesReviewed ?? 0;
}

function resolveSnapshotUpdatedAt(item: RepetitionItem, itemState?: AnkiSyncItemState): number {
    if (itemState?.lastLocalUpdatedAt) {
        return itemState.lastLocalUpdatedAt;
    }
    if (itemState?.lastRemoteUpdatedAt) {
        return itemState.lastRemoteUpdatedAt;
    }
    if ((item?.timesReviewed ?? 0) > 0) {
        return Date.now();
    }

    return 0;
}

function toDisplayLineNumber(lineNo: number | null | undefined): number | null {
    return lineNo != null && lineNo >= 0 ? lineNo + 1 : null;
}

export function createReviewSnapshotFromItem(
    item: RepetitionItem | null | undefined,
    itemState?: AnkiSyncItemState,
): ReviewSnapshot {
    const queue = item?.queue ?? CardQueue.New;
    const reps = resolveReps(item ?? null);
    const lapses = resolveLapses(item ?? null);

    return {
        queue,
        nextReview: item?.nextReview ?? 0,
        interval: resolveInterval(item ?? null),
        factor: resolveFactor(item ?? null, itemState),
        reps,
        lapses,
        timesReviewed: item?.timesReviewed ?? reps,
        timesCorrect: item?.timesCorrect ?? Math.max(reps - lapses, 0),
        errorStreak: item?.errorStreak ?? 0,
        updatedAt: resolveSnapshotUpdatedAt(item ?? null, itemState),
        source: "syro",
    };
}

function createSourceField(filePath: string, lineNo: number | null): string {
    const displayLine = toDisplayLineNumber(lineNo);
    return filePath && displayLine != null ? `${filePath}:L${displayLine}` : filePath;
}

function buildObsidianOpenLink(vaultName: string, filePath: string): string {
    return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}

function buildAdvancedUriLink(vaultName: string, filePath: string, lineNo: number | null): string {
    const displayLine = toDisplayLineNumber(lineNo);
    if (displayLine == null) {
        return "";
    }

    return `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}&line=${displayLine}`;
}

function createBreadcrumbField(filePath: string, lineNo: number | null): string {
    const displayLine = toDisplayLineNumber(lineNo);
    if (!filePath) {
        return displayLine != null ? `L${displayLine}` : "";
    }

    const parts = filePath
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
    const label = parts.length > 0 ? parts.join(" / ") : filePath;
    return displayLine != null ? `${label} · L${displayLine}` : label;
}

function createLinkFields(
    filePath: string,
    lineNo: number | null,
    buildContext?: AnkiPayloadBuildContext,
): { openLink: string; exactLink: string } {
    const vaultName = normalizeText(buildContext?.vaultName);
    if (!vaultName || !filePath) {
        return {
            openLink: "",
            exactLink: "",
        };
    }

    return {
        openLink: buildObsidianOpenLink(vaultName, filePath),
        exactLink: buildContext?.hasAdvancedUri
            ? buildAdvancedUriLink(vaultName, filePath, lineNo)
            : "",
    };
}

function collectMediaCandidates(
    regex: RegExp,
    markdown: string,
    fieldName: AnkiMediaFieldName,
    sourceType: AnkiMediaReferenceCandidate["sourceType"],
    normalize: (value: string) => string,
): AnkiMediaReferenceCandidate[] {
    const matches: AnkiMediaReferenceCandidate[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(markdown)) !== null) {
        const originalPath = normalize(match[2] ?? match[1] ?? "");
        if (!originalPath) {
            continue;
        }

        matches.push({
            fieldName,
            originalPath,
            index: match.index,
            sourceType,
        });
    }

    return matches;
}

export function extractMarkdownMediaReferenceCandidates(
    markdown: string,
    fieldName: AnkiMediaFieldName,
): AnkiMediaReferenceCandidate[] {
    const normalized = markdown ?? "";
    return [
        ...collectMediaCandidates(
            WIKILINK_IMAGE_REGEX,
            normalized,
            fieldName,
            "wikilink",
            normalizeWikilinkTarget,
        ),
        ...collectMediaCandidates(
            MARKDOWN_IMAGE_REGEX,
            normalized,
            fieldName,
            "markdown",
            normalizeMediaTarget,
        ),
        ...collectMediaCandidates(
            HTML_IMG_SRC_REGEX,
            normalized,
            fieldName,
            "html",
            (value) => normalizeMediaTarget(decodeHtmlAttribute(value)),
        ),
    ].sort((left, right) => left.index - right.index);
}

function escapeMediaPathSegment(value: string): string {
    return encodeURIComponent(value).replace(/%/g, "_");
}

export function buildAnkiMediaFilename(vaultPath: string): string {
    const normalizedSegments = normalizeText(vaultPath)
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map(escapeMediaPathSegment);

    return `syro__${normalizedSegments.length > 0 ? normalizedSegments.join("__") : "media"}`;
}

function createFallbackContextField(card: Card): string {
    const lines = card.question?.questionContext ?? [];
    return lines.join("\n").trim();
}

function createFallbackRenderedFields(
    card: Card,
    filePath: string,
    buildContext?: AnkiPayloadBuildContext,
    warning?: string,
): RenderedPayloadFields {
    const lineNo = card.question?.lineNo ?? null;
    const links = createLinkFields(filePath, lineNo, buildContext);
    return {
        front: normalizeText(card.front),
        back: normalizeText(card.back),
        context: createFallbackContextField(card),
        breadcrumb: createBreadcrumbField(filePath, lineNo),
        source: createSourceField(filePath, lineNo),
        openLink: links.openLink,
        exactLink: links.exactLink,
        lineNo,
        warnings: warning ? [warning] : [],
        renderSource: "fallback",
    };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function createCardHash(
    deckName: string,
    filePath: string,
    front: string,
    back: string,
    context: string,
    source: string,
    breadcrumb: string,
    openLink: string,
    exactLink: string,
): string {
    return cyrb53(
        JSON.stringify({
            deckName,
            filePath,
            front,
            back,
            context,
            source,
            breadcrumb,
            openLink,
            exactLink,
        }),
    );
}

function resolveFilePath(card: Card, buildContext?: AnkiPayloadBuildContext): string {
    const directPath = card.question?.note?.filePath;
    if (directPath) {
        return directPath;
    }

    const fileId = card.repetitionItem?.fileID;
    if (!fileId || !buildContext?.store?.getFileByID) {
        return "";
    }

    return buildContext.store.getFileByID(fileId)?.path ?? "";
}

function resolveItemOwnerFilePath(
    card: Card,
    buildContext?: AnkiPayloadBuildContext,
): string {
    const fileId = card.repetitionItem?.fileID;
    if (!fileId || !buildContext?.store?.getFileByID) {
        return "";
    }

    return buildContext.store.getFileByID(fileId)?.path ?? "";
}

function logPayloadOwnershipMismatch(
    card: Card,
    expectedFilePath: string,
    actualFilePath: string,
    buildContext?: AnkiPayloadBuildContext,
): void {
    if (!buildContext?.settings?.showRuntimeDebugMessages) {
        return;
    }

    console.warn(
        `[Syro-Anki] Skip payload for mismatched card binding: notePath=${expectedFilePath || "n/a"} actualFilePath=${
            actualFilePath || "n/a"
        } cardId=${card.repetitionItem?.ID ?? "n/a"} uuid=${card.repetitionItem?.uuid ?? "n/a"}`,
    );
}

function resolveTrackedFile(
    card: Card,
    filePath: string,
    buildContext?: AnkiPayloadBuildContext,
): TrackedFile | null {
    if (filePath && buildContext?.store?.getTrackedFile) {
        const trackedFile = buildContext.store.getTrackedFile(filePath);
        if (trackedFile) {
            return trackedFile;
        }
    }

    const fileId = card.repetitionItem?.fileID;
    if (fileId && buildContext?.store?.getFileByID) {
        return buildContext.store.getFileByID(fileId) ?? null;
    }

    return null;
}

function resolveFileText(
    card: Card,
    filePath: string,
    buildContext?: AnkiPayloadBuildContext,
): string | null {
    const noteText = (card.question?.note as { fileText?: string } | undefined)?.fileText;
    if (typeof noteText === "string" && noteText.length > 0) {
        return noteText;
    }

    if (!filePath) {
        return null;
    }

    return buildContext?.fileTextByPath?.get(filePath) ?? null;
}

function findTrackedItemByReviewId(
    trackedFile: TrackedFile | null,
    reviewId: number | null | undefined,
): TrackedItem | undefined {
    if (!trackedFile?.trackedItems || reviewId == null || reviewId < 0) {
        return undefined;
    }

    return trackedFile.trackedItems.find((item) => item.reviewId === reviewId);
}

function guessTrackedItemFromQuestion(card: Card, trackedFile: TrackedFile | null): TrackedItem | undefined {
    if (!trackedFile?.trackedItems?.length) {
        return undefined;
    }

    const lineNo = card.question?.lineNo;
    if (lineNo == null) {
        return undefined;
    }

    const sameLineItems = trackedFile.trackedItems.filter((item) => item.lineNo === lineNo);
    if (sameLineItems.length === 0) {
        return undefined;
    }

    return sameLineItems[Math.min(card.cardIdx ?? 0, sameLineItems.length - 1)];
}

function findTrackedItem(card: Card, trackedFile: TrackedFile | null): TrackedItem | undefined {
    return (
        findTrackedItemByReviewId(trackedFile, card.repetitionItem?.ID) ??
        guessTrackedItemFromQuestion(card, trackedFile)
    );
}

function normalizeBlockForRendering(
    blockText: string,
    settings?: SRSettings,
): { text: string; cleanOffset: number } {
    if (!settings) {
        return { text: blockText.trimEnd(), cleanOffset: 0 };
    }

    try {
        const [, actualQuestion] = QuestionText.splitText(blockText, settings);
        if (actualQuestion) {
            const cleanOffset = blockText.indexOf(actualQuestion);
            return {
                text: actualQuestion.trimEnd(),
                cleanOffset: cleanOffset >= 0 ? cleanOffset : 0,
            };
        }
    } catch {
        // Fall back to the raw block if QuestionText parsing fails.
    }

    return { text: blockText.trimEnd(), cleanOffset: 0 };
}

function resolveActiveRange(
    displayBlock: string,
    trackedItem: TrackedItem,
    cleanOffset: number,
): { start: number; end: number } | null {
    const start = trackedItem.span.startOffset - trackedItem.span.blockStartOffset - cleanOffset;
    const end = trackedItem.span.endOffset - trackedItem.span.blockStartOffset - cleanOffset;
    if (start >= 0 && end > start && end <= displayBlock.length) {
        return { start, end };
    }

    const fingerprint = normalizeText(trackedItem.fingerprint);
    if (!fingerprint) {
        return null;
    }

    const fallbackIndex = displayBlock.indexOf(fingerprint);
    if (fallbackIndex >= 0) {
        return { start: fallbackIndex, end: fallbackIndex + fingerprint.length };
    }

    return null;
}

function createBlockRenderContext(
    card: Card,
    trackedItem: TrackedItem,
    fileText: string,
    filePath: string,
    settings?: SRSettings,
): BlockRenderContext | null {
    const { blockStartOffset, blockEndOffset } = trackedItem.span;
    if (
        blockStartOffset < 0 ||
        blockEndOffset <= blockStartOffset ||
        blockEndOffset > fileText.length
    ) {
        return null;
    }

    const rawBlock = fileText.slice(blockStartOffset, blockEndOffset);
    const { text: displayBlock, cleanOffset } = normalizeBlockForRendering(rawBlock, settings);
    const activeRange = resolveActiveRange(displayBlock, trackedItem, cleanOffset);
    if (!displayBlock || !activeRange) {
        return null;
    }

    return {
        displayBlock,
        activeStart: activeRange.start,
        activeEnd: activeRange.end,
        cleanOffset,
        filePath,
        lineNo: trackedItem.lineNo ?? card.question?.lineNo ?? null,
    };
}

function isClozeType(cardType: CardType | null | undefined): boolean {
    return cardType === CardType.Cloze || cardType === CardType.AnkiCloze;
}

function resolveModelKind(card: Card): AnkiModelKind {
    return isClozeType(card.question?.questionType) ? "cloze" : "basic";
}

function resolveModelNames(modelNames?: AnkiPayloadModelNames): Record<AnkiModelKind, string> {
    if (typeof modelNames === "string") {
        return {
            basic: modelNames,
            cloze: DEFAULT_ANKI_CLOZE_MODEL_NAME,
        };
    }

    return {
        basic: modelNames?.basic || DEFAULT_ANKI_BASIC_MODEL_NAME,
        cloze: modelNames?.cloze || DEFAULT_ANKI_CLOZE_MODEL_NAME,
    };
}

function splitQuestionAnswer(
    blockText: string,
    cardType: CardType | null | undefined,
    settings: SRSettings,
): { question: string; answer: string } | null {
    if (cardType === CardType.SingleLineBasic || cardType === CardType.SingleLineReversed) {
        const separator =
            cardType === CardType.SingleLineReversed
                ? settings.singleLineReversedCardSeparator
                : settings.singleLineCardSeparator;
        const separatorIndex = blockText.indexOf(separator);
        if (separatorIndex < 0) {
            return null;
        }

        return {
            question: blockText.slice(0, separatorIndex),
            answer: blockText.slice(separatorIndex + separator.length),
        };
    }

    if (cardType === CardType.MultiLineBasic || cardType === CardType.MultiLineReversed) {
        const separator =
            cardType === CardType.MultiLineReversed
                ? settings.multilineReversedCardSeparator
                : settings.multilineCardSeparator;
        const lines = blockText.split(/\r?\n/);
        const separatorIndex = findLineIndexOfSearchStringIgnoringWs(lines, separator);
        if (separatorIndex < 0) {
            return null;
        }

        return {
            question: lines.slice(0, separatorIndex).join("\n"),
            answer: lines.slice(separatorIndex + 1).join("\n"),
        };
    }

    return null;
}

function replaceRange(text: string, start: number, end: number, replacement: string): string {
    return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function createMaskMarkup(): string {
    return '<span class="syro-anki-mask">[...]</span>';
}

function createAnswerMarkup(text: string): string {
    return `<span class="syro-anki-answer">${escapeHtml(text)}</span>`;
}

function createInactiveAnkiClozeMarkup(text: string): string {
    return `<span class="syro-anki-inline-cloze">${escapeHtml(text)}</span>`;
}

function shouldShowOtherAnkiClozeVisual(settings: SRSettings): boolean {
    return !settings.convertAnkiClozesToClozes || settings.showOtherAnkiClozeVisual;
}

function extractAnkiClozeInfos(text: string): Array<{ id: number; content: string; start: number; end: number }> {
    const infos: Array<{ id: number; content: string; start: number; end: number }> = [];
    const regex = /\{\{c(\d+)(?:::|：：)/gi;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const id = Number(match[1]);
        const start = match.index;
        const contentStart = start + match[0].length;
        let braceDepth = 0;
        let end = -1;

        for (let index = contentStart; index < text.length; index += 1) {
            if (braceDepth === 0 && text.startsWith("}}", index)) {
                end = index + 2;
                break;
            }
            if (text[index] === "{") {
                braceDepth += 1;
            } else if (text[index] === "}" && braceDepth > 0) {
                braceDepth -= 1;
            }
        }

        if (end !== -1) {
            infos.push({
                id,
                content: text.slice(contentStart, end - 2).replace(/(?:::|：：)[^:：]*$/u, ""),
                start,
                end,
            });
            regex.lastIndex = end;
        }
    }

    return infos;
}

function renderAnkiClozeText(
    renderContext: BlockRenderContext,
    trackedItem: TrackedItem,
): string | null {
    const clozeInfos = extractAnkiClozeInfos(renderContext.displayBlock);
    if (clozeInfos.length === 0) {
        return null;
    }

    const activeId = Number((trackedItem.clozeId ?? "").replace(/^c/i, ""));
    if (!activeId) {
        return null;
    }

    let text = "";
    let lastEnd = 0;
    for (const info of clozeInfos) {
        text += renderContext.displayBlock.slice(lastEnd, info.start);

        if (info.id === activeId) {
            text += `{{c1::${info.content}}}`;
        } else {
            text += info.content;
        }

        lastEnd = info.end;
    }

    text += renderContext.displayBlock.slice(lastEnd);
    return text.trim();
}

function resolveSiblingClozeItems(
    trackedFile: TrackedFile | null,
    trackedItem: TrackedItem,
): TrackedItem[] {
    const siblings = (trackedFile?.trackedItems ?? []).filter((candidate) => {
        if (!isClozeType(candidate.cardType)) {
            return false;
        }

        return (
            candidate.span.blockStartOffset === trackedItem.span.blockStartOffset &&
            candidate.span.blockEndOffset === trackedItem.span.blockEndOffset
        );
    });

    return siblings.sort((left, right) => left.span.startOffset - right.span.startOffset);
}

function resolveMarkerWrappedRange(
    displayBlock: string,
    renderContext: BlockRenderContext,
    trackedItem: TrackedItem,
): { start: number; end: number } {
    const localStart =
        trackedItem.span.startOffset - trackedItem.span.blockStartOffset - renderContext.cleanOffset;
    const localEnd =
        trackedItem.span.endOffset - trackedItem.span.blockStartOffset - renderContext.cleanOffset;

    let markerStart = localStart;
    let markerEnd = localEnd;
    const prefix = displayBlock.slice(Math.max(0, localStart - 2), localStart);
    const suffix = displayBlock.slice(localEnd, Math.min(displayBlock.length, localEnd + 2));

    if (trackedItem.clozeId?.startsWith("hl") && prefix === "==" && suffix === "==") {
        markerStart -= 2;
        markerEnd += 2;
    } else if (trackedItem.clozeId?.startsWith("bd") && prefix === "**" && suffix === "**") {
        markerStart -= 2;
        markerEnd += 2;
    }

    return {
        start: Math.max(0, markerStart),
        end: Math.min(displayBlock.length, markerEnd),
    };
}

function renderStandardClozeText(
    renderContext: BlockRenderContext,
    trackedItem: TrackedItem,
    siblingItems: TrackedItem[],
): string | null {
    if (!normalizeText(trackedItem.fingerprint)) {
        return null;
    }

    const items = siblingItems.length > 0 ? siblingItems : [trackedItem];
    let cursor = 0;
    let text = "";

    for (const item of items) {
        const range = resolveMarkerWrappedRange(renderContext.displayBlock, renderContext, item);
        text += renderContext.displayBlock.slice(cursor, range.start);
        const isActive =
            item === trackedItem ||
            (item.clozeId != null &&
                trackedItem.clozeId != null &&
                item.clozeId === trackedItem.clozeId &&
                item.span.startOffset === trackedItem.span.startOffset);
        text += isActive ? `{{c1::${item.fingerprint}}}` : item.fingerprint;
        cursor = range.end;
    }

    text += renderContext.displayBlock.slice(cursor);
    return text.trim();
}

function renderQaFields(
    card: Card,
    renderContext: BlockRenderContext,
    settings: SRSettings,
    cardType: CardType | null | undefined,
): { front: string; back: string } | null {
    const split = splitQuestionAnswer(renderContext.displayBlock, cardType, settings);
    if (split) {
        const isReverse =
            (cardType === CardType.SingleLineReversed || cardType === CardType.MultiLineReversed) &&
            (card.cardIdx ?? 0) % 2 === 1;
        const frontText = isReverse ? split.answer : split.question;
        const backText = isReverse ? split.question : split.answer;
        if (normalizeText(frontText) && normalizeText(backText)) {
            return {
                front: frontText.trim(),
                back: backText.trim(),
            };
        }
    }

    const answerText = renderContext.displayBlock.slice(
        renderContext.activeStart,
        renderContext.activeEnd,
    );
    if (!normalizeText(answerText) || !normalizeText(renderContext.displayBlock)) {
        return null;
    }

    return {
        front: renderContext.displayBlock.trim(),
        back: replaceRange(
            renderContext.displayBlock,
            renderContext.activeStart,
            renderContext.activeEnd,
            createAnswerMarkup(answerText),
        ),
    };
}

function buildLocatorRenderedFields(
    card: Card,
    trackedFile: TrackedFile,
    trackedItem: TrackedItem,
    fileText: string,
    filePath: string,
    settings: SRSettings,
    buildContext?: AnkiPayloadBuildContext,
): RenderedPayloadFields | null {
    const renderContext = createBlockRenderContext(card, trackedItem, fileText, filePath, settings);
    if (!renderContext) {
        return null;
    }

    const cardType = trackedItem.cardType ?? card.question?.questionType;
    const siblingItems = resolveSiblingClozeItems(trackedFile, trackedItem);
    const rendered =
        cardType === CardType.AnkiCloze
            ? (() => {
                  const text = renderAnkiClozeText(renderContext, trackedItem);
                  return text ? { front: text, back: "" } : null;
              })()
            : isClozeType(cardType)
              ? (() => {
                    const text = renderStandardClozeText(renderContext, trackedItem, siblingItems);
                    return text ? { front: text, back: "" } : null;
                })()
              : renderQaFields(card, renderContext, settings, cardType);
    if (!rendered) {
        return null;
    }

    const links = createLinkFields(renderContext.filePath, renderContext.lineNo, buildContext);

    return {
        front: rendered.front,
        back: rendered.back,
        context: renderContext.displayBlock.trim(),
        breadcrumb: createBreadcrumbField(renderContext.filePath, renderContext.lineNo),
        source: createSourceField(renderContext.filePath, renderContext.lineNo),
        openLink: links.openLink,
        exactLink: links.exactLink,
        lineNo: renderContext.lineNo,
        warnings: [],
        renderSource: "locator",
    };
}

function tryBuildLocatorRenderedFields(
    card: Card,
    filePath: string,
    buildContext?: AnkiPayloadBuildContext,
): RenderedPayloadFields | null {
    if (!buildContext?.settings || !buildContext.store?.getTrackedFile) {
        return null;
    }

    const trackedFile = resolveTrackedFile(card, filePath, buildContext);
    const fileText = resolveFileText(card, filePath, buildContext);
    if (!trackedFile || !fileText) {
        return null;
    }

    let trackedItem = findTrackedItem(card, trackedFile);
    let rendered = trackedItem
        ? buildLocatorRenderedFields(
              card,
              trackedFile,
              trackedItem,
              fileText,
              filePath,
              buildContext.settings,
              buildContext,
          )
        : null;
    if (rendered) {
        return rendered;
    }

    trackedFile.syncNoteCardsIndex(fileText, buildContext.settings);
    trackedItem = findTrackedItem(card, trackedFile);
    if (!trackedItem) {
        return null;
    }

    return buildLocatorRenderedFields(
        card,
        trackedFile,
        trackedItem,
        fileText,
        filePath,
        buildContext.settings,
        buildContext,
    );
}

function shouldWarnOnLocatorFallback(buildContext?: AnkiPayloadBuildContext): boolean {
    return !!buildContext?.settings && !!buildContext.store?.getTrackedFile;
}

function createLocatorFallbackWarning(card: Card, filePath: string, reason: string): string {
    const lineNo = card.question?.lineNo;
    const parts = [
        `path=${filePath || "unknown"}`,
        lineNo != null ? `line=${lineNo}` : null,
        `reason=${reason}`,
    ].filter(Boolean);
    return `locator fallback: ${parts.join(" ")}`;
}

function renderVisibleFields(
    card: Card,
    filePath: string,
    buildContext?: AnkiPayloadBuildContext,
): RenderedPayloadFields {
    const locatorRendered = tryBuildLocatorRenderedFields(card, filePath, buildContext);
    if (locatorRendered) {
        return locatorRendered;
    }

    const warning = shouldWarnOnLocatorFallback(buildContext)
        ? createLocatorFallbackWarning(card, filePath, "tracked item or locator span unavailable")
        : undefined;
    return createFallbackRenderedFields(card, filePath, buildContext, warning);
}

export function buildSyroAnkiCardPayload(
    card: Card,
    itemState?: AnkiSyncItemState,
    modelNames: AnkiPayloadModelNames = DEFAULT_ANKI_MODEL_NAME,
    buildContext?: AnkiPayloadBuildContext,
): SyroAnkiCardPayload | null {
    const item = card.repetitionItem;
    if (!item?.uuid) {
        return null;
    }

    const resolvedModelNames = resolveModelNames(modelNames);
    const modelKind = resolveModelKind(card);
    const modelName = resolvedModelNames[modelKind];
    const deckName = buildDeckName(card);
    const filePath = resolveFilePath(card, buildContext);
    const actualFilePath = resolveItemOwnerFilePath(card, buildContext);
    if (filePath && actualFilePath && filePath !== actualFilePath) {
        logPayloadOwnershipMismatch(card, filePath, actualFilePath, buildContext);
        return null;
    }

    const renderedFields = renderVisibleFields(card, filePath, buildContext);
    const snapshot = createReviewSnapshotFromItem(item, itemState);
    const cardHash = createCardHash(
        deckName,
        filePath,
        renderedFields.front,
        renderedFields.back,
        renderedFields.context,
        renderedFields.source,
        renderedFields.breadcrumb,
        renderedFields.openLink,
        renderedFields.exactLink,
    );

    return {
        itemUuid: item.uuid,
        deckName,
        modelName,
        modelKind,
        filePath,
        front: renderedFields.front,
        back: renderedFields.back,
        context: renderedFields.context,
        breadcrumb: renderedFields.breadcrumb,
        source: renderedFields.source,
        openLink: renderedFields.openLink,
        exactLink: renderedFields.exactLink,
        lineNo: renderedFields.lineNo,
        warnings: renderedFields.warnings,
        renderSource: renderedFields.renderSource,
        mediaRefs: [],
        cardHash,
        snapshot,
        fields:
            modelKind === "cloze"
                ? {
                      Text: renderedFields.front,
                      "Back Extra": renderedFields.context,
                      Source: renderedFields.source,
                      Breadcrumb: renderedFields.breadcrumb,
                      OpenLink: renderedFields.openLink,
                      ExactLink: renderedFields.exactLink,
                      syro_item_uuid: item.uuid,
                      syro_file_path: filePath,
                      syro_card_hash: cardHash,
                      syro_snapshot: JSON.stringify(snapshot),
                      syro_updated_at: String(snapshot.updatedAt),
                  }
                : {
                      Front: renderedFields.front,
                      Back: renderedFields.back,
                      Context: renderedFields.context,
                      Source: renderedFields.source,
                      Breadcrumb: renderedFields.breadcrumb,
                      OpenLink: renderedFields.openLink,
                      ExactLink: renderedFields.exactLink,
                      syro_item_uuid: item.uuid,
                      syro_file_path: filePath,
                      syro_card_hash: cardHash,
                      syro_snapshot: JSON.stringify(snapshot),
                      syro_updated_at: String(snapshot.updatedAt),
                  },
    };
}

export function buildSyroAnkiCardSnapshotMap(
    deckTree: Deck,
    itemStates: Record<string, AnkiSyncItemState>,
    modelNames: AnkiPayloadModelNames = DEFAULT_ANKI_MODEL_NAME,
    buildContext?: AnkiPayloadBuildContext,
): Map<string, BuiltSyroCardSnapshot> {
    const cards = deckTree.getFlattenedCardArray(CardListType.All, true);
    const result = new Map<string, BuiltSyroCardSnapshot>();
    const seenCards = new Set<Card>();

    for (const card of cards) {
        if (seenCards.has(card)) {
            continue;
        }
        seenCards.add(card);

        const itemUuid = card.repetitionItem?.uuid;
        if (!itemUuid) {
            continue;
        }

        const payload = buildSyroAnkiCardPayload(
            card,
            itemStates[itemUuid],
            modelNames,
            buildContext,
        );
        if (!payload) {
            continue;
        }

        result.set(itemUuid, { payload, card });
    }

    return result;
}
