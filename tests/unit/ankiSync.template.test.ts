import { buildSyroAnkiTemplateBack, buildSyroAnkiTemplateFront } from "src/ankiSync/template";

describe("ankiSync template", () => {
    it("keeps the front shell stable without loading an external script", () => {
        const front = buildSyroAnkiTemplateFront();

        expect(front).toContain('id="syro-front-content"');
        expect(front).toContain('id="syro-answer-region"');
        expect(front).toContain("OB&#183;SYRO");
        expect(front).not.toContain("_syro_anki_sync.js");
        expect(front).not.toContain("syroApplyTemplateFallback");
    });

    it("reuses FrontSide and keeps only an inline back reveal patch", () => {
        const back = buildSyroAnkiTemplateBack();

        expect(back).toContain("{{FrontSide}}");
        expect(back).toContain('id="syro-back-payload"');
        expect(back).toContain('document.getElementById("syro-front-content")');
        expect(back).not.toContain("_syro_anki_sync.js");
        expect(back).not.toContain("window.syroRevealBack");
    });
});
