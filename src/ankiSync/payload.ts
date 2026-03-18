import { Card } from "src/Card";
import { CardType, QuestionText } from "src/Question";
import { CardListType, Deck } from "src/Deck";
import { TrackedFile, TrackedItem } from "src/dataStore/trackedFile";
import { CardQueue, RepetitionItem } from "src/dataStore/repetitionItem";
import { SRSettings } from "src/settings";
import { cyrb53, findLineIndexOfSearchStringIgnoringWs } from "src/util/utils";
import {
    AnkiSyncItemState,
    BuiltSyroCardSnapshot,
    DEFAULT_ANKI_MODEL_NAME,
    ReviewSnapshot,
    SyroAnkiCardPayload,
    SyroAnkiRenderSource,
} from "src/ankiSync/types";

const DEFAULT_FACTOR = 2500;
const SYRO_ANKI_DECK_ROOT = "Syro";
const DEFAULT_ANKI_DECK_SEGMENT = "default";

export interface AnkiPayloadTrackedFileStore {
    getTrackedFile(path: string): TrackedFile | null;
    getFileByID(fileID: string): TrackedFile | null;
}

export interface AnkiPayloadBuildContext {
    settings?: SRSettings;
    store?: AnkiPayloadTrackedFileStore | null;
    fileTextByPath?: Map<string, string> | null;
}

interface RenderedPayloadFields {
    front: string;
    back: string;
    context: string;
    source: string;
    lineNo: number | null;
    warnings: string[];
    renderSource: SyroAnkiRenderSource;
}

interface BlockRenderContext {
    displayBlock: string;
    activeStart: number;
    activeEnd: number;
    filePath: string;
    lineNo: number | null;
}

function normalizeText(value: string | null | undefined): string {
    return (value ?? "").trim();
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
    return filePath && lineNo != null && lineNo > 0 ? `${filePath}:L${lineNo}` : filePath;
}

function createFallbackContextField(card: Card): string {
    const lines = card.question?.questionContext ?? [];
    return lines.join("\n").trim();
}

function createFallbackRenderedFields(card: Card, filePath: string, warning?: string): RenderedPayloadFields {
    const lineNo = card.question?.lineNo ?? null;
    return {
        front: normalizeText(card.front),
        back: normalizeText(card.back),
        context: createFallbackContextField(card),
        source: createSourceField(filePath, lineNo),
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

function renderPlainText(text: string): string {
    return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function renderWithReplacement(
    text: string,
    start: number,
    end: number,
    replacementHtml: string,
): string {
    return `${renderPlainText(text.slice(0, start))}${replacementHtml}${renderPlainText(text.slice(end))}`;
}

function createCardHash(
    deckName: string,
    filePath: string,
    front: string,
    back: string,
    context: string,
    source: string,
): string {
    return cyrb53(
        JSON.stringify({
            deckName,
            filePath,
            front,
            back,
            context,
            source,
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
        filePath,
        lineNo: trackedItem.lineNo ?? card.question?.lineNo ?? null,
    };
}

function isClozeType(cardType: CardType | null | undefined): boolean {
    return cardType === CardType.Cloze || cardType === CardType.AnkiCloze;
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

function renderClozeFields(renderContext: BlockRenderContext): { front: string; back: string } | null {
    const answerText = renderContext.displayBlock.slice(
        renderContext.activeStart,
        renderContext.activeEnd,
    );
    if (!normalizeText(answerText)) {
        return null;
    }

    return {
        front: renderWithReplacement(
            renderContext.displayBlock,
            renderContext.activeStart,
            renderContext.activeEnd,
            '<span class="syro-anki-mask">[...]</span>',
        ),
        back: renderWithReplacement(
            renderContext.displayBlock,
            renderContext.activeStart,
            renderContext.activeEnd,
            `<mark>${renderPlainText(answerText)}</mark>`,
        ),
    };
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
                front: renderPlainText(frontText.trim()),
                back: renderPlainText(backText.trim()),
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
        front: renderPlainText(renderContext.displayBlock.trim()),
        back: renderWithReplacement(
            renderContext.displayBlock,
            renderContext.activeStart,
            renderContext.activeEnd,
            `<mark>${renderPlainText(answerText)}</mark>`,
        ),
    };
}

function buildLocatorRenderedFields(
    card: Card,
    trackedItem: TrackedItem,
    fileText: string,
    filePath: string,
    settings: SRSettings,
): RenderedPayloadFields | null {
    const renderContext = createBlockRenderContext(card, trackedItem, fileText, filePath, settings);
    if (!renderContext) {
        return null;
    }

    const cardType = trackedItem.cardType ?? card.question?.questionType;
    const rendered = isClozeType(cardType)
        ? renderClozeFields(renderContext)
        : renderQaFields(card, renderContext, settings, cardType);
    if (!rendered) {
        return null;
    }

    return {
        front: rendered.front,
        back: rendered.back,
        context: renderPlainText(renderContext.displayBlock.trim()),
        source: renderPlainText(createSourceField(renderContext.filePath, renderContext.lineNo)),
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
        ? buildLocatorRenderedFields(card, trackedItem, fileText, filePath, buildContext.settings)
        : null;
    if (rendered) {
        return rendered;
    }

    trackedFile.syncNoteCardsIndex(fileText, buildContext.settings);
    trackedItem = findTrackedItem(card, trackedFile);
    if (!trackedItem) {
        return null;
    }

    return buildLocatorRenderedFields(card, trackedItem, fileText, filePath, buildContext.settings);
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
    return createFallbackRenderedFields(card, filePath, warning);
}

export function buildSyroAnkiCardPayload(
    card: Card,
    itemState?: AnkiSyncItemState,
    modelName = DEFAULT_ANKI_MODEL_NAME,
    buildContext?: AnkiPayloadBuildContext,
): SyroAnkiCardPayload | null {
    const item = card.repetitionItem;
    if (!item?.uuid) {
        return null;
    }

    const deckName = buildDeckName(card);
    const filePath = resolveFilePath(card, buildContext);
    const renderedFields = renderVisibleFields(card, filePath, buildContext);
    const snapshot = createReviewSnapshotFromItem(item, itemState);
    const cardHash = createCardHash(
        deckName,
        filePath,
        renderedFields.front,
        renderedFields.back,
        renderedFields.context,
        renderedFields.source,
    );

    return {
        itemUuid: item.uuid,
        deckName,
        modelName,
        filePath,
        front: renderedFields.front,
        back: renderedFields.back,
        context: renderedFields.context,
        source: renderedFields.source,
        lineNo: renderedFields.lineNo,
        warnings: renderedFields.warnings,
        renderSource: renderedFields.renderSource,
        cardHash,
        snapshot,
        fields: {
            Front: renderedFields.front,
            Back: renderedFields.back,
            Context: renderedFields.context,
            Source: renderedFields.source,
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
    modelName = DEFAULT_ANKI_MODEL_NAME,
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

        const payload = buildSyroAnkiCardPayload(card, itemStates[itemUuid], modelName, buildContext);
        if (!payload) {
            continue;
        }

        result.set(itemUuid, { payload, card });
    }

    return result;
}
