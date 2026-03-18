import { Card } from "src/Card";
import { CardListType, Deck } from "src/Deck";
import { CardQueue, RepetitionItem } from "src/dataStore/repetitionItem";
import { cyrb53 } from "src/util/utils";
import {
    AnkiSyncItemState,
    BuiltSyroCardSnapshot,
    DEFAULT_ANKI_MODEL_NAME,
    ReviewSnapshot,
    SyroAnkiCardPayload,
} from "src/ankiSync/types";

const DEFAULT_FACTOR = 2500;

function normalizeText(value: string | null | undefined): string {
    return (value ?? "").trim();
}

function stripDeckPrefix(value: string | null | undefined): string {
    const raw = normalizeText(value);
    if (!raw) {
        return "Syro";
    }

    return raw.replace(/^#+/, "").replace(/\//g, "::");
}

function buildDeckName(card: Card): string {
    const topicPath = card.question?.topicPathList?.list?.[0];
    if (topicPath?.path?.length) {
        return topicPath.path.map((part) => stripDeckPrefix(part)).join("::");
    }

    return stripDeckPrefix(card.repetitionItem?.deckName);
}

function resolveFactor(item: RepetitionItem, itemState?: AnkiSyncItemState): number | null {
    if (!item) {
        return DEFAULT_FACTOR;
    }

    if (!item.isFsrs) {
        const rawEase = Number((item.data as Record<string, unknown>)?.ease ?? item.ease ?? 2.5);
        if (!Number.isNaN(rawEase) && rawEase > 0) {
            return Math.round(rawEase * 1000);
        }
    }

    return itemState?.lastRemoteSnapshot?.factor ?? DEFAULT_FACTOR;
}

function resolveInterval(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const scheduledDays = Number((item.data as Record<string, unknown>)?.scheduled_days ?? 0);
        return Number.isNaN(scheduledDays) ? 0 : scheduledDays;
    }

    return item.interval;
}

function resolveLapses(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const lapses = Number((item.data as Record<string, unknown>)?.lapses ?? 0);
        return Number.isNaN(lapses) ? 0 : lapses;
    }

    return Math.max(item.timesReviewed - item.timesCorrect, 0);
}

function resolveReps(item: RepetitionItem): number {
    if (!item) {
        return 0;
    }

    if (item.isFsrs) {
        const reps = Number((item.data as Record<string, unknown>)?.reps ?? item.timesReviewed ?? 0);
        return Number.isNaN(reps) ? item.timesReviewed ?? 0 : reps;
    }

    return item.timesReviewed ?? 0;
}

function resolveSnapshotUpdatedAt(item: RepetitionItem, itemState?: AnkiSyncItemState): number {
    if (itemState?.lastLocalUpdatedAt) {
        return itemState.lastLocalUpdatedAt;
    }
    if (itemState?.lastRemoteUpdatedAt) {
        return itemState.lastRemoteUpdatedAt;
    }
    if ((item?.timesReviewed ?? 0) > 0) {
        return Date.now();
    }

    return 0;
}

export function createReviewSnapshotFromItem(
    item: RepetitionItem | null | undefined,
    itemState?: AnkiSyncItemState,
): ReviewSnapshot {
    const queue = item?.queue ?? CardQueue.New;
    const reps = resolveReps(item ?? null);
    const lapses = resolveLapses(item ?? null);

    return {
        queue,
        nextReview: item?.nextReview ?? 0,
        interval: resolveInterval(item ?? null),
        factor: resolveFactor(item ?? null, itemState),
        reps,
        lapses,
        timesReviewed: item?.timesReviewed ?? reps,
        timesCorrect: item?.timesCorrect ?? Math.max(reps - lapses, 0),
        errorStreak: item?.errorStreak ?? 0,
        updatedAt: resolveSnapshotUpdatedAt(item ?? null, itemState),
        source: "syro",
    };
}

function createSourceField(card: Card): string {
    const filePath = card.question?.note?.filePath ?? "";
    const lineNo = card.question?.lineNo ?? 0;
    return lineNo > 0 ? `${filePath}:L${lineNo}` : filePath;
}

function createContextField(card: Card): string {
    const lines = card.question?.questionContext ?? [];
    return lines.join("\n").trim();
}

function createCardHash(card: Card, deckName: string, filePath: string): string {
    const payload = JSON.stringify({
        deckName,
        filePath,
        front: normalizeText(card.front),
        back: normalizeText(card.back),
        context: createContextField(card),
        source: createSourceField(card),
    });
    return cyrb53(payload);
}

export function buildSyroAnkiCardPayload(
    card: Card,
    itemState?: AnkiSyncItemState,
    modelName = DEFAULT_ANKI_MODEL_NAME,
): SyroAnkiCardPayload | null {
    const item = card.repetitionItem;
    if (!item?.uuid) {
        return null;
    }

    const deckName = buildDeckName(card);
    const filePath = card.question?.note?.filePath ?? "";
    const context = createContextField(card);
    const source = createSourceField(card);
    const snapshot = createReviewSnapshotFromItem(item, itemState);
    const cardHash = createCardHash(card, deckName, filePath);

    return {
        itemUuid: item.uuid,
        deckName,
        modelName,
        filePath,
        front: normalizeText(card.front),
        back: normalizeText(card.back),
        context,
        source,
        cardHash,
        snapshot,
        fields: {
            Front: normalizeText(card.front),
            Back: normalizeText(card.back),
            Context: context,
            Source: source,
            syro_item_uuid: item.uuid,
            syro_file_path: filePath,
            syro_card_hash: cardHash,
            syro_snapshot: JSON.stringify(snapshot),
            syro_updated_at: String(snapshot.updatedAt),
        },
    };
}

export function buildSyroAnkiCardSnapshotMap(
    deckTree: Deck,
    itemStates: Record<string, AnkiSyncItemState>,
    modelName = DEFAULT_ANKI_MODEL_NAME,
): Map<string, BuiltSyroCardSnapshot> {
    const cards = deckTree.getFlattenedCardArray(CardListType.All, true);
    const result = new Map<string, BuiltSyroCardSnapshot>();
    const seenCards = new Set<Card>();

    for (const card of cards) {
        if (seenCards.has(card)) {
            continue;
        }
        seenCards.add(card);

        const itemUuid = card.repetitionItem?.uuid;
        if (!itemUuid) {
            continue;
        }

        const payload = buildSyroAnkiCardPayload(card, itemStates[itemUuid], modelName);
        if (!payload) {
            continue;
        }

        result.set(itemUuid, { payload, card });
    }

    return result;
}
