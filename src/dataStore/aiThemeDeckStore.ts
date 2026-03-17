import { Iadapter } from "src/dataStore/adapter";
import { getStorePath } from "src/dataStore/dataLocation";
import { SRSettings } from "src/settings";
import { AiThemePackRecord } from "src/aiTheme/types";

interface AiThemeDeckStoreFile {
    version: number;
    nextId: number;
    items: Record<string, AiThemePackRecord>;
}

const AI_THEME_DECK_STORE_VERSION = 1;

export class AiThemeDeckStore {
    private readonly dataPath: string;
    private data: Record<string, AiThemePackRecord> = {};
    private nextId = 1;

    constructor(settings: SRSettings, manifestDir: string) {
        const trackedPath = getStorePath(manifestDir, settings);
        const lastSlash = Math.max(trackedPath.lastIndexOf("/"), trackedPath.lastIndexOf("\\"));
        const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
        this.dataPath = dir + "ai_theme_decks.json";
    }

    async load(): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            if (!(await adapter.exists(this.dataPath))) {
                this.data = {};
                this.nextId = 1;
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.data = {};
                this.nextId = 1;
                return;
            }

            const parsed = JSON.parse(raw) as AiThemeDeckStoreFile;
            if (
                parsed?.version !== AI_THEME_DECK_STORE_VERSION ||
                typeof parsed.nextId !== "number" ||
                !parsed.items ||
                typeof parsed.items !== "object"
            ) {
                this.data = {};
                this.nextId = 1;
                return;
            }

            this.data = {};
            this.nextId = Math.max(1, Math.floor(parsed.nextId));
            for (const [id, pack] of Object.entries(parsed.items)) {
                if (!pack || typeof pack !== "object") continue;
                if (typeof pack.id !== "string" || !pack.id) continue;
                this.data[id] = clone(pack);
                this.nextId = Math.max(this.nextId, extractNumericTail(id) + 1);
            }
        } catch (error) {
            console.error("[SR-AITheme] Failed to load ai_theme_decks.json:", error);
            this.data = {};
            this.nextId = 1;
        }
    }

    async save(): Promise<void> {
        try {
            const payload: AiThemeDeckStoreFile = {
                version: AI_THEME_DECK_STORE_VERSION,
                nextId: this.nextId,
                items: clone(this.data),
            };
            await Iadapter.instance.adapter.write(this.dataPath, JSON.stringify(payload, null, 2));
        } catch (error) {
            console.error("[SR-AITheme] Failed to save ai_theme_decks.json:", error);
        }
    }

    list(): AiThemePackRecord[] {
        return Object.values(this.data)
            .map((pack) => clone(pack))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    get(id: string): AiThemePackRecord | null {
        const pack = this.data[id];
        return pack ? clone(pack) : null;
    }

    async upsert(pack: AiThemePackRecord): Promise<AiThemePackRecord> {
        const normalized = clone(pack);
        const id = normalized.id?.trim() || this.createId();
        normalized.id = id;
        this.data[id] = normalized;
        this.nextId = Math.max(this.nextId, extractNumericTail(id) + 1);
        await this.save();
        return clone(normalized);
    }

    async remove(id: string): Promise<boolean> {
        if (!this.data[id]) return false;
        delete this.data[id];
        await this.save();
        return true;
    }

    createId(): string {
        return `ai-theme-${this.nextId++}`;
    }
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function extractNumericTail(id: string): number {
    const match = id.match(/(\d+)$/);
    if (!match) return 0;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : 0;
}

