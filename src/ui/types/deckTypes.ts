/**
 * Deck/UI state types shared by review deck list views.
 */

export interface DeckState {
    deckName: string;
    fullPath?: string;
    newCount: number;
    learningCount: number;
    dueCount: number;
    subdecks: DeckState[];
    isCollapsed: boolean;
    depth?: number;
    kind?: "native" | "ai-pack";
    id?: string;
    subtitle?: string;
    entryCount?: number;
    cardCount?: number;
}

export type DeckSourceTab = "native" | "ai";

export type AiPackOrderMode = "relevance" | "random";

export interface AiDeckPack {
    id: string;
    name: string;
    themePrompt: string;
    finalEntryLimit: number;
    entryCount: number;
    cardCount: number;
    orderMode: AiPackOrderMode;
    llmEnabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface AiDeckDraftInput {
    name: string;
    themePrompt: string;
    finalEntryLimit: number;
    orderMode: AiPackOrderMode;
    llmEnabled: boolean;
}
