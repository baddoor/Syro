import {
    AnkiCardInfo,
    AnkiNoteInfo,
    DEFAULT_ANKI_MODEL_NAME,
    DEFAULT_ANKI_SYNC_ENDPOINT,
} from "src/ankiSync/types";

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

export class AnkiConnectClient {
    constructor(private readonly endpoint = DEFAULT_ANKI_SYNC_ENDPOINT) {}

    private async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action,
                version: 6,
                params,
            }),
        });

        if (!response.ok) {
            throw new Error(`AnkiConnect HTTP ${response.status} for action ${action}`);
        }

        const payload = (await response.json()) as AnkiInvokeResponse<T>;
        if (payload.error) {
            throw new Error(`AnkiConnect ${action} failed: ${payload.error}`);
        }

        return payload.result;
    }

    async getVersion(): Promise<number> {
        return this.invoke<number>("version");
    }

    async ensureModel(modelName = DEFAULT_ANKI_MODEL_NAME): Promise<void> {
        const fieldNames = [
            "Front",
            "Back",
            "Context",
            "Source",
            "syro_item_uuid",
            "syro_file_path",
            "syro_card_hash",
            "syro_snapshot",
            "syro_updated_at",
        ];

        try {
            await this.invoke("createModel", {
                modelName,
                inOrderFields: fieldNames,
                css: `.card { font-family: Arial, sans-serif; font-size: 18px; text-align: left; color: #222; background: white; } .syro-context { margin-top: 1rem; color: #666; font-size: 0.85em; white-space: pre-wrap; } .syro-source { margin-top: 0.75rem; color: #999; font-size: 0.75em; }`,
                isCloze: false,
                cardTemplates: [
                    {
                        Name: "Card 1",
                        Front: "{{Front}}",
                        Back: "{{FrontSide}}<hr id=answer>{{Back}}<div class=\"syro-context\">{{Context}}</div><div class=\"syro-source\">{{Source}}</div>",
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
                        Front: "{{Front}}",
                        Back: "{{FrontSide}}<hr id=answer>{{Back}}<div class=\"syro-context\">{{Context}}</div><div class=\"syro-source\">{{Source}}</div>",
                    },
                },
            },
        });
    }

    async addNotes(notes: Array<Record<string, unknown>>): Promise<Array<number | null>> {
        return this.invoke<Array<number | null>>("addNotes", { notes });
    }

    async updateNoteFields(noteId: number, fields: Record<string, string>): Promise<void> {
        await this.invoke("updateNoteFields", {
            note: {
                id: noteId,
                fields,
            },
        });
    }

    async notesInfo(noteIds: number[]): Promise<AnkiNoteInfo[]> {
        if (noteIds.length === 0) {
            return [];
        }

        const result: AnkiNoteInfo[] = [];
        for (const chunk of chunkArray(noteIds)) {
            const raw = await this.invoke<RawNoteInfo[]>("notesInfo", { notes: chunk });
            result.push(...raw.map(normalizeNoteInfo));
        }
        return result;
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
