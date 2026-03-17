import type { App } from "obsidian";
import {
    AiThemeRetriever,
    AiThemeRetrieverHit,
    AiThemeRetrieverRequest,
    AiThemeRetrieverSource,
    AiThemeRetrieverStatus,
    normalizeAiThemePath,
    toLineNo,
} from "src/aiTheme/types";

type SmartConnectionsCallable = (arg0?: unknown, arg1?: unknown) => Promise<unknown> | unknown;

interface LegacyMethod {
    fn: SmartConnectionsCallable;
    context: unknown;
    methodName: string;
}

interface LookupMethod {
    fn: SmartConnectionsCallable;
    context: unknown;
    source: "smart-blocks" | "smart-sources";
}

interface ResolvedRuntime {
    status: AiThemeRetrieverStatus;
    lookup?: LookupMethod;
    legacy?: LegacyMethod;
}

const SEARCH_METHODS = [
    "semanticSearch",
    "search",
    "query",
    "findMostSimilar",
    "findSimilar",
    "searchSimilar",
    "searchConnections",
];

export class SmartConnectionsRetriever implements AiThemeRetriever {
    readonly id = "smart-connections";
    private app?: App;

    constructor(app?: App) {
        this.app = app;
    }

    getStatus(): AiThemeRetrieverStatus {
        return this.resolveRuntime().status;
    }

    isAvailable(): boolean {
        return this.getStatus().canRetrieve;
    }

    async retrieve(request: AiThemeRetrieverRequest): Promise<AiThemeRetrieverHit[]> {
        const runtime = this.resolveRuntime();
        const query = (request.query ?? "").trim();
        if (!query || !runtime.status.canRetrieve) return [];

        try {
            if (runtime.lookup) {
                const raw = await runtime.lookup.fn.call(
                    runtime.lookup.context,
                    buildLookupRequest(query, request),
                );
                return normalizeRetrieverResult(raw, runtime.lookup.source);
            }

            if (runtime.legacy) {
                let raw: unknown;
                try {
                    raw = await runtime.legacy.fn.call(runtime.legacy.context, {
                        query,
                        q: query,
                        limit: request.limit,
                        ...(request.extra ?? {}),
                    });
                } catch {
                    raw = await runtime.legacy.fn.call(runtime.legacy.context, query, request.limit);
                }
                return normalizeRetrieverResult(raw, "legacy-search");
            }
        } catch (error) {
            console.warn("[SR-AITheme] Smart Connections retrieval failed:", error);
        }

        return [];
    }

    private resolveRuntime(): ResolvedRuntime {
        const root = this.resolveSmartConnectionsRoot();
        if (!root) {
            return {
                status: {
                    kind: "missing-plugin",
                    canRetrieve: false,
                    source: "none",
                    message: "Smart Connections plugin is not loaded.",
                },
            };
        }

        const env = asRecord((root as Record<string, unknown>).env);
        const envState = asString(env?.state);
        if (!env || (envState && envState !== "loaded")) {
            return {
                status: {
                    kind: "env-loading",
                    canRetrieve: false,
                    source: "none",
                    message:
                        envState && envState !== "loaded"
                            ? `Smart Connections environment is ${envState}.`
                            : "Smart Connections environment is not ready yet.",
                    details: envState ? { envState } : undefined,
                },
            };
        }

        const smartBlocks = asRecord(env.smart_blocks);
        const smartBlocksLookup = getCallable(smartBlocks?.lookup);
        const embedBlocks = smartBlocks?.settings
            ? (asRecord(smartBlocks.settings)?.embed_blocks as boolean | undefined)
            : undefined;
        if (smartBlocksLookup && embedBlocks !== false) {
            return {
                status: {
                    kind: "smart-blocks-ready",
                    canRetrieve: true,
                    source: "smart-blocks",
                    message: "Smart Connections block retrieval is ready.",
                    details: { envState, embedBlocks: embedBlocks ?? true },
                },
                lookup: {
                    fn: smartBlocksLookup,
                    context: smartBlocks,
                    source: "smart-blocks",
                },
            };
        }

        const smartSources = asRecord(env.smart_sources);
        const smartSourcesLookup = getCallable(smartSources?.lookup);
        if (smartSourcesLookup) {
            return {
                status: {
                    kind: "smart-sources-fallback",
                    canRetrieve: true,
                    source: "smart-sources",
                    message:
                        embedBlocks === false
                            ? "Smart Connections block embeddings are disabled; falling back to source retrieval."
                            : "Using Smart Connections source retrieval fallback.",
                    details: { envState, embedBlocks: embedBlocks ?? null },
                },
                lookup: {
                    fn: smartSourcesLookup,
                    context: smartSources,
                    source: "smart-sources",
                },
            };
        }

        const legacy = this.resolveLegacySearchMethod(root);
        if (legacy) {
            return {
                status: {
                    kind: "smart-sources-fallback",
                    canRetrieve: true,
                    source: "legacy-search",
                    message: `Using legacy Smart Connections method: ${legacy.methodName}.`,
                    details: { methodName: legacy.methodName },
                },
                legacy,
            };
        }

        return {
            status: {
                kind: "unsupported-shape",
                canRetrieve: false,
                source: "none",
                message: "Smart Connections loaded, but no supported retrieval interface was found.",
            },
        };
    }

    private resolveLegacySearchMethod(root: unknown): LegacyMethod | null {
        const candidates: unknown[] = [root, (root as any).api, (root as any).service];
        for (const candidate of candidates) {
            if (!candidate) continue;
            for (const methodName of SEARCH_METHODS) {
                const maybeFn = (candidate as any)[methodName];
                if (typeof maybeFn === "function") {
                    return { fn: maybeFn as SmartConnectionsCallable, context: candidate, methodName };
                }
            }
        }
        return null;
    }

