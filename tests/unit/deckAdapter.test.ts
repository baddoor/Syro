import { Card } from "src/Card";
import { Deck } from "src/Deck";
import { RepetitionItem, CardQueue, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { DEFAULT_DECK_OPTIONS_PRESET } from "src/settings";
import { TopicPath } from "src/TopicPath";
import { deckToUIState } from "src/ui/adapters/deckAdapter";

function createLearningCard(id: number, nextReview: number): Card {
    const item = new RepetitionItem(id, "test-file", RPITEMTYPE.CARD, "#learning", {});
    item.queue = CardQueue.Learn;
    item.learningStep = 1;
    item.nextReview = nextReview;

    const card = new Card();
    card.Id = item.ID;
    card.repetitionItem = item;
    return card;
}

function createPluginStub(learnAheadMinutes: number = 15): any {
    return {
        data: {
            settings: {
                deckCollapseState: {},
                deckPresetAssignment: {},
                deckOptionsPresets: [
                    {
                        ...DEFAULT_DECK_OPTIONS_PRESET,
                        maxNewCards: 999,
                        maxReviews: 999,
                    },
                ],
                learnAheadMinutes,
            },
        },
        loadDailyDeckStats: (): void => undefined,
        getDailyCounts: () => ({ new: 0, review: 0 }),
    };
}

describe("deckToUIState learning counts", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("hides cross-day learning cards that are outside the learn-ahead window", () => {
        const now = Date.UTC(2026, 2, 19, 9, 0, 0);
        jest.spyOn(Date, "now").mockReturnValue(now);

        const root = new Deck("Root", null);
        const deck = root.getOrCreateDeck(new TopicPath(["sync-learning"]));
        deck.learningFlashcards.push(createLearningCard(1, now + 24 * 60 * 60 * 1000));

        const state = deckToUIState(deck, createPluginStub(15));

        expect(state.learningCount).toBe(0);
    });

    test("shows learning cards that fall inside the learn-ahead window", () => {
        const now = Date.UTC(2026, 2, 19, 9, 0, 0);
        jest.spyOn(Date, "now").mockReturnValue(now);

        const root = new Deck("Root", null);
        const deck = root.getOrCreateDeck(new TopicPath(["sync-learning"]));
        deck.learningFlashcards.push(createLearningCard(1, now + 10 * 60 * 1000));

        const state = deckToUIState(deck, createPluginStub(15));

        expect(state.learningCount).toBe(1);
    });
});
