import { CardQueue } from "src/dataStore/repetitionItem";
import { chooseLatestSnapshot, planAnkiSyncOperations } from "src/ankiSync/planner";
import {
    AnkiSyncItemState,
    ReviewSnapshot,
    SyroAnkiCardPayload,
    createEmptyAnkiSyncItemState,
} from "src/ankiSync/types";

function createSnapshot(updatedAt: number, queue = CardQueue.Review): ReviewSnapshot {
    return {
        queue,
        nextReview: updatedAt,
        interval: 3,
        factor: 2500,
        reps: 4,
        lapses: 1,
        timesReviewed: 4,
        timesCorrect: 3,
        errorStreak: 0,
        updatedAt,
        source: "syro",
    };
}

function createPayload(itemUuid: string, overrides: Partial<SyroAnkiCardPayload> = {}): SyroAnkiCardPayload {
    return {
        itemUuid,
        deckName: "Deck::One",
        modelName: "Syro::Card",
        filePath: "folder/note.md",
        front: "front",
        back: "back",
        context: "context",
        source: "folder/note.md:L10",
        cardHash: "hash-a",
        snapshot: createSnapshot(1000),
        fields: {
            Front: "front",
            Back: "back",
            Context: "context",
            Source: "folder/note.md:L10",
            syro_item_uuid: itemUuid,
            syro_file_path: "folder/note.md",
            syro_card_hash: "hash-a",
            syro_snapshot: JSON.stringify(createSnapshot(1000)),
            syro_updated_at: "1000",
        },
        ...overrides,
    };
}

function createItemState(overrides: Partial<AnkiSyncItemState> = {}): AnkiSyncItemState {
    return {
        ...createEmptyAnkiSyncItemState(),
        mapping: {
            noteId: 1,
            cardId: 11,
            modelName: "Syro::Card",
            deckName: "Deck::One",
            filePath: "folder/note.md",
            cardHash: "hash-a",
        },
        ...overrides,
    };
}

describe("ankiSync planner", () => {
    it("plans create, update, noop, delete and detach operations", () => {
        const payloads = new Map<string, SyroAnkiCardPayload>([
            ["create-me", createPayload("create-me")],
            ["update-me", createPayload("update-me", { cardHash: "hash-b" })],
            ["noop-me", createPayload("noop-me")],
        ]);
        const itemStates: Record<string, AnkiSyncItemState> = {
            "update-me": createItemState(),
            "noop-me": createItemState(),
            "delete-me": createItemState(),
            "detach-me": createItemState(),
        };

        const deleteOps = planAnkiSyncOperations(payloads, itemStates, "delete");
        expect(deleteOps.find((op) => op.itemUuid === "create-me")?.type).toBe("create");
        expect(deleteOps.find((op) => op.itemUuid === "update-me")?.type).toBe("update");
        expect(deleteOps.find((op) => op.itemUuid === "noop-me")?.type).toBe("noop");
        expect(deleteOps.find((op) => op.itemUuid === "delete-me")?.type).toBe("delete");

        const detachOps = planAnkiSyncOperations(new Map(), { "detach-me": createItemState() }, "detach");
        expect(detachOps[0].type).toBe("detach");
    });

    it("latest-wins prefers newer remote snapshots and keeps local on same timestamp", () => {
        const local = createSnapshot(1000);
        const newerRemote = { ...createSnapshot(2000), source: "anki-card" as const };
        const sameTimeRemote = { ...createSnapshot(1000), source: "anki-card" as const };

        expect(chooseLatestSnapshot(local, newerRemote)).toEqual(newerRemote);
        expect(chooseLatestSnapshot(local, null)).toEqual(local);
        expect(chooseLatestSnapshot(local, sameTimeRemote)).toEqual(local);
    });
});
