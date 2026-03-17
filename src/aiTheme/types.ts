export type AiThemeOrderMode = "relevance" | "random";

export type AiThemeRetrieverId = "smart-connections";
export type AiThemeRetrieverStatusKind =
    | "missing-plugin"
    | "env-loading"
    | "smart-blocks-ready"
    | "smart-sources-fallback"
    | "unsupported-shape"
    | "error";
export type AiThemeRetrieverSource = "smart-blocks" | "smart-sources" | "legacy-search" | "none";
export type AiThemeLlmProviderId =
    | "lm_studio"
    | "ollama"
    | "openai"
    | "open_router"
    | "gemini"
    | "anthropic"
    | "azure_openai"
    | "custom_openai_compatible";
export type AiThemeLlmAdapterKind =
    | "openai"
    | "ollama"
    | "gemini"
    | "anthropic"
    | "azure_openai"
    | "lm_studio";

export interface AiThemeRetrieverStatus {
    kind: AiThemeRetrieverStatusKind;
    canRetrieve: boolean;
    source: AiThemeRetrieverSource;
    message: string;
    details?: Record<string, unknown>;
}

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
    lineEnd?: number;
    content?: string;
    metadata?: Record<string, unknown>;
    matchedEntryKey?: string;
    runtimeCollection?: "smart-blocks" | "smart-sources" | "legacy-search";
    rawPath?: string;
    subKey?: string;
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
    llmProvider?: string;
    llmModel?: string;
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
    lineEnd?: number;
    content?: string;
    metadata?: Record<string, unknown>;
    runtimeCollection?: "smart-blocks" | "smart-sources" | "legacy-search";
    rawPath?: string;
    subKey?: string;
}

export interface AiThemeRetriever {
    readonly id: string;
    getStatus(): AiThemeRetrieverStatus;
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

export interface AiThemeLlmProviderConfig {
    model?: string;
    baseUrl?: string;
    host?: string;
    apiKey?: string;
    headersJson?: string;
    timeoutMs?: number;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    modelsEndpoint?: string;
    chatEndpoint?: string;
    adapterKind?: AiThemeLlmAdapterKind;
    customAdapterKind?: AiThemeLlmAdapterKind;
    azureResourceName?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
    anthropicVersion?: string;
}

export type AiThemeLlmProviderConfigMap = Partial<
    Record<AiThemeLlmProviderId, AiThemeLlmProviderConfig>
>;

export interface AiThemeResolvedLlmConfig extends AiThemeLlmProviderConfig {
    provider: AiThemeLlmProviderId;
    model: string;
    systemPrompt?: string;
    strictJsonOutput: boolean;
    timeoutMs: number;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    headers?: Record<string, string>;
}

export interface AiThemeRerankExecutionInput extends AiThemeRerankerInput {
    providerId: AiThemeLlmProviderId;
    resolvedConfig: AiThemeResolvedLlmConfig;
}

export interface AiThemeLlmModelOption {
    id: string;
    label: string;
    contextWindow?: number;
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
    llmProvider?: string | AiThemeLlmProviderId;
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
