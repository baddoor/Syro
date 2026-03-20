import { CardQueue, FsrsReviewEvent } from "src/dataStore/repetitionItem";

export const ANKI_SYNC_STATE_VERSION = 1;
export const DEFAULT_ANKI_BASIC_MODEL_NAME = "Syro Card";
export const DEFAULT_ANKI_CLOZE_MODEL_NAME = "Syro Cloze";
export const DEFAULT_ANKI_MODEL_NAME = DEFAULT_ANKI_BASIC_MODEL_NAME;
export const DEFAULT_ANKI_SYNC_ENDPOINT = "http://127.0.0.1:8765";
export const DEFAULT_ANKI_DELETE_POLICY: AnkiDeletePolicy = "delete";

export type AnkiDeletePolicy = "delete" | "detach";
export type ReviewSnapshotSource = "syro" | "anki-card" | "anki-hidden";
export type AnkiOperationType = "create" | "update" | "delete" | "detach" | "noop";
export type SyroAnkiRenderSource = "locator" | "fallback";
export type AnkiMediaFieldName = "Front" | "Back" | "Context" | "Text" | "Back Extra";
export type AnkiModelKind = "basic" | "cloze";
export type AnkiSyncPhase =
    | "prepare"
    | "writeback"
    | "pull"
    | "ensure-decks"
    | "media"
    | "create"
    | "update"
    | "delete"
    | "finalize";

export interface ReviewSnapshot {
    queue: CardQueue;
    nextReview: number;
    interval: number;
    factor: number | null;
    reps: number;
    lapses: number;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    updatedAt: number;
    dueValue?: number | null;
    left?: number | null;
    raw?: Record<string, unknown> | null;
    source: ReviewSnapshotSource;
}

export interface PendingReviewWriteback {
    id: string;
    reviewEvent?: FsrsReviewEvent | null;
    snapshot: ReviewSnapshot;
    createdAt: number;
    attempts: number;
    lastError?: string | null;
}

export interface AnkiMapping {
    noteId: number;
    cardId: number;
    modelName: string;
    deckName: string;
    filePath: string;
    cardHash: string;
    detached?: boolean;
}

export interface AnkiSyncItemState {
    mapping: AnkiMapping | null;
    lastLocalSnapshot: ReviewSnapshot | null;
    lastRemoteSnapshot: ReviewSnapshot | null;
    pendingReviewWritebacks: PendingReviewWriteback[];
    lastMergedReviewId: number;
    lastPushedReviewId: number;
    lastLocalUpdatedAt: number;
    lastRemoteUpdatedAt: number;
    lastMergedUpdatedAt: number;
    lastKnownCardHash: string;
    lastKnownFilePath: string;
}

export interface AnkiConnectionCache {
    endpoint: string;
    version: number | null;
    lastVerifiedAt: number;
    modelReady: boolean;
}

export interface AnkiSyncRetryState {
    consecutiveFailures: number;
    lastFailureAt: number;
    lastFailureMessage: string | null;
}

export interface AnkiSyncGlobalState {
    endpoint: string;
    lastPullCursor: number;
    lastFullSignature: string;
    reviewDueOffset: number | null;
    connection: AnkiConnectionCache;
    retry: AnkiSyncRetryState;
}

export interface AnkiSyncStateFile {
    version: number;
    global: AnkiSyncGlobalState;
    items: Record<string, AnkiSyncItemState>;
}

export interface AnkiMediaReferenceCandidate {
    fieldName: AnkiMediaFieldName;
    originalPath: string;
    index: number;
    sourceType: "wikilink" | "markdown" | "html";
}

export interface AnkiMediaReference {
    fieldName: AnkiMediaFieldName;
    vaultPath: string;
    filename: string;
    originalPath: string;
}

export interface AnkiBinaryMediaAsset {
    filename: string;
    base64Data: string;
    vaultPath: string;
}

