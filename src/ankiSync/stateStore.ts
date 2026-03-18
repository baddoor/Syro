import { Iadapter } from "src/dataStore/adapter";
import {
    ANKI_SYNC_STATE_VERSION,
    AnkiSyncItemState,
    AnkiSyncStateFile,
    DEFAULT_ANKI_SYNC_ENDPOINT,
    createDefaultAnkiSyncState,
    createEmptyAnkiSyncItemState,
} from "src/ankiSync/types";

function buildSidecarPath(basePath: string): string {
    if (!basePath) {
        return "anki_sync_state.json";
    }

    const separatorIndex = Math.max(basePath.lastIndexOf("/"), basePath.lastIndexOf("\\"));
    const dir = separatorIndex >= 0 ? basePath.substring(0, separatorIndex + 1) : "";
    return `${dir}anki_sync_state.json`;
}

function normalizeItemState(value: Partial<AnkiSyncItemState> | null | undefined): AnkiSyncItemState {
    const fallback = createEmptyAnkiSyncItemState();
    if (!value) {
        return fallback;
    }

    return {
        ...fallback,
        ...value,
        mapping: value.mapping ?? null,
        lastLocalSnapshot: value.lastLocalSnapshot ?? null,
        lastRemoteSnapshot: value.lastRemoteSnapshot ?? null,
        pendingReviewWritebacks: Array.isArray(value.pendingReviewWritebacks)
            ? value.pendingReviewWritebacks
            : [],
        lastLocalUpdatedAt: value.lastLocalUpdatedAt ?? 0,
        lastRemoteUpdatedAt: value.lastRemoteUpdatedAt ?? 0,
        lastMergedUpdatedAt: value.lastMergedUpdatedAt ?? 0,
        lastKnownCardHash: value.lastKnownCardHash ?? "",
        lastKnownFilePath: value.lastKnownFilePath ?? "",
    };
}

function normalizeState(state: Partial<AnkiSyncStateFile> | null | undefined): AnkiSyncStateFile {
    const endpoint = state?.global?.endpoint ?? DEFAULT_ANKI_SYNC_ENDPOINT;
    const normalized = createDefaultAnkiSyncState(endpoint);

    if (!state || state.version !== ANKI_SYNC_STATE_VERSION) {
        return normalized;
    }

    normalized.global = {
        ...normalized.global,
        ...state.global,
        endpoint: state.global?.endpoint ?? endpoint,
        connection: {
            ...normalized.global.connection,
            ...(state.global?.connection ?? {}),
            endpoint: state.global?.connection?.endpoint ?? state.global?.endpoint ?? endpoint,
        },
        retry: {
            ...normalized.global.retry,
            ...(state.global?.retry ?? {}),
        },
    };

    normalized.items = {};
    for (const [itemUuid, itemState] of Object.entries(state.items ?? {})) {
        normalized.items[itemUuid] = normalizeItemState(itemState);
    }

    return normalized;
}

export class AnkiSyncStateStore {
    constructor(private readonly getBasePath: () => string) {}

    getStatePath(): string {
        return buildSidecarPath(this.getBasePath());
    }

    async load(): Promise<AnkiSyncStateFile> {
        const adapter = Iadapter.instance.adapter;
        const statePath = this.getStatePath();

        try {
            if (!(await adapter.exists(statePath))) {
                return createDefaultAnkiSyncState();
            }

            const raw = await adapter.read(statePath);
            if (!raw) {
                return createDefaultAnkiSyncState();
            }

            return normalizeState(JSON.parse(raw));
        } catch (error) {
            console.warn("[Syro-Anki] Failed to load anki sync state, using defaults:", error);
            return createDefaultAnkiSyncState();
        }
    }

    async save(state: AnkiSyncStateFile): Promise<void> {
        const adapter = Iadapter.instance.adapter;
        const statePath = this.getStatePath();
        const normalized = normalizeState(state);
        await adapter.write(statePath, JSON.stringify(normalized));
    }
}

export function ensureAnkiSyncItemState(
    state: AnkiSyncStateFile,
    itemUuid: string,
): AnkiSyncItemState {
    if (!state.items[itemUuid]) {
        state.items[itemUuid] = createEmptyAnkiSyncItemState();
    }

    return state.items[itemUuid];
}

export function pruneAnkiSyncState(
    state: AnkiSyncStateFile,
    retainedItemUuids: Set<string>,
): void {
    for (const [itemUuid, itemState] of Object.entries(state.items)) {
        const hasPending = (itemState.pendingReviewWritebacks?.length ?? 0) > 0;
        const hasMapping = !!itemState.mapping;
        if (retainedItemUuids.has(itemUuid) || hasPending || hasMapping) {
            continue;
        }

        delete state.items[itemUuid];
    }
}
