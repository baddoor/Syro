import {
    AiThemeReranker,
    AiThemeRerankerInput,
    AiThemeRerankerResult,
} from "src/aiTheme/types";

export type AiThemeLlmExecutor = (
    input: AiThemeRerankerInput,
) =>
    | Promise<string | string[] | { keys?: string[]; orderedKeys?: string[] } | null | undefined>
    | string
    | string[]
    | { keys?: string[]; orderedKeys?: string[] }
    | null
    | undefined;

export class NoopAiThemeReranker implements AiThemeReranker {
    isAvailable(): boolean {
        return false;
    }

    async rerank(_: AiThemeRerankerInput): Promise<AiThemeRerankerResult> {
        return {
            used: false,
            orderedKeys: [],
        };
    }
}

export class FunctionAiThemeReranker implements AiThemeReranker {
    private executor: AiThemeLlmExecutor;

    constructor(executor: AiThemeLlmExecutor) {
        this.executor = executor;
    }

    isAvailable(): boolean {
        return typeof this.executor === "function";
    }

    async rerank(input: AiThemeRerankerInput): Promise<AiThemeRerankerResult> {
        if (!this.isAvailable()) {
            return { used: false, orderedKeys: [] };
        }

        try {
            const raw = await this.executor(input);
            const { orderedKeys, rawText } = parseOrderedKeysFromLlmOutput(raw, input.strictJson);
            return {
                used: true,
                orderedKeys,
                rawText,
            };
        } catch (error) {
            return {
                used: true,
                orderedKeys: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export function parseOrderedKeysFromLlmOutput(
    raw: unknown,
    strictJson = true,
): { orderedKeys: string[]; rawText?: string } {
    if (Array.isArray(raw)) {
        return {
            orderedKeys: coerceStringList(raw),
        };
    }

    if (raw && typeof raw === "object") {
        const obj = raw as { keys?: unknown; orderedKeys?: unknown };
        const fromKeys = coerceStringList(obj.keys);
        if (fromKeys.length > 0) return { orderedKeys: fromKeys };
        const fromOrdered = coerceStringList(obj.orderedKeys);
        if (fromOrdered.length > 0) return { orderedKeys: fromOrdered };
        return { orderedKeys: [] };
    }

    if (typeof raw !== "string") {
        return { orderedKeys: [] };
    }

    const text = raw.trim();
    if (!text) return { orderedKeys: [], rawText: "" };

    const parsed = safeJsonParse(text);
    if (parsed.ok) {
        const extracted = parseOrderedKeysFromLlmOutput(parsed.value, strictJson);
        return { orderedKeys: extracted.orderedKeys, rawText: text };
    }

    if (strictJson) {
        return { orderedKeys: [], rawText: text };
    }

    return {
        orderedKeys: extractQuotedTokens(text),
        rawText: text,
    };
}

function coerceStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
}

function extractQuotedTokens(text: string): string[] {
    const result: string[] = [];
    const regex = /"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const key = match[1].trim();
        if (!key) continue;
        result.push(key);
    }
    return result;
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}

