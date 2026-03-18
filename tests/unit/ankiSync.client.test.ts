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
});
