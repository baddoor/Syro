import { Note } from "src/Note";
import { NoteFileLoader } from "src/NoteFileLoader";
import {
    CachedNoteBindingStore,
    validateCachedNoteBindings,
} from "src/cache/noteCacheStore";
import { TopicPath } from "src/TopicPath";
import { DEFAULT_SETTINGS } from "src/settings";
import { TextDirection } from "src/util/TextDirection";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";

const noteFileLoader = new NoteFileLoader({
    ...DEFAULT_SETTINGS,
    convertFoldersToDecks: false,
});

async function createNote(path = "zh/flashcards/index.md"): Promise<Note> {
    const file = new UnitTestSRFile(
        `#flashcards/test
Q1::A1
Q2::A2
`,
        path,
    );
    return noteFileLoader.load(file, TextDirection.Ltr, TopicPath.emptyPath);
}

describe("note cache binding validation", () => {
    it("accepts cached cards that still belong to the same note and tracked file", async () => {
        const note = await createNote();
        note.questionList[0].cards[0].Id = 101;
        note.questionList[1].cards[0].Id = 102;

        const store: CachedNoteBindingStore = {
            getItembyID: (id) => ({ fileID: id === 101 || id === 102 ? "file-1" : null }),
            getFileByID: (fileID) =>
                fileID === "file-1" ? { path: "zh/flashcards/index.md" } : null,
            getTrackedFile: (path) =>
                path === "zh/flashcards/index.md"
                    ? { trackedItems: [{ reviewId: 101 }, { reviewId: 102 }] }
                    : null,
        };

        expect(validateCachedNoteBindings(note, store)).toBeNull();
    });

    it("rejects cached cards when the item now belongs to another file", async () => {
        const note = await createNote();
        note.questionList[0].cards[0].Id = 101;
        note.questionList[1].cards[0].Id = 102;

        const store: CachedNoteBindingStore = {
            getItembyID: () => ({ fileID: "file-2" }),
            getFileByID: (fileID) =>
                fileID === "file-2" ? { path: "zh/flashcards/card-authoring.md" } : null,
            getTrackedFile: (path) =>
                path === "zh/flashcards/index.md"
                    ? { trackedItems: [{ reviewId: 101 }, { reviewId: 102 }] }
                    : null,
        };

        expect(validateCachedNoteBindings(note, store)).toEqual(
            expect.objectContaining({
                reason: "file-mismatch",
                cardId: 101,
                notePath: "zh/flashcards/index.md",
                actualFilePath: "zh/flashcards/card-authoring.md",
            }),
        );
    });

    it("rejects cached cards when the tracked file no longer contains the review id", async () => {
        const note = await createNote();
        note.questionList[0].cards[0].Id = 101;
        note.questionList[1].cards[0].Id = 102;

        const store: CachedNoteBindingStore = {
            getItembyID: () => ({ fileID: "file-1" }),
            getFileByID: (fileID) =>
                fileID === "file-1" ? { path: "zh/flashcards/index.md" } : null,
            getTrackedFile: (path) =>
                path === "zh/flashcards/index.md"
                    ? { trackedItems: [{ reviewId: 101 }] }
                    : null,
        };

        expect(validateCachedNoteBindings(note, store)).toEqual(
            expect.objectContaining({
                reason: "missing-tracked-item",
                cardId: 102,
                notePath: "zh/flashcards/index.md",
                actualFilePath: "zh/flashcards/index.md",
            }),
        );
    });
});
