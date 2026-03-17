import { FunctionAiThemeReranker } from "src/aiTheme/llmReranker";
import { ThemePackService } from "src/aiTheme/service";
import {
    AiThemePackRecord,
    AiThemeQuestionIndexRecord,
    AiThemeReranker,
    AiThemeRetriever,
} from "src/aiTheme/types";

class MemoryPackStore {
    private items = new Map<string, AiThemePackRecord>();
    private nextId = 1;

    list(): AiThemePackRecord[] {
        return Array.from(this.items.values()).map(clone);
    }

    get(id: string): AiThemePackRecord | null {
        const item = this.items.get(id);
        return item ? clone(item) : null;
    }

    async upsert(pack: AiThemePackRecord): Promise<AiThemePackRecord> {
        this.items.set(pack.id, clone(pack));
        return clone(pack);
    }

    async remove(id: string): Promise<boolean> {
        return this.items.delete(id);
    }

    createId(): string {
        return `ai-theme-${this.nextId++}`;
    }
}

class StaticRetriever implements AiThemeRetriever {
    readonly id = "smart-connections";

    constructor(private readonly hits: unknown[], private readonly available = true) {}

    getStatus() {
        return this.available
            ? {
                  kind: "smart-blocks-ready" as const,
                  canRetrieve: true,
                  source: "smart-blocks" as const,
                  message: "ready",
              }
            : {
                  kind: "missing-plugin" as const,
                  canRetrieve: false,
                  source: "none" as const,
                  message: "missing",
              };
    }

    isAvailable(): boolean {
        return this.available;
    }

    async retrieve(): Promise<any[]> {
        return this.hits.map(clone);
    }
}

function createQuestionIndex(): AiThemeQuestionIndexRecord[] {
    return [
        {
            path: "vault/topic-a.md",
            obsidianBlockId: "block-a",
            textHash: "hash-a",
            lineNo: 10,
            sourceText: "Alpha text",
            cardRefs: [
                { path: "vault/topic-a.md", cardIdx: 0, cardId: 100, obsidianBlockId: "block-a" },
                { path: "vault/topic-a.md", cardIdx: 1, cardId: 101, obsidianBlockId: "block-a" },
            ],
        },
        {
            path: "vault/topic-b.md",
            obsidianBlockId: "block-b",
            textHash: "hash-b",
            lineNo: 22,
            sourceText: "Beta text",
            cardRefs: [
                { path: "vault/topic-b.md", cardIdx: 0, cardId: 200, obsidianBlockId: "block-b" },
            ],
        },
    ];
}

