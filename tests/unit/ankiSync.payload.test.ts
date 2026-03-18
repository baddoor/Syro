import { Card } from "src/Card";
import { TopicPath } from "src/TopicPath";
import { buildSyroAnkiCardPayload } from "src/ankiSync/payload";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";

function createItem(deckName = "#Deck"): RepetitionItem {
    const item = new RepetitionItem(1, "file-1", RPITEMTYPE.CARD, deckName, {
        ease: 2.5,
        lastInterval: 3,
        iteration: 3,
    });
    item.uuid = "uuid-1";
    item.queue = CardQueue.Review;
    item.nextReview = 10;
    return item;
}

function createCard(topicPath?: string[], deckName = "#Deck"): Card {
    const item = createItem(deckName);
    const card = new Card({ front: "front", back: "back", cardIdx: 0 });
    card.repetitionItem = item;
    card.question = {
        topicPathList: topicPath ? { list: [new TopicPath(topicPath)] } : { list: [] },
        note: { filePath: "note.md" },
        questionContext: ["context"],
        lineNo: 10,
    } as any;
    return card;
}

describe("ankiSync payload", () => {
    it("prefixes root-level topic paths with the Syro namespace", () => {
        const payload = buildSyroAnkiCardPayload(createCard(["final-test"]));

        expect(payload?.deckName).toBe("Syro::final-test");
    });

    it("prefixes nested topic paths with the Syro namespace", () => {
        const payload = buildSyroAnkiCardPayload(createCard(["zh", "note-review", "timeline"]));

        expect(payload?.deckName).toBe("Syro::zh::note-review::timeline");
    });

    it("normalizes tag-style deck names and preserves a single Syro prefix", () => {
        const fromTag = buildSyroAnkiCardPayload(createCard(undefined, "#Deck/Subdeck"));
        const alreadyPrefixed = buildSyroAnkiCardPayload(createCard(["Syro", "Deck"]));

        expect(fromTag?.deckName).toBe("Syro::Deck::Subdeck");
        expect(alreadyPrefixed?.deckName).toBe("Syro::Deck");
    });

    it("falls back to Syro::default when the source deck is empty", () => {
        const payload = buildSyroAnkiCardPayload(createCard(undefined, ""));

        expect(payload?.deckName).toBe("Syro::default");
    });
});
