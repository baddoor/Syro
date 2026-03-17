import {
    aiPacksToDeckStates,
    createAiDeckDraftInput,
    createAiDeckDraftInputFromPack,
    getAiPackIdFromDeckState,
} from "src/ui/adapters/aiDeckAdapter";

describe("aiDeckAdapter", () => {
    it("creates stable draft defaults", () => {
        expect(createAiDeckDraftInput()).toEqual({
            name: "",
            themePrompt: "",
            finalEntryLimit: 10,
            orderMode: "relevance",
            llmEnabled: false,
        });
    });

    it("maps theme packs to dedicated deck states", () => {
        const [deck] = aiPacksToDeckStates([
            {
                id: "ai-theme-3",
                name: "量子力学",
                themePrompt: "叠加态",
                retriever: "smart-connections",
                finalEntryLimit: 10,
                entryCount: 10,
                cardCount: 24,
                orderMode: "random",
                llmEnabled: true,
                createdAt: 1,
                updatedAt: 2,
                sourceBlocks: [],
                entryRefs: [],
                cardRefs: [],
            },
        ]);

        expect(deck.kind).toBe("ai-pack");
        expect(deck.subtitle).toBe("10 条 / 24 卡");
        expect(deck.newCount).toBe(10);
        expect(deck.dueCount).toBe(24);
        expect(deck.entryCount).toBe(10);
        expect(deck.cardCount).toBe(24);
        expect(getAiPackIdFromDeckState(deck)).toBe("ai-theme-3");
    });

    it("creates draft input from saved pack", () => {
        const draft = createAiDeckDraftInputFromPack({
            id: "ai-theme-4",
            name: "生物",
            themePrompt: "细胞器",
            retriever: "smart-connections",
            finalEntryLimit: 20,
            entryCount: 20,
            cardCount: 25,
            orderMode: "relevance",
            llmEnabled: false,
            createdAt: 1,
            updatedAt: 2,
            sourceBlocks: [],
            entryRefs: [],
            cardRefs: [],
        });

        expect(draft).toEqual({
            name: "生物",
            themePrompt: "细胞器",
            finalEntryLimit: 20,
            orderMode: "relevance",
            llmEnabled: false,
        });
    });
});
