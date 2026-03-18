import { Iadapter } from "src/dataStore/adapter";
import { AnkiSyncStateStore, ensureAnkiSyncItemState } from "src/ankiSync/stateStore";

describe("ankiSync state store", () => {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };

    beforeEach(() => {
        files.clear();
        (Iadapter as any)._instance = { adapter };
    });

    it("writes state and reloads it after restart", async () => {
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        const itemState = ensureAnkiSyncItemState(state, "uuid-1");
        itemState.lastKnownCardHash = "hash-1";
        itemState.pendingReviewWritebacks = [];

        await store.save(state);

        const reloadedStore = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const reloaded = await reloadedStore.load();
        expect(reloaded.items["uuid-1"].lastKnownCardHash).toBe("hash-1");
        expect(adapter.write).toHaveBeenCalled();
    });

    it("falls back to defaults when the sidecar is corrupted", async () => {
        files.set(
            ".obsidian/plugins/syro/anki_sync_state.json",
            "{this-is-not-valid-json",
        );
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        expect(state.items).toEqual({});
        expect(state.global.lastPullCursor).toBe(0);
        warnSpy.mockRestore();
    });
});
