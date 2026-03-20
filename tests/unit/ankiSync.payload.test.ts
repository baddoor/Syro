import { Card } from "src/Card";
import { CardType } from "src/Question";
import { TopicPath } from "src/TopicPath";
import {
    buildAnkiMediaFilename,
    buildSyroAnkiCardPayload,
    extractMarkdownMediaReferenceCandidates,
} from "src/ankiSync/payload";
import { DEFAULT_ANKI_BASIC_MODEL_NAME, DEFAULT_ANKI_CLOZE_MODEL_NAME } from "src/ankiSync/types";
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
        const noteText = "这是一个非常完整的重构蓝图。基于你的决策，我为你制定了一份详细的**分步修复计划**。";
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
        expect(payload?.modelKind).toBe("cloze");
        expect(payload?.modelName).toBe(DEFAULT_ANKI_CLOZE_MODEL_NAME);
        expect(payload?.fields.Text).toContain("{{c1::");
        expect(payload?.fields.Text).toContain(answerText);
        expect(payload?.fields.Text).not.toContain("legacy-front");
        expect(payload?.fields["Back Extra"]).toContain(noteText);
        expect(payload?.warnings).toEqual([]);
    });

    it("keeps other clozes wrapped in their original markers when building a native cloze note", () => {
        const noteText = "alpha ==first== beta ==second== gamma";
        const card = createCard({
            noteText,
            questionType: CardType.Cloze,
        });
        const trackedItems = [
            new TrackedItem(
                "first",
                10,
                "",
                CardType.Cloze,
                {
                    startOffset: noteText.indexOf("first"),
                    endOffset: noteText.indexOf("first") + "first".length,
                    blockStartOffset: 0,
                    blockEndOffset: noteText.length,
                },
                "hl0",
                card.repetitionItem!.ID,
            ),
            new TrackedItem(
                "second",
                10,
                "",
                CardType.Cloze,
                {
                    startOffset: noteText.indexOf("second"),
                    endOffset: noteText.indexOf("second") + "second".length,
                    blockStartOffset: 0,
                    blockEndOffset: noteText.length,
                },
                "hl1",
                999,
            ),
        ];
        const trackedFile = createLocatorTrackedFile(noteText, trackedItems[0]);
        trackedFile.trackedItems = trackedItems;

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", noteText]]),
        });

        expect(payload?.fields.Text).toBe("alpha =={{c1::first}}== beta ==second== gamma");
    });

    it("builds a native cloze note for non-first bold clozes in a multiline block", () => {
        const noteText =
            "- A. 只要 `timesReviewed === 0`，它就**一定**是 New，不管 `nextReview` 是多少。\n" +
            "- B. 必须 `nextReview === 0` (或 null) 才算 New。如果被设置了未来的排程时间，即便从未复习过，也不算 New。\n" +
            "- C. 这种情况被视为**脏数据/Bug**，正常逻辑下不该存在，你打算在其他地方拦截/清洗它。";
        const card = createCard({
            noteText,
            questionType: CardType.Cloze,
        });
        card.repetitionItem!.ID = 2;
        const trackedItems = [
            new TrackedItem(
                "一定",
                12,
                "",
                CardType.Cloze,
                {
                    startOffset: noteText.indexOf("一定"),
                    endOffset: noteText.indexOf("一定") + "一定".length,
                    blockStartOffset: 0,
                    blockEndOffset: noteText.length,
                },
                "bd0",
                1,
            ),
            new TrackedItem(
                "脏数据/Bug",
                12,
                "",
                CardType.Cloze,
                {
                    startOffset: noteText.indexOf("脏数据/Bug"),
                    endOffset: noteText.indexOf("脏数据/Bug") + "脏数据/Bug".length,
                    blockStartOffset: 0,
                    blockEndOffset: noteText.length,
                },
                "bd1",
                2,
            ),
        ];
        const trackedFile = createLocatorTrackedFile(noteText, trackedItems[0]);
        trackedFile.trackedItems = trackedItems;

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", noteText]]),
        });

        expect(payload?.fields.Text).toContain("一定");
        expect(payload?.fields.Text).toContain("{{c1::脏数据/Bug}}");
        expect(payload?.fields.Text).not.toContain("{{c1::一定}}");
    });

    it("builds a native cloze note for emoji-prefixed bold clozes", () => {
        const noteText =
            "👉 **疑问**：对于之前的进度，我们需要在代码里写一个“后备兼容”逻辑吗？";
        const card = createCard({
            noteText,
            questionType: CardType.Cloze,
        });
        card.repetitionItem!.ID = 88;
        const trackedItem = new TrackedItem(
            "疑问",
            85,
            "",
            CardType.Cloze,
            {
                startOffset: noteText.indexOf("疑问"),
                endOffset: noteText.indexOf("疑问") + "疑问".length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "bd0",
            88,
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

        expect(payload?.fields.Text).toContain("**{{c1::疑问}}**：");
        expect(payload?.fields.Text).toContain("后备兼容");
    });

    it("repairs bold cloze ranges locally when the stored span drifts by one character", () => {
        const noteText = "**相关章节导航：**\n\n- Timeline：保存阅读位置与历史进度";
        const card = createCard({
            noteText,
            questionType: CardType.Cloze,
        });
        card.repetitionItem!.ID = 301;
        const fingerprint = "相关章节导航：";
        const start = noteText.indexOf(fingerprint);
        const trackedItem = new TrackedItem(
            fingerprint,
            33,
            "",
            CardType.Cloze,
            {
                startOffset: start + 1,
                endOffset: start + 1 + fingerprint.length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "bd0",
            301,
        );
        const trackedFile = createLocatorTrackedFile(noteText, trackedItem);
        const syncSpy = jest.spyOn(trackedFile, "syncNoteCardsIndex");

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["note.md", noteText]]),
        });

        expect(payload?.fields.Text).toContain("**{{c1::相关章节导航：}}**");
        expect(payload?.fields.Text).not.toContain("*{{c1::相关章节导航：}}：**");
        expect(syncSpy).not.toHaveBeenCalled();
    });

    it("resyncs a broken file at most once when multiple cards from the same file have stale spans", () => {
        const noteText = "**第一项：**\n\n**第二项：**";
        const firstCard = createCard({
            noteText,
            questionType: CardType.Cloze,
            filePath: "shared.md",
        });
        const secondCard = createCard({
            noteText,
            questionType: CardType.Cloze,
            filePath: "shared.md",
        });
        firstCard.repetitionItem!.ID = 401;
        secondCard.repetitionItem!.ID = 402;

        const brokenFirst = new TrackedItem(
            "第一项：",
            10,
            "",
            CardType.Cloze,
            {
                startOffset: 0,
                endOffset: 2,
                blockStartOffset: 0,
                blockEndOffset: 2,
            },
            "bd0",
            401,
        );
        const brokenSecond = new TrackedItem(
            "第二项：",
            12,
            "",
            CardType.Cloze,
            {
                startOffset: 0,
                endOffset: 2,
                blockStartOffset: 0,
                blockEndOffset: 2,
            },
            "bd1",
            402,
        );
        const trackedFile = createLocatorTrackedFile(noteText, brokenFirst, "shared.md");
        trackedFile.trackedItems = [brokenFirst, brokenSecond];

        const repairedFirst = new TrackedItem(
            "第一项：",
            10,
            "",
            CardType.Cloze,
            {
                startOffset: noteText.indexOf("第一项："),
                endOffset: noteText.indexOf("第一项：") + "第一项：".length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "bd0",
            401,
        );
        const repairedSecond = new TrackedItem(
            "第二项：",
            12,
            "",
            CardType.Cloze,
            {
                startOffset: noteText.indexOf("第二项："),
                endOffset: noteText.indexOf("第二项：") + "第二项：".length,
                blockStartOffset: 0,
                blockEndOffset: noteText.length,
            },
            "bd1",
            402,
        );
        const syncSpy = jest
            .spyOn(trackedFile, "syncNoteCardsIndex")
            .mockImplementation((_fileText, _settings) => {
                trackedFile.trackedItems = [repairedFirst, repairedSecond];
                return { hasChange: false, removedIds: [] };
            });
        const buildContext = {
            settings: DEFAULT_SETTINGS,
            store: {
                getTrackedFile: () => trackedFile,
                getFileByID: () => trackedFile,
            },
            fileTextByPath: new Map([["shared.md", noteText]]),
            locatorRepairCache: new Map(),
        };

        const firstPayload = buildSyroAnkiCardPayload(firstCard, undefined, undefined, buildContext);
        const secondPayload = buildSyroAnkiCardPayload(secondCard, undefined, undefined, buildContext);

        expect(syncSpy).toHaveBeenCalledTimes(1);
        expect(firstPayload?.fields.Text).toContain("**{{c1::第一项：}}**");
        expect(secondPayload?.fields.Text).toContain("**{{c1::第二项：}}**");
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
        expect(payload?.modelKind).toBe("basic");
        expect(payload?.modelName).toBe(DEFAULT_ANKI_BASIC_MODEL_NAME);
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

    it("skips payload generation when the repetition item belongs to a different file", () => {
        const card = createCard({ filePath: "zh/flashcards/index.md" });
        card.repetitionItem!.fileID = "file-2";

        const payload = buildSyroAnkiCardPayload(card, undefined, undefined, {
            settings: { ...DEFAULT_SETTINGS, showRuntimeDebugMessages: true },
            store: {
                getTrackedFile: () => null,
                getFileByID: (fileID: string) =>
                    fileID === "file-2" ? ({ path: "zh/flashcards/card-authoring.md" } as TrackedFile) : null,
            },
        });

        expect(payload).toBeNull();
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

    it("extracts wikilink, markdown, and html image references in source order", () => {
        const candidates = extractMarkdownMediaReferenceCandidates(
            'before ![[assets/图.png]] middle ![alt](imgs/img 1.png) <img src="../raw/pic.jpg">',
            "Front",
        );

        expect(candidates.map((candidate) => candidate.originalPath)).toEqual([
            "assets/图.png",
            "imgs/img 1.png",
            "../raw/pic.jpg",
        ]);
        expect(candidates.map((candidate) => candidate.sourceType)).toEqual(["wikilink", "markdown", "html"]);
    });

    it("builds stable escaped Anki media filenames from vault paths", () => {
        expect(buildAnkiMediaFilename("assets/cards/img 1.png")).toBe("syro__assets__cards__img_201.png");
        expect(buildAnkiMediaFilename("资料/图.png")).toBe("syro___E8_B5_84_E6_96_99___E5_9B_BE.png");
    });

});
