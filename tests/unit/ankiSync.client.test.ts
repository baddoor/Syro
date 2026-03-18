import { requestUrl } from "obsidian";
import { AnkiConnectClient } from "src/ankiSync/AnkiConnectClient";

jest.mock("obsidian");

describe("AnkiConnectClient", () => {
    const mockedRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it("uses requestUrl so Obsidian desktop sync is not blocked by CORS", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: { error: null, result: 6 },
            text: JSON.stringify({ error: null, result: 6 }),
        } as any);

        const client = new AnkiConnectClient("http://127.0.0.1:8765");

        await expect(client.getVersion()).resolves.toBe(6);
        expect(mockedRequestUrl).toHaveBeenCalledWith({
            url: "http://127.0.0.1:8765",
            method: "POST",
            contentType: "application/json",
            headers: {
                Accept: "application/json",
            },
            throw: false,
            body: JSON.stringify({
                action: "version",
                version: 6,
                params: {},
            }),
        });
    });

    it("falls back to parsing response text when json is unavailable", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: null,
            text: JSON.stringify({ error: null, result: 6 }),
        } as any);

        const client = new AnkiConnectClient("http://127.0.0.1:8765");

        await expect(client.getVersion()).resolves.toBe(6);
    });

    it("ensures decks and ignores already-existing deck errors", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 200,
                headers: {},
                arrayBuffer: new ArrayBuffer(0),
                json: { error: null, result: null },
                text: JSON.stringify({ error: null, result: null }),
            } as any)
            .mockResolvedValueOnce({
                status: 200,
                headers: {},
                arrayBuffer: new ArrayBuffer(0),
                json: { error: "deck already exists", result: null },
                text: JSON.stringify({ error: "deck already exists", result: null }),
            } as any)
            .mockResolvedValueOnce({
                status: 200,
                headers: {},
                arrayBuffer: new ArrayBuffer(0),
                json: { error: "invalid deck name", result: null },
                text: JSON.stringify({ error: "invalid deck name", result: null }),
            } as any);

        const client = new AnkiConnectClient("http://127.0.0.1:8765");
        const progress = jest.fn();

        const errors = await client.ensureDecks(["Deck A", "Deck A", "Deck B", "Deck C"], progress);

        expect(mockedRequestUrl).toHaveBeenCalledTimes(3);
        expect(progress).toHaveBeenNthCalledWith(1, 1, 3, "Deck A");
        expect(progress).toHaveBeenNthCalledWith(3, 3, 3, "Deck C");
        expect(errors).toEqual([
            {
                deckName: "Deck C",
                error: "Error: AnkiConnect createDeck failed: invalid deck name",
            },
        ]);
    });

    it("queries notesInfo by search query for remote mapping discovery", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: {
                error: null,
                result: [
                    {
                        noteId: 10,
                        modelName: "Syro::Card",
                        cards: [20],
                        tags: ["syro-sync"],
                        mod: 123,
                        fields: {
                            syro_item_uuid: { value: "uuid-1" },
                        },
                    },
                ],
            },
            text: JSON.stringify({
                error: null,
                result: [
                    {
                        noteId: 10,
                        modelName: "Syro::Card",
                        cards: [20],
                        tags: ["syro-sync"],
                        mod: 123,
                        fields: {
                            syro_item_uuid: { value: "uuid-1" },
                        },
                    },
                ],
            }),
        } as any);

        const client = new AnkiConnectClient("http://127.0.0.1:8765");
        const result = await client.notesInfoByQuery("tag:syro-sync");

        expect(result).toEqual([
            {
                noteId: 10,
                modelName: "Syro::Card",
                cards: [20],
                tags: ["syro-sync"],
                mod: 123,
                fields: {
                    syro_item_uuid: "uuid-1",
                },
            },
        ]);
    });

    it("calls canAddNotesWithErrorDetail for detailed add-note diagnostics", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: {
                error: null,
                result: [{ canAdd: false, error: "cannot create note because it is a duplicate" }],
            },
            text: JSON.stringify({
                error: null,
                result: [{ canAdd: false, error: "cannot create note because it is a duplicate" }],
            }),
        } as any);

        const client = new AnkiConnectClient("http://127.0.0.1:8765");
        const result = await client.canAddNotesWithErrorDetail([
            {
                deckName: "Syro::Deck",
                modelName: "Syro::Card",
                fields: { Front: "front" },
            },
        ]);

        expect(result).toEqual([{ canAdd: false, error: "cannot create note because it is a duplicate" }]);
        expect(mockedRequestUrl).toHaveBeenCalledWith({
            url: "http://127.0.0.1:8765",
            method: "POST",
            contentType: "application/json",
            headers: {
                Accept: "application/json",
            },
            throw: false,
            body: JSON.stringify({
                action: "canAddNotesWithErrorDetail",
                version: 6,
                params: {
                    notes: [
                        {
                            deckName: "Syro::Deck",
                            modelName: "Syro::Card",
                            fields: { Front: "front" },
                        },
                    ],
                },
            }),
        });
    });
});
