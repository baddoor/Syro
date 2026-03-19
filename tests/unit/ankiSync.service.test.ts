import { MarkdownRenderer } from "obsidian";
import { Card } from "src/Card";
import { Deck } from "src/Deck";
import { buildSyroAnkiCardSnapshotMap, createReviewSnapshotFromItem } from "src/ankiSync/payload";
import { AnkiSyncService } from "src/ankiSync/service";
import { AnkiSyncStateStore, ensureAnkiSyncItemState } from "src/ankiSync/stateStore";
import { DEFAULT_SETTINGS } from "src/settings";
import { Iadapter } from "src/dataStore/adapter";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TopicPath } from "src/TopicPath";

const DAY_MS = 24 * 60 * 60 * 1000;

function createItem(): RepetitionItem {
    const item = new RepetitionItem(1, "file-1", RPITEMTYPE.CARD, "#Deck", {
        ease: 2.5,
        lastInterval: 3,
        iteration: 3,
    });
    item.uuid = "uuid-1";
    item.queue = CardQueue.Review;
    item.nextReview = 10 * DAY_MS;
    item.timesReviewed = 3;
    item.timesCorrect = 2;
    item.errorStreak = 0;
    return item;
}

function createPlugin(
    item: RepetitionItem | RepetitionItem[],
    settingsOverrides: Record<string, unknown> = {},
) {
    const items = Array.isArray(item) ? item : [item];
    return {
        data: {
            settings: {
                ...DEFAULT_SETTINGS,
                ankiSyncEnabled: true,
                ankiSyncEndpoint: "http://127.0.0.1:8765",
                ankiSyncDeletePolicy: "delete",
                ankiSyncModelName: "Syro::Card",
                ...settingsOverrides,
            },
        },
        manifest: { dir: ".obsidian/plugins/syro" },
        store: {
            data: { items },
            dataPath: ".obsidian/plugins/syro/tracked_files.json",
            saveReviewItemDelta: jest.fn(async () => undefined),
        },
    } as any;
}

function createDeckWithCard(item: RepetitionItem): { deck: Deck; cardHash: string; filePath: string } {
    const card = new Card({ front: "front", back: "back", cardIdx: 0 });
    card.repetitionItem = item;
    card.question = {
        topicPathList: { list: [new TopicPath(["Deck"])] },
        note: { filePath: "note.md" },
        questionContext: ["context"],
        lineNo: 10,
    } as any;

    const deck = new Deck("root", null);
    deck.dueFlashcards.push(card);

    const payloadMap = buildSyroAnkiCardSnapshotMap(deck, {}, "Syro::Card");
    return {
        deck,
        cardHash: payloadMap.get(item.uuid)!.payload.cardHash,
        filePath: payloadMap.get(item.uuid)!.payload.filePath,
    };
}

function stringifyLogCalls(logSpy: jest.SpyInstance): string {
    return logSpy.mock.calls
        .map((call) =>
            call
                .map((value: unknown) => (typeof value === "string" ? value : JSON.stringify(value)))
                .join(" "),
        )
        .join("\n");
}

