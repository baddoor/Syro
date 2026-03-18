import { Card } from "src/Card";
import { CardListType, Deck } from "src/Deck";
import { NoteCardScheduleParser } from "src/CardSchedule";
import { MarkdownRenderer } from "obsidian";
import { DataStore } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { CardQueue, RPITEMTYPE, RepetitionItem } from "src/dataStore/repetitionItem";
import { SRSettings } from "src/settings";
import { AnkiConnectClient } from "src/ankiSync/AnkiConnectClient";
import { buildSyroAnkiCardSnapshotMap, createReviewSnapshotFromItem } from "src/ankiSync/payload";
import { chooseLatestSnapshot, areSnapshotsEquivalent, planAnkiSyncOperations } from "src/ankiSync/planner";
import { AnkiSyncStateStore, ensureAnkiSyncItemState, pruneAnkiSyncState } from "src/ankiSync/stateStore";
import {
    AnkiCanAddNoteResult,
    AnkiCardInfo,
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

export interface AnkiSyncPluginAdapter {
    data: { settings: SRSettings };
    app?: {
        vault?: {
            getName?: () => string;
            configDir?: string;
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

function chunkArray<T>(values: T[], chunkSize = 25): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        result.push(values.slice(index, index + chunkSize));
    }
    return result;
}

function toCardQueue(value: number): CardQueue {
    if (value === CardQueue.Learn || value === CardQueue.Review || value === CardQueue.Suspended) {
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
                message,
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

    private async renderMarkdownFragment(
        markdown: string,
        sourcePath: string,
        side: "front" | "back" | "context",
    ): Promise<string> {
        const normalized = this.normalizeLegacyClozeMarkers(markdown, side).trim();
        if (!normalized) {
            return "";
        }

        const app = this.plugin.app;
        if (!app || typeof document === "undefined") {
            return this.renderFallbackHtml(normalized);
        }

        try {
            const container = document.createElement("div");
            await MarkdownRenderer.render(app as any, normalized, container, sourcePath, this.plugin as any);
            return container.innerHTML.trim();
        } catch {
            return this.renderFallbackHtml(normalized);
        }
    }

    private async renderSnapshotFields(
        builtSnapshots: Map<string, BuiltSyroCardSnapshot>,
    ): Promise<void> {
        for (const { payload } of builtSnapshots.values()) {
            const sourcePath = payload.filePath ?? "";
            payload.front = await this.renderMarkdownFragment(payload.front, sourcePath, "front");
            payload.back = await this.renderMarkdownFragment(payload.back, sourcePath, "back");
            payload.context = await this.renderMarkdownFragment(payload.context, sourcePath, "context");
            payload.breadcrumb = this.buildBreadcrumbHtml(payload.breadcrumb, payload.openLink, payload.exactLink);
            payload.source = this.buildSourceHtml(payload.source, payload.openLink, payload.exactLink);

            payload.fields.Front = payload.front;
            payload.fields.Back = payload.back;
            payload.fields.Context = payload.context;
            payload.fields.Breadcrumb = payload.breadcrumb;
            payload.fields.Source = payload.source;
            payload.fields.OpenLink = payload.openLink;
            payload.fields.ExactLink = payload.exactLink;
        }
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

    private buildCardSnapshot(
        cardInfo: AnkiCardInfo,
        itemState: AnkiSyncItemState,
        reviewDueOffset: number | null,
    ): ReviewSnapshot {
        let nextReview = 0;
        if (cardInfo.queue === CardQueue.Review && reviewDueOffset !== null && cardInfo.due !== null) {
            nextReview = Math.max(0, (cardInfo.due - reviewDueOffset) * DAY_MS);
        } else if (cardInfo.queue === CardQueue.Learn && cardInfo.due !== null) {
            nextReview = cardInfo.due * 1000;
        } else {
            nextReview =
                itemState.lastRemoteSnapshot?.nextReview ?? itemState.lastLocalSnapshot?.nextReview ?? 0;
        }

        const reps = cardInfo.reps ?? 0;
        const lapses = cardInfo.lapses ?? 0;
        return {
            queue: toCardQueue(cardInfo.queue),
            nextReview,
            interval: Math.max(0, cardInfo.interval ?? 0),
            factor: cardInfo.factor ?? null,
            reps,
            lapses,
            timesReviewed: reps,
            timesCorrect: Math.max(reps - lapses, 0),
            errorStreak: cardInfo.queue === CardQueue.Learn && lapses > 0 ? 1 : 0,
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
        return {
            itemUuid,
            noteId: noteInfo.noteId,
            cardId: cardInfo.cardId,
            deckName: cardInfo.deckName,
            cardHash: noteInfo.fields.syro_card_hash ?? itemState.mapping?.cardHash ?? "",
            filePath: noteInfo.fields.syro_file_path ?? itemState.mapping?.filePath ?? "",
            mod: (cardInfo.mod ?? 0) * 1000,
            hiddenSnapshot: this.buildHiddenSnapshot(noteInfo.fields),
            cardSnapshot: this.buildCardSnapshot(cardInfo, itemState, reviewDueOffset),
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

        let maxCursor = state.global.lastPullCursor;
        let processed = 0;
        for (const [itemUuid, itemState] of mappedEntries) {
            try {
                const mapping = itemState.mapping;
                const noteInfo = mapping ? noteInfoById.get(mapping.noteId) : null;
                const cardInfo = mapping ? cardInfoById.get(mapping.cardId) : null;
                if (!mapping || !noteInfo || !cardInfo) {
                    itemState.mapping = null;
                    continue;
                }

                const remoteRecord = this.buildRemoteRecord(
                    itemUuid,
                    noteInfo,
                    cardInfo,
                    itemState,
                    state.global.reviewDueOffset,
                );
                const calibrationSource =
                    remoteRecord.hiddenSnapshot?.nextReview ??
                    itemState.lastRemoteSnapshot?.nextReview ??
                    itemState.lastLocalSnapshot?.nextReview ??
                    0;
                if (
                    cardInfo.queue === CardQueue.Review &&
                    cardInfo.due !== null &&
                    calibrationSource > 0
                ) {
                    state.global.reviewDueOffset =
                        cardInfo.due - Math.floor(calibrationSource / DAY_MS);
                }

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

                if (!remoteSnapshot || remoteChangedAt <= state.global.lastPullCursor) {
                    continue;
                }

                const localBaseline = chooseLatestSnapshot(
                    itemState.lastLocalSnapshot,
                    itemState.lastRemoteSnapshot,
                );
                if (localBaseline && remoteSnapshot.updatedAt <= localBaseline.updatedAt) {
                    itemState.lastRemoteSnapshot = remoteSnapshot;
                    itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                    continue;
                }

                const item = this.findCardItemByUuid(itemUuid);
                if (!item) {
                    itemState.lastRemoteSnapshot = remoteSnapshot;
                    itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                    continue;
                }

                this.applySnapshotToItem(item, remoteSnapshot);
                const builtSnapshot = builtSnapshots.get(itemUuid);
                if (builtSnapshot) {
                    this.refreshCardRuntime(builtSnapshot.card, item);
                }
                await this.plugin.store.saveReviewItemDelta(item);

                itemState.lastRemoteSnapshot = remoteSnapshot;
                itemState.lastRemoteUpdatedAt = remoteSnapshot.updatedAt;
                itemState.lastMergedUpdatedAt = remoteSnapshot.updatedAt;
                result.pulled += 1;
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