describe("ThemePackService", () => {
    it("counts finalEntryLimit as eligible entries and expands cardCount from clozes", async () => {
        const service = new ThemePackService({
            store: new MemoryPackStore() as any,
            retriever: new StaticRetriever([
                { path: "vault/topic-a.md", blockId: "block-a", score: 0.99, content: "Alpha hit" },
                {
                    path: "vault/topic-a.md",
                    blockId: "block-a",
                    score: 0.95,
                    content: "Duplicate alpha hit",
                },
                { path: "vault/missing.md", blockId: "missing", score: 0.9, content: "Missing hit" },
                { path: "vault/topic-b.md", blockId: "block-b", score: 0.88, content: "Beta hit" },
            ]),
        });

        const result = await service.createPack({
            name: "Physics",
            themePrompt: "momentum",
            finalEntryLimit: 1,
            orderMode: "relevance",
            llmEnabled: false,
            questionIndex: createQuestionIndex(),
        });

        expect(result.stats.rawRecallLimit).toBe(50);
        expect(result.stats.rawHits).toBe(4);
        expect(result.stats.eligibleEntries).toBe(2);
        expect(result.pack.entryCount).toBe(1);
        expect(result.pack.cardCount).toBe(2);
        expect(result.pack.entryRefs[0].key).toContain("block-a");
        expect(result.pack.cardRefs).toHaveLength(2);
        expect(result.pack.sourceBlocks).toHaveLength(4);
        expect(result.warnings).toEqual([]);
    });

    it("matches eligible entries by path plus line number when block ids are unavailable", async () => {
        const service = new ThemePackService({
            store: new MemoryPackStore() as any,
            retriever: new StaticRetriever([
                { path: "vault/topic-b.md", lineNo: 22, score: 0.88, rawPath: "vault/topic-b.md#x" },
            ]),
        });

        const result = await service.createPack({
            name: "Biology",
            themePrompt: "cells",
            finalEntryLimit: 1,
            orderMode: "relevance",
            llmEnabled: false,
            questionIndex: createQuestionIndex(),
        });

        expect(result.pack.entryCount).toBe(1);
        expect(result.pack.entryRefs[0].path).toBe("vault/topic-b.md");
        expect(result.pack.cardRefs[0].cardId).toBe(200);
    });

    it("falls back to the first entry inside a retrieved line range when exact line hits are unavailable", async () => {
        const service = new ThemePackService({
            store: new MemoryPackStore() as any,
            retriever: new StaticRetriever([
                {
                    path: "vault/topic-b.md",
                    lineNo: 20,
                    lineEnd: 25,
                    score: 0.88,
                    rawPath: "vault/topic-b.md#heading",
                },
            ]),
        });

        const result = await service.createPack({
            name: "Biology",
            themePrompt: "cells",
            finalEntryLimit: 1,
            orderMode: "relevance",
            llmEnabled: false,
            questionIndex: createQuestionIndex(),
        });

        expect(result.pack.entryCount).toBe(1);
        expect(result.pack.entryRefs[0].lineNo).toBe(22);
        expect(result.pack.cardRefs[0].cardId).toBe(200);
    });

    it("applies LLM rerank when JSON keys are valid", async () => {
        const reranker: AiThemeReranker = new FunctionAiThemeReranker(async (input) =>
            JSON.stringify([input.candidates[1].key]),
        );
        const service = new ThemePackService({
            store: new MemoryPackStore() as any,
            retriever: new StaticRetriever([
                { path: "vault/topic-a.md", blockId: "block-a", score: 0.99 },
                { path: "vault/topic-b.md", blockId: "block-b", score: 0.88 },
            ]),
            reranker,
        });

        const result = await service.createPack({
            name: "Biology",
            themePrompt: "cells",
            finalEntryLimit: 1,
            orderMode: "relevance",
            llmEnabled: true,
            llmProvider: "openai",
            llmModel: "gpt-test",
            llmStrictJson: true,
            questionIndex: createQuestionIndex(),
        });

        expect(result.warnings).toEqual([]);
        expect(result.pack.entryCount).toBe(1);
        expect(result.pack.entryRefs[0].path).toBe("vault/topic-b.md");
        expect(result.pack.cardRefs[0].cardId).toBe(200);
        expect(result.pack.llmProvider).toBe("openai");
        expect(result.pack.llmModel).toBe("gpt-test");
    });

    it("falls back to retrieval order when LLM JSON is broken", async () => {
        const reranker: AiThemeReranker = new FunctionAiThemeReranker(async () => "not-json");
        const service = new ThemePackService({
            store: new MemoryPackStore() as any,
            retriever: new StaticRetriever([
                { path: "vault/topic-a.md", blockId: "block-a", score: 0.99 },
                { path: "vault/topic-b.md", blockId: "block-b", score: 0.88 },
            ]),
            reranker,
        });

        const result = await service.createPack({
            name: "Chemistry",
            themePrompt: "atoms",
            finalEntryLimit: 2,
            orderMode: "relevance",
            llmEnabled: true,
            llmStrictJson: true,
            questionIndex: createQuestionIndex(),
        });

        expect(result.warnings).toContain(
            "LLM response could not be parsed as entry-key JSON; using retrieval order.",
        );
        expect(result.pack.entryRefs.map((entry) => entry.path)).toEqual([
            "vault/topic-a.md",
            "vault/topic-b.md",
        ]);
    });
});

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
