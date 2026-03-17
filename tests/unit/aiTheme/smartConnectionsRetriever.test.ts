import type { App } from "obsidian";
import { SmartConnectionsRetriever } from "src/aiTheme/smartConnectionsRetriever";

type LookupResult = Record<string, unknown>;

function createAppWithPlugin(root?: unknown): App {
    return {
        plugins: {
            plugins: {
                "smart-connections": root,
            },
        },
    } as unknown as App;
}

describe("SmartConnectionsRetriever", () => {
    it("returns missing-plugin when Smart Connections is not installed", () => {
        const retriever = new SmartConnectionsRetriever(createAppWithPlugin());
        const status = retriever.getStatus();
        expect(status.kind).toBe("missing-plugin");
        expect(status.canRetrieve).toBe(false);
    });

    it("reports env-loading when runtime is not ready", () => {
        const retriever = new SmartConnectionsRetriever(
            createAppWithPlugin({
                env: {
                    state: "initializing",
                },
            }),
        );
        const status = retriever.getStatus();
        expect(status.kind).toBe("env-loading");
        expect(status.canRetrieve).toBe(false);
    });

    it("prefers smart_blocks lookup, normalizes line_start and returns smart-blocks-ready", async () => {
        const lookup = jest.fn().mockResolvedValue([
            {
                item: { path: "Vault/Plan.md#abc", line_start: 9 },
                score: 0.9,
            },
        ]);
        const retriever = new SmartConnectionsRetriever(
            createAppWithPlugin({
                env: {
                    state: "loaded",
                    smart_blocks: {
                        lookup,
                        settings: { embed_blocks: true },
                    },
                },
            }),
        );

        const status = retriever.getStatus();
        expect(status.kind).toBe("smart-blocks-ready");
        expect(status.source).toBe("smart-blocks");

        const hits = await retriever.retrieve({ query: "plan", limit: 5 });
        expect(lookup).toHaveBeenCalled();
        expect(hits).toHaveLength(1);
        expect(hits[0].lineNo).toBe(8);
        expect(hits[0].path).toBe("Vault/Plan.md");
    });

    it("falls back to smart_sources when block embedding is disabled", async () => {
        const blocksLookup = jest.fn();
        const sourcesLookup = jest.fn().mockResolvedValue([
            {
                item: { path: "Vault/Plan.md###block" },
                metadata: { line_start: 3, score: 0.5 },
            },
        ]);

        const retriever = new SmartConnectionsRetriever(
            createAppWithPlugin({
                env: {
                    state: "loaded",
                    smart_blocks: {
                        lookup: blocksLookup,
                        settings: { embed_blocks: false },
                    },
                    smart_sources: {
                        lookup: sourcesLookup,
                    },
                },
            }),
        );

        const status = retriever.getStatus();
        expect(status.kind).toBe("smart-sources-fallback");
        expect(status.source).toBe("smart-sources");

        const hits = await retriever.retrieve({ query: "plan", limit: 3 });
        expect(blocksLookup).not.toHaveBeenCalled();
        expect(sourcesLookup).toHaveBeenCalled();
        expect(hits[0].lineNo).toBe(2);
        expect(hits[0].runtimeCollection).toBe("smart-sources");
    });
});
