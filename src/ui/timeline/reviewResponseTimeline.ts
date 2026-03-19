import { App } from "obsidian";

import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { ReviewResponse } from "src/scheduling";

import { captureTimelineContext } from "./timelineContext";

export type TimelineReviewResponse = "Reset" | "Hard" | "Good" | "Easy";

export function mapReviewResponseToTimelineValue(
    response: ReviewResponse,
): TimelineReviewResponse | null {
    switch (response) {
        case ReviewResponse.Reset:
            return "Reset";
        case ReviewResponse.Hard:
            return "Hard";
        case ReviewResponse.Good:
            return "Good";
        case ReviewResponse.Easy:
            return "Easy";
        default:
            return null;
    }
}

export async function autoCommitReviewResponseToTimeline(opts: {
    app: App;
    commitStore: ReviewCommitStore | null | undefined;
    enabled: boolean;
    notePath: string;
    response: ReviewResponse;
}): Promise<boolean> {
    const { app, commitStore, enabled, notePath, response } = opts;
    if (!enabled || !commitStore) return false;

    const reviewResponse = mapReviewResponseToTimelineValue(response);
    if (!reviewResponse) return false;

    const context = captureTimelineContext(app, notePath);
    await commitStore.addCommit(
        notePath,
        reviewResponse,
        context.contextAnchor,
        context.scrollPercentage,
        {
            entryType: "review-response",
            reviewResponse,
        },
    );

    return true;
}
