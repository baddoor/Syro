import { Card } from "src/Card";
import { CardListType, Deck } from "src/Deck";
import { NoteCardScheduleParser } from "src/CardSchedule";
import { MarkdownRenderer, TFile } from "obsidian";
import { DataStore } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { CardQueue, RPITEMTYPE, RepetitionItem } from "src/dataStore/repetitionItem";
import { SRSettings } from "src/settings";
import { AnkiConnectClient } from "src/ankiSync/AnkiConnectClient";
import {
    buildAnkiMediaFilename,
    buildSyroAnkiCardSnapshotMap,
    createReviewSnapshotFromItem,
    extractMarkdownMediaReferenceCandidates,
} from "src/ankiSync/payload";
import { chooseLatestSnapshot, areSnapshotsEquivalent, planAnkiSyncOperations } from "src/ankiSync/planner";
import { AnkiSyncStateStore, ensureAnkiSyncItemState, pruneAnkiSyncState } from "src/ankiSync/stateStore";
import {
    AnkiBinaryMediaAsset,
    AnkiCanAddNoteResult,
    AnkiCardInfo,
    AnkiMediaFieldName,
    AnkiMediaReference,
    AnkiMediaReferenceCandidate,
    AnkiNoteInfo,
    AnkiSyncPhase,
    AnkiSyncPlanOperation,
    AnkiSyncProgress,
    AnkiRemoteRecord,
    AnkiSyncRunOptions,
    AnkiSyncItemState,
    AnkiSyncRunResult,
    AnkiSyncStateFile,
    BuiltSyroCardSnapshot,
    DEFAULT_ANKI_DELETE_POLICY,
    DEFAULT_ANKI_MODEL_NAME,
    DEFAULT_ANKI_SYNC_ENDPOINT,
    ReviewSnapshot,
    createEmptyRunResult,
} from "src/ankiSync/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DETACHED_DECK_NAME = "Syro::Detached";
const REMOTE_DISCOVERY_QUERY = "tag:syro-sync";
const ANKI_SUSPENDED_QUEUE = -1;
const ANKI_SCHED_BURIED_QUEUE = -2;
const ANKI_USER_BURIED_QUEUE = -3;

export interface AnkiSyncPluginAdapter {
    data: { settings: SRSettings };
    app?: {
        vault?: {
            getName?: () => string;
            configDir?: string;
            getAbstractFileByPath?: (path: string) => unknown;
            adapter?: {
                readBinary?: (path: string) => Promise<ArrayBuffer>;
            };
        };
        metadataCache?: {
            getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => TFile | null;
        };
    };
    manifest: { dir?: string };
    store: DataStore;
}

interface AnkiSyncServiceDeps {
    clientFactory?: (endpoint: string) => AnkiConnectClient;
    stateStore?: AnkiSyncStateStore;
    now?: () => number;
}

interface PreparedCreateNote {
    op: AnkiSyncPlanOperation;
    noteInput: Record<string, unknown>;
}

interface RenderedFieldResult {
    html: string;
    mediaRefs: AnkiMediaReference[];
    warnings: string[];
}

interface SnapshotChoice {
    snapshot: ReviewSnapshot | null;
    source: string | null;
}

interface NumericChoice {
    value: number;
    source: string | null;
}

interface ReviewDueOffsetCandidateResult {
    candidate: number | null;
    reason: "not-review-queue" | "missing-due" | "missing-baseline-next-review" | "baseline-available";
    calibrationSource: number;
    calibrationSourceLabel: string | null;
    baselineDue: number | null;
    dueSource: number | null;
    missingBaselineState: "new-card-without-baseline" | "baseline-state-missing" | "no-snapshot-history" | null;
}

interface DueComparisonCardRef {
    itemUuid: string;
    noteId: number;
    cardId: number;
    deckName: string;
    filePath: string;
    cardHash: string;
    frontPreview: string;
}

interface DueComparisonRow {
    card: DueComparisonCardRef;
    ankiDue: boolean | null;
    ankiQueue: number | null;
    ankiType: number | null;
    ankiDueValue: number | null;
    ankiInterval: number | null;
    syroDue: boolean | null;
    syroQueue: number | null;
    syroNextReview: number | null;
    reviewDueOffset: number | null;
    candidateReason: ReviewDueOffsetCandidateResult["reason"] | null;
    missingBaselineState: ReviewDueOffsetCandidateResult["missingBaselineState"] | null;
    remoteSnapshotSource: ReviewSnapshot["source"] | null;
    applied: boolean;
    decision: string;
    analysis: string[];
}

function safeJsonParse<T>(value: string | null | undefined): T | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function createPendingId(itemUuid: string, now: number): string {
    return `${itemUuid}:${now}`;
}

function truncateText(value: string, maxLength = 80): string {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function chunkArray<T>(values: T[], chunkSize = 25): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        result.push(values.slice(index, index + chunkSize));
    }
    return result;
}

function isBuriedQueue(queue: number | null | undefined): boolean {
    return queue === ANKI_SCHED_BURIED_QUEUE || queue === ANKI_USER_BURIED_QUEUE;
}

function isRemoteUrl(value: string): boolean {
    return /^(?:https?:|data:|ftp:|mailto:)/i.test(value);
}

function normalizeVaultPath(value: string): string {
    const normalized = value.replace(/\\/g, "/");
    const segments = normalized
        .split("/")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0 && segment !== ".");
    const resolved: string[] = [];

    for (const segment of segments) {
        if (segment === "..") {
            resolved.pop();
            continue;
        }

        resolved.push(segment);
    }

    return resolved.join("/");
}

function dirname(filePath: string): string {
    const normalized = normalizeVaultPath(filePath);
    const segments = normalized.split("/");
    segments.pop();
    return segments.join("/");
}

function joinVaultPath(baseDir: string, target: string): string {
    const normalizedTarget = target.replace(/\\/g, "/");
    if (normalizedTarget.startsWith("/")) {
        return normalizeVaultPath(normalizedTarget.slice(1));
    }
    return normalizeVaultPath(baseDir ? `${baseDir}/${normalizedTarget}` : normalizedTarget);
}

function getAbstractPath(value: unknown): string | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const path = (value as { path?: unknown }).path;
    return typeof path === "string" && path.length > 0 ? path : null;
}

