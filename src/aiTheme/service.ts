import type { App } from "obsidian";
import { NoopAiThemeReranker } from "src/aiTheme/llmReranker";
import { AiThemePackStore, DefaultAiThemePackStore } from "src/aiTheme/packStore";
import { SmartConnectionsRetriever } from "src/aiTheme/smartConnectionsRetriever";
import {
    AiThemeCardRef,
    AiThemeEntryRef,
    AiThemeOrderMode,
    AiThemePackBuildResult,
    AiThemePackBuildStats,
    AiThemePackRecord,
    AiThemeQuestionIndexRecord,
    AiThemeRerankCandidate,
    AiThemeReranker,
    AiThemeRetriever,
    AiThemeRetrieverHit,
    AiThemeSourceBlock,
    CreateAiThemePackInput,
    UpdateAiThemePackInput,
    createEntryKey,
    normalizeAiThemePath,
    normalizeObsidianBlockId,
    toLineNo,
} from "src/aiTheme/types";
import { AiThemeDeckStore } from "src/dataStore/aiThemeDeckStore";

interface ThemePackServiceOptions {
    store: AiThemePackStore | AiThemeDeckStore;
    app?: App;
    retriever?: AiThemeRetriever;
    reranker?: AiThemeReranker;
}

interface IndexedEntry {
    key: string;
    path: string;
    sourceText?: string;
    lineNo?: number;
    obsidianBlockId?: string;
    textHash?: string;
    cardRefs: AiThemeCardRef[];
    hitScore?: number;
}

interface EntryLookupContext {
    entriesByKey: Map<string, IndexedEntry>;
    byPathAndBlockId: Map<string, IndexedEntry>;
    byPathAndTextHashLine: Map<string, IndexedEntry>;
    byPathAndUniqueTextHash: Map<string, IndexedEntry>;
}

const MIN_RAW_RECALL_LIMIT = 50;
const MAX_RAW_RECALL_LIMIT = 200;

export class ThemePackService {
    private readonly store: AiThemePackStore;
    private readonly retriever: AiThemeRetriever;
    private readonly reranker: AiThemeReranker;

    constructor(options: ThemePackServiceOptions) {
        this.store =
            options.store instanceof AiThemeDeckStore
                ? new DefaultAiThemePackStore(options.store)
                : options.store;
        this.retriever = options.retriever ?? new SmartConnectionsRetriever(options.app);
        this.reranker = options.reranker ?? new NoopAiThemeReranker();
    }

    isRetrieverAvailable(): boolean {
        return this.retriever.isAvailable();
    }

    listPacks(): AiThemePackRecord[] {
        return this.store.list();
    }

    getPack(id: string): AiThemePackRecord | null {
        return this.store.get(id);
    }

    async removePack(id: string): Promise<boolean> {
        return this.store.remove(id);
    }

    async createPack(input: CreateAiThemePackInput): Promise<AiThemePackBuildResult> {
        return this.buildAndPersistPack(input, null);
    }

    async updatePack(input: UpdateAiThemePackInput): Promise<AiThemePackBuildResult> {
        return this.buildAndPersistPack(input, input.id);
    }

    async regeneratePack(input: UpdateAiThemePackInput): Promise<AiThemePackBuildResult> {
        return this.updatePack(input);
    }

    private async buildAndPersistPack(
        input: CreateAiThemePackInput | UpdateAiThemePackInput,
        packId: string | null,
    ): Promise<AiThemePackBuildResult> {
        const warnings: string[] = [];
        const finalEntryLimit = normalizeFinalEntryLimit(input.finalEntryLimit);
        const rawRecallLimit = computeRawRecallLimit(finalEntryLimit);
        const entryLookup = buildEntryLookup(input.questionIndex);

        let rawHits: AiThemeRetrieverHit[] = [];
        if (!this.retriever.isAvailable()) {
            warnings.push("Smart Connections 不可用，无法执行语义召回。");
        } else {
            rawHits = await this.retriever.retrieve({
                query: input.themePrompt,
                limit: rawRecallLimit,
                extra: input.retrieverExtra,
            });
        }

        const { matchedEntries, sourceBlocks } = mapHitsToEntries(rawHits, entryLookup);
        let orderedEntries = matchedEntries;
        if (input.llmEnabled && matchedEntries.length > 0) {
            if (this.reranker.isAvailable()) {
                const reranked = await this.reranker.rerank({
                    themePrompt: input.themePrompt,
                    limit: finalEntryLimit,
                    candidates: matchedEntries.map((entry) => toRerankCandidate(entry)),
                    provider: input.llmProvider,
                    model: input.llmModel,
                    systemPrompt: input.llmSystemPrompt,
                    strictJson: input.llmStrictJson ?? true,
                });
                if (reranked.error) {
                    warnings.push(`LLM 精排失败，回退到检索排序: ${reranked.error}`);
                } else if (reranked.used && reranked.rawText && reranked.orderedKeys.length === 0) {
                    warnings.push("LLM 返回结果无法解析为条目 JSON，已回退到检索排序。");
                }
                orderedEntries = applyRerankOrder(matchedEntries, reranked.orderedKeys);
            } else {
                warnings.push("LLM 已开启但未提供可用 reranker，已回退到检索排序。");
            }
        }

        const selectedEntries = orderedEntries.slice(0, finalEntryLimit);
        if (selectedEntries.length < finalEntryLimit) {
            warnings.push(
                `eligible 条目不足：目标 ${finalEntryLimit}，实际 ${selectedEntries.length}。`,
            );
        }

        const entryRefs = selectedEntries.map((entry) => toEntryRef(entry));
        const cardRefs = collectCardRefs(selectedEntries, input.orderMode);

        const now = Date.now();
        const existing = packId ? this.store.get(packId) : null;
        const id = existing?.id ?? packId ?? this.store.createId();
        const createdAt = existing?.createdAt ?? now;
        const pack: AiThemePackRecord = {
            id,
            name: (input.name ?? "").trim() || "AI Theme Pack",
            themePrompt: input.themePrompt,
            retriever: this.retriever.id,
            finalEntryLimit,
            entryCount: entryRefs.length,
            cardCount: cardRefs.length,
            orderMode: input.orderMode,
            llmEnabled: input.llmEnabled,
            createdAt,
            updatedAt: now,
            sourceBlocks,
            entryRefs,
            cardRefs,
        };

        const saved = await this.store.upsert(pack);
        const stats: AiThemePackBuildStats = {
            rawRecallLimit,
            rawHits: rawHits.length,
            eligibleEntries: matchedEntries.length,
            selectedEntries: entryRefs.length,
            selectedCards: cardRefs.length,
        };

        return {
            pack: saved,
            stats,
            warnings,
        };
    }
}

