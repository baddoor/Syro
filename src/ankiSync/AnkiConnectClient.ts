import { requestUrl } from "obsidian";
import {
    AnkiBinaryMediaAsset,
    AnkiCanAddNoteResult,
    AnkiCardInfo,
    AnkiNoteInfo,
    DEFAULT_ANKI_MODEL_NAME,
    DEFAULT_ANKI_SYNC_ENDPOINT,
} from "src/ankiSync/types";
import {
    buildSyroAnkiModelCss,
    buildSyroAnkiTemplateBack,
    buildSyroAnkiTemplateFront,
    SYRO_ANKI_MEDIA_FILES,
    SYRO_ANKI_MODEL_FIELDS,
} from "src/ankiSync/template";

interface AnkiInvokeResponse<T> {
    error: string | null;
    result: T;
}

interface RawNoteInfo {
    noteId: number;
    modelName: string;
    cards: number[];
    tags: string[];
    fields: Record<string, { value: string }>;
    mod?: number;
}

interface RawCardInfo {
    cardId: number;
    note: number;
    deckName: string;
    factor: number;
    interval: number;
    type: number;
    queue: number;
    due: number;
    reps: number;
    lapses: number;
    left: number;
    mod: number;
}

function chunkArray<T>(values: T[], chunkSize = 100): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        result.push(values.slice(index, index + chunkSize));
    }
    return result;
}

function normalizeNoteInfo(raw: RawNoteInfo): AnkiNoteInfo {
    const fields: Record<string, string> = {};
    for (const [fieldName, fieldValue] of Object.entries(raw.fields ?? {})) {
        fields[fieldName] = fieldValue?.value ?? "";
    }

    return {
        noteId: raw.noteId,
        cards: raw.cards ?? [],
        modelName: raw.modelName,
        fields,
        tags: raw.tags ?? [],
        mod: raw.mod ?? 0,
    };
}

function normalizeCardInfo(raw: RawCardInfo): AnkiCardInfo {
    return {
        cardId: raw.cardId,
        noteId: raw.note,
        deckName: raw.deckName,
        factor: raw.factor ?? null,
        interval: raw.interval ?? 0,
        type: raw.type ?? null,
        queue: raw.queue ?? 0,
        due: raw.due ?? null,
        reps: raw.reps ?? 0,
        lapses: raw.lapses ?? 0,
        left: raw.left ?? null,
        mod: raw.mod ?? 0,
    };
}

function normalizeInvokeResponse<T>(action: string, payload: unknown): AnkiInvokeResponse<T> {
    if (payload && typeof payload === "object" && "result" in payload && "error" in payload) {
        return payload as AnkiInvokeResponse<T>;
    }

    throw new Error(`AnkiConnect ${action} returned an invalid payload`);
}

export class AnkiConnectClient {
    constructor(private readonly endpoint = DEFAULT_ANKI_SYNC_ENDPOINT) {}

