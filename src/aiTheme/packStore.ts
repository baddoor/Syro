import { AiThemePackRecord } from "src/aiTheme/types";
import { AiThemeDeckStore } from "src/dataStore/aiThemeDeckStore";

export interface AiThemePackStore {
    list(): AiThemePackRecord[];
    get(id: string): AiThemePackRecord | null;
    upsert(pack: AiThemePackRecord): Promise<AiThemePackRecord>;
    remove(id: string): Promise<boolean>;
    createId(): string;
}

export class DefaultAiThemePackStore implements AiThemePackStore {
    private readonly deckStore: AiThemeDeckStore;

    constructor(deckStore: AiThemeDeckStore) {
        this.deckStore = deckStore;
    }

    list(): AiThemePackRecord[] {
        return this.deckStore.list();
    }

    get(id: string): AiThemePackRecord | null {
        return this.deckStore.get(id);
    }

    upsert(pack: AiThemePackRecord): Promise<AiThemePackRecord> {
        return this.deckStore.upsert(pack);
    }

    remove(id: string): Promise<boolean> {
        return this.deckStore.remove(id);
    }

    createId(): string {
        return this.deckStore.createId();
    }
}