function normalizeFinalEntryLimit(value: number): number {
    if (!Number.isFinite(value)) return 10;
    const rounded = Math.floor(value);
    if (rounded <= 0) return 10;
    return rounded;
}

function computeRawRecallLimit(finalEntryLimit: number): number {
    const computed = Math.max(finalEntryLimit * 5, MIN_RAW_RECALL_LIMIT);
    return Math.min(computed, MAX_RAW_RECALL_LIMIT);
}

function buildEntryLookup(indexRecords: AiThemeQuestionIndexRecord[]): EntryLookupContext {
    const entriesByKey = new Map<string, IndexedEntry>();

    for (const record of indexRecords ?? []) {
        const path = normalizeAiThemePath(record.path);
        if (!path) continue;
        const key = createEntryKey({
            path,
            obsidianBlockId: record.obsidianBlockId,
            textHash: record.textHash,
            lineNo: record.lineNo,
        });

        let entry = entriesByKey.get(key);
        if (!entry) {
            entry = {
                key,
                path,
                sourceText: record.sourceText,
                lineNo: toLineNo(record.lineNo),
                obsidianBlockId: record.obsidianBlockId,
                textHash: record.textHash,
                cardRefs: [],
            };
            entriesByKey.set(key, entry);
        }

        const mergedCards = dedupeCardRefs([...(entry.cardRefs ?? []), ...(record.cardRefs ?? [])]);
        entry.cardRefs = mergedCards;
    }

    const byPathAndBlockId = new Map<string, IndexedEntry>();
    const byPathAndTextHashLine = new Map<string, IndexedEntry>();
    const hashBuckets = new Map<string, IndexedEntry[]>();
    const byPathAndUniqueTextHash = new Map<string, IndexedEntry>();

    for (const entry of entriesByKey.values()) {
        if (!entry.cardRefs?.length) continue;
        const path = normalizeAiThemePath(entry.path);
        const blockId = normalizeObsidianBlockId(entry.obsidianBlockId);
        const textHash = (entry.textHash ?? "").trim();
        const lineNo = toLineNo(entry.lineNo);

        if (path && blockId) {
            byPathAndBlockId.set(composePathAndBlockKey(path, blockId), entry);
        }
        if (path && textHash && lineNo !== undefined) {
            byPathAndTextHashLine.set(composePathAndHashLineKey(path, textHash, lineNo), entry);
        }
        if (path && textHash) {
            const hashKey = composePathAndHashKey(path, textHash);
            const bucket = hashBuckets.get(hashKey) ?? [];
            bucket.push(entry);
            hashBuckets.set(hashKey, bucket);
        }
    }

    for (const [hashKey, bucket] of hashBuckets.entries()) {
        if (bucket.length === 1) {
            byPathAndUniqueTextHash.set(hashKey, bucket[0]);
        }
    }

    return {
        entriesByKey,
        byPathAndBlockId,
        byPathAndTextHashLine,
        byPathAndUniqueTextHash,
    };
}

