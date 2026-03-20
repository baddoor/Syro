import {
    buildSyroAnkiClozeTemplateBack,
    buildSyroAnkiClozeTemplateFront,
    buildSyroAnkiTemplateBack,
    buildSyroAnkiTemplateFront,
} from "src/ankiSync/template";

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

    it("uses native cloze placeholders for the cloze model", () => {
        const front = buildSyroAnkiClozeTemplateFront();
        const back = buildSyroAnkiClozeTemplateBack();

        expect(front).toContain('<link rel="stylesheet" href="_syro_anki_sync.css">');
        expect(front).toContain('<div class="syro-container">');
        expect(front).toContain('<div class="syro-front-content">');
        expect(front).toContain("{{cloze:Text}}");
        expect(back).toContain("{{cloze:Text}}");
        expect(back).not.toContain("{{Back Extra}}");
        expect(back).not.toContain("{{Source}}");
        expect(back).not.toContain("syro-meta-panel");
        expect(front).not.toContain("syro-answer-region");
        expect(back).not.toContain("syro-back-payload");
    });
});