export interface SyroAnkiCardPayload {
    itemUuid: string;
    deckName: string;
    modelName: string;
    modelKind: AnkiModelKind;
    filePath: string;
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
    mediaRefs: AnkiMediaReference[];
    cardHash: string;
    snapshot: ReviewSnapshot;
    fields: Record<string, string>;
}

export interface AnkiRemoteRecord {
    itemUuid: string;
    noteId: number;
    cardId: number;
    deckName: string;
    cardHash: string;
    filePath: string;
    mod: number;
    hiddenSnapshot: ReviewSnapshot | null;
    cardSnapshot: ReviewSnapshot | null;
    latestReview: AnkiCardReview | null;
    fields: Record<string, string>;
}

export interface AnkiSyncPlanOperation {
    type: AnkiOperationType;
    itemUuid: string;
    payload: SyroAnkiCardPayload | null;
    mapping: AnkiMapping | null;
    reason: string;
}

export interface AnkiSyncRunResult {
    created: number;
    updated: number;
    deleted: number;
    detached: number;
    pulled: number;
    writebacks: number;
    noop: number;
    errors: string[];
}

export interface AnkiSyncProgress {
    phase: AnkiSyncPhase;
    current: number;
    total: number;
    overallCurrent: number;
    overallTotal: number;
    message: string;
}

export interface AnkiSyncRunOptions {
    onProgress?: (progress: AnkiSyncProgress) => void;
}

export interface AnkiCardInfo {
    cardId: number;
    noteId: number;
    deckName: string;
    factor: number | null;
    interval: number;
    type: number | null;
    queue: number;
    due: number | null;
    reps: number;
    lapses: number;
    left: number | null;
    mod: number;
}

export interface AnkiCardReview {
    id: number;
    usn: number;
    ease: number;
    ivl: number;
    lastIvl: number;
    factor: number;
    time: number;
    type: number;
}

export interface AnkiInsertedReview {
    reviewTime: number;
    cardId: number;
    usn: number;
    buttonPressed: number;
    newInterval: number;
    previousInterval: number;
    newFactor: number;
    reviewDuration: number;
    reviewType: number;
}

export interface AnkiNoteInfo {
    noteId: number;
    cards: number[];
    modelName: string;
    fields: Record<string, string>;
    tags: string[];
    mod: number;
}

export interface AnkiCanAddNoteResult {
    canAdd: boolean;
    error?: string;
}

export interface BuiltSyroCardSnapshot {
    payload: SyroAnkiCardPayload;
    card: import("src/Card").Card;
}

export function createEmptyAnkiSyncItemState(): AnkiSyncItemState {
    return {
        mapping: null,
        lastLocalSnapshot: null,
        lastRemoteSnapshot: null,
        pendingReviewWritebacks: [],
        lastMergedReviewId: 0,
        lastPushedReviewId: 0,
        lastLocalUpdatedAt: 0,
        lastRemoteUpdatedAt: 0,
        lastMergedUpdatedAt: 0,
        lastKnownCardHash: "",
        lastKnownFilePath: "",
    };
}

export function createDefaultAnkiSyncState(endpoint = DEFAULT_ANKI_SYNC_ENDPOINT): AnkiSyncStateFile {
    return {
        version: ANKI_SYNC_STATE_VERSION,
        global: {
            endpoint,
            lastPullCursor: 0,
            lastFullSignature: "",
            reviewDueOffset: null,
            connection: {
                endpoint,
                version: null,
                lastVerifiedAt: 0,
                modelReady: false,
            },
            retry: {
                consecutiveFailures: 0,
                lastFailureAt: 0,
                lastFailureMessage: null,
            },
        },
        items: {},
    };
}

export function createEmptyRunResult(): AnkiSyncRunResult {
    return {
        created: 0,
        updated: 0,
        deleted: 0,
        detached: 0,
        pulled: 0,
        writebacks: 0,
        noop: 0,
        errors: [],
    };
}