function mapHitsToEntries(
    rawHits: AiThemeRetrieverHit[],
    lookup: EntryLookupContext,
): { matchedEntries: IndexedEntry[]; sourceBlocks: AiThemeSourceBlock[] } {
    const matchedEntries: IndexedEntry[] = [];
    const sourceBlocks: AiThemeSourceBlock[] = [];
    const seenEntryKeys = new Set<string>();

    for (const hit of rawHits ?? []) {
        const candidate = resolveCandidateFromHit(hit, lookup);
        if (candidate) {
            candidate.hitScore = candidate.hitScore ?? hit.score;
            if (!seenEntryKeys.has(candidate.key)) {
                seenEntryKeys.add(candidate.key);
                matchedEntries.push(candidate);
            }
        }

        sourceBlocks.push({
            path: normalizeAiThemePath(hit.path),
            score: hit.score,
            blockId: hit.blockId,
            textHash: hit.textHash,
            lineNo: toLineNo(hit.lineNo),
            content: hit.content,
            metadata: hit.metadata,
            matchedEntryKey: candidate?.key,
        });
    }

    return { matchedEntries, sourceBlocks };
}

function resolveCandidateFromHit(
    hit: AiThemeRetrieverHit,
    lookup: EntryLookupContext,
): IndexedEntry | null {
    const path = normalizeAiThemePath(hit.path);
    if (!path) return null;

    const blockId = normalizeObsidianBlockId(hit.blockId);
    if (blockId) {
        const byBlock = lookup.byPathAndBlockId.get(composePathAndBlockKey(path, blockId));
        if (byBlock) return byBlock;
    }

    const textHash = (hit.textHash ?? "").trim();
    const lineNo = toLineNo(hit.lineNo);
    if (textHash && lineNo !== undefined) {
        const byHashLine = lookup.byPathAndTextHashLine.get(
            composePathAndHashLineKey(path, textHash, lineNo),
        );
        if (byHashLine) return byHashLine;
    }

    if (textHash) {
        const byHash = lookup.byPathAndUniqueTextHash.get(composePathAndHashKey(path, textHash));
        if (byHash) return byHash;
    }

    return null;
}

function toRerankCandidate(entry: IndexedEntry): AiThemeRerankCandidate {
    return {
        key: entry.key,
        path: entry.path,
        sourceText: entry.sourceText,
        score: entry.hitScore,
        blockId: entry.obsidianBlockId,
        textHash: entry.textHash,
        lineNo: entry.lineNo,
    };
}

function applyRerankOrder(entries: IndexedEntry[], orderedKeys: string[]): IndexedEntry[] {
    if (!orderedKeys?.length) return entries;

    const byKey = new Map<string, IndexedEntry>();
    for (const entry of entries) {
        byKey.set(entry.key, entry);
    }

    const seen = new Set<string>();
    const output: IndexedEntry[] = [];
    for (const key of orderedKeys) {
        const entry = byKey.get(key);
        if (!entry || seen.has(key)) continue;
        seen.add(key);
        output.push(entry);
    }
    for (const entry of entries) {
        if (seen.has(entry.key)) continue;
        output.push(entry);
    }
    return output;
}

function toEntryRef(entry: IndexedEntry): AiThemeEntryRef {
    return {
        key: entry.key,
        path: entry.path,
        sourceText: entry.sourceText,
        lineNo: entry.lineNo,
        obsidianBlockId: entry.obsidianBlockId,
        textHash: entry.textHash,
        score: entry.hitScore,
        cardCount: entry.cardRefs.length,
        cardRefs: clone(entry.cardRefs),
    };
}

function collectCardRefs(entries: IndexedEntry[], orderMode: AiThemeOrderMode): AiThemeCardRef[] {
    const result: AiThemeCardRef[] = [];
    const seenCardKeys = new Set<string>();

    for (const entry of entries) {
        for (const cardRef of entry.cardRefs) {
            const card = {
                ...cardRef,
                score: cardRef.score ?? entry.hitScore,
            };
            const cardKey = composeCardKey(card);
            if (seenCardKeys.has(cardKey)) continue;
            seenCardKeys.add(cardKey);
            result.push(card);
        }
    }

    if (orderMode === "random") {
        shuffleInPlace(result);
    }
    return result;
}

function dedupeCardRefs(cardRefs: AiThemeCardRef[]): AiThemeCardRef[] {
    const result: AiThemeCardRef[] = [];
    const seen = new Set<string>();
    for (const ref of cardRefs ?? []) {
        if (!ref) continue;
        const normalized: AiThemeCardRef = {
            ...ref,
            path: normalizeAiThemePath(ref.path),
            lineNo: toLineNo(ref.lineNo),
        };
        const key = composeCardKey(normalized);
        if (!normalized.path || normalized.cardIdx == null || seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

function composePathAndBlockKey(path: string, blockId: string): string {
    return `p:${normalizeAiThemePath(path)}|b:${normalizeObsidianBlockId(blockId)}`;
}

function composePathAndHashLineKey(path: string, textHash: string, lineNo: number): string {
    return `p:${normalizeAiThemePath(path)}|h:${(textHash ?? "").trim()}|l:${lineNo}`;
}

function composePathAndHashKey(path: string, textHash: string): string {
    return `p:${normalizeAiThemePath(path)}|h:${(textHash ?? "").trim()}`;
}

function composeCardKey(cardRef: AiThemeCardRef): string {
    const cardId = cardRef.cardId != null ? String(cardRef.cardId) : "";
    return `p:${normalizeAiThemePath(cardRef.path)}|idx:${cardRef.cardIdx}|id:${cardId}`;
}

function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
