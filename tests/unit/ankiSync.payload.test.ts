import { Card } from "src/Card";
import { CardType } from "src/Question";
import { TopicPath } from "src/TopicPath";
import { buildSyroAnkiCardPayload } from "src/ankiSync/payload";
import { TrackedFile, TrackedItem } from "src/dataStore/trackedFile";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { DEFAULT_SETTINGS } from "src/settings";

function createItem(deckName = "#Deck"): RepetitionItem {
    const item = new RepetitionItem(1, "file-1", RPITEMTYPE.CARD, deckName, {
        ease: 2.5,
        lastInterval: 3,
        iteration: 3,
    });
    item.uuid = "uuid-1";
    item.queue = CardQueue.Review;
    item.nextReview = 10;
    return item;
}

function createCard(options: {
    topicPath?: string[];
    deckName?: string;
    front?: string;
    back?: string;
    cardIdx?: number;
    questionType?: CardType;
    noteText?: string;
    filePath?: string;
} = {}): Card {
    const {
        topicPath,
        deckName = "#Deck",
        front = "front",
        back = "back",
        cardIdx = 0,
        questionType = CardType.Cloze,
        noteText = front,
        filePath = "note.md",
    } = options;
    const item = createItem(deckName);
    const card = new Card({ front, back, cardIdx });
    card.repetitionItem = item;
    card.question = {
        topicPathList: topicPath ? { list: [new TopicPath(topicPath)] } : { list: [] },
        note: { filePath, fileText: noteText },
        questionContext: ["context"],
        questionType,
        questionText: { actualQuestion: noteText },
        lineNo: 10,
    } as any;
    return card;
}

function createLocatorTrackedFile(
    noteText: string,
    trackedItem: TrackedItem,
    filePath = "note.md",
): TrackedFile {
    const trackedFile = new TrackedFile(filePath, RPITEMTYPE.CARD);
    trackedFile.trackedItems = [trackedItem];
    return trackedFile;
}

describe("ankiSync payload", () => {
    it("prefixes root-level topic paths with the Syro namespace", () => {
        const payload = buildSyroAnkiCardPayload(createCard({ topicPath: ["final-test"] }));

        expect(payload?.deckName).toBe("Syro::final-test");
    });

    it("prefixes nested topic paths with the Syro namespace", () => {
        const payload = buildSyroAnkiCardPayload(
            createCard({ topicPath: ["zh", "note-review", "timeline"] }),
        );

        expect(payload?.deckName).toBe("Syro::zh::note-review::timeline");
    });

    it("normalizes tag-style deck names and preserves a single Syro prefix", () => {
        const fromTag = buildSyroAnkiCardPayload(createCard({ deckName: "#Deck/Subdeck" }));
        const alreadyPrefixed = buildSyroAnkiCardPayload(createCard({ topicPath: ["Syro", "Deck"] }));

        expect(fromTag?.deckName).toBe("Syro::Deck::Subdeck");
        expect(alreadyPrefixed?.deckName).toBe("Syro::Deck");
    });

    it("falls back to Syro::default when the source deck is empty", () => {
        const payload = buildSyroAnkiCardPayload(createCard({ deckName: "" }));

        expect(payload?.deckName).toBe("Syro::default");
    });

    it("renders cloze cards from locator spans instead of legacy front/back markers", () => {
        const noteText = "这是一个非常完善的重构蓝图。基于你提供的决策，我为你制定了一份详细的**分步修复计划**。";
        const card = createCard({
            front: "legacy-front",
            back: "legacy-back",
            noteText,
            questionType: CardType.Cloze,
        });
        const answerText = "分步修复计划";
        const answerStart = noteText.indexOf(answerText);
        const trackedItem = new TrackedItem(
            answerText,
            10,
            "",
            CardType.Cloze,
            {
                startOffset: answerStart,
                endOffset: answerStart + answerText.length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "bd0",
            card.repetitionItem!.ID,
        );
        const trackedFile = createLocatorTrackedFile(noteText, trackedItem);

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", noteText]]),
        });

        expect(payload?.renderSource).toBe("locator");
        expect(payload?.fields.Front).toContain("[...]");
        expect(payload?.fields.Front).not.toContain("legacy-front");
        expect(payload?.fields.Back).toContain('class="syro-anki-answer"');
        expect(payload?.fields.Back).not.toContain("legacy-back");
        expect(payload?.warnings).toEqual([]);
    });

    it("renders QA cards from locator blocks instead of legacy serialized content", () => {
        const noteText = "问题::答案";
        const card = createCard({
            front: "legacy-question",
            back: "legacy-answer",
            noteText,
            questionType: CardType.SingleLineBasic,
        });
        const answerText = "答案";
        const answerStart = noteText.indexOf(answerText);
        const trackedItem = new TrackedItem(
            noteText,
            10,
            "",
            CardType.SingleLineBasic,
            {
                startOffset: answerStart,
                endOffset: answerStart + answerText.length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "c1",
            card.repetitionItem!.ID,
        );
        const trackedFile = createLocatorTrackedFile(noteText, trackedItem);

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", noteText]]),
        });

        expect(payload?.renderSource).toBe("locator");
        expect(payload?.fields.Front).toBe("问题");
        expect(payload?.fields.Back).toBe("答案");
    });

    it("falls back to legacy front/back and records a warning when locator resolution fails", () => {
        const card = createCard({
            front: "legacy-front",
            back: "legacy-back",
            noteText: "问题::答案",
            questionType: CardType.SingleLineBasic,
        });
        const trackedFile = createLocatorTrackedFile("问题::答案", undefined as any);
        trackedFile.trackedItems = [];

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", "问题::答案"]]),
        });

        expect(payload?.renderSource).toBe("fallback");
        expect(payload?.fields.Front).toBe("legacy-front");
        expect(payload?.warnings[0]).toContain("locator fallback");
    });
    it("builds Obsidian source links and one-based breadcrumb lines when vault context is available", () => {
        const payload = buildSyroAnkiCardPayload(createCard({ filePath: "zh/test.md" }), undefined, undefined, {
            vaultName: "plugin_test",
            hasAdvancedUri: true,
        });

        expect(payload?.breadcrumb).toContain("zh / test.md");
        expect(payload?.breadcrumb).toContain("L11");
        expect(payload?.openLink).toContain("obsidian://open");
        expect(payload?.openLink).toContain("vault=plugin_test");
        expect(payload?.exactLink).toContain("obsidian://advanced-uri");
        expect(payload?.exactLink).toContain("line=11");
    });

});