    private resolveSmartConnectionsRoot(): unknown {
        const pluginBag = (this.app as any)?.plugins?.plugins;
        if (pluginBag) {
            const byDash = pluginBag["smart-connections"];
            if (byDash) return byDash;
            const byUnderscore = pluginBag["smart_connections"];
            if (byUnderscore) return byUnderscore;
        }

        const globalWindow = typeof window !== "undefined" ? (window as any) : null;
        if (!globalWindow) return null;
        return (
            globalWindow.smartConnections ??
            globalWindow.SmartConnections ??
            globalWindow.smart_connections ??
            null
        );
    }
}

function buildLookupRequest(
    query: string,
    request: AiThemeRetrieverRequest,
): Record<string, unknown> {
    const extra = asRecord(request.extra) ?? {};
    const filter = {
        ...(asRecord(extra.filter) ?? {}),
        limit: request.limit,
    };

    return {
        ...extra,
        hypotheticals: [query],
        filter,
    };
}

function normalizeRetrieverResult(
    raw: unknown,
    source: AiThemeRetrieverSource,
): AiThemeRetrieverHit[] {
    const rows = coerceRows(raw);
    const result: AiThemeRetrieverHit[] = [];

    for (const row of rows) {
        const normalized = normalizeRow(row, source);
        if (!normalized) continue;
        result.push(normalized);
    }
    return result;
}

function coerceRows(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];

    const obj = raw as Record<string, unknown>;
    const listCandidates = [obj.results, obj.items, obj.hits, obj.data];
    for (const candidate of listCandidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
}

function normalizeRow(row: unknown, source: AiThemeRetrieverSource): AiThemeRetrieverHit | null {
    if (!row) return null;
    if (typeof row === "string") {
        const path = normalizeAiThemePath(stripBlockSuffix(row));
        if (!path) return null;
        return { path, rawPath: row, runtimeCollection: toRuntimeCollection(source) };
    }
    if (typeof row !== "object") return null;

    const obj = row as Record<string, unknown>;
    const item = asRecord(obj.item);
    const itemData = asRecord(item?.data);
    const metadata = {
        ...(asRecord(obj.metadata) ?? {}),
    };

    const rawPath =
        asString(item?.path) ??
        asString(item?.key) ??
        asString(obj.path) ??
        asString(obj.filePath) ??
        asString(obj.sourcePath) ??
        asString(obj.notePath) ??
        asString(metadata.path);
    const path = normalizeAiThemePath(stripBlockSuffix(rawPath ?? ""));
    if (!path) return null;

    const itemLineStart =
        asNumber(item?.line_start) ??
        asNumber(itemData?.line_start) ??
        asNumber(metadata.line_start);
    const itemLineEnd =
        asNumber(item?.line_end) ?? asNumber(itemData?.line_end) ?? asNumber(metadata.line_end);
    const lineNo =
        typeof itemLineStart === "number"
            ? toLineNo(itemLineStart - 1)
            : toLineNo(
                  asNumber(obj.lineNo) ??
                      asNumber(obj.line) ??
                      asNumber(metadata.lineNo) ??
                      asNumber(metadata.line),
              );
    const lineEnd =
        typeof itemLineEnd === "number" ? toLineNo(itemLineEnd - 1) : undefined;

    const score =
        asNumber(obj.score) ??
        asNumber(obj.similarity) ??
        asNumber(obj.relevance) ??
        asNumber(metadata.score);
    const blockId =
        asString(obj.blockId) ??
        asString(obj.block_id) ??
        asString(metadata.blockId) ??
        asString(metadata.block_id);
    const textHash =
        asString(obj.textHash) ?? asString(itemData?.textHash) ?? asString(metadata.textHash);
    const content =
        asString(itemData?.text) ??
        asString(itemData?.content) ??
        asString(obj.content) ??
        asString(obj.text) ??
        asString(metadata.content) ??
        asString(metadata.text);
    const subKey = asString(item?.sub_key) ?? asString(itemData?.sub_key);

    const mergedMetadata: Record<string, unknown> = {
        ...metadata,
    };
    if (item?.key) mergedMetadata.itemKey = item.key;
    if (item?.path) mergedMetadata.itemPath = item.path;
    if (itemLineStart != null) mergedMetadata.line_start = itemLineStart;
    if (itemLineEnd != null) mergedMetadata.line_end = itemLineEnd;

    return {
        path,
        score,
        blockId: blockId ?? undefined,
        textHash: textHash ?? undefined,
        lineNo,
        lineEnd,
        content: content ?? undefined,
        metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
        runtimeCollection: toRuntimeCollection(source),
        rawPath: rawPath ?? undefined,
        subKey: subKey ?? undefined,
    };
}

function toRuntimeCollection(
    source: AiThemeRetrieverSource,
): "smart-blocks" | "smart-sources" | "legacy-search" | undefined {
    if (source === "none") return undefined;
    return source;
}

function stripBlockSuffix(path: string): string {
    const normalized = normalizeAiThemePath(path);
    if (!normalized) return normalized;
    const hashIndex = normalized.indexOf("#");
    if (hashIndex < 0) return normalized;
    return normalized.substring(0, hashIndex);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getCallable(value: unknown): SmartConnectionsCallable | null {
    return typeof value === "function" ? (value as SmartConnectionsCallable) : null;
}
