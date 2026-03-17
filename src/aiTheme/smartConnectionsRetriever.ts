import type { App } from "obsidian";
import {
    AiThemeRetriever,
    AiThemeRetrieverHit,
    AiThemeRetrieverRequest,
    normalizeAiThemePath,
    toLineNo,
} from "src/aiTheme/types";

type SmartConnectionsCallable = (arg0?: unknown, arg1?: unknown) => Promise<unknown> | unknown;

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

    isAvailable(): boolean {
        const callable = this.resolveSearchMethod();
        return callable != null;
    }

    async retrieve(request: AiThemeRetrieverRequest): Promise<AiThemeRetrieverHit[]> {
        const resolved = this.resolveSearchMethod();
        if (!resolved) return [];

        const { fn, context } = resolved;
        const query = (request.query ?? "").trim();
        if (!query) return [];

        let raw: unknown;
        try {
            raw = await fn.call(context, { query, q: query, limit: request.limit, ...request.extra });
        } catch {
            raw = await fn.call(context, query, request.limit);
        }

        return normalizeRetrieverResult(raw);
    }

    private resolveSearchMethod(): { fn: SmartConnectionsCallable; context: unknown } | null {
        const root = this.resolveSmartConnectionsRoot();
        if (!root) return null;

        const candidates: unknown[] = [root, (root as any).api, (root as any).service];
        for (const candidate of candidates) {
            if (!candidate) continue;
            for (const methodName of SEARCH_METHODS) {
                const maybeFn = (candidate as any)[methodName];
                if (typeof maybeFn === "function") {
                    return { fn: maybeFn as SmartConnectionsCallable, context: candidate };
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

function normalizeRetrieverResult(raw: unknown): AiThemeRetrieverHit[] {
    const rows = coerceRows(raw);
    const result: AiThemeRetrieverHit[] = [];

    for (const row of rows) {
        const normalized = normalizeRow(row);
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

function normalizeRow(row: unknown): AiThemeRetrieverHit | null {
    if (!row) return null;
    if (typeof row === "string") {
        const path = normalizeAiThemePath(row);
        if (!path) return null;
        return { path };
    }
    if (typeof row !== "object") return null;

    const obj = row as Record<string, unknown>;
    const metadata = asRecord(obj.metadata);

    const path = normalizeAiThemePath(
        asString(obj.path) ??
            asString(obj.filePath) ??
            asString(obj.sourcePath) ??
            asString(obj.notePath) ??
            asString(metadata?.path),
    );
    if (!path) return null;

    const score =
        asNumber(obj.score) ??
        asNumber(obj.similarity) ??
        asNumber(obj.relevance) ??
        asNumber(metadata?.score);
    const blockId =
        asString(obj.blockId) ??
        asString(obj.block_id) ??
        asString(obj.chunkId) ??
        asString(metadata?.blockId) ??
        asString(metadata?.block_id);
    const textHash = asString(obj.textHash) ?? asString(metadata?.textHash);
    const lineNo =
        toLineNo(asNumber(obj.lineNo)) ??
        toLineNo(asNumber(obj.line)) ??
        toLineNo(asNumber(metadata?.lineNo)) ??
        toLineNo(asNumber(metadata?.line));
    const content =
        asString(obj.content) ??
        asString(obj.text) ??
        asString(obj.chunk) ??
        asString(metadata?.content) ??
        asString(metadata?.text);

    return {
        path,
        score,
        blockId: blockId ?? undefined,
        textHash: textHash ?? undefined,
        lineNo,
        content: content ?? undefined,
        metadata: metadata ?? undefined,
    };
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

