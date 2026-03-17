export type AiThemeOrderMode = "relevance" | "random";

export type AiThemeRetrieverId = "smart-connections";

export interface AiThemeCardRef {
    path: string;
    cardIdx: number;
    cardId?: number;
    obsidianBlockId?: string;
    textHash?: string;
    lineNo?: number;
    score?: number;
}

export interface AiThemeEntryRef {
    key: string;
    path: string;
    sourceText?: string;
    lineNo?: number;
    obsidianBlockId?: string;
    textHash?: string;
    score?: number;
    cardCount: number;
    cardRefs: AiThemeCardRef[];
}

export interface AiThemeSourceBlock {
    path: string;
    score?: number;
    blockId?: string;
    textHash?: string;
    lineNo?: number;
    content?: string;
    metadata?: Record<string, unknown>;
    matchedEntryKey?: string;
}

export interface AiThemePackRecord {
    id: string;
    name: string;
    themePrompt: string;
    retriever: AiThemeRetrieverId | string;
    finalEntryLimit: number;
    entryCount: number;
    cardCount: number;
    orderMode: AiThemeOrderMode;
    llmEnabled: boolean;
    createdAt: number;
    updatedAt: number;
    sourceBlocks: AiThemeSourceBlock[];
    entryRefs: AiThemeEntryRef[];
    cardRefs: AiThemeCardRef[];
}

export interface AiThemeQuestionIndexRecord {
    path: string;
    sourceText?: string;
    lineNo?: number;
    obsidianBlockId?: string;
    textHash?: string;
    cardRefs: AiThemeCardRef[];
}

export interface AiThemeRetrieverRequest {
    query: string;
    limit: number;
    extra?: Record<string, unknown>;
}

export interface AiThemeRetrieverHit {
    path: string;
    score?: number;
    blockId?: string;
    textHash?: string;
    lineNo?: number;
    content?: string;
    metadata?: Record<string, unknown>;
}

export interface AiThemeRetriever {
    readonly id: string;
    isAvailable(): boolean;
    retrieve(request: AiThemeRetrieverRequest): Promise<AiThemeRetrieverHit[]>;
}

export interface AiThemeRerankCandidate {
    key: string;
    path: string;
    sourceText?: string;
    score?: number;
    blockId?: string;
    textHash?: string;
    lineNo?: number;
}

export interface AiThemeRerankerInput {
    themePrompt: string;
    candidates: AiThemeRerankCandidate[];
    limit: number;
    provider?: string;
    model?: string;
    systemPrompt?: string;
    strictJson?: boolean;
}

export interface AiThemeRerankerResult {
    used: boolean;
    orderedKeys: string[];
    rawText?: string;
    error?: string;
}

export interface AiThemeReranker {
    isAvailable(): boolean;
    rerank(input: AiThemeRerankerInput): Promise<AiThemeRerankerResult>;
}

export interface CreateAiThemePackInput {
    name: string;
    themePrompt: string;
    finalEntryLimit: number;
    orderMode: AiThemeOrderMode;
    llmEnabled: boolean;
    llmProvider?: string;
    llmModel?: string;
    llmSystemPrompt?: string;
    llmStrictJson?: boolean;
    questionIndex: AiThemeQuestionIndexRecord[];
    retrieverExtra?: Record<string, unknown>;
}

export interface UpdateAiThemePackInput extends CreateAiThemePackInput {
    id: string;
}

export interface AiThemePackBuildStats {
    rawRecallLimit: number;
    rawHits: number;
    eligibleEntries: number;
    selectedEntries: number;
    selectedCards: number;
}

export interface AiThemePackBuildResult {
    pack: AiThemePackRecord;
    stats: AiThemePackBuildStats;
    warnings: string[];
}

export function normalizeAiThemePath(path: string): string {
    return (path ?? "").replace(/\\/g, "/").trim();
}

export function normalizeObsidianBlockId(blockId?: string): string {
    if (!blockId) return "";
    return blockId.trim().replace(/^\^/, "");
}

export function toLineNo(lineNo?: number): number | undefined {
    if (typeof lineNo !== "number") return undefined;
    if (!Number.isFinite(lineNo)) return undefined;
    const rounded = Math.floor(lineNo);
    return rounded >= 0 ? rounded : undefined;
}

export function createEntryKey(input: {
    path: string;
    obsidianBlockId?: string;
    textHash?: string;
    lineNo?: number;
}): string {
    const path = normalizeAiThemePath(input.path);
    const blockId = normalizeObsidianBlockId(input.obsidianBlockId);
    const textHash = (input.textHash ?? "").trim();
    const lineNo = toLineNo(input.lineNo);

    if (path && blockId) return `p:${path}|b:${blockId}`;
    if (path && textHash && lineNo !== undefined) return `p:${path}|h:${textHash}|l:${lineNo}`;
    if (path && textHash) return `p:${path}|h:${textHash}`;
    if (path && lineNo !== undefined) return `p:${path}|l:${lineNo}`;
    return `p:${path}`;
}

