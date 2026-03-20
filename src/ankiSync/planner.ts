import {
    AnkiDeletePolicy,
    AnkiMapping,
    AnkiSyncItemState,
    AnkiSyncPlanOperation,
    ReviewSnapshot,
    SyroAnkiCardPayload,
} from "src/ankiSync/types";

function snapshotComparableParts(snapshot: ReviewSnapshot | null): string {
    if (!snapshot) {
        return "null";
    }

    return JSON.stringify({
        queue: snapshot.queue,
        nextReview: snapshot.nextReview,
        interval: snapshot.interval,
        factor: snapshot.factor,
        reps: snapshot.reps,
        lapses: snapshot.lapses,
        timesReviewed: snapshot.timesReviewed,
        timesCorrect: snapshot.timesCorrect,
        errorStreak: snapshot.errorStreak,
        dueValue: snapshot.dueValue ?? null,
        left: snapshot.left ?? null,
        source: snapshot.source,
    });
}

export function areSnapshotsEquivalent(
    left: ReviewSnapshot | null | undefined,
    right: ReviewSnapshot | null | undefined,
): boolean {
    return snapshotComparableParts(left ?? null) === snapshotComparableParts(right ?? null);
}

export function chooseLatestSnapshot(
    localSnapshot: ReviewSnapshot | null | undefined,
    remoteSnapshot: ReviewSnapshot | null | undefined,
): ReviewSnapshot | null {
    if (!localSnapshot && !remoteSnapshot) {
        return null;
    }
    if (!localSnapshot) {
        return remoteSnapshot ?? null;
    }
    if (!remoteSnapshot) {
        return localSnapshot;
    }
    if (remoteSnapshot.updatedAt > localSnapshot.updatedAt) {
        return remoteSnapshot;
    }
    if (remoteSnapshot.updatedAt < localSnapshot.updatedAt) {
        return localSnapshot;
    }

    return areSnapshotsEquivalent(localSnapshot, remoteSnapshot) ? localSnapshot : localSnapshot;
}

function needsPayloadUpdate(payload: SyroAnkiCardPayload, mapping: AnkiMapping): boolean {
    return (
        mapping.cardHash !== payload.cardHash ||
        mapping.deckName !== payload.deckName ||
        mapping.filePath !== payload.filePath ||
        mapping.modelName !== payload.modelName
    );
}

export function planAnkiSyncOperations(
    payloadsByUuid: Map<string, SyroAnkiCardPayload>,
    itemStates: Record<string, AnkiSyncItemState>,
    deletePolicy: AnkiDeletePolicy,
): AnkiSyncPlanOperation[] {
    const operations: AnkiSyncPlanOperation[] = [];
    const seen = new Set<string>();

    for (const [itemUuid, payload] of payloadsByUuid.entries()) {
        seen.add(itemUuid);
        const itemState = itemStates[itemUuid];
        const mapping = itemState?.mapping ?? null;

        if (!mapping || mapping.detached || mapping.noteId <= 0 || mapping.cardId <= 0) {
            operations.push({
                type: "create",
                itemUuid,
                payload,
                mapping,
                reason: "missing-mapping",
            });
            continue;
        }

        if (mapping.modelName !== payload.modelName) {
            operations.push({
                type: "recreate",
                itemUuid,
                payload,
                mapping,
                reason: "model-changed",
            });
            continue;
        }

        if (needsPayloadUpdate(payload, mapping)) {
            operations.push({
                type: "update",
                itemUuid,
                payload,
                mapping,
                reason: "payload-changed",
            });
            continue;
        }

        operations.push({
            type: "noop",
            itemUuid,
            payload,
            mapping,
            reason: "unchanged",
        });
    }

    for (const [itemUuid, itemState] of Object.entries(itemStates)) {
        if (seen.has(itemUuid)) {
            continue;
        }
        const mapping = itemState?.mapping ?? null;
        if (!mapping || mapping.noteId <= 0 || mapping.cardId <= 0) {
            continue;
        }

        operations.push({
            type: deletePolicy,
            itemUuid,
            payload: null,
            mapping,
            reason: "missing-from-syro",
        });
    }

    return operations;
}