    private async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
        const body = JSON.stringify({
            action,
            version: 6,
            params,
        });
        const response = await requestUrl({
            url: this.endpoint,
            method: "POST",
            contentType: "application/json; charset=utf-8",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json; charset=utf-8",
            },
            throw: false,
            body,
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`AnkiConnect HTTP ${response.status} for action ${action}`);
        }

        const payload = normalizeInvokeResponse<T>(action, response.json ?? JSON.parse(response.text));
        if (payload.error) {
            throw new Error(`AnkiConnect ${action} failed: ${payload.error}`);
        }

        return payload.result;
    }

    async getVersion(): Promise<number> {
        return this.invoke<number>("version");
    }

    async storeTextMediaFile(filename: string, data: string): Promise<void> {
        await this.invoke("storeMediaFile", {
            filename,
            data: Buffer.from(data, "utf8").toString("base64"),
        });
    }

    async ensureMediaFiles(mediaFiles: Record<string, string>): Promise<void> {
        for (const [filename, data] of Object.entries(mediaFiles)) {
            await this.storeTextMediaFile(filename, data);
        }
    }

    async storeBinaryMediaFile(filename: string, base64Data: string): Promise<void> {
        await this.invoke("storeMediaFile", {
            filename,
            data: base64Data,
        });
    }

    async ensureBinaryMediaFiles(
        assets: AnkiBinaryMediaAsset[],
        onProgress?: (current: number, total: number, filename: string) => void,
    ): Promise<void> {
        const uniqueAssets = Array.from(
            new Map(
                assets
                    .filter((asset) => !!asset.filename && !!asset.base64Data)
                    .map((asset) => [asset.filename, asset]),
            ).values(),
        );

        for (let index = 0; index < uniqueAssets.length; index += 1) {
            const asset = uniqueAssets[index];
            await this.storeBinaryMediaFile(asset.filename, asset.base64Data);
            onProgress?.(index + 1, uniqueAssets.length, asset.filename);
        }
    }

    async ensureModel(modelName = DEFAULT_ANKI_MODEL_NAME): Promise<void> {
        const fieldNames = SYRO_ANKI_MODEL_FIELDS;
        const css = buildSyroAnkiModelCss();
        const frontTemplate = buildSyroAnkiTemplateFront();
        const backTemplate = buildSyroAnkiTemplateBack();

        try {
            await this.invoke("createModel", {
                modelName,
                inOrderFields: fieldNames,
                css,
                isCloze: false,
                cardTemplates: [
                    {
                        Name: "Card 1",
                        Front: frontTemplate,
                        Back: backTemplate,
                    },
                ],
            });
        } catch (error) {
            if (!String(error).includes("Model name already exists")) {
                throw error;
            }
        }

        for (const fieldName of fieldNames) {
            try {
                await this.invoke("modelFieldAdd", {
                    modelName,
                    fieldName,
                });
            } catch (error) {
                if (!String(error).includes("Field already exists")) {
                    throw error;
                }
            }
        }

        await this.invoke("updateModelTemplates", {
            model: {
                name: modelName,
                templates: {
                    "Card 1": {
                        Front: frontTemplate,
                        Back: backTemplate,
                    },
                },
            },
        });

        try {
            await this.invoke("updateModelStyling", {
                model: {
                    name: modelName,
                    css,
                },
            });
        } catch (error) {
            if (!String(error).includes("updateModelStyling")) {
                throw error;
            }
        }

        await this.ensureMediaFiles(SYRO_ANKI_MEDIA_FILES);
    }

    async createDeck(deckName: string): Promise<void> {
        await this.invoke("createDeck", {
            deck: deckName,
        });
    }

    async ensureDecks(
        deckNames: string[],
        onProgress?: (current: number, total: number, deckName: string) => void,
    ): Promise<Array<{ deckName: string; error: string }>> {
        const uniqueDecks = Array.from(
            new Set(deckNames.map((deckName) => deckName?.trim()).filter(Boolean)),
        ) as string[];
        const errors: Array<{ deckName: string; error: string }> = [];

        for (let index = 0; index < uniqueDecks.length; index += 1) {
            const deckName = uniqueDecks[index];
            try {
                await this.createDeck(deckName);
            } catch (error) {
                const message = String(error);
                if (!message.toLowerCase().includes("already exists")) {
                    errors.push({ deckName, error: message });
                }
            }
            onProgress?.(index + 1, uniqueDecks.length, deckName);
        }

        return errors;
    }

    async addNotes(notes: Array<Record<string, unknown>>): Promise<Array<number | null>> {
        return this.invoke<Array<number | null>>("addNotes", { notes });
    }

    async canAddNotesWithErrorDetail(
        notes: Array<Record<string, unknown>>,
    ): Promise<AnkiCanAddNoteResult[]> {
        if (notes.length === 0) {
            return [];
        }

        return this.invoke<AnkiCanAddNoteResult[]>("canAddNotesWithErrorDetail", { notes });
    }

    async updateNoteFields(noteId: number, fields: Record<string, string>): Promise<void> {
        await this.invoke("updateNoteFields", {
            note: {
                id: noteId,
                fields,
            },
        });
    }

    private async notesInfoByParams(params: Record<string, unknown>): Promise<AnkiNoteInfo[]> {
        const raw = await this.invoke<RawNoteInfo[]>("notesInfo", params);
        return raw.map(normalizeNoteInfo);
    }

    async notesInfo(noteIds: number[]): Promise<AnkiNoteInfo[]> {
        if (noteIds.length === 0) {
            return [];
        }

        const result: AnkiNoteInfo[] = [];
        for (const chunk of chunkArray(noteIds)) {
            result.push(...(await this.notesInfoByParams({ notes: chunk })));
        }
        return result;
    }

    async notesInfoByQuery(query: string): Promise<AnkiNoteInfo[]> {
        if (!query?.trim()) {
            return [];
        }

        return this.notesInfoByParams({ query });
    }

    async cardsInfo(cardIds: number[]): Promise<AnkiCardInfo[]> {
        if (cardIds.length === 0) {
            return [];
        }

        const result: AnkiCardInfo[] = [];
        for (const chunk of chunkArray(cardIds)) {
            const raw = await this.invoke<RawCardInfo[]>("cardsInfo", { cards: chunk });
            result.push(...raw.map(normalizeCardInfo));
        }
        return result;
    }

    async changeDeck(cardIds: number[], deckName: string): Promise<void> {
        if (cardIds.length === 0) {
            return;
        }

        await this.invoke("changeDeck", {
            cards: cardIds,
            deck: deckName,
        });
    }

    async deleteNotes(noteIds: number[]): Promise<void> {
        if (noteIds.length === 0) {
            return;
        }

        await this.invoke("deleteNotes", {
            notes: noteIds,
        });
    }

    async setSpecificCardValues(
        cardId: number,
        values: Record<string, number>,
        warningCheck = true,
    ): Promise<void> {
        const keys = Object.keys(values);
        if (keys.length === 0) {
            return;
        }

        await this.invoke("setSpecificValueOfCard", {
            card: cardId,
            keys,
            newValues: keys.map((key) => values[key]),
            warning_check: warningCheck,
        });
    }
}
