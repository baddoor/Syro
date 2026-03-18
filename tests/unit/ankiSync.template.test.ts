import { buildSyroAnkiTemplateBack, buildSyroAnkiTemplateFront } from "src/ankiSync/template";

describe("ankiSync template", () => {
    it("keeps the front shell stable and reserves an answer region", () => {
        const front = buildSyroAnkiTemplateFront();

        expect(front).toContain('id="syro-front-content"');
        expect(front).toContain('id="syro-answer-region"');
        expect(front).toContain("OB&#183;SYRO");
    });

    it("reuses FrontSide on the back and only injects reveal payload", () => {
        const back = buildSyroAnkiTemplateBack();

        expect(back).toContain("{{FrontSide}}");
        expect(back).toContain('id="syro-back-payload"');
        expect(back).toContain('window.syroRevealBack("syro-front-content", "syro-answer-region", "syro-back-payload")');
    });
});
