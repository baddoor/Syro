import { Iadapter } from "src/dataStore/adapter";
import { AiThemeDeckStore } from "src/dataStore/aiThemeDeckStore";
import { DEFAULT_SETTINGS } from "src/settings";
import { AiThemePackRecord } from "src/aiTheme/types";

class MemoryDataAdapter {
    private readonly files = new Map<string, string>();

    async exists(path: string): Promise<boolean> {
        return this.files.has(path);
    }

    async read(path: string): Promise<string> {
        return this.files.get(path) ?? "";
    }

    async write(path: string, data: string): Promise<void> {
        this.files.set(path, data);
    }
}

class MockIAdapter extends Iadapter {
    constructor(adapter: MemoryDataAdapter) {
        super({ metadataCache: {}, vault: { adapter } } as any);
        this.metadataCache = {} as any;
        this.adapter = adapter as any;
        this.vault = { adapter } as any;
    }
}

function createPack(id: string): AiThemePackRecord {
    const now = Date.now();
    return {
        id,
        name: "AI 包",
        themePrompt: "prompt",
        retriever: "smart-connections",
        finalEntryLimit: 10,
        entryCount: 2,
        cardCount: 3,
        orderMode: "relevance" as const,
        llmEnabled: false,
        createdAt: now,
        updatedAt: now,
        sourceBlocks: [],
        entryRefs: [],
        cardRefs: [],
    };
}

describe("AiThemeDeckStore", () => {
    it("supports upsert, list, remove and reload roundtrip", async () => {
        const adapter = new MemoryDataAdapter();
        new MockIAdapter(adapter);

        const store = new AiThemeDeckStore(DEFAULT_SETTINGS, "/plugin/");
        await store.load();

        expect(store.list()).toEqual([]);
        expect(store.createId()).toBe("ai-theme-1");

        const saved = await store.upsert(createPack("ai-theme-1"));
        expect(saved.id).toBe("ai-theme-1");
        expect(store.get("ai-theme-1")?.name).toBe("AI 包");
        expect(store.list()).toHaveLength(1);

        const reloaded = new AiThemeDeckStore(DEFAULT_SETTINGS, "/plugin/");
        await reloaded.load();
        expect(reloaded.get("ai-theme-1")?.cardCount).toBe(3);

        expect(await reloaded.remove("ai-theme-1")).toBe(true);
        expect(reloaded.get("ai-theme-1")).toBeNull();
        expect(reloaded.list()).toEqual([]);
    });
});