describe("ankiSync service", () => {
    const files = new Map<string, string>();
    const binaryFiles = new Map<string, Uint8Array>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        readBinary: jest.fn(async (path: string) => {
            const value = binaryFiles.get(path);
            return value ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : new Uint8Array().buffer;
        }),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };

    beforeEach(() => {
        files.clear();
        binaryFiles.clear();
        jest.clearAllMocks();
        (Iadapter as any)._instance = { adapter };
    });

    it("queues a pending writeback for local reviews", async () => {
        const item = createItem();
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => ({}) as any,
            now: () => 1234,
        });
        await service.initialize();
        await service.queueLocalReviewWriteback(item);

        const state = await store.load();
        expect(state.items[item.uuid].pendingReviewWritebacks).toHaveLength(1);
        expect(state.items[item.uuid].lastLocalUpdatedAt).toBe(1234);
    });

    it("clears the pending writeback when undo restores the last synced snapshot", async () => {
        const item = createItem();
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => ({}) as any,
            now: () => 2000,
        });
        const baseline = { ...createReviewSnapshotFromItem(item), updatedAt: 1000 };
        const state = await store.load();
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        itemState.lastRemoteSnapshot = baseline;
        itemState.lastRemoteUpdatedAt = 1000;
        await store.save(state);
        await service.initialize();

        item.timesReviewed += 1;
        item.timesCorrect += 1;
        await service.queueLocalReviewWriteback(item);

        item.timesReviewed = baseline.timesReviewed;
        item.timesCorrect = baseline.timesCorrect;
        item.nextReview = baseline.nextReview;
        item.queue = baseline.queue;
        await service.rewritePendingWriteback(item);

        const reloaded = await store.load();
        expect(reloaded.items[item.uuid].pendingReviewWritebacks).toHaveLength(0);
    });

    it("keeps pending writebacks when Anki writeback fails", async () => {
        const item = createItem();
        const { deck, cardHash, filePath } = createDeckWithCard(item);
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        const snapshot = { ...createReviewSnapshotFromItem(item), updatedAt: 1500 };
        itemState.mapping = {
            noteId: 10,
            cardId: 20,
            modelName: "Syro::Card",
            deckName: "Syro::Deck",
            filePath,
            cardHash,
        };
        itemState.lastRemoteSnapshot = snapshot;
        itemState.pendingReviewWritebacks = [
            { id: "p1", snapshot, createdAt: 1500, attempts: 0, lastError: null },
        ];
        await store.save(state);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            updateNoteFields: jest.fn(async () => {
                throw new Error("offline");
            }),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => [
                {
                    noteId: 10,
                    cards: [20],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {
                        syro_item_uuid: item.uuid,
                        syro_file_path: filePath,
                        syro_card_hash: cardHash,
                        syro_snapshot: JSON.stringify(snapshot),
                        syro_updated_at: "1500",
                    },
                },
            ]),
            cardsInfo: jest.fn(async () => [
                {
                    cardId: 20,
                    noteId: 10,
                    deckName: "Syro::Deck",
                    factor: 2500,
                    interval: 3,
                    type: 2,
                    queue: 2,
                    due: 100,
                    reps: 3,
                    lapses: 1,
                    left: 0,
                    mod: 1,
                },
            ]),
            addNotes: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => client as any,
            now: () => 2000,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-1");
        const reloaded = await store.load();
        expect(reloaded.items[item.uuid].pendingReviewWritebacks).toHaveLength(1);
        expect(result.errors.some((message) => message.includes("offline"))).toBe(true);
    });

    it("clears pending writebacks after a successful flush", async () => {
        const item = createItem();
        const { deck, cardHash, filePath } = createDeckWithCard(item);
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        const snapshot = { ...createReviewSnapshotFromItem(item), updatedAt: 2500 };
        itemState.mapping = {
            noteId: 10,
            cardId: 20,
            modelName: "Syro::Card",
            deckName: "Syro::Deck",
            filePath,
            cardHash,
        };
        itemState.lastRemoteSnapshot = snapshot;
        itemState.pendingReviewWritebacks = [
            { id: "p1", snapshot, createdAt: 2500, attempts: 0, lastError: null },
        ];
        await store.save(state);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => [
                {
                    noteId: 10,
                    cards: [20],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {
                        syro_item_uuid: item.uuid,
                        syro_file_path: filePath,
                        syro_card_hash: cardHash,
                        syro_snapshot: JSON.stringify(snapshot),
                        syro_updated_at: "2500",
                    },
                },
            ]),
            cardsInfo: jest.fn(async () => [
                {
                    cardId: 20,
                    noteId: 10,
                    deckName: "Syro::Deck",
                    factor: 2500,
                    interval: 3,
                    type: 2,
                    queue: 2,
                    due: 100,
                    reps: 3,
                    lapses: 1,
                    left: 0,
                    mod: 1,
                },
            ]),
            addNotes: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => client as any,
            now: () => 3000,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-1");
        const reloaded = await store.load();
        expect(reloaded.items[item.uuid].pendingReviewWritebacks).toHaveLength(0);
        expect(result.writebacks).toBe(1);
    });

    it("recovers mappings from remote Syro notes when the sidecar is empty", async () => {
        const item = createItem();
        const { deck, cardHash, filePath } = createDeckWithCard(item);
        const snapshot = { ...createReviewSnapshotFromItem(item), updatedAt: 1000 };
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => [
                {
                    noteId: 30,
                    cards: [40],
                    modelName: "Syro::Card",
                    tags: ["syro-sync"],
                    mod: 10,
                    fields: {
                        syro_item_uuid: item.uuid,
                        syro_file_path: filePath,
                        syro_card_hash: cardHash,
                        syro_snapshot: JSON.stringify(snapshot),
                        syro_updated_at: "1000",
                    },
                },
            ]),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => [
                {
                    noteId: 30,
                    cards: [40],
                    modelName: "Syro::Card",
                    tags: ["syro-sync"],
                    mod: 10,
                    fields: {
                        syro_item_uuid: item.uuid,
                        syro_file_path: filePath,
                        syro_card_hash: cardHash,
                        syro_snapshot: JSON.stringify(snapshot),
                        syro_updated_at: "1000",
                    },
                },
            ]),
            cardsInfo: jest.fn(async () => [
                {
                    cardId: 40,
                    noteId: 30,
                    deckName: "Syro::Deck",
                    factor: 2500,
                    interval: 3,
                    type: 0,
                    queue: 0,
                    due: 100,
                    reps: 3,
                    lapses: 1,
                    left: 0,
                    mod: 10,
                },
            ]),
            addNotes: jest.fn(async () => {
                throw new Error("should not create");
            }),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => client as any,
            now: () => 3500,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-remote");
        const reloaded = await store.load();

        expect(client.notesInfoByQuery).toHaveBeenCalledWith("tag:syro-sync");
        expect(client.addNotes).not.toHaveBeenCalled();
        expect(reloaded.items[item.uuid].mapping).toMatchObject({
            noteId: 30,
            cardId: 40,
            deckName: "Syro::Deck",
        });
        expect(result.noop).toBe(1);
    });

    it("passes allowDuplicate=true so same-front cards can both be created", async () => {
        const first = createItem();
        const second = createItem();
        second.uuid = "uuid-2";

        const firstCard = new Card({ front: "front", back: "back", cardIdx: 0 });
        firstCard.repetitionItem = first;
        firstCard.question = {
            topicPathList: { list: [new TopicPath(["Deck"])] },
            note: { filePath: "note-a.md" },
            questionContext: ["context"],
            lineNo: 10,
        } as any;

        const secondCard = new Card({ front: "front", back: "back", cardIdx: 1 });
        secondCard.repetitionItem = second;
        secondCard.question = {
            topicPathList: { list: [new TopicPath(["Deck"])] },
            note: { filePath: "note-b.md" },
            questionContext: ["context"],
            lineNo: 12,
        } as any;

        const deck = new Deck("root", null);
        deck.dueFlashcards.push(firstCard, secondCard);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async (noteIds: number[]) =>
                noteIds.map((noteId) => ({
                    noteId,
                    cards: [noteId + 100],
                    modelName: "Syro::Card",
                    tags: ["syro-sync"],
                    mod: 1,
                    fields: {},
                })),
            ),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest.fn(async () => [10, 11]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(first), {
            clientFactory: () => client as any,
            now: () => 3600,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-duplicates");
        const batchInput = (client.addNotes.mock.calls as any[][])[0][0] as Array<{
            options: { allowDuplicate: boolean };
        }>;

        expect(result.created).toBe(2);
        expect(batchInput).toHaveLength(2);
        expect(batchInput.every((note: any) => note.options.allowDuplicate === true)).toBe(true);
    });

    it("renders breadcrumb as a plain link and prefers the exact locate URI", async () => {
        files.set(".obsidian/plugins/obsidian-advanced-uri/manifest.json", "{}");
        const item = createItem();
        const { deck } = createDeckWithCard(item);
        const plugin = createPlugin(item);
        plugin.app = {
            vault: {
                getName: () => "plugin_test",
                configDir: ".obsidian",
            },
        };
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => [{ canAdd: true }]),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async (noteIds: number[]) =>
                noteIds.map((noteId) => ({
                    noteId,
                    cards: [noteId + 100],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {},
                })),
            ),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest.fn(async () => [10]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(plugin, {
            clientFactory: () => client as any,
            now: () => 3900,
        });
        await service.initialize();

        await service.sync(deck, "sig-breadcrumb");

        const createdBatch = (client.addNotes.mock.calls as any[][])[0][0] as Array<Record<string, any>>;
        const breadcrumb = createdBatch[0].fields.Breadcrumb as string;

        expect(breadcrumb).toContain('<a href="obsidian://advanced-uri');
        expect(breadcrumb).toContain("note.md");
        expect(breadcrumb).toContain("L11");
        expect(breadcrumb).not.toContain("syro-anki-badge");
        expect(breadcrumb).not.toContain("obsidian://open");
    });

    it("treats buried remote cards as delayed schedule updates without changing the local queue", async () => {
        const item = createItem();
        const { deck, cardHash, filePath } = createDeckWithCard(item);
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        state.global.reviewDueOffset = 0;
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        const baseline = {
            ...createReviewSnapshotFromItem(item),
            updatedAt: 1000,
            raw: { queue: 2, type: 2, due: 10 },
        };
        itemState.mapping = {
            noteId: 10,
            cardId: 20,
            modelName: "Syro::Card",
            deckName: "Syro::Deck",
            filePath,
            cardHash,
        };
        itemState.lastRemoteSnapshot = baseline;
        itemState.lastRemoteUpdatedAt = baseline.updatedAt;
        await store.save(state);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => [
                {
                    noteId: 10,
                    cards: [20],
                    modelName: "Syro::Card",
                    tags: ["syro-sync"],
                    mod: 20,
                    fields: {
                        syro_item_uuid: item.uuid,
                        syro_file_path: filePath,
                        syro_card_hash: cardHash,
                        syro_snapshot: JSON.stringify(baseline),
                        syro_updated_at: "1000",
                    },
                },
            ]),
            cardsInfo: jest.fn(async () => [
                {
                    cardId: 20,
                    noteId: 10,
                    deckName: "Syro::Deck",
                    factor: 2500,
                    interval: 3,
                    type: 2,
                    queue: -2,
                    due: 25,
                    reps: 99,
                    lapses: 33,
                    left: 0,
                    mod: 20,
                },
            ]),
            addNotes: jest.fn(async () => []),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => client as any,
            now: () => 3900,
        });
        await service.initialize();
        jest.spyOn(service as any, "refreshCardRuntime").mockImplementation(() => undefined);

        const result = await service.sync(deck, "sig-bury");

        expect(item.queue).toBe(CardQueue.Review);
        expect(item.nextReview).toBe(25 * DAY_MS);
        expect(item.timesReviewed).toBe(3);
        expect((item.data as any).ease).toBeCloseTo(2.5);
        expect(result.pulled).toBe(1);
    });

    it("pulls reviewed remote cards correctly when reviewDueOffset is calibrated from the first mapped card", async () => {
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const item = createItem();
            item.nextReview = 10 * DAY_MS;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const baseline = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastRemoteSnapshot = baseline;
            itemState.lastRemoteUpdatedAt = baseline.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(baseline),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-review-offset");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(1);
            expect(item.nextReview).toBe(25 * DAY_MS);
            expect(item.isDue).toBe(false);
            expect(deck.dueFlashcards[0].isDue).toBe(false);
            expect(reloaded.global.reviewDueOffset).toBe(90);
            expect(debugOutput).toContain("[Syro-Anki][Pull][Calibrate] candidate accepted");
            expect(debugOutput).toContain("\"reason\":\"baseline-available\"");
            expect(debugOutput).toContain("\"computedNextReview\":2160000000");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("uses review logs to clear due when a newly reviewed card has no review baseline", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const item = createItem();
            item.queue = CardQueue.New;
            item.nextReview = 0;
            item.timesReviewed = 0;
            item.timesCorrect = 0;
            item.errorStreak = 0;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const hiddenSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastLocalSnapshot = hiddenSnapshot;
            itemState.lastRemoteSnapshot = hiddenSnapshot;
            itemState.lastLocalUpdatedAt = hiddenSnapshot.updatedAt;
            itemState.lastRemoteUpdatedAt = hiddenSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false]),
                getReviewsOfCards: jest.fn(async () =>
                    new Map([
                        [
                            20,
                            [
                                {
                                    id: 23 * DAY_MS,
                                    usn: 1,
                                    ease: 3,
                                    ivl: 2,
                                    lastIvl: 0,
                                    factor: 2500,
                                    time: 1234,
                                    type: 1,
                                },
                            ],
                        ],
                    ])
                ),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(hiddenSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 105,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-missing-baseline");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(1);
            expect(item.queue).toBe(CardQueue.Review);
            expect(item.nextReview).toBe(25 * DAY_MS);
            expect(item.isDue).toBe(false);
            expect(reloaded.global.reviewDueOffset).toBe(80);
            expect(debugOutput).toContain("\"reason\":\"review-log-available\"");
            expect(debugOutput).toContain("\"missingBaselineState\":\"new-card-without-baseline\"");
            expect(debugOutput).toContain("\"reviewLogState\":\"review-log-available\"");
            expect(debugOutput).toContain("\"computedNextReviewSource\":\"baseline\"");
            expect(debugOutput).not.toContain("[Syro-Anki][Pull][BuildSnapshot][review-offset-unresolved]");
            expect(result.errors).not.toContain(
                "[compare:Syro::Deck] ankiNotDueButSyroDue=1 ankiDueButSyroNotDue=0 ankiDue=0 syroDue=1 unmapped=0",
            );
            expect(result.errors.some((message) => message.includes("[compare-card:Syro::Deck]"))).toBe(false);
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("keeps unresolved diagnostics when a newly reviewed card has no baseline and no usable review log", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const item = createItem();
            item.queue = CardQueue.New;
            item.nextReview = 0;
            item.timesReviewed = 0;
            item.timesCorrect = 0;
            item.errorStreak = 0;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const hiddenSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastLocalSnapshot = hiddenSnapshot;
            itemState.lastRemoteSnapshot = hiddenSnapshot;
            itemState.lastLocalUpdatedAt = hiddenSnapshot.updatedAt;
            itemState.lastRemoteUpdatedAt = hiddenSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false]),
                getReviewsOfCards: jest.fn(async () => new Map([[20, []]])),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(hiddenSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 105,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-missing-baseline-unresolved");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(1);
            expect(item.queue).toBe(CardQueue.Review);
            expect(item.nextReview).toBe(0);
            expect(item.isDue).toBe(true);
            expect(reloaded.global.reviewDueOffset).toBeNull();
            expect(debugOutput).toContain("\"reason\":\"missing-baseline-next-review\"");
            expect(debugOutput).toContain("\"reviewLogState\":\"missing-review-log\"");
            expect(debugOutput).toContain("[Syro-Anki][Pull][BuildSnapshot][review-offset-unresolved]");
            expect(debugOutput).toContain("[Syro-Anki][Pull][Diagnosis] remote review due unresolved");
            expect(debugOutput).toContain("\"direction\":\"anki-not-due_syro-due\"");
            expect(result.errors).toContain(
                "[compare:Syro::Deck] ankiNotDueButSyroDue=1 ankiDueButSyroNotDue=0 ankiDue=0 syroDue=1 unmapped=0",
            );
            expect(
                result.errors.some(
                    (message) =>
                        message.includes("[compare-card:Syro::Deck]") &&
                        message.includes("direction=anki-not-due_syro-due") &&
                        message.includes("reviewLogState=missing-review-log") &&
                        message.includes(`uuid=${item.uuid}`),
                ),
            ).toBe(true);
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("uses a calibrated offset from another mapped card before building a newly reviewed card snapshot", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const newlyReviewedItem = createItem();
            newlyReviewedItem.queue = CardQueue.New;
            newlyReviewedItem.nextReview = 0;
            newlyReviewedItem.timesReviewed = 0;
            newlyReviewedItem.timesCorrect = 0;
            newlyReviewedItem.errorStreak = 0;

            const baselineItem = createItem();
            baselineItem.ID = 2;
            baselineItem.uuid = "uuid-2";
            baselineItem.nextReview = 10 * DAY_MS;

            const firstCard = new Card({ front: "front-1", back: "back-1", cardIdx: 0 });
            firstCard.repetitionItem = newlyReviewedItem;
            firstCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "note-new.md" },
                questionContext: ["context"],
                lineNo: 10,
            } as any;

            const secondCard = new Card({ front: "front-2", back: "back-2", cardIdx: 0 });
            secondCard.repetitionItem = baselineItem;
            secondCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "note-baseline.md" },
                questionContext: ["context"],
                lineNo: 12,
            } as any;

            const deck = new Deck("root", null);
            deck.dueFlashcards.push(firstCard, secondCard);
            const payloadMap = buildSyroAnkiCardSnapshotMap(deck, {}, "Syro::Card");
            const newPayload = payloadMap.get(newlyReviewedItem.uuid)!.payload;
            const baselinePayload = payloadMap.get(baselineItem.uuid)!.payload;

            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const newItemState = ensureAnkiSyncItemState(state, newlyReviewedItem.uuid);
            const baselineItemState = ensureAnkiSyncItemState(state, baselineItem.uuid);
            const newHiddenSnapshot = {
                ...createReviewSnapshotFromItem(newlyReviewedItem),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            const baselineSnapshot = {
                ...createReviewSnapshotFromItem(baselineItem),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            newItemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath: newPayload.filePath,
                cardHash: newPayload.cardHash,
            };
            newItemState.lastLocalSnapshot = newHiddenSnapshot;
            newItemState.lastRemoteSnapshot = newHiddenSnapshot;
            newItemState.lastLocalUpdatedAt = newHiddenSnapshot.updatedAt;
            newItemState.lastRemoteUpdatedAt = newHiddenSnapshot.updatedAt;
            baselineItemState.mapping = {
                noteId: 11,
                cardId: 21,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath: baselinePayload.filePath,
                cardHash: baselinePayload.cardHash,
            };
            baselineItemState.lastRemoteSnapshot = baselineSnapshot;
            baselineItemState.lastRemoteUpdatedAt = baselineSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 21,
                        fields: {
                            syro_item_uuid: newlyReviewedItem.uuid,
                            syro_file_path: newPayload.filePath,
                            syro_card_hash: newPayload.cardHash,
                            syro_snapshot: JSON.stringify(newHiddenSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                    {
                        noteId: 11,
                        cards: [21],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: baselineItem.uuid,
                            syro_file_path: baselinePayload.filePath,
                            syro_card_hash: baselinePayload.cardHash,
                            syro_snapshot: JSON.stringify(baselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 117,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: 21,
                    },
                    {
                        cardId: 21,
                        noteId: 11,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(
                createPlugin([newlyReviewedItem, baselineItem], { showRuntimeDebugMessages: true }),
                {
                    stateStore: store,
                    clientFactory: () => client as any,
                    now: () => 4000,
                },
            );
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-cross-calibration");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(2);
            expect(newlyReviewedItem.nextReview).toBe(27 * DAY_MS);
            expect(reloaded.global.reviewDueOffset).toBe(90);
            expect(debugOutput).toContain("[Syro-Anki][Pull][Calibrate] candidate accepted");
            expect(debugOutput).toContain("\"itemUuid\":\"uuid-1\"");
            expect(debugOutput).toContain("\"computedNextReview\":2332800000");
        } finally {
            logSpy.mockRestore();
        }
    });

    it("reports only the mismatched card when one mapped card disagrees between Anki and Syro", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const mismatchedItem = createItem();
            mismatchedItem.queue = CardQueue.New;
            mismatchedItem.nextReview = 0;
            mismatchedItem.timesReviewed = 0;
            mismatchedItem.timesCorrect = 0;
            mismatchedItem.errorStreak = 0;

            const matchedItem = createItem();
            matchedItem.ID = 2;
            matchedItem.uuid = "uuid-2";
            matchedItem.nextReview = 10 * DAY_MS;

            const firstCard = new Card({ front: "mismatch-front", back: "mismatch-back", cardIdx: 0 });
            firstCard.repetitionItem = mismatchedItem;
            firstCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/mismatch.md" },
                questionContext: ["context"],
                lineNo: 10,
            } as any;

            const secondCard = new Card({ front: "match-front", back: "match-back", cardIdx: 0 });
            secondCard.repetitionItem = matchedItem;
            secondCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/match.md" },
                questionContext: ["context"],
                lineNo: 12,
            } as any;

            const deck = new Deck("root", null);
            deck.dueFlashcards.push(firstCard, secondCard);
            const payloadMap = buildSyroAnkiCardSnapshotMap(deck, {}, "Syro::Card");
            const mismatchPayload = payloadMap.get(mismatchedItem.uuid)!.payload;
            const matchedPayload = payloadMap.get(matchedItem.uuid)!.payload;

            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const mismatchState = ensureAnkiSyncItemState(state, mismatchedItem.uuid);
            const matchedState = ensureAnkiSyncItemState(state, matchedItem.uuid);
            const mismatchHiddenSnapshot = {
                ...createReviewSnapshotFromItem(mismatchedItem),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            const matchedBaselineSnapshot = {
                ...createReviewSnapshotFromItem(matchedItem),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            mismatchState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: mismatchPayload.filePath,
                cardHash: mismatchPayload.cardHash,
            };
            mismatchState.lastLocalSnapshot = mismatchHiddenSnapshot;
            mismatchState.lastRemoteSnapshot = mismatchHiddenSnapshot;
            mismatchState.lastLocalUpdatedAt = mismatchHiddenSnapshot.updatedAt;
            mismatchState.lastRemoteUpdatedAt = mismatchHiddenSnapshot.updatedAt;
            matchedState.mapping = {
                noteId: 11,
                cardId: 21,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: matchedPayload.filePath,
                cardHash: matchedPayload.cardHash,
            };
            matchedState.lastRemoteSnapshot = matchedBaselineSnapshot;
            matchedState.lastRemoteUpdatedAt = matchedBaselineSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false, true]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 21,
                        fields: {
                            syro_item_uuid: mismatchedItem.uuid,
                            syro_file_path: mismatchPayload.filePath,
                            syro_card_hash: mismatchPayload.cardHash,
                            syro_snapshot: JSON.stringify(mismatchHiddenSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                    {
                        noteId: 11,
                        cards: [21],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: matchedItem.uuid,
                            syro_file_path: matchedPayload.filePath,
                            syro_card_hash: matchedPayload.cardHash,
                            syro_snapshot: JSON.stringify(matchedBaselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "1",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 105,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: 21,
                    },
                    {
                        cardId: 21,
                        noteId: 11,
                        deckName: "1",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin([mismatchedItem, matchedItem], { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-due-compare");
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.errors).toContain(
                "[compare:1] ankiNotDueButSyroDue=1 ankiDueButSyroNotDue=1 ankiDue=1 syroDue=1 unmapped=0",
            );
            expect(debugOutput).toContain("[Syro-Anki][Compare][Deck]");
            expect(debugOutput).toContain("\"deckName\":\"1\"");
            expect(debugOutput).toContain("\"ankiNotDue\":[{\"itemUuid\":\"uuid-1\"");
            expect(debugOutput).toContain("\"syroDue\":[{\"itemUuid\":\"uuid-1\"");
            expect(debugOutput).toContain("\"itemUuid\":\"uuid-2\"");
            expect(debugOutput).toContain("\"direction\":\"anki-not-due_syro-due\"");
            expect(debugOutput).toContain("\"direction\":\"anki-due_syro-not-due\"");
            expect(debugOutput).toContain("reviewDueOffset 缺少可用 baseline");
            expect(debugOutput).toContain("[Syro-Anki][Compare][ReviewAuthority]");
            const compareCardWarnings = result.errors.filter((message) => message.startsWith("[compare-card:1]"));
            expect(compareCardWarnings).toHaveLength(1);
            expect(compareCardWarnings[0]).toContain("direction=anki-not-due_syro-due");
            expect(compareCardWarnings[0]).toContain("uuid=uuid-1");
            expect(compareCardWarnings[0]).toContain("localReviewFreshness=");
            expect(compareCardWarnings[0]).toContain("remoteReviewFreshness=");
            expect(compareCardWarnings[0]).toContain("lastMergedUpdatedAt=");
            expect(compareCardWarnings[0]).toContain("lastRemoteUpdatedAt=");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("hides compare warnings unless runtime debug messages are enabled", async () => {
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const mismatchedItem = createItem();
            mismatchedItem.queue = CardQueue.New;
            mismatchedItem.nextReview = 0;
            mismatchedItem.timesReviewed = 0;
            mismatchedItem.timesCorrect = 0;
            mismatchedItem.errorStreak = 0;

            const matchedItem = createItem();
            matchedItem.ID = 2;
            matchedItem.uuid = "uuid-2";
            matchedItem.nextReview = 10 * DAY_MS;

            const firstCard = new Card({ front: "mismatch-front", back: "mismatch-back", cardIdx: 0 });
            firstCard.repetitionItem = mismatchedItem;
            firstCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/mismatch.md" },
                questionContext: ["context"],
                lineNo: 10,
            } as any;

            const secondCard = new Card({ front: "match-front", back: "match-back", cardIdx: 0 });
            secondCard.repetitionItem = matchedItem;
            secondCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/match.md" },
                questionContext: ["context"],
                lineNo: 12,
            } as any;

            const deck = new Deck("root", null);
            deck.dueFlashcards.push(firstCard, secondCard);
            const payloadMap = buildSyroAnkiCardSnapshotMap(deck, {}, "Syro::Card");
            const mismatchPayload = payloadMap.get(mismatchedItem.uuid)!.payload;
            const matchedPayload = payloadMap.get(matchedItem.uuid)!.payload;

            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const mismatchState = ensureAnkiSyncItemState(state, mismatchedItem.uuid);
            const matchedState = ensureAnkiSyncItemState(state, matchedItem.uuid);
            const mismatchHiddenSnapshot = {
                ...createReviewSnapshotFromItem(mismatchedItem),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            const matchedBaselineSnapshot = {
                ...createReviewSnapshotFromItem(matchedItem),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            mismatchState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: mismatchPayload.filePath,
                cardHash: mismatchPayload.cardHash,
            };
            mismatchState.lastLocalSnapshot = mismatchHiddenSnapshot;
            mismatchState.lastRemoteSnapshot = mismatchHiddenSnapshot;
            mismatchState.lastLocalUpdatedAt = mismatchHiddenSnapshot.updatedAt;
            mismatchState.lastRemoteUpdatedAt = mismatchHiddenSnapshot.updatedAt;
            matchedState.mapping = {
                noteId: 11,
                cardId: 21,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: matchedPayload.filePath,
                cardHash: matchedPayload.cardHash,
            };
            matchedState.lastRemoteSnapshot = matchedBaselineSnapshot;
            matchedState.lastRemoteUpdatedAt = matchedBaselineSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false, true]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 21,
                        fields: {
                            syro_item_uuid: mismatchedItem.uuid,
                            syro_file_path: mismatchPayload.filePath,
                            syro_card_hash: mismatchPayload.cardHash,
                            syro_snapshot: JSON.stringify(mismatchHiddenSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                    {
                        noteId: 11,
                        cards: [21],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: matchedItem.uuid,
                            syro_file_path: matchedPayload.filePath,
                            syro_card_hash: matchedPayload.cardHash,
                            syro_snapshot: JSON.stringify(matchedBaselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "1",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 105,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: 21,
                    },
                    {
                        cardId: 21,
                        noteId: 11,
                        deckName: "1",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin([mismatchedItem, matchedItem]), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-due-compare-hidden");

            expect(result.errors.some((message) => message.startsWith("[compare:"))).toBe(false);
            expect(result.errors.some((message) => message.startsWith("[compare-card:"))).toBe(false);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("pulls only the remotely newer mapped card and keeps the locally newer card untouched", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const remoteItem = createItem();
            const localItem = createItem();
            localItem.ID = 2;
            localItem.uuid = "uuid-2";
            localItem.nextReview = 30 * DAY_MS;
            localItem.timesReviewed = 4;
            localItem.timesCorrect = 3;

            const remoteCard = new Card({ front: "remote-front", back: "remote-back", cardIdx: 0 });
            remoteCard.repetitionItem = remoteItem;
            remoteCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/remote.md" },
                questionContext: ["context"],
                lineNo: 10,
            } as any;

            const localCard = new Card({ front: "local-front", back: "local-back", cardIdx: 0 });
            localCard.repetitionItem = localItem;
            localCard.question = {
                topicPathList: { list: [new TopicPath(["Deck"])] },
                note: { filePath: "deck-1/local.md" },
                questionContext: ["context"],
                lineNo: 12,
            } as any;

            const deck = new Deck("root", null);
            deck.dueFlashcards.push(remoteCard, localCard);
            const payloadMap = buildSyroAnkiCardSnapshotMap(deck, {}, "Syro::Card");
            const remotePayload = payloadMap.get(remoteItem.uuid)!.payload;
            const localPayload = payloadMap.get(localItem.uuid)!.payload;

            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const remoteState = ensureAnkiSyncItemState(state, remoteItem.uuid);
            const localState = ensureAnkiSyncItemState(state, localItem.uuid);
            const remoteBaselineSnapshot = {
                ...createReviewSnapshotFromItem(remoteItem),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            const localRemoteSnapshot = {
                ...createReviewSnapshotFromItem(localItem),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 110 },
            };
            const localPendingSnapshot = {
                ...createReviewSnapshotFromItem(localItem),
                updatedAt: 30000,
                raw: { queue: 2, type: 2, due: 120 },
            };
            remoteState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: remotePayload.filePath,
                cardHash: remotePayload.cardHash,
            };
            remoteState.lastRemoteSnapshot = remoteBaselineSnapshot;
            remoteState.lastRemoteUpdatedAt = remoteBaselineSnapshot.updatedAt;
            localState.mapping = {
                noteId: 11,
                cardId: 21,
                modelName: "Syro::Card",
                deckName: "1",
                filePath: localPayload.filePath,
                cardHash: localPayload.cardHash,
            };
            localState.lastRemoteSnapshot = localRemoteSnapshot;
            localState.lastRemoteUpdatedAt = localRemoteSnapshot.updatedAt;
            localState.lastLocalSnapshot = localPendingSnapshot;
            localState.lastLocalUpdatedAt = localPendingSnapshot.updatedAt;
            localState.pendingReviewWritebacks = [
                {
                    id: "pending-local",
                    snapshot: localPendingSnapshot,
                    createdAt: localPendingSnapshot.updatedAt,
                    attempts: 0,
                    lastError: null,
                },
            ];
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false, false]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 21,
                        fields: {
                            syro_item_uuid: remoteItem.uuid,
                            syro_file_path: remotePayload.filePath,
                            syro_card_hash: remotePayload.cardHash,
                            syro_snapshot: JSON.stringify(remoteBaselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                    {
                        noteId: 11,
                        cards: [21],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: localItem.uuid,
                            syro_file_path: localPayload.filePath,
                            syro_card_hash: localPayload.cardHash,
                            syro_snapshot: JSON.stringify(localRemoteSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "1",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 21,
                    },
                    {
                        cardId: 21,
                        noteId: 11,
                        deckName: "1",
                        factor: 2500,
                        interval: 12,
                        type: 2,
                        queue: 2,
                        due: 112,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin([remoteItem, localItem], { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-per-card-atomic");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.writebacks).toBe(1);
            expect(result.pulled).toBe(1);
            expect(remoteItem.nextReview).toBe(25 * DAY_MS);
            expect(localItem.nextReview).toBe(30 * DAY_MS);
            expect(reloaded.items[localItem.uuid].pendingReviewWritebacks).toHaveLength(0);
            expect(debugOutput).toContain("\"authority\":\"anki\"");
            expect(debugOutput).toContain("\"authority\":\"syro\"");
            expect(debugOutput).toContain("\"localReviewFreshness\":30000");
            expect(debugOutput).toContain("\"remoteReviewFreshness\":20000");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("applies a remotely newer card even when lastPullCursor is already ahead", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const item = createItem();
            item.nextReview = 12 * DAY_MS;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            state.global.lastPullCursor = 50000;
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const remoteBaselineSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 102 },
            };
            const staleLocalPendingSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1500,
                raw: { queue: 2, type: 2, due: 103 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastRemoteSnapshot = remoteBaselineSnapshot;
            itemState.lastRemoteUpdatedAt = remoteBaselineSnapshot.updatedAt;
            itemState.lastLocalSnapshot = staleLocalPendingSnapshot;
            itemState.lastLocalUpdatedAt = staleLocalPendingSnapshot.updatedAt;
            itemState.pendingReviewWritebacks = [
                {
                    id: "pending-stale",
                    snapshot: staleLocalPendingSnapshot,
                    createdAt: staleLocalPendingSnapshot.updatedAt,
                    attempts: 0,
                    lastError: null,
                },
            ];
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 21,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(remoteBaselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 117,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 21,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-cursor-bypass");
            const reloaded = await store.load();
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(1);
            expect(item.nextReview).toBe(27 * DAY_MS);
            expect(reloaded.items[item.uuid].pendingReviewWritebacks).toHaveLength(0);
            expect(debugOutput).toContain("\"cursorWouldSkip\":true");
            expect(debugOutput).toContain("\"authority\":\"anki\"");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("treats bookkeeping timestamps as diagnostic only when Anki reviewed most recently", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const item = createItem();
            item.queue = CardQueue.New;
            item.nextReview = 0;
            item.timesReviewed = 0;
            item.timesCorrect = 0;
            item.errorStreak = 0;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const remoteUnsyncedSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 0, type: 0, due: 0 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastRemoteSnapshot = remoteUnsyncedSnapshot;
            itemState.lastRemoteUpdatedAt = 23 * DAY_MS;
            itemState.lastMergedUpdatedAt = 23 * DAY_MS;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [false]),
                getReviewsOfCards: jest.fn(async () =>
                    new Map([
                        [
                            20,
                            [
                                {
                                    id: 23 * DAY_MS,
                                    usn: 1,
                                    ease: 3,
                                    ivl: 2,
                                    lastIvl: 0,
                                    factor: 2500,
                                    time: 1234,
                                    type: 1,
                                },
                            ],
                        ],
                    ])
                ),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: (23 * DAY_MS) / 1000,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(remoteUnsyncedSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 2,
                        type: 2,
                        queue: 2,
                        due: 105,
                        reps: 1,
                        lapses: 0,
                        left: 0,
                        mod: (23 * DAY_MS) / 1000,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-bookkeeping-not-review");
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(1);
            expect(item.nextReview).toBe(25 * DAY_MS);
            expect(item.isDue).toBe(false);
            expect(debugOutput).toContain("\"localReviewFreshness\":0");
            expect(debugOutput).toContain(`\"remoteReviewFreshness\":${23 * DAY_MS}`);
            expect(debugOutput).toContain(`\"lastMergedUpdatedAt\":${23 * DAY_MS}`);
            expect(debugOutput).toContain(`\"lastRemoteUpdatedAt\":${23 * DAY_MS}`);
            expect(debugOutput).toContain("\"reviewLogState\":\"review-log-available\"");
            expect(debugOutput).toContain("\"authority\":\"anki\"");
            expect(debugOutput).not.toContain("\"authority\":\"tie\"");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("keeps the local state when local and remote review freshness tie", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const nowSpy = jest.spyOn(Date, "now").mockReturnValue(20 * DAY_MS);
        try {
            const item = createItem();
            item.nextReview = 10 * DAY_MS;
            const { deck, cardHash, filePath } = createDeckWithCard(item);
            const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
            const state = await store.load();
            const itemState = ensureAnkiSyncItemState(state, item.uuid);
            const remoteBaselineSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 1000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            const localTieSnapshot = {
                ...createReviewSnapshotFromItem(item),
                updatedAt: 20000,
                raw: { queue: 2, type: 2, due: 100 },
            };
            itemState.mapping = {
                noteId: 10,
                cardId: 20,
                modelName: "Syro::Card",
                deckName: "Syro::Deck",
                filePath,
                cardHash,
            };
            itemState.lastRemoteSnapshot = remoteBaselineSnapshot;
            itemState.lastRemoteUpdatedAt = remoteBaselineSnapshot.updatedAt;
            itemState.lastLocalSnapshot = localTieSnapshot;
            itemState.lastLocalUpdatedAt = localTieSnapshot.updatedAt;
            itemState.lastMergedUpdatedAt = localTieSnapshot.updatedAt;
            await store.save(state);

            const client = {
                getVersion: jest.fn(async () => 6),
                ensureModel: jest.fn(async () => undefined),
                notesInfoByQuery: jest.fn(async () => []),
                canAddNotesWithErrorDetail: jest.fn(async () => []),
                ensureDecks: jest.fn(async () => []),
                ensureBinaryMediaFiles: jest.fn(async () => undefined),
                updateNoteFields: jest.fn(async () => undefined),
                setSpecificCardValues: jest.fn(async () => undefined),
                areDue: jest.fn(async () => [true]),
                notesInfo: jest.fn(async () => [
                    {
                        noteId: 10,
                        cards: [20],
                        modelName: "Syro::Card",
                        tags: ["syro-sync"],
                        mod: 20,
                        fields: {
                            syro_item_uuid: item.uuid,
                            syro_file_path: filePath,
                            syro_card_hash: cardHash,
                            syro_snapshot: JSON.stringify(remoteBaselineSnapshot),
                            syro_updated_at: "1000",
                        },
                    },
                ]),
                cardsInfo: jest.fn(async () => [
                    {
                        cardId: 20,
                        noteId: 10,
                        deckName: "Syro::Deck",
                        factor: 2500,
                        interval: 15,
                        type: 2,
                        queue: 2,
                        due: 115,
                        reps: 4,
                        lapses: 1,
                        left: 0,
                        mod: 20,
                    },
                ]),
                addNotes: jest.fn(async () => []),
                changeDeck: jest.fn(async () => undefined),
                deleteNotes: jest.fn(async () => undefined),
            };
            const service = new AnkiSyncService(createPlugin(item, { showRuntimeDebugMessages: true }), {
                stateStore: store,
                clientFactory: () => client as any,
                now: () => 4000,
            });
            await service.initialize();
            jest.spyOn(service as any, "refreshCardRuntime").mockImplementation((card: Card, nextItem: RepetitionItem) => {
                card.repetitionItem = nextItem;
                card.scheduleInfo = null as any;
            });

            const result = await service.sync(deck, "sig-freshness-tie");
            const debugOutput = stringifyLogCalls(logSpy);

            expect(result.pulled).toBe(0);
            expect(item.nextReview).toBe(10 * DAY_MS);
            expect(debugOutput).toContain("\"authority\":\"tie\"");
            expect(debugOutput).toContain("\"localReviewFreshness\":20000");
            expect(debugOutput).toContain("\"remoteReviewFreshness\":20000");
            expect(debugOutput).toContain("\"lastMergedUpdatedAt\":20000");
            expect(debugOutput).toContain("\"reason\":\"freshness-tie\"");
        } finally {
            logSpy.mockRestore();
            nowSpy.mockRestore();
        }
    });

    it("uploads local image media and rewrites the rendered Anki html to the media filename", async () => {
        const originalRender = (MarkdownRenderer as any).render;
        (MarkdownRenderer as any).render = jest.fn(
            async (_app: any, markdown: string, container: HTMLElement) => {
                container.innerHTML = markdown.replace(
                    /!\[[^\]]*]\((.+?)\)/g,
                    (_match, src) => `<p><img src="${src}" alt="img"></p>`,
                );
            },
        );
        const item = createItem();
        const card = new Card({ front: "![diagram](../assets/img 1.png)", back: "back", cardIdx: 0 });
        card.repetitionItem = item;
        card.question = {
            topicPathList: { list: [new TopicPath(["Deck"])] },
            note: { filePath: "notes/topic.md" },
            questionContext: ["context"],
            lineNo: 10,
        } as any;
        const deck = new Deck("root", null);
        deck.dueFlashcards.push(card);
        binaryFiles.set("assets/img 1.png", new Uint8Array([1, 2, 3, 4]));

        const plugin = createPlugin(item);
        plugin.app = {
            vault: {
                getName: () => "plugin_test",
                getAbstractFileByPath: (path: string) =>
                    binaryFiles.has(path) ? ({ path } as any) : null,
                adapter,
            },
            metadataCache: {
                getFirstLinkpathDest: (): null => null,
            },
        };
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async (noteIds: number[]) =>
                noteIds.map((noteId) => ({
                    noteId,
                    cards: [noteId + 100],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {},
                })),
            ),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest.fn(async () => [10]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(plugin, {
            clientFactory: () => client as any,
            now: () => 3920,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-media");
        const uploadedAssets = (client.ensureBinaryMediaFiles as jest.Mock).mock.calls[0][0] as Array<{
            filename: string;
            base64Data: string;
            vaultPath: string;
        }>;
        const createdBatch = (client.addNotes.mock.calls as any[][])[0][0] as Array<Record<string, any>>;
        const frontHtml = createdBatch[0].fields.Front as string;

        expect(result.errors).toEqual([]);
        expect(uploadedAssets).toHaveLength(1);
        expect(uploadedAssets[0]).toMatchObject({
            filename: "syro__assets__img_201.png",
            vaultPath: "assets/img 1.png",
        });
        expect(uploadedAssets[0].base64Data).toBe("AQIDBA==");
        expect(frontHtml).toContain('src="syro__assets__img_201.png"');
        (MarkdownRenderer as any).render = originalRender;
    });

    it("records detailed create failure reasons when Anki returns null", async () => {
        const item = createItem();
        const { deck } = createDeckWithCard(item);
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => [
                { canAdd: false, error: "cannot create note because it is a duplicate" },
            ]),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => []),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest.fn(async () => [null]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            clientFactory: () => client as any,
            now: () => 3700,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-null");

        expect(result.created).toBe(0);
        expect(result.errors.some((message) => message.includes("cannot create note because it is a duplicate"))).toBe(
            true,
        );
    });

    it("skips preflight-rejected notes and still creates the remaining cards", async () => {
        const first = createItem();
        const second = createItem();
        second.ID = 2;
        second.uuid = "uuid-2";

        const firstCard = new Card({ front: "Q1", back: "A1", cardIdx: 0 });
        firstCard.repetitionItem = first;
        firstCard.question = {
            topicPathList: { list: [new TopicPath(["Deck"])] },
            note: { filePath: "note-a.md" },
            questionContext: ["context"],
            lineNo: 10,
        } as any;

        const secondCard = new Card({ front: "Q2", back: "A2", cardIdx: 0 });
        secondCard.repetitionItem = second;
        secondCard.question = {
            topicPathList: { list: [new TopicPath(["Deck"])] },
            note: { filePath: "note-b.md" },
            questionContext: ["context"],
            lineNo: 12,
        } as any;

        const deck = new Deck("root", null);
        deck.dueFlashcards.push(firstCard, secondCard);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => [
                { canAdd: false, error: "cannot create note because it is empty" },
                { canAdd: true },
            ]),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async (noteIds: number[]) =>
                noteIds.map((noteId) => ({
                    noteId,
                    cards: [noteId + 100],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {},
                })),
            ),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest.fn(async () => [11]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin([first, second]), {
            clientFactory: () => client as any,
            now: () => 3800,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-preflight");
        const createdBatch = (client.addNotes.mock.calls as any[][])[0][0] as Array<Record<string, unknown>>;

        expect(result.created).toBe(1);
        expect(result.errors.some((message) => message.includes("[preflight:uuid-1]"))).toBe(true);
        expect(createdBatch).toHaveLength(1);
        expect((createdBatch[0].fields as Record<string, string>).syro_item_uuid).toBe("uuid-2");
    });

    it("ensures decks, falls back to single-note creation, and reports progress", async () => {
        const item = createItem();
        const { deck } = createDeckWithCard(item);
        const progress = jest.fn();
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            ensureDecks: jest.fn(async (deckNames: string[], onProgress?: Function) => {
                deckNames.forEach((deckName, index) => onProgress?.(index + 1, deckNames.length, deckName));
                return [];
            }),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async (noteIds: number[]) =>
                noteIds.map((noteId) => ({
                    noteId,
                    cards: [noteId + 100],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {},
                })),
            ),
            cardsInfo: jest.fn(async () => []),
            addNotes: jest
                .fn()
                .mockRejectedValueOnce(new Error("deck was not found: Syro::Deck"))
                .mockResolvedValueOnce([10]),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => undefined),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            clientFactory: () => client as any,
            now: () => 4000,
        });
        await service.initialize();

        const result = await service.sync(deck, "sig-2", { onProgress: progress });

        expect(client.ensureDecks).toHaveBeenCalledWith(["Syro::Deck"], expect.any(Function));
        expect(client.addNotes).toHaveBeenCalledTimes(2);
        expect(result.created).toBe(1);
        expect(progress.mock.calls.some(([update]) => update.phase === "ensure-decks")).toBe(true);
        expect(progress.mock.calls.some(([update]) => update.phase === "create")).toBe(true);
        expect(
            progress.mock.calls
                .map(([update]) => update.message)
                .every((message: string) => !/\(\d+\/\d+\)/.test(message)),
        ).toBe(true);
        expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
            phase: "finalize",
            message: "Anki 同步完成",
        });
    });

    it("ensures the detached deck before delete fallback moves cards there", async () => {
        const item = createItem();
        const store = new AnkiSyncStateStore(() => ".obsidian/plugins/syro/tracked_files.json");
        const state = await store.load();
        const itemState = ensureAnkiSyncItemState(state, item.uuid);
        itemState.mapping = {
            noteId: 10,
            cardId: 20,
            modelName: "Syro::Card",
            deckName: "Syro::Deck",
            filePath: "note.md",
            cardHash: "hash-1",
        };
        await store.save(state);

        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            notesInfoByQuery: jest.fn(async () => []),
            canAddNotesWithErrorDetail: jest.fn(async () => []),
            ensureDecks: jest.fn(async () => []),
            ensureBinaryMediaFiles: jest.fn(async () => undefined),
            updateNoteFields: jest.fn(async () => undefined),
            setSpecificCardValues: jest.fn(async () => undefined),
            notesInfo: jest.fn(async () => [
                {
                    noteId: 10,
                    cards: [20],
                    modelName: "Syro::Card",
                    tags: [],
                    fields: {},
                },
            ]),
            cardsInfo: jest.fn(async () => [
                {
                    cardId: 20,
                    noteId: 10,
                    deckName: "Syro::Deck",
                    factor: 2500,
                    interval: 3,
                    type: 2,
                    queue: 2,
                    due: 100,
                    reps: 3,
                    lapses: 1,
                    left: 0,
                    mod: 1,
                },
            ]),
            addNotes: jest.fn(async () => []),
            changeDeck: jest.fn(async () => undefined),
            deleteNotes: jest.fn(async () => {
                throw new Error("delete blocked");
            }),
        };
        const service = new AnkiSyncService(createPlugin(item), {
            stateStore: store,
            clientFactory: () => client as any,
            now: () => 5000,
        });
        await service.initialize();

        const result = await service.sync(new Deck("root", null), "sig-3");

        expect(client.ensureDecks).toHaveBeenCalledWith(["Syro::Detached"], expect.any(Function));
        expect(result.detached).toBe(1);
        expect(client.changeDeck).toHaveBeenCalledWith([20], "Syro::Detached");
    });
});
