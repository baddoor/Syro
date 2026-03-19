import { ReviewDeck } from "src/ReviewDeck";
import { reviewDeckToSections } from "src/ui/adapters/noteReviewAdapter";
import * as DateProviderModule from "src/util/DateProvider";
import { StaticDateProvider } from "src/util/DateProvider";

function createPluginStub(): any {
    return {
        data: {
            settings: {
                maxNDaysNotesReviewQueue: 365,
            },
        },
        app: {
            metadataCache: {
                getFileCache: (): null => null,
            },
        },
    };
}

describe("reviewDeckToSections", () => {
    const originalDateProvider = DateProviderModule.globalDateProvider;

    afterEach(() => {
        (
            DateProviderModule as unknown as {
                globalDateProvider: typeof DateProviderModule.globalDateProvider;
            }
        ).globalDateProvider = originalDateProvider;
    });

    test("keeps tracked scheduled notes visible even when due date is beyond the sidebar day limit", () => {
        (
            DateProviderModule as unknown as { globalDateProvider: StaticDateProvider }
        ).globalDateProvider = StaticDateProvider.fromDateStr("2026-03-19");

        const deck = new ReviewDeck("default");
        deck.scheduledNotes.push({
            note: {
                path: "future-note.md",
                basename: "future-note",
            } as any,
            item: {
                priority: 5,
            } as any,
            dueUnix: Date.UTC(2028, 6, 9, 5, 8, 31),
        });

        const sections = reviewDeckToSections(deck, createPluginStub());

        expect(sections).toHaveLength(1);
        expect(sections[0].id).toBe("day-843");
        expect(sections[0].items).toHaveLength(1);
        expect(sections[0].items[0].path).toBe("future-note.md");
        expect(sections[0].items[0].title).toBe("future-note");
    });

    test("still renders unscheduled tracked notes in the new section", () => {
        (
            DateProviderModule as unknown as { globalDateProvider: StaticDateProvider }
        ).globalDateProvider = StaticDateProvider.fromDateStr("2026-03-19");

        const deck = new ReviewDeck("default");
        deck.newNotes.push({
            note: {
                path: "new-note.md",
                basename: "new-note",
            } as any,
            item: {
                priority: 3,
            } as any,
        });

        const sections = reviewDeckToSections(deck, createPluginStub());

        expect(sections[0].id).toBe("new");
        expect(sections[0].items).toHaveLength(1);
        expect(sections[0].items[0].path).toBe("new-note.md");
    });
});
