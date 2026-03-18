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

function createPlugin(item: RepetitionItem) {
    return {
        data: {
            settings: {
                ...DEFAULT_SETTINGS,
                ankiSyncEnabled: true,
                ankiSyncEndpoint: "http://127.0.0.1:8765",
                ankiSyncDeletePolicy: "delete",
                ankiSyncModelName: "Syro::Card",
            },
        },
        manifest: { dir: ".obsidian/plugins/syro" },
        store: {
            data: { items: [item] },
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

describe("ankiSync service", () => {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };

    beforeEach(() => {
        files.clear();
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

    it("ensures decks, falls back to single-note creation, and reports progress", async () => {
        const item = createItem();
        const { deck } = createDeckWithCard(item);
        const progress = jest.fn();
        const client = {
            getVersion: jest.fn(async () => 6),
            ensureModel: jest.fn(async () => undefined),
            ensureDecks: jest.fn(async (deckNames: string[], onProgress?: Function) => {
                deckNames.forEach((deckName, index) => onProgress?.(index + 1, deckNames.length, deckName));
                return [];
            }),
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
            ensureDecks: jest.fn(async () => []),
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
