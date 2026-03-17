import { AiThemePackRecord } from "src/aiTheme";
import { AiDeckDraftInput, AiPackOrderMode, DeckState } from "src/ui/types/deckTypes";

export const AI_DECK_PATH_PREFIX = "ai-pack/";

export function createAiDeckDraftInput(seed?: Partial<AiDeckDraftInput>): AiDeckDraftInput {
    return {
        name: seed?.name ?? "",
        themePrompt: seed?.themePrompt ?? "",
        finalEntryLimit: Math.max(1, Number(seed?.finalEntryLimit ?? 10)),
        orderMode: (seed?.orderMode ?? "relevance") as AiPackOrderMode,
        llmEnabled: seed?.llmEnabled ?? false,
    };
}

export function createAiDeckDraftInputFromPack(pack: AiThemePackRecord): AiDeckDraftInput {
    return createAiDeckDraftInput({
        name: pack.name,
        themePrompt: pack.themePrompt,
        finalEntryLimit: pack.finalEntryLimit,
        orderMode: pack.orderMode,
        llmEnabled: pack.llmEnabled,
    });
}

export function aiPacksToDeckStates(packs: AiThemePackRecord[]): DeckState[] {
    return packs.map((pack) => ({
        id: pack.id,
        kind: "ai-pack",
        deckName: pack.name,
        subtitle: `${pack.entryCount} entries / ${pack.cardCount} cards`,
        fullPath: `${AI_DECK_PATH_PREFIX}${pack.id}`,
        newCount: pack.entryCount,
        learningCount: 0,
        dueCount: pack.cardCount,
        subdecks: [],
        isCollapsed: false,
        entryCount: pack.entryCount,
        cardCount: pack.cardCount,
    }));
}

export function getAiPackIdFromDeckState(deck: DeckState): string | null {
    if (deck.id) return deck.id;
    if (!deck.fullPath) return null;
    if (!deck.fullPath.startsWith(AI_DECK_PATH_PREFIX)) return null;
    return deck.fullPath.slice(AI_DECK_PATH_PREFIX.length);
}
