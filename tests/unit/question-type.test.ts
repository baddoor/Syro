import { CardType } from "src/Question";
import { CardFrontBack, CardFrontBackUtil, QuestionTypeClozeFormatter } from "src/question-type";
import { DEFAULT_SETTINGS, SRSettings } from "src/settings";

test("CardType.SingleLineBasic", () => {
    expect(CardFrontBackUtil.expand(CardType.SingleLineBasic, "A::B", DEFAULT_SETTINGS)).toEqual([
        new CardFrontBack("A", "B"),
    ]);
});

test("CardType.SingleLineReversed", () => {
    expect(
        CardFrontBackUtil.expand(CardType.SingleLineReversed, "A:::B", DEFAULT_SETTINGS),
    ).toEqual([new CardFrontBack("A", "B"), new CardFrontBack("B", "A")]);
});

describe("CardType.MultiLineBasic", () => {
    test("Basic", () => {
        expect(
            CardFrontBackUtil.expand(
                CardType.MultiLineBasic,
                "A1\nA2\n?\nB1\nB2",
                DEFAULT_SETTINGS,
            ),
        ).toEqual([new CardFrontBack("A1\nA2", "B1\nB2")]);
    });
});

test("CardType.MultiLineReversed", () => {
    expect(
        CardFrontBackUtil.expand(
            CardType.MultiLineReversed,
            "A1\nA2\n??\nB1\nB2",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("A1\nA2", "B1\nB2"), new CardFrontBack("B1\nB2", "A1\nA2")]);
});

test("CardType.Cloze", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();

    expect(
        CardFrontBackUtil.expand(
            CardType.Cloze,
            "This is a very ==interesting== test",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
        ),
    ]);

    const settings2: SRSettings = DEFAULT_SETTINGS;
    settings2.clozePatterns = [
        "==[123;;]answer[;;hint]==",
        "**[123;;]answer[;;hint]**",
        "{{[123;;]answer[;;hint]}}",
    ];

    expect(
        CardFrontBackUtil.expand(CardType.Cloze, "This is a very **interesting** test", settings2),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
        ),
    ]);

    expect(
        CardFrontBackUtil.expand(CardType.Cloze, "This is a very {{interesting}} test", settings2),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
        ),
    ]);

    expect(
        CardFrontBackUtil.expand(
            CardType.Cloze,
            "This is a really very {{interesting}} and ==fascinating== and **great** test",
            settings2,
        ),
    ).toEqual([
        new CardFrontBack(
            "This is a really very interesting and " + clozeFormatter.asking() + " and great test",
            "This is a really very interesting and " +
                clozeFormatter.showingAnswer("fascinating") +
                " and great test",
        ),
        new CardFrontBack(
            "This is a really very interesting and fascinating and " +
                clozeFormatter.asking() +
                " test",
            "This is a really very interesting and fascinating and " +
                clozeFormatter.showingAnswer("great") +
                " test",
        ),
        new CardFrontBack(
            "This is a really very " + clozeFormatter.asking() + " and fascinating and great test",
            "This is a really very " +
                clozeFormatter.showingAnswer("interesting") +
                " and fascinating and great test",
        ),
    ]);
});

describe("CardType.AnkiCloze with LaTeX switch", () => {
    test("skips pure LaTeX clozes when disabled", () => {
        const settings: SRSettings = {
            ...DEFAULT_SETTINGS,
            isPro: true,
            enableLatexClozes: false,
            convertAnkiClozesToClozes: true,
        };

        expect(
            CardFrontBackUtil.expand(CardType.AnkiCloze, "Formula only ${{c1::x}}$", settings),
        ).toEqual([]);
    });

    test("keeps non-LaTeX clozes and strips LaTeX wrappers when disabled", () => {
        const settings: SRSettings = {
            ...DEFAULT_SETTINGS,
            isPro: true,
            enableLatexClozes: false,
            convertAnkiClozesToClozes: true,
        };

        const result = CardFrontBackUtil.expand(
            CardType.AnkiCloze,
            "Outside {{c1::word}} and $E={{c2::mc^2}}$",
            settings,
        );

        expect(result).toHaveLength(1);
        expect(result[0].front).toContain("SR_H:");
        expect(result[0].back).toContain("SR_S:");
        expect(result[0].front).toContain("$E=mc^2$");
        expect(result[0].back).toContain("$E=mc^2$");
        expect(result[0].front).not.toContain("{{c2::");
        expect(result[0].back).not.toContain("{{c2::");
    });

    test("keeps LaTeX clozes when enabled", () => {
        const settings: SRSettings = {
            ...DEFAULT_SETTINGS,
            isPro: true,
            enableLatexClozes: true,
            convertAnkiClozesToClozes: true,
        };

        const result = CardFrontBackUtil.expand(
            CardType.AnkiCloze,
            "Formula only ${{c1::x}}$",
            settings,
        );

        expect(result).toHaveLength(1);
        expect(result[0].front).toContain("$");
        expect(result[0].back).toContain("$");
        expect(result[0].front).toContain("SR_H:");
        expect(result[0].back).toContain("SR_S:");
        expect(result[0].back).toContain("x");
    });
});