function toCardQueue(value: number): CardQueue {
    if (value === CardQueue.Learn || value === CardQueue.Review || value === ANKI_SUSPENDED_QUEUE) {
        return value as CardQueue;
    }

    return CardQueue.New;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function createMaskMarkup(label = "[...]"): string {
    return `<span class="syro-anki-mask">${escapeHtml(label)}</span>`;
}

function createAnswerMarkup(value: string): string {
    return `<span class="syro-anki-answer">${escapeHtml(value)}</span>`;
}

export class AnkiSyncService {
    private readonly clientFactory: (endpoint: string) => AnkiConnectClient;
    private readonly stateStore: AnkiSyncStateStore;
    private readonly now: () => number;
    private state: AnkiSyncStateFile | null = null;

    constructor(
        private readonly plugin: AnkiSyncPluginAdapter,
        deps: AnkiSyncServiceDeps = {},
    ) {
        this.clientFactory = deps.clientFactory ?? ((endpoint) => new AnkiConnectClient(endpoint));
        this.stateStore =
            deps.stateStore ?? new AnkiSyncStateStore(() => this.plugin.store?.dataPath ?? "");
        this.now = deps.now ?? (() => Date.now());
    }

    async initialize(): Promise<void> {
        this.state = await this.stateStore.load();
    }

    private logRuntimeDebug(...args: unknown[]): void {
        if (this.plugin.data.settings.showRuntimeDebugMessages) {
            console.log(...args);
        }
    }

    private summarizeSnapshot(snapshot: ReviewSnapshot | null | undefined): Record<string, unknown> | null {
        if (!snapshot) {
            return null;
        }

        const raw = snapshot.raw ?? {};
        return {
            source: snapshot.source,
            queue: snapshot.queue,
            nextReview: snapshot.nextReview,
            interval: snapshot.interval,
            reps: snapshot.reps,
            lapses: snapshot.lapses,
            updatedAt: snapshot.updatedAt,
            dueValue: snapshot.dueValue ?? null,
            rawQueue: toNumber((raw as Record<string, unknown>).queue, Number.NaN),
            rawType: toNumber((raw as Record<string, unknown>).type, Number.NaN),
            rawDue: toNumber((raw as Record<string, unknown>).due, Number.NaN),
        };
    }

    private summarizeCardInfo(cardInfo: AnkiCardInfo | null | undefined): Record<string, unknown> | null {
        if (!cardInfo) {
            return null;
        }

        return {
            cardId: cardInfo.cardId,
            noteId: cardInfo.noteId,
            queue: cardInfo.queue,
            type: cardInfo.type,
            due: cardInfo.due,
            interval: cardInfo.interval,
            reps: cardInfo.reps,
            lapses: cardInfo.lapses,
            mod: cardInfo.mod,
        };
    }

    private buildDueComparisonCardRef(
        itemUuid: string,
        mapping: NonNullable<AnkiSyncItemState["mapping"]>,
        builtSnapshot: BuiltSyroCardSnapshot | undefined,
    ): DueComparisonCardRef {
        return {
            itemUuid,
            noteId: mapping.noteId,
            cardId: mapping.cardId,
            deckName: mapping.deckName ?? "unknown",
            filePath: mapping.filePath ?? "",
            cardHash: mapping.cardHash ?? "",
            frontPreview: truncateText(builtSnapshot?.card?.front ?? ""),
        };
    }

    private summarizeDueCard(row: DueComparisonRow): Record<string, unknown> {
        return {
            itemUuid: row.card.itemUuid,
            noteId: row.card.noteId,
            cardId: row.card.cardId,
            filePath: row.card.filePath,
            cardHash: row.card.cardHash,
            frontPreview: row.card.frontPreview,
        };
    }

    private analyzeDueMismatch(row: DueComparisonRow): string[] {
        const analysis: string[] = [];
        if (row.ankiDue === row.syroDue) {
            return analysis;
        }

        if (row.candidateReason === "missing-baseline-next-review") {
            analysis.push("reviewDueOffset 缺少可用 baseline，review due 天数无法可靠换算。");
        }
        if (row.remoteSnapshotSource === "anki-hidden") {
            analysis.push("远端隐藏 snapshot 被选为最新状态，可能覆盖了 cardSnapshot。");
        }
        if (row.decision === "stale-pull-cursor") {
            analysis.push("远端更新被 lastPullCursor 跳过。");
        }
        if (row.decision === "remote-not-newer-than-local-baseline") {
            analysis.push("远端更新未超过本地 baseline.updatedAt。");
        }
        if (row.decision === "local-item-missing") {
            analysis.push("本地 item 未找到，无法将远端状态应用到 Syro。");
        }
        if (row.applied && row.syroNextReview !== null && row.syroNextReview > 0 && row.ankiDue !== row.syroDue) {
            analysis.push("本地 nextReview 已更新，但最终 due 判定仍与 Anki 不一致。");
        }
        if (analysis.length === 0) {
            analysis.push("未命中已知异常路径，需要继续检查该卡的 schedule 计算。");
        }

        return analysis;
    }

    private buildDueComparisonRow(
        itemUuid: string,
        mapping: NonNullable<AnkiSyncItemState["mapping"]>,
        builtSnapshot: BuiltSyroCardSnapshot | undefined,
        cardInfo: AnkiCardInfo,
        itemState: AnkiSyncItemState,
        ankiDue: boolean | null,
        candidateResult: ReviewDueOffsetCandidateResult | null,
        remoteSnapshot: ReviewSnapshot | null,
        item: RepetitionItem | null,
        decision: string,
        applied: boolean,
        reviewDueOffset: number | null,
    ): DueComparisonRow {
        const row: DueComparisonRow = {
            card: this.buildDueComparisonCardRef(itemUuid, mapping, builtSnapshot),
            ankiDue,
            ankiQueue: cardInfo.queue ?? null,
            ankiType: cardInfo.type ?? null,
            ankiDueValue: cardInfo.due ?? null,
            ankiInterval: cardInfo.interval ?? null,
            syroDue: item ? item.isDue : null,
            syroQueue: item?.queue ?? null,
            syroNextReview: item?.nextReview ?? null,
            reviewDueOffset,
            candidateReason: candidateResult?.reason ?? null,
            missingBaselineState: candidateResult?.missingBaselineState ?? null,
            remoteSnapshotSource: remoteSnapshot?.source ?? itemState.lastRemoteSnapshot?.source ?? null,
            applied,
            decision,
            analysis: [],
        };
        row.analysis = this.analyzeDueMismatch(row);
        return row;
    }

    private emitDueComparisonReport(
        rows: DueComparisonRow[],
        unmappedByDeck: Map<string, number>,
        result: AnkiSyncRunResult,
    ): void {
        const groupedRows = new Map<string, DueComparisonRow[]>();
        for (const row of rows) {
            const deckName = row.card.deckName || "unknown";
            if (!groupedRows.has(deckName)) {
                groupedRows.set(deckName, []);
            }
            groupedRows.get(deckName)!.push(row);
        }

        for (const [deckName, deckRows] of groupedRows.entries()) {
            const mismatchRows = deckRows.filter(
                (row) => row.ankiDue !== null && row.syroDue !== null && row.ankiDue !== row.syroDue,
            );
            if (mismatchRows.length === 0) {
                continue;
            }

            const ankiDue = deckRows.filter((row) => row.ankiDue === true).map((row) => this.summarizeDueCard(row));
            const ankiNotDue = deckRows.filter((row) => row.ankiDue === false).map((row) => this.summarizeDueCard(row));
            const syroDue = deckRows.filter((row) => row.syroDue === true).map((row) => this.summarizeDueCard(row));
            const syroNotDue = deckRows.filter((row) => row.syroDue === false).map((row) => this.summarizeDueCard(row));
            const unmapped = unmappedByDeck.get(deckName) ?? 0;

            this.logRuntimeDebug("[Syro-Anki][Compare][Deck]", {
                deckName,
                mapped: deckRows.length,
                unmapped,
                ankiDue,
                ankiNotDue,
                syroDue,
                syroNotDue,
                mismatch: mismatchRows.map((row) => ({
                    ...this.summarizeDueCard(row),
                    ankiDue: row.ankiDue,
                    syroDue: row.syroDue,
                    decision: row.decision,
                })),
            });

            for (const row of mismatchRows) {
                this.logRuntimeDebug("[Syro-Anki][Compare][Mismatch]", {
                    deckName,
                    ...this.summarizeDueCard(row),
                    anki: {
                        due: row.ankiDue,
                        queue: row.ankiQueue,
                        type: row.ankiType,
                        dueValue: row.ankiDueValue,
                        interval: row.ankiInterval,
                    },
                    syro: {
                        due: row.syroDue,
                        queue: row.syroQueue,
                        nextReview: row.syroNextReview,
                    },
                    reviewDueOffset: row.reviewDueOffset,
                    candidateReason: row.candidateReason,
                    missingBaselineState: row.missingBaselineState,
                    remoteSnapshotSource: row.remoteSnapshotSource,
                    applied: row.applied,
                    decision: row.decision,
                    analysis: row.analysis,
                });
            }

            result.errors.push(
                `[compare:${deckName}] mismatch=${mismatchRows.length} ankiDue=${ankiDue.length} syroDue=${syroDue.length} unmapped=${unmapped}`,
            );
        }
    }

    private chooseSnapshotByPriority(...choices: Array<[string, ReviewSnapshot | null | undefined]>): SnapshotChoice {
        for (const [source, snapshot] of choices) {
            if (snapshot) {
                return { snapshot, source };
            }
        }

        return { snapshot: null, source: null };
    }

    private resolveMissingBaselineState(
        snapshots: Array<ReviewSnapshot | null | undefined>,
    ): "new-card-without-baseline" | "baseline-state-missing" | "no-snapshot-history" {
        const existingSnapshots = snapshots.filter((snapshot): snapshot is ReviewSnapshot => !!snapshot);
        if (existingSnapshots.length === 0) {
            return "no-snapshot-history";
        }

        const allLookNew = existingSnapshots.every((snapshot) => {
            const rawQueue = toNumber(snapshot.raw?.queue, snapshot.queue);
            return (
                snapshot.queue === CardQueue.New &&
                rawQueue === CardQueue.New &&
                snapshot.nextReview <= 0 &&
                snapshot.reps <= 0 &&
                snapshot.timesReviewed <= 0
            );
        });

        return allLookNew ? "new-card-without-baseline" : "baseline-state-missing";
    }

    private resolveBaselineNextReview(
        baselineSnapshot: ReviewSnapshot | null,
        baselineSource: string | null,
        itemState: AnkiSyncItemState,
    ): NumericChoice {
        if (baselineSnapshot) {
            return {
                value: baselineSnapshot.nextReview ?? 0,
                source: baselineSource,
            };
        }

        if (itemState.lastRemoteSnapshot) {
            return {
                value: itemState.lastRemoteSnapshot.nextReview ?? 0,
                source: "lastRemoteSnapshot",
            };
        }

        if (itemState.lastLocalSnapshot) {
            return {
                value: itemState.lastLocalSnapshot.nextReview ?? 0,
                source: "lastLocalSnapshot",
            };
        }

        return {
            value: 0,
            source: null,
        };
    }

    isEnabled(settings = this.plugin.data.settings): boolean {
        return settings.ankiSyncEnabled === true;
    }

    private async getState(): Promise<AnkiSyncStateFile> {
        if (!this.state) {
            this.state = await this.stateStore.load();
        }

        return this.state;
    }

    private async persistState(): Promise<void> {
        if (this.state) {
            await this.stateStore.save(this.state);
        }
    }

    private createProgressReporter(
        options: AnkiSyncRunOptions | undefined,
    ): (phase: AnkiSyncPhase, current: number, total: number, message: string) => void {
        const phaseOrder: AnkiSyncPhase[] = [
            "prepare",
            "writeback",
            "pull",
            "ensure-decks",
            "media",
            "create",
            "update",
            "delete",
            "finalize",
        ];
        const phaseTotals = new Map<AnkiSyncPhase, number>(phaseOrder.map((phase) => [phase, 0]));
        const phaseCurrents = new Map<AnkiSyncPhase, number>(phaseOrder.map((phase) => [phase, 0]));

        return (phase: AnkiSyncPhase, current: number, total: number, message: string) => {
            phaseTotals.set(phase, Math.max(total, 0));
            phaseCurrents.set(phase, Math.max(current, 0));

            let overallCurrent = 0;
            let overallTotal = 0;
            for (const orderedPhase of phaseOrder) {
                overallCurrent += phaseCurrents.get(orderedPhase) ?? 0;
                overallTotal += phaseTotals.get(orderedPhase) ?? 0;
            }

            overallTotal = Math.max(overallTotal, 1);
            overallCurrent = Math.min(overallCurrent, overallTotal);

            options?.onProgress?.({
                phase,
                current,
                total,
                overallCurrent,
                overallTotal,
                message: message.replace(/\s*\(\d+\/\d+\)/g, "").replace(/\s{2,}/g, " ").trim(),
            } satisfies AnkiSyncProgress);
        };
    }

    private async buildFileTextMap(deckTree: Deck): Promise<Map<string, string>> {
        const fileTextByPath = new Map<string, string>();
        const adapter = Iadapter.instance?.adapter;
        if (!adapter) {
            return fileTextByPath;
        }

        const cards = deckTree.getFlattenedCardArray(CardListType.All, true);
        const uniquePaths = new Set(
            cards
                .map((card) => card.question?.note?.filePath ?? "")
                .filter((filePath) => filePath.length > 0),
        );

        for (const filePath of uniquePaths) {
            try {
                if (!(await adapter.exists(filePath))) {
                    continue;
                }
                const fileText = await adapter.read(filePath);
                if (typeof fileText === "string") {
                    fileTextByPath.set(filePath, fileText);
                }
            } catch (error) {
                console.warn(`[Syro-Anki] Failed to read ${filePath} for locator export:`, error);
            }
        }

        return fileTextByPath;
    }

    private async hasAdvancedUriPlugin(): Promise<boolean> {
        const adapter = Iadapter.instance?.adapter;
        const configDir = this.plugin.app?.vault?.configDir;
        if (!adapter || !configDir) {
            return false;
        }

        try {
            return await adapter.exists(`${configDir}/plugins/obsidian-advanced-uri/manifest.json`);
        } catch {
            return false;
        }
    }

    private buildBreadcrumbHtml(label: string, openLink: string, exactLink: string): string {
        const safeLabel = escapeHtml(label);
        if (!safeLabel) {
            return "";
        }

        const primaryLink = exactLink || openLink;
        if (!primaryLink) {
            return safeLabel;
        }

        return `<a href="${escapeHtml(primaryLink)}">${safeLabel}</a>`;
    }

    private buildSourceHtml(label: string, openLink: string, exactLink: string): string {
        const safeLabel = escapeHtml(label);
        const links: string[] = [];
        if (openLink) {
            links.push(`<a href="${escapeHtml(openLink)}">Open file</a>`);
        }
        if (exactLink) {
            links.push(`<a href="${escapeHtml(exactLink)}">Locate line</a>`);
        }

        const actions = links.length > 0 ? ` <span class="syro-anki-source-links">(${links.join(" · ")})</span>` : "";
        return `${safeLabel}${actions}`.trim();
    }

    private normalizeLegacyClozeMarkers(markdown: string, side: "front" | "back" | "context"): string {
        let normalized = markdown.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\r?\n?/g, "");
        normalized = normalized.replace(/芦芦SR_H:([^禄]+)禄禄/g, (_match, encoded) => {
            try {
                return createMaskMarkup(decodeURIComponent(encoded));
            } catch {
                return createMaskMarkup();
            }
        });
        normalized = normalized.replace(/芦芦SR_S:([^禄]+)禄禄/g, (_match, encoded) => {
            try {
                return createAnswerMarkup(decodeURIComponent(encoded));
            } catch {
                return createAnswerMarkup(encoded);
            }
        });
        normalized = normalized.replace(/««SR_CLOZE_FRONT»»/g, createMaskMarkup());
        normalized = normalized.replace(/««SR_CLOZE_BACK:([^»]+)»»/g, (_match, encoded) => {
            try {
                return createAnswerMarkup(decodeURIComponent(encoded));
            } catch {
                return createAnswerMarkup(encoded);
            }
        });
        normalized = normalized.replace(/««SR_CLOZE:([^»]+)»»/g, (_match, encoded) => {
            try {
                return side === "front"
                    ? createMaskMarkup()
                    : createAnswerMarkup(decodeURIComponent(encoded));
            } catch {
                return side === "front" ? createMaskMarkup() : createAnswerMarkup(encoded);
            }
        });
        normalized = normalized.replace(/\{\{c\d+(?:::|：：)(.*?)(?:(?:::|：：).*?)?\}\}/giu, (_match, content) =>
            createAnswerMarkup(content),
        );
        return normalized;
    }

    private renderFallbackHtml(markdown: string): string {
        return escapeHtml(markdown)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*(.+?)\*/g, "$1<em>$2</em>")
            .replace(/==(.*?)==/g, "<mark>$1</mark>")
            .replace(/\r?\n/g, "<br>");
    }

    private resolveVaultMediaPath(originalPath: string, sourcePath: string): string | null {
        const normalizedPath = (originalPath ?? "").trim();
        if (!normalizedPath || isRemoteUrl(normalizedPath)) {
            return null;
        }

        const app = this.plugin.app as any;
        const metadataCache = app?.metadataCache;
        const vault = app?.vault;
        const cleanedPath = normalizedPath.replace(/^app:\/\/local\//i, "").replace(/^app:\/\/obsidian\.md\//i, "");
        let decodedPath = cleanedPath;
        try {
            decodedPath = decodeURIComponent(cleanedPath);
        } catch {
            decodedPath = cleanedPath;
        }

        const sourceDir = dirname(sourcePath);
        const directCandidates = [
            cleanedPath,
            decodedPath,
            joinVaultPath(sourceDir, cleanedPath),
            joinVaultPath(sourceDir, decodedPath),
        ].filter(Boolean);

        const directMatch = directCandidates.find((candidate) =>
            typeof getAbstractPath(vault?.getAbstractFileByPath?.(candidate)) === "string",
        );
        if (directMatch) {
            return normalizeVaultPath(directMatch);
        }

        const linked = metadataCache?.getFirstLinkpathDest?.(cleanedPath, sourcePath);
        const linkedPath = getAbstractPath(linked);
        if (linkedPath) {
            return normalizeVaultPath(linkedPath);
        }

        return null;
    }

    private async loadBinaryMediaAsset(vaultPath: string): Promise<AnkiBinaryMediaAsset | null> {
        const binaryReader = this.plugin.app?.vault?.adapter?.readBinary;
        if (!binaryReader) {
            return null;
        }

        try {
            const data = await binaryReader.call(this.plugin.app?.vault?.adapter, vaultPath);
            return {
                filename: buildAnkiMediaFilename(vaultPath),
                base64Data: Buffer.from(data).toString("base64"),
                vaultPath,
            };
        } catch (error) {
            console.warn(`[Syro-Anki] Failed to load media asset ${vaultPath}:`, error);
            return null;
        }
    }

    private async rewriteRenderedMedia(
        container: HTMLElement,
        fieldName: AnkiMediaFieldName,
        sourcePath: string,
        candidates: AnkiMediaReferenceCandidate[],
    ): Promise<RenderedFieldResult> {
        const mediaRefs: AnkiMediaReference[] = [];
        const warnings: string[] = [];
        const images = Array.from(container.querySelectorAll("img"));

        for (let index = 0; index < images.length; index += 1) {
            const image = images[index];
            const candidate = candidates[index];
            const candidatePath = candidate?.originalPath ?? image.getAttribute("src") ?? "";
            if (!candidatePath || candidatePath.startsWith("data:") || isRemoteUrl(candidatePath)) {
                continue;
            }

            const vaultPath = this.resolveVaultMediaPath(candidatePath, sourcePath);
            if (!vaultPath) {
                warnings.push(
                    `[media:${fieldName}] unresolved image path=${candidatePath} source=${sourcePath || "unknown"}`,
                );
                continue;
            }

            const filename = buildAnkiMediaFilename(vaultPath);
            image.setAttribute("src", filename);
            mediaRefs.push({
                fieldName,
                vaultPath,
                filename,
                originalPath: candidatePath,
            });
        }

        return {
            html: container.innerHTML.trim(),
            mediaRefs,
            warnings,
        };
    }

    private async renderMarkdownField(
        markdown: string,
        sourcePath: string,
        side: "front" | "back" | "context",
        fieldName: AnkiMediaFieldName,
    ): Promise<RenderedFieldResult> {
        const normalized = this.normalizeLegacyClozeMarkers(markdown, side).trim();
        if (!normalized) {
            return { html: "", mediaRefs: [], warnings: [] };
        }

        const mediaCandidates = extractMarkdownMediaReferenceCandidates(normalized, fieldName);
        const app = this.plugin.app;
        if (!app || typeof document === "undefined") {
            return {
                html: this.renderFallbackHtml(normalized),
                mediaRefs: [],
                warnings:
                    mediaCandidates.length > 0
                        ? [`[media:${fieldName}] media rendering unavailable for ${sourcePath || "unknown"}`]
                        : [],
            };
        }

        try {
            const container = document.createElement("div");
            await MarkdownRenderer.render(app as any, normalized, container, sourcePath, this.plugin as any);
            return this.rewriteRenderedMedia(container, fieldName, sourcePath, mediaCandidates);
        } catch {
            return {
                html: this.renderFallbackHtml(normalized),
                mediaRefs: [],
                warnings:
                    mediaCandidates.length > 0
                        ? [`[media:${fieldName}] media rendering failed for ${sourcePath || "unknown"}`]
                        : [],
            };
        }
    }

    private async renderSnapshotFields(builtSnapshots: Map<string, BuiltSyroCardSnapshot>): Promise<void> {
        for (const { payload } of builtSnapshots.values()) {
            const sourcePath = payload.filePath ?? "";
            const front = await this.renderMarkdownField(payload.front, sourcePath, "front", "Front");
            const back = await this.renderMarkdownField(payload.back, sourcePath, "back", "Back");
            const context = await this.renderMarkdownField(payload.context, sourcePath, "context", "Context");

            payload.front = front.html;
            payload.back = back.html;
            payload.context = context.html;
            payload.breadcrumb = this.buildBreadcrumbHtml(payload.breadcrumb, payload.openLink, payload.exactLink);
            payload.source = this.buildSourceHtml(payload.source, payload.openLink, payload.exactLink);
            payload.mediaRefs = [...front.mediaRefs, ...back.mediaRefs, ...context.mediaRefs];
            payload.warnings.push(...front.warnings, ...back.warnings, ...context.warnings);

            payload.fields.Front = payload.front;
            payload.fields.Back = payload.back;
            payload.fields.Context = payload.context;
            payload.fields.Breadcrumb = payload.breadcrumb;
            payload.fields.Source = payload.source;
            payload.fields.OpenLink = payload.openLink;
            payload.fields.ExactLink = payload.exactLink;
        }
    }

    private async uploadSnapshotMedia(
        client: AnkiConnectClient,
        builtSnapshots: Map<string, BuiltSyroCardSnapshot>,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const mediaRefs = Array.from(
            new Map(
                Array.from(builtSnapshots.values())
                    .flatMap((snapshot) => snapshot.payload.mediaRefs)
                    .map((mediaRef) => [mediaRef.filename, mediaRef]),
            ).values(),
        );
        if (mediaRefs.length === 0) {
            onProgress?.(0, 0, "No Anki media files to upload");
            return;
        }

        const assets: AnkiBinaryMediaAsset[] = [];
        for (const mediaRef of mediaRefs) {
            const asset = await this.loadBinaryMediaAsset(mediaRef.vaultPath);
            if (!asset) {
                result.errors.push(
                    `[media:${mediaRef.fieldName}] failed to load asset path=${mediaRef.vaultPath} file=${mediaRef.filename}`,
                );
                continue;
            }
            assets.push(asset);
        }

        if (assets.length === 0) {
            onProgress?.(mediaRefs.length, mediaRefs.length, "Anki media upload skipped");
            return;
        }

        await client.ensureBinaryMediaFiles(assets, (current, total, filename) =>
            onProgress?.(current, total, `正在上传 Anki 图片媒体 (${current}/${total}): ${filename}`),
        );
    }

    private getPendingWritebackTargets(
        state: AnkiSyncStateFile,
    ): Array<[string, AnkiSyncItemState]> {
        return Object.entries(state.items).filter(([, itemState]) => {
            const pending = itemState.pendingReviewWritebacks?.[0];
            const mapping = itemState.mapping;
            return !!pending && !!mapping?.noteId && !!mapping.cardId;
        });
    }

    private getMappedEntries(state: AnkiSyncStateFile): Array<[string, AnkiSyncItemState]> {
        return Object.entries(state.items).filter(([, itemState]) => !!itemState.mapping);
    }

    private collectDeckNames(ops: AnkiSyncPlanOperation[]): string[] {
        const deckNames = new Set<string>();
        for (const op of ops) {
            if ((op.type === "create" || op.type === "update") && op.payload?.deckName) {
                deckNames.add(op.payload.deckName);
            }
            if (op.type === "delete" || op.type === "detach") {
                deckNames.add(DETACHED_DECK_NAME);
            }
        }
        return Array.from(deckNames);
    }

    private buildAddNoteInput(op: AnkiSyncPlanOperation): Record<string, unknown> {
        return {
            deckName: op.payload?.deckName,
            modelName: op.payload?.modelName,
            fields: op.payload?.fields,
            tags: ["syro-sync"],
            options: {
                allowDuplicate: true,
            },
        };
    }

    private async loadNoteInfoMap(
        client: AnkiConnectClient,
        noteIds: number[],
    ): Promise<Map<number, AnkiNoteInfo>> {
        const noteInfos = new Map<number, AnkiNoteInfo>();
        const createdIds = noteIds.filter((value): value is number => typeof value === "number" && value > 0);
        for (const noteInfo of await client.notesInfo(createdIds)) {
            noteInfos.set(noteInfo.noteId, noteInfo);
        }
        return noteInfos;
    }

    private formatCreateContext(op: AnkiSyncPlanOperation): string {
        const filePath = op.payload?.filePath ?? "unknown";
        const linePart = op.payload?.lineNo != null ? ` line=${op.payload.lineNo}` : "";
        return `uuid=${op.itemUuid} path=${filePath}${linePart} deck=${op.payload?.deckName ?? "unknown"} model=${op.payload?.modelName ?? "unknown"}`;
    }

    private async diagnoseAddNoteFailure(
        client: AnkiConnectClient,
        noteInput: Record<string, unknown>,
    ): Promise<string | null> {
        try {
            const detail = (await client.canAddNotesWithErrorDetail([noteInput]))[0] as
                | AnkiCanAddNoteResult
                | undefined;
            return detail?.canAdd === false ? detail.error ?? "cannot add note" : null;
        } catch (error) {
            return `failed to diagnose addNote: ${String(error)}`;
        }
    }

    private async preflightCreateNotes(
        client: AnkiConnectClient,
        ops: AnkiSyncPlanOperation[],
        result: AnkiSyncRunResult,
    ): Promise<PreparedCreateNote[]> {
        const prepared = ops
            .filter((op) => op.type === "create" && op.payload)
            .map((op) => ({ op, noteInput: this.buildAddNoteInput(op) }));
        if (prepared.length === 0) {
            return [];
        }

        try {
            const checks = await client.canAddNotesWithErrorDetail(
                prepared.map((entry) => entry.noteInput),
            );
            const accepted: PreparedCreateNote[] = [];

            for (let index = 0; index < prepared.length; index += 1) {
                const entry = prepared[index];
                const check = checks[index];
                if (check?.canAdd === false) {
                    result.errors.push(
                        `[preflight:${entry.op.itemUuid}] ${this.formatCreateContext(entry.op)} ${check.error ?? "cannot add note"}`,
                    );
                    continue;
                }
                accepted.push(entry);
            }

            return accepted;
        } catch (error) {
            result.errors.push(`[preflight] ${String(error)}`);
            return prepared;
        }
    }

    private async discoverRemoteMappings(
        client: AnkiConnectClient,
        state: AnkiSyncStateFile,
        candidateUuids: Set<string>,
        result: AnkiSyncRunResult,
    ): Promise<void> {
        if (candidateUuids.size === 0) {
            return;
        }

        const noteInfos = await client.notesInfoByQuery(REMOTE_DISCOVERY_QUERY);
        const relevantNotes = noteInfos.filter((noteInfo) => {
            const itemUuid = noteInfo.fields.syro_item_uuid?.trim();
            return !!itemUuid && candidateUuids.has(itemUuid);
        });
        if (relevantNotes.length === 0) {
            return;
        }

        const primaryCardIds = Array.from(
            new Set(
                relevantNotes
                    .map((noteInfo) => noteInfo.cards?.[0] ?? 0)
                    .filter((cardId) => cardId > 0),
            ),
        );
        const cardInfoById = new Map<number, AnkiCardInfo>();
        for (const cardInfo of await client.cardsInfo(primaryCardIds)) {
            cardInfoById.set(cardInfo.cardId, cardInfo);
        }

        const resolved = new Map<string, { noteInfo: AnkiNoteInfo; cardInfo: AnkiCardInfo; sortKey: number }>();
        for (const noteInfo of relevantNotes) {
            const itemUuid = noteInfo.fields.syro_item_uuid.trim();
            const cardId = noteInfo.cards?.[0] ?? 0;
            const cardInfo = cardInfoById.get(cardId);
            if (!cardInfo) {
                continue;
            }

            const sortKey = Math.max((noteInfo.mod ?? 0) * 1000, (cardInfo.mod ?? 0) * 1000);
            const existing = resolved.get(itemUuid);
            if (!existing || sortKey > existing.sortKey) {
                if (existing) {
                    result.errors.push(
                        `[discover:${itemUuid}] multiple remote notes found; using note ${noteInfo.noteId} over ${existing.noteInfo.noteId}`,
                    );
                }
                resolved.set(itemUuid, { noteInfo, cardInfo, sortKey });
                continue;
            }

            result.errors.push(
                `[discover:${itemUuid}] multiple remote notes found; keeping note ${existing.noteInfo.noteId} over ${noteInfo.noteId}`,
            );
        }

        for (const [itemUuid, entry] of resolved.entries()) {
            const itemState = ensureAnkiSyncItemState(state, itemUuid);
            itemState.mapping = {
                noteId: entry.noteInfo.noteId,
                cardId: entry.cardInfo.cardId,
                modelName: entry.noteInfo.modelName || DEFAULT_ANKI_MODEL_NAME,
                deckName: entry.cardInfo.deckName,
                filePath: entry.noteInfo.fields.syro_file_path ?? itemState.lastKnownFilePath,
                cardHash: entry.noteInfo.fields.syro_card_hash ?? itemState.lastKnownCardHash,
            };
            itemState.lastKnownFilePath = itemState.mapping.filePath;
            itemState.lastKnownCardHash = itemState.mapping.cardHash;
        }
    }

    private registerCreatedNote(
        op: AnkiSyncPlanOperation,
        noteId: number,
        noteInfo: AnkiNoteInfo | undefined,
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
    ): void {
        const cardId = noteInfo?.cards?.[0] ?? 0;
        const itemState = ensureAnkiSyncItemState(state, op.itemUuid);
        itemState.mapping = {
            noteId,
            cardId,
            modelName: op.payload?.modelName ?? DEFAULT_ANKI_MODEL_NAME,
            deckName: op.payload?.deckName ?? "Syro",
            filePath: op.payload?.filePath ?? "",
            cardHash: op.payload?.cardHash ?? "",
        };
        itemState.lastKnownCardHash = op.payload?.cardHash ?? "";
        itemState.lastKnownFilePath = op.payload?.filePath ?? "";
        result.created += 1;
    }

    private shouldTrackItem(item: RepetitionItem | null | undefined): boolean {
        return item?.itemType === RPITEMTYPE.CARD && !!item.uuid;
    }

    async queueLocalReviewWriteback(item: RepetitionItem | null | undefined): Promise<void> {
        if (!this.shouldTrackItem(item) || !this.isEnabled()) {
            return;
        }

        const state = await this.getState();
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        const snapshot = {
            ...createReviewSnapshotFromItem(item, itemState),
            updatedAt: this.now(),
            source: "syro" as const,
        };

        itemState.lastLocalSnapshot = snapshot;
        itemState.lastLocalUpdatedAt = snapshot.updatedAt;
        itemState.pendingReviewWritebacks = [
            {
                id: createPendingId(item.uuid, snapshot.updatedAt),
                snapshot,
                createdAt: snapshot.updatedAt,
                attempts: 0,
                lastError: null,
            },
        ];

        await this.persistState();
    }

    async rewritePendingWriteback(item: RepetitionItem | null | undefined): Promise<void> {
        if (!this.shouldTrackItem(item)) {
            return;
        }

        const state = await this.getState();
        const itemState = state.items[item.uuid];
        if (!itemState) {
            return;
        }

        const snapshot = {
            ...createReviewSnapshotFromItem(item, itemState),
            updatedAt: this.now(),
            source: "syro" as const,
        };

        itemState.lastLocalSnapshot = snapshot;
        itemState.lastLocalUpdatedAt = snapshot.updatedAt;

        if (areSnapshotsEquivalent(snapshot, itemState.lastRemoteSnapshot)) {
            itemState.pendingReviewWritebacks = [];
        } else {
            itemState.pendingReviewWritebacks = [
                {
                    id: createPendingId(item.uuid, snapshot.updatedAt),
                    snapshot,
                    createdAt: snapshot.updatedAt,
                    attempts: 0,
                    lastError: null,
                },
            ];
        }

        await this.persistState();
    }

    private findCardItemByUuid(itemUuid: string): RepetitionItem | null {
        return (
            this.plugin.store.data.items.find(
                (item) => item?.itemType === RPITEMTYPE.CARD && item.uuid === itemUuid,
            ) ?? null
        );
    }

    private refreshCardRuntime(card: Card, item: RepetitionItem): void {
        card.repetitionItem = item;
        card.scheduleInfo =
            item.queue === CardQueue.New ? null : NoteCardScheduleParser.createInfo_algo(item.getSched());
    }

    private buildHiddenSnapshot(fields: Record<string, string>): ReviewSnapshot | null {
        const parsed = safeJsonParse<ReviewSnapshot>(fields.syro_snapshot);
        if (!parsed) {
            return null;
        }

        const updatedAt = toNumber(fields.syro_updated_at, parsed.updatedAt ?? 0);
        return {
            ...parsed,
            queue: toCardQueue(parsed.queue),
            updatedAt,
            source: "anki-hidden",
        };
    }

    private computeReviewDueOffsetCandidate(
        cardInfo: AnkiCardInfo,
        itemState: AnkiSyncItemState,
        hiddenSnapshot: ReviewSnapshot | null,
    ): ReviewDueOffsetCandidateResult {
        if (cardInfo.queue !== CardQueue.Review || cardInfo.due === null) {
            return {
                candidate: null,
                reason: cardInfo.queue !== CardQueue.Review ? "not-review-queue" : "missing-due",
                calibrationSource: 0,
                calibrationSourceLabel: null,
                baselineDue: null,
                dueSource: null,
                missingBaselineState: null,
            };
        }

        const calibrationChoice = this.chooseSnapshotByPriority(
            ["anki-hidden", hiddenSnapshot],
            ["lastRemoteSnapshot", itemState.lastRemoteSnapshot],
            ["lastLocalSnapshot", itemState.lastLocalSnapshot],
        );
        const calibrationSource = calibrationChoice.snapshot?.nextReview ?? 0;
        if (calibrationSource <= 0) {
            return {
                candidate: null,
                reason: "missing-baseline-next-review",
                calibrationSource,
                calibrationSourceLabel: calibrationChoice.source,
                baselineDue: null,
                dueSource: null,
                missingBaselineState: this.resolveMissingBaselineState([
                    hiddenSnapshot,
                    itemState.lastRemoteSnapshot,
                    itemState.lastLocalSnapshot,
                ]),
            };
        }

        const baselineDue = toNumber(
            hiddenSnapshot?.raw?.due ??
                itemState.lastRemoteSnapshot?.raw?.due ??
                itemState.lastLocalSnapshot?.raw?.due,
            Number.NaN,
        );
        const dueSource = Number.isNaN(baselineDue) ? cardInfo.due : baselineDue;

        return {
            candidate: dueSource - Math.floor(calibrationSource / DAY_MS),
            reason: "baseline-available",
            calibrationSource,
            calibrationSourceLabel: calibrationChoice.source,
            baselineDue: Number.isNaN(baselineDue) ? null : baselineDue,
            dueSource,
            missingBaselineState: null,
        };
    }

    private inferQueueFromType(type: number | null | undefined): CardQueue {
        if (type === 2) {
            return CardQueue.Review;
        }
        if (type === 1) {
            return CardQueue.Learn;
        }
        return CardQueue.New;
    }

    private chooseNonBuriedBaselineSnapshot(
        itemState: AnkiSyncItemState,
        hiddenSnapshot: ReviewSnapshot | null,
    ): SnapshotChoice {
        const hiddenRawQueue = Number(hiddenSnapshot?.raw?.queue);
        if (hiddenSnapshot && !isBuriedQueue(hiddenRawQueue)) {
            return { snapshot: hiddenSnapshot, source: "anki-hidden" };
        }

        const remoteRawQueue = Number(itemState.lastRemoteSnapshot?.raw?.queue);
        if (itemState.lastRemoteSnapshot && !isBuriedQueue(remoteRawQueue)) {
            return { snapshot: itemState.lastRemoteSnapshot, source: "lastRemoteSnapshot" };
        }

        const localRawQueue = Number(itemState.lastLocalSnapshot?.raw?.queue);
        if (itemState.lastLocalSnapshot && !isBuriedQueue(localRawQueue)) {
            return { snapshot: itemState.lastLocalSnapshot, source: "lastLocalSnapshot" };
        }

        return { snapshot: null, source: null };
    }

    private buildCardSnapshot(
        itemUuid: string,
        cardInfo: AnkiCardInfo,
        itemState: AnkiSyncItemState,
        reviewDueOffset: number | null,
        hiddenSnapshot: ReviewSnapshot | null,
    ): ReviewSnapshot {
        const buried = isBuriedQueue(cardInfo.queue);
        const baselineChoice = this.chooseNonBuriedBaselineSnapshot(itemState, hiddenSnapshot);
        const baselineSnapshot = baselineChoice.snapshot;
        const projectedQueue = buried
            ? baselineSnapshot?.queue ?? this.inferQueueFromType(cardInfo.type)
            : toCardQueue(cardInfo.queue);

        let computedNextReview = 0;
        if (projectedQueue === CardQueue.Review && reviewDueOffset !== null && cardInfo.due !== null) {
            computedNextReview = Math.max(0, (cardInfo.due - reviewDueOffset) * DAY_MS);
        } else if (projectedQueue === CardQueue.Learn && cardInfo.due !== null) {
            computedNextReview = cardInfo.due * 1000;
        }

        const baselineNextReviewChoice = this.resolveBaselineNextReview(
            baselineSnapshot,
            baselineChoice.source,
            itemState,
        );
        const baselineNextReview = baselineNextReviewChoice.value;
        const nextReview = buried
            ? Math.max(baselineNextReview, computedNextReview || 0)
            : computedNextReview || baselineNextReview;

        const reps = buried ? baselineSnapshot?.reps ?? cardInfo.reps ?? 0 : cardInfo.reps ?? 0;
        const lapses = buried ? baselineSnapshot?.lapses ?? cardInfo.lapses ?? 0 : cardInfo.lapses ?? 0;
        if (buried || projectedQueue === CardQueue.Review || projectedQueue === CardQueue.Learn) {
            this.logRuntimeDebug("[Syro-Anki][Pull][BuildSnapshot]", {
                itemUuid,
                card: this.summarizeCardInfo(cardInfo),
                buried,
                projectedQueue,
                reviewDueOffset,
                computedNextReview,
                baselineNextReview,
                nextReview,
                baselineSource: baselineNextReviewChoice.source,
                hiddenSnapshot: this.summarizeSnapshot(hiddenSnapshot),
            });
        }

        if (projectedQueue === CardQueue.Review && cardInfo.due !== null && reviewDueOffset === null) {
            this.logRuntimeDebug("[Syro-Anki][Pull][BuildSnapshot][review-offset-unresolved]", {
                itemUuid,
                reason: "review-offset-unresolved",
                due: cardInfo.due,
                baselineNextReview,
                nextReview,
                baselineSource: baselineNextReviewChoice.source,
                hiddenSnapshot: this.summarizeSnapshot(hiddenSnapshot),
                lastRemoteSnapshot: this.summarizeSnapshot(itemState.lastRemoteSnapshot),
                lastLocalSnapshot: this.summarizeSnapshot(itemState.lastLocalSnapshot),
            });
        }

        return {
            queue: projectedQueue,
            nextReview,
            interval: buried
                ? Math.max(0, baselineSnapshot?.interval ?? cardInfo.interval ?? 0)
                : Math.max(0, cardInfo.interval ?? 0),
            factor: buried ? baselineSnapshot?.factor ?? cardInfo.factor ?? null : cardInfo.factor ?? null,
            reps,
            lapses,
            timesReviewed: buried ? baselineSnapshot?.timesReviewed ?? reps : reps,
            timesCorrect: buried
                ? baselineSnapshot?.timesCorrect ?? Math.max(reps - lapses, 0)
                : Math.max(reps - lapses, 0),
            errorStreak: buried
                ? baselineSnapshot?.errorStreak ?? 0
                : projectedQueue === CardQueue.Learn && lapses > 0
                  ? 1
                  : 0,
            updatedAt: (cardInfo.mod ?? 0) * 1000,
            dueValue: cardInfo.due ?? null,
            left: cardInfo.left ?? null,
            raw: {
                type: cardInfo.type,
                queue: cardInfo.queue,
                due: cardInfo.due,
                interval: cardInfo.interval,
                factor: cardInfo.factor,
                reps: cardInfo.reps,
                lapses: cardInfo.lapses,
                left: cardInfo.left,
                mod: cardInfo.mod,
            },
            source: "anki-card",
        };
    }

    private buildRemoteRecord(
        itemUuid: string,
        noteInfo: AnkiNoteInfo,
        cardInfo: AnkiCardInfo,
        itemState: AnkiSyncItemState,
        reviewDueOffset: number | null,
    ): AnkiRemoteRecord {
        const hiddenSnapshot = this.buildHiddenSnapshot(noteInfo.fields);
        return {
            itemUuid,
            noteId: noteInfo.noteId,
            cardId: cardInfo.cardId,
            deckName: cardInfo.deckName,
            cardHash: noteInfo.fields.syro_card_hash ?? itemState.mapping?.cardHash ?? "",
            filePath: noteInfo.fields.syro_file_path ?? itemState.mapping?.filePath ?? "",
            mod: (cardInfo.mod ?? 0) * 1000,
            hiddenSnapshot,
            cardSnapshot: this.buildCardSnapshot(itemUuid, cardInfo, itemState, reviewDueOffset, hiddenSnapshot),
            fields: noteInfo.fields,
        };
    }

    private applySnapshotToItem(item: RepetitionItem, snapshot: ReviewSnapshot): void {
        item.queue = snapshot.queue;
        item.nextReview = snapshot.nextReview;
        item.timesReviewed = snapshot.timesReviewed;
        item.timesCorrect = snapshot.timesCorrect;
        item.errorStreak = snapshot.errorStreak;
        item.learningStep = snapshot.queue === CardQueue.Learn ? item.learningStep ?? 0 : null;

        if (item.isFsrs) {
            const data = item.data as Record<string, unknown>;
            if (snapshot.nextReview > 0) {
                data.due = new Date(snapshot.nextReview);
            }
            data.scheduled_days = snapshot.interval;
            data.reps = snapshot.reps;
            data.lapses = snapshot.lapses;
        } else {
            const data = item.data as Record<string, unknown>;
            data.lastInterval = snapshot.interval;
            if (snapshot.factor != null) {
                data.ease = snapshot.factor / 1000;
            }
            data.iteration = Math.max(snapshot.reps, 1);
        }
    }

    private buildCardValueUpdate(snapshot: ReviewSnapshot, reviewDueOffset: number | null): Record<string, number> {
        const values: Record<string, number> = {
            mod: Math.floor(snapshot.updatedAt / 1000),
            reps: snapshot.reps,
            lapses: snapshot.lapses,
            queue: snapshot.queue,
        };

        if (snapshot.factor != null) {
            values.factor = Math.round(snapshot.factor);
        }
        if (snapshot.interval > 0) {
            values.ivl = Math.max(1, Math.round(snapshot.interval));
        }

        if (snapshot.queue === CardQueue.Review) {
            values.type = 2;
            if (reviewDueOffset !== null && snapshot.nextReview > 0) {
                values.due = Math.floor(snapshot.nextReview / DAY_MS) + reviewDueOffset;
            }
        } else if (snapshot.queue === CardQueue.Learn) {
            values.type = 1;
            if (snapshot.left != null) {
                values.left = snapshot.left;
            }
            if (snapshot.nextReview > 0) {
                values.due = Math.floor(snapshot.nextReview / 1000);
            }
        } else {
            values.type = 0;
        }

        return values;
    }

    private async flushPendingWritebacks(
        client: AnkiConnectClient,
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const targets = this.getPendingWritebackTargets(state);
        const total = targets.length;
        if (total === 0) {
            onProgress?.(0, 0, "No Anki review writebacks");
            return;
        }

        let processed = 0;
        for (const [itemUuid, itemState] of targets) {
            const pending = itemState.pendingReviewWritebacks[0];
            const mapping = itemState.mapping!;
            try {
                await client.updateNoteFields(mapping.noteId, {
                    syro_snapshot: JSON.stringify(pending.snapshot),
                    syro_updated_at: String(pending.snapshot.updatedAt),
                });
                await client.setSpecificCardValues(
                    mapping.cardId,
                    this.buildCardValueUpdate(pending.snapshot, state.global.reviewDueOffset),
                );

                itemState.pendingReviewWritebacks = [];
                itemState.lastLocalSnapshot = pending.snapshot;
                itemState.lastRemoteSnapshot = pending.snapshot;
                itemState.lastLocalUpdatedAt = pending.snapshot.updatedAt;
                itemState.lastRemoteUpdatedAt = pending.snapshot.updatedAt;
                itemState.lastMergedUpdatedAt = pending.snapshot.updatedAt;
                result.writebacks += 1;
            } catch (error) {
                pending.attempts += 1;
                pending.lastError = String(error);
                result.errors.push(`[writeback:${itemUuid}] ${String(error)}`);
            } finally {
                processed += 1;
                onProgress?.(
                    processed,
                    total,
                    `正在写回 Anki 复习数据 (${processed}/${total})...`,
                );
            }
        }
    }

    private async pullRemoteChanges(
        client: AnkiConnectClient,
        state: AnkiSyncStateFile,
        builtSnapshots: Map<string, BuiltSyroCardSnapshot>,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const mappedEntries = this.getMappedEntries(state);
        if (mappedEntries.length === 0) {
            onProgress?.(0, 0, "No remote Anki cards to pull");
            return;
        }

        this.logRuntimeDebug("[Syro-Anki][Pull] start", {
            lastPullCursor: state.global.lastPullCursor,
            reviewDueOffset: state.global.reviewDueOffset,
            mappedCount: mappedEntries.length,
            needsReviewDueCalibration: mappedEntries.some(
                ([, itemState]) => (itemState.mapping?.cardId ?? 0) > 0,
            ),
        });

        const noteIds = mappedEntries
            .map(([, itemState]) => itemState.mapping?.noteId ?? 0)
            .filter((noteId) => noteId > 0);
        const cardIds = mappedEntries
            .map(([, itemState]) => itemState.mapping?.cardId ?? 0)
            .filter((cardId) => cardId > 0);

        const noteInfoById = new Map<number, AnkiNoteInfo>();
        const cardInfoById = new Map<number, AnkiCardInfo>();
        for (const noteInfo of await client.notesInfo(noteIds)) {
            noteInfoById.set(noteInfo.noteId, noteInfo);
        }
        for (const cardInfo of await client.cardsInfo(cardIds)) {
            cardInfoById.set(cardInfo.cardId, cardInfo);
        }
        const ankiDueByCardId = new Map<number, boolean | null>();
        const areDue = typeof (client as { areDue?: (cards: number[]) => Promise<boolean[]> }).areDue === "function"
            ? await client.areDue(cardIds)
            : cardIds.map(() => null);
        cardIds.forEach((cardId, index) => {
            ankiDueByCardId.set(cardId, areDue[index] ?? null);
        });
        const dueCandidateByItemUuid = new Map<string, ReviewDueOffsetCandidateResult>();
        const comparisonRows: DueComparisonRow[] = [];
        const unmappedByDeck = new Map<string, number>();
        for (const [itemUuid, builtSnapshot] of builtSnapshots.entries()) {
            if (state.items[itemUuid]?.mapping?.cardId) {
                continue;
            }

            const deckName = builtSnapshot.payload.deckName || "unknown";
            unmappedByDeck.set(deckName, (unmappedByDeck.get(deckName) ?? 0) + 1);
        }

        let maxCursor = state.global.lastPullCursor;
        let calibratedReviewDueOffset = state.global.reviewDueOffset;
        for (const [itemUuid, itemState] of mappedEntries) {
            const mapping = itemState.mapping;
            const noteInfo = mapping ? noteInfoById.get(mapping.noteId) : null;
            const cardInfo = mapping ? cardInfoById.get(mapping.cardId) : null;
            if (!mapping || !noteInfo || !cardInfo) {
                this.logRuntimeDebug("[Syro-Anki][Pull][Calibrate] skipped-missing-mapping", {
                    itemUuid,
                    hasMapping: !!mapping,
                    hasNoteInfo: !!noteInfo,
                    hasCardInfo: !!cardInfo,
                });
                continue;
            }

            const hiddenSnapshot = this.buildHiddenSnapshot(noteInfo.fields);
            const candidateResult = this.computeReviewDueOffsetCandidate(cardInfo, itemState, hiddenSnapshot);
            dueCandidateByItemUuid.set(itemUuid, candidateResult);
            this.logRuntimeDebug("[Syro-Anki][Pull][Calibrate]", {
                itemUuid,
                noteId: mapping.noteId,
                cardId: mapping.cardId,
                card: this.summarizeCardInfo(cardInfo),
                hiddenSnapshot: this.summarizeSnapshot(hiddenSnapshot),
                lastRemoteSnapshot: this.summarizeSnapshot(itemState.lastRemoteSnapshot),
                lastLocalSnapshot: this.summarizeSnapshot(itemState.lastLocalSnapshot),
                candidate: candidateResult.candidate,
                reason: candidateResult.reason,
                calibrationSource: candidateResult.calibrationSource,
                calibrationSourceLabel: candidateResult.calibrationSourceLabel,
                baselineDue: candidateResult.baselineDue,
                dueSource: candidateResult.dueSource,
                missingBaselineState: candidateResult.missingBaselineState,
            });
            if (candidateResult.candidate === null) {
                continue;
            }

            if (calibratedReviewDueOffset === null) {
                calibratedReviewDueOffset = candidateResult.candidate;
                this.logRuntimeDebug("[Syro-Anki][Pull][Calibrate] candidate accepted", {
                    itemUuid,
                    cardId: mapping.cardId,
                    reviewDueOffset: calibratedReviewDueOffset,
                });
                continue;
            }

            if (calibratedReviewDueOffset !== candidateResult.candidate) {
                this.logRuntimeDebug(
                    `[Syro-Anki] reviewDueOffset conflict ignored: current=${calibratedReviewDueOffset}, candidate=${candidateResult.candidate}, cardId=${cardInfo.cardId}`,
                );
            }
        }
        state.global.reviewDueOffset = calibratedReviewDueOffset;
        this.logRuntimeDebug("[Syro-Anki][Pull] calibrated", {
            reviewDueOffset: state.global.reviewDueOffset,
        });

        let processed = 0;
        for (const [itemUuid, itemState] of mappedEntries) {
            try {
                const mapping = itemState.mapping;
                const noteInfo = mapping ? noteInfoById.get(mapping.noteId) : null;
                const cardInfo = mapping ? cardInfoById.get(mapping.cardId) : null;
                if (!mapping || !noteInfo || !cardInfo) {
                    itemState.mapping = null;
                    this.logRuntimeDebug("[Syro-Anki][Pull][Apply] dropped-missing-mapping", {
                        itemUuid,
                        hasMapping: !!mapping,
                        hasNoteInfo: !!noteInfo,
                        hasCardInfo: !!cardInfo,
                    });
                    continue;
                }

                const remoteRecord = this.buildRemoteRecord(
                    itemUuid,
                    noteInfo,
                    cardInfo,
                    itemState,
                    state.global.reviewDueOffset,
                );
                itemState.mapping = {
                    ...mapping,
                    deckName: remoteRecord.deckName,
                    filePath: remoteRecord.filePath,
                    cardHash: remoteRecord.cardHash,
                };
                itemState.lastKnownCardHash = remoteRecord.cardHash;
                itemState.lastKnownFilePath = remoteRecord.filePath;

                const remoteSnapshot = chooseLatestSnapshot(
                    remoteRecord.cardSnapshot,
                    remoteRecord.hiddenSnapshot,
                );
                const remoteChangedAt = Math.max(
                    remoteRecord.mod,
                    remoteRecord.hiddenSnapshot?.updatedAt ?? 0,
                    remoteSnapshot?.updatedAt ?? 0,
                );
                maxCursor = Math.max(maxCursor, remoteChangedAt);
                const builtSnapshot = builtSnapshots.get(itemUuid);
                const candidateResult = dueCandidateByItemUuid.get(itemUuid) ?? null;
                let decision = "remote-record";
                let applied = false;

                this.logRuntimeDebug("[Syro-Anki][Pull][Apply] remote-record", {
                    itemUuid,
                    noteId: mapping.noteId,
                    cardId: mapping.cardId,
                    card: this.summarizeCardInfo(cardInfo),
                    remoteSnapshot: this.summarizeSnapshot(remoteSnapshot),
                    hiddenSnapshot: this.summarizeSnapshot(remoteRecord.hiddenSnapshot),
                    cardSnapshot: this.summarizeSnapshot(remoteRecord.cardSnapshot),
                    remoteChangedAt,
                    lastPullCursor: state.global.lastPullCursor,
                });

                if (
                    remoteRecord.cardSnapshot?.queue === CardQueue.Review &&
                    cardInfo.due !== null &&
                    state.global.reviewDueOffset === null &&
                    remoteRecord.cardSnapshot.nextReview <= 0
                ) {
                    this.logRuntimeDebug("[Syro-Anki][Pull][Diagnosis] remote review due unresolved", {
                        itemUuid,
                        message:
                            "首次远端复习缺少可用 review baseline，无法可靠换算 review due day。",
                        currentIsDue: remoteRecord.cardSnapshot.nextReview <= 0,
                        card: this.summarizeCardInfo(cardInfo),
                        hiddenSnapshot: this.summarizeSnapshot(remoteRecord.hiddenSnapshot),
                        lastRemoteSnapshot: this.summarizeSnapshot(itemState.lastRemoteSnapshot),
                        lastLocalSnapshot: this.summarizeSnapshot(itemState.lastLocalSnapshot),
                        remoteCardSnapshot: this.summarizeSnapshot(remoteRecord.cardSnapshot),
                    });
                }

                if (!remoteSnapshot || remoteChangedAt <= state.global.lastPullCursor) {
                    decision = !remoteSnapshot ? "missing-remote-snapshot" : "stale-pull-cursor";
                    this.logRuntimeDebug("[Syro-Anki][Pull][Apply] skipped", {
                        itemUuid,
                        reason: decision,
                        remoteChangedAt,
                        lastPullCursor: state.global.lastPullCursor,
                    });
                    comparisonRows.push(
                        this.buildDueComparisonRow(
                            itemUuid,
                            mapping,
                            builtSnapshot,
                            cardInfo,
                            itemState,
                            ankiDueByCardId.get(mapping.cardId) ?? null,
                            candidateResult,
                            remoteSnapshot,
                            this.findCardItemByUuid(itemUuid),
                            decision,
                            applied,
                            state.global.reviewDueOffset,
                        ),
                    );
                    continue;
                }

                const localBaseline = chooseLatestSnapshot(
                    itemState.lastLocalSnapshot,
                    itemState.lastRemoteSnapshot,
                );
                if (localBaseline && remoteSnapshot.updatedAt <= localBaseline.updatedAt) {
                    itemState.lastRemoteSnapshot = remoteSnapshot;
                    itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                    decision = "remote-not-newer-than-local-baseline";
                    this.logRuntimeDebug("[Syro-Anki][Pull][Apply] skipped", {
                        itemUuid,
                        reason: decision,
                        remoteUpdatedAt: remoteSnapshot.updatedAt,
                        localBaseline: this.summarizeSnapshot(localBaseline),
                    });
                    comparisonRows.push(
                        this.buildDueComparisonRow(
                            itemUuid,
                            mapping,
                            builtSnapshot,
                            cardInfo,
                            itemState,
                            ankiDueByCardId.get(mapping.cardId) ?? null,
                            candidateResult,
                            remoteSnapshot,
                            this.findCardItemByUuid(itemUuid),
                            decision,
                            applied,
                            state.global.reviewDueOffset,
                        ),
                    );
                    continue;
                }

                const item = this.findCardItemByUuid(itemUuid);
                if (!item) {
                    itemState.lastRemoteSnapshot = remoteSnapshot;
                    itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                    decision = "local-item-missing";
                    this.logRuntimeDebug("[Syro-Anki][Pull][Apply] skipped", {
                        itemUuid,
                        reason: decision,
                        remoteSnapshot: this.summarizeSnapshot(remoteSnapshot),
                    });
                    comparisonRows.push(
                        this.buildDueComparisonRow(
                            itemUuid,
                            mapping,
                            builtSnapshot,
                            cardInfo,
                            itemState,
                            ankiDueByCardId.get(mapping.cardId) ?? null,
                            candidateResult,
                            remoteSnapshot,
                            item,
                            decision,
                            applied,
                            state.global.reviewDueOffset,
                        ),
                    );
                    continue;
                }

                decision = "applied";
                this.logRuntimeDebug("[Syro-Anki][Pull][Apply] applying", {
                    itemUuid,
                    remoteSnapshot: this.summarizeSnapshot(remoteSnapshot),
                    localBaseline: this.summarizeSnapshot(localBaseline),
                });
                this.applySnapshotToItem(item, remoteSnapshot);
                if (builtSnapshot) {
                    this.refreshCardRuntime(builtSnapshot.card, item);
                }
                await this.plugin.store.saveReviewItemDelta(item);
                applied = true;

                this.logRuntimeDebug("[Syro-Anki][Pull][Apply] applied", {
                    itemUuid,
                    queue: item.queue,
                    nextReview: item.nextReview,
                    isDue: item.isDue,
                });

                itemState.lastRemoteSnapshot = remoteSnapshot;
                itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                itemState.lastMergedUpdatedAt = remoteSnapshot.updatedAt;
                result.pulled += 1;
                comparisonRows.push(
                    this.buildDueComparisonRow(
                        itemUuid,
                        mapping,
                        builtSnapshot,
                        cardInfo,
                        itemState,
                        ankiDueByCardId.get(mapping.cardId) ?? null,
                        candidateResult,
                        remoteSnapshot,
                        item,
                        decision,
                        applied,
                        state.global.reviewDueOffset,
                    ),
                );
            } finally {
                processed += 1;
                onProgress?.(
                    processed,
                    mappedEntries.length,
                    `正在拉取 Anki 远端变更 (${processed}/${mappedEntries.length})...`,
                );
            }
        }

        state.global.lastPullCursor = maxCursor;
        this.emitDueComparisonReport(comparisonRows, unmappedByDeck, result);
    }

    private async createSingleNote(
        client: AnkiConnectClient,
        preparedNote: PreparedCreateNote,
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
    ): Promise<void> {
        const { op, noteInput } = preparedNote;
        try {
            const addResults = await client.addNotes([noteInput]);
            const noteId = addResults[0];
            if (typeof noteId !== "number") {
                const detail = await this.diagnoseAddNoteFailure(client, noteInput);
                result.errors.push(
                    `[create:${op.itemUuid}] ${this.formatCreateContext(op)} ${detail ?? "addNotes returned null"}`,
                );
                return;
            }

            const noteInfo = (await client.notesInfo([noteId]))[0];
            this.registerCreatedNote(op, noteId, noteInfo, state, result);
        } catch (error) {
            const detail = await this.diagnoseAddNoteFailure(client, noteInput);
            const suffix = detail ? `; ${detail}` : "";
            result.errors.push(`[create:${op.itemUuid}] ${this.formatCreateContext(op)} ${String(error)}${suffix}`);
        }
    }

    private async createNotes(
        client: AnkiConnectClient,
        ops: AnkiSyncPlanOperation[],
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const createOps = ops.filter((op) => op.type === "create" && op.payload);
        if (createOps.length === 0) {
            onProgress?.(0, 0, "No new Anki cards to create");
            return;
        }

        const preparedNotes = await this.preflightCreateNotes(client, createOps, result);
        let processed = createOps.length - preparedNotes.length;
        if (processed > 0) {
            onProgress?.(
                processed,
                createOps.length,
                `Anki 预检跳过 ${processed} 张卡片 (${processed}/${createOps.length})...`,
            );
        }
        if (preparedNotes.length === 0) {
            onProgress?.(createOps.length, createOps.length, "Anki 建卡预检后无可创建卡片");
            return;
        }

        for (const chunk of chunkArray(preparedNotes)) {
            try {
                const addResults = await client.addNotes(
                    chunk.map((entry) => entry.noteInput),
                );
                const noteInfos = await this.loadNoteInfoMap(
                    client,
                    addResults.filter((value): value is number => typeof value === "number"),
                );

                for (let index = 0; index < chunk.length; index += 1) {
                    const preparedNote = chunk[index];
                    const op = preparedNote.op;
                    const noteId = addResults[index];
                    if (typeof noteId === "number") {
                        this.registerCreatedNote(op, noteId, noteInfos.get(noteId), state, result);
                    } else {
                        await this.createSingleNote(client, preparedNote, state, result);
                    }
                    processed += 1;
                    onProgress?.(
                        processed,
                        createOps.length,
                        `正在创建 Anki 卡片 (${processed}/${createOps.length})...`,
                    );
                }
            } catch (error) {
                for (const preparedNote of chunk) {
                    await this.createSingleNote(client, preparedNote, state, result);
                    processed += 1;
                    onProgress?.(
                        processed,
                        createOps.length,
                        `正在创建 Anki 卡片 (${processed}/${createOps.length})...`,
                    );
                }
            }
        }
    }

    private async updateNotes(
        client: AnkiConnectClient,
        ops: AnkiSyncPlanOperation[],
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const updateOps = ops.filter((op) => op.type === "update" && op.payload && op.mapping);
        if (updateOps.length === 0) {
            onProgress?.(0, 0, "No Anki cards to update");
            return;
        }

        let processed = 0;
        for (const op of updateOps) {
            try {
                await client.updateNoteFields(op.mapping!.noteId, op.payload!.fields);
                if (op.mapping!.deckName !== op.payload!.deckName) {
                    await client.changeDeck([op.mapping!.cardId], op.payload!.deckName);
                }

                const itemState = ensureAnkiSyncItemState(state, op.itemUuid);
                itemState.mapping = {
                    ...op.mapping!,
                    deckName: op.payload!.deckName,
                    filePath: op.payload!.filePath,
                    cardHash: op.payload!.cardHash,
                    modelName: op.payload!.modelName,
                };
                itemState.lastKnownCardHash = op.payload!.cardHash;
                itemState.lastKnownFilePath = op.payload!.filePath;
                result.updated += 1;
            } catch (error) {
                result.errors.push(`[update:${op.itemUuid}] ${String(error)}`);
            } finally {
                processed += 1;
                onProgress?.(
                    processed,
                    updateOps.length,
                    `正在更新 Anki 卡片 (${processed}/${updateOps.length})...`,
                );
            }
        }
    }

    private async detachNote(client: AnkiConnectClient, noteId: number, cardId: number): Promise<void> {
        await client.updateNoteFields(noteId, {
            syro_item_uuid: "",
            syro_file_path: "",
            syro_card_hash: "",
            syro_snapshot: "",
            syro_updated_at: "",
        });
        await client.changeDeck([cardId], DETACHED_DECK_NAME);
    }

    private async removeNotes(
        client: AnkiConnectClient,
        ops: AnkiSyncPlanOperation[],
        state: AnkiSyncStateFile,
        result: AnkiSyncRunResult,
        onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<void> {
        const destructiveOps = ops.filter((op) => (op.type === "delete" || op.type === "detach") && op.mapping);
        if (destructiveOps.length === 0) {
            onProgress?.(0, 0, "No Anki cards to remove");
            return;
        }

        let processed = 0;
        for (const op of destructiveOps) {
            const mapping = op.mapping!;
            const itemState = ensureAnkiSyncItemState(state, op.itemUuid);
            try {
                if (op.type === "delete") {
                    try {
                        await client.deleteNotes([mapping.noteId]);
                        result.deleted += 1;
                    } catch (error) {
                        await this.detachNote(client, mapping.noteId, mapping.cardId);
                        result.detached += 1;
                        result.errors.push(`[delete:${op.itemUuid}] fallback to detach: ${String(error)}`);
                    }
                } else {
                    await this.detachNote(client, mapping.noteId, mapping.cardId);
                    result.detached += 1;
                }
                itemState.mapping = null;
                itemState.pendingReviewWritebacks = [];
            } catch (error) {
                result.errors.push(`[${op.type}:${op.itemUuid}] ${String(error)}`);
            } finally {
                processed += 1;
                onProgress?.(
                    processed,
                    destructiveOps.length,
                    `正在清理 Anki 卡片 (${processed}/${destructiveOps.length})...`,
                );
            }
        }
    }

    async sync(
        deckTree: Deck,
        syncSignature: string,
        options: AnkiSyncRunOptions = {},
    ): Promise<AnkiSyncRunResult> {
        const result = createEmptyRunResult();
        if (!this.isEnabled()) {
            return result;
        }

        const settings = this.plugin.data.settings;
        const endpoint = settings.ankiSyncEndpoint || DEFAULT_ANKI_SYNC_ENDPOINT;
        const modelName = settings.ankiSyncModelName || DEFAULT_ANKI_MODEL_NAME;
        const deletePolicy = settings.ankiSyncDeletePolicy || DEFAULT_ANKI_DELETE_POLICY;
        const state = await this.getState();
        state.global.endpoint = endpoint;
        state.global.connection.endpoint = endpoint;
        const reportProgress = this.createProgressReporter(options);
        reportProgress("prepare", 0, 1, "正在准备 Anki 同步...");

        try {
            const client = this.clientFactory(endpoint);
            const version = await client.getVersion();
            state.global.connection.version = version;
            state.global.connection.lastVerifiedAt = this.now();
            await client.ensureModel(modelName);
            state.global.connection.modelReady = true;
            reportProgress("prepare", 1, 1, "Anki 已连接");

            const fileTextByPath = await this.buildFileTextMap(deckTree);
            const vaultName = this.plugin.app?.vault?.getName?.() ?? "";
            const hasAdvancedUri = await this.hasAdvancedUriPlugin();
            const builtSnapshots = buildSyroAnkiCardSnapshotMap(deckTree, state.items, modelName, {
                settings,
                store: this.plugin.store,
                fileTextByPath,
                vaultName,
                hasAdvancedUri,
            });
            await this.renderSnapshotFields(builtSnapshots);
            for (const [itemUuid, builtSnapshot] of builtSnapshots.entries()) {
                for (const warning of builtSnapshot.payload.warnings) {
                    result.errors.push(`[render:${itemUuid}] ${warning}`);
                }
            }
            try {
                await this.discoverRemoteMappings(
                    client,
                    state,
                    new Set([...builtSnapshots.keys(), ...Object.keys(state.items)]),
                    result,
                );
            } catch (error) {
                result.errors.push(`[discover] ${String(error)}`);
            }
            await this.flushPendingWritebacks(client, state, result, (current, total, message) =>
                reportProgress("writeback", current, total, message),
            );
            await this.pullRemoteChanges(client, state, builtSnapshots, result, (current, total, message) =>
                reportProgress("pull", current, total, message),
            );

            const payloadsByUuid = new Map(
                Array.from(builtSnapshots.entries()).map(([itemUuid, builtSnapshot]) => [
                    itemUuid,
                    builtSnapshot.payload,
                ]),
            );
            const ops = planAnkiSyncOperations(payloadsByUuid, state.items, deletePolicy);
            const deckNames = this.collectDeckNames(ops);
            if (deckNames.length > 0) {
                const deckErrors = await client.ensureDecks(
                    deckNames,
                    (current, total, deckName) =>
                        reportProgress(
                            "ensure-decks",
                            current,
                            total,
                            `正在确保 Anki 牌组 (${current}/${total}): ${deckName}`,
                        ),
                );
                result.errors.push(
                    ...deckErrors.map(
                        (deckError) => `[deck:${deckError.deckName}] ${deckError.error}`,
                    ),
                );
            } else {
                reportProgress("ensure-decks", 0, 0, "无需创建 Anki 牌组");
            }

            await this.uploadSnapshotMedia(client, builtSnapshots, result, (current, total, message) =>
                reportProgress("media", current, total, message),
            );
            await this.createNotes(client, ops, state, result, (current, total, message) =>
                reportProgress("create", current, total, message),
            );
            await this.updateNotes(client, ops, state, result, (current, total, message) =>
                reportProgress("update", current, total, message),
            );
            await this.removeNotes(client, ops, state, result, (current, total, message) =>
                reportProgress("delete", current, total, message),
            );
            reportProgress("finalize", 0, 1, "正在完成 Anki 同步...");

            for (const op of ops) {
                if (op.type !== "noop") {
                    continue;
                }
                const itemState = ensureAnkiSyncItemState(state, op.itemUuid);
                itemState.lastKnownCardHash = op.payload?.cardHash ?? itemState.lastKnownCardHash;
                itemState.lastKnownFilePath = op.payload?.filePath ?? itemState.lastKnownFilePath;
                result.noop += 1;
            }

            state.global.retry.consecutiveFailures = 0;
            state.global.retry.lastFailureAt = 0;
            state.global.retry.lastFailureMessage = null;
            state.global.lastFullSignature = syncSignature;
            pruneAnkiSyncState(state, new Set(builtSnapshots.keys()));
            await this.persistState();
            reportProgress(
                "finalize",
                1,
                1,
                result.errors.length > 0
                    ? "Anki \u540c\u6b65\u5b8c\u6210\uff08\u6709\u8b66\u544a\uff09"
                    : "Anki \u540c\u6b65\u5b8c\u6210",
            );
        } catch (error) {
            state.global.retry.consecutiveFailures += 1;
            state.global.retry.lastFailureAt = this.now();
            state.global.retry.lastFailureMessage = String(error);
            result.errors.push(String(error));
            await this.persistState();
            reportProgress("finalize", 1, 1, "Anki 同步失败");
            console.warn("[Syro-Anki] Sync skipped due to Anki error:", error);
        }

        return result;
    }
}
