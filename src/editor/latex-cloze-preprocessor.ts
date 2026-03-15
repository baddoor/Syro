/**
 * 处理编辑器里 LaTeX 公式中的 Cloze 渲染效果。
 * 仅在 LaTeX 挖空开关开启时，把公式中的 {{c1::...}} 转成高亮后的数学公式预览。
 */
import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { finishRenderMath, renderMath } from "obsidian";
import { findLatexFormulaRanges, LatexFormulaRange } from "../util/latex-formula";
import { hasClozeSyntax, transformLatex } from "../utils/latexTransformer";

interface MathBlock {
    from: number;
    to: number;
    text: string;
    latex: string;
    isBlock: boolean;
}

let isLatexClozePreprocessorEnabled: () => boolean = () => true;

export function initializeLatexClozePreprocessor(options?: { isEnabled?: () => boolean }) {
    isLatexClozePreprocessorEnabled = options?.isEnabled ?? (() => true);
}

function findMathBlocks(doc: string): MathBlock[] {
    return findLatexFormulaRanges(doc)
        .filter((range) => hasClozeSyntax(range.latex))
        .map((range) => ({
            from: range.from,
            to: range.to,
            text: doc.slice(range.from, range.to),
            latex: range.latex,
            isBlock: range.isBlock,
        }));
}

function findMatchingFormula(
    formulas: LatexFormulaRange[],
    domPos: number,
): LatexFormulaRange | undefined {
    return formulas.find(
        (formula) =>
            Math.abs(formula.from - domPos) <= 2 || (domPos >= formula.from && domPos <= formula.to),
    );
}

function createRenderedMathContainer(latex: string, isBlock: boolean, transform: boolean): HTMLElement {
    const innerLatex = latex.trim();
    const renderedLatex = transform ? transformLatex(innerLatex, "highlight", null) : innerLatex;
    const finalLatex = isBlock ? `\\displaystyle ${renderedLatex}` : renderedLatex;
    const container = renderMath(finalLatex, false);
    finishRenderMath();

    if (transform) {
        container.classList.add("sr-cloze-math-custom");
        container.setAttribute("data-sr-cloze", "true");
        container.setAttribute("data-sr-processed", "true");
    }

    if (isBlock) {
        container.style.display = "block";
        container.style.textAlign = "center";
        container.style.width = "100%";
        container.style.margin = "1em 0";
    }

    return container;
}

class LatexClozeDOMPlugin {
    view: EditorView;
    blocks: MathBlock[] = [];
    rafId: number | null = null;
    timeoutId: number | null = null;
    lastEnabledState: boolean;

    constructor(view: EditorView) {
        this.view = view;
        this.lastEnabledState = isLatexClozePreprocessorEnabled();
        this.updateBlocks();
        this.scheduleProcess();
    }

    updateBlocks() {
        const docText = this.view.state.doc.toString();
        this.blocks = isLatexClozePreprocessorEnabled() ? findMathBlocks(docText) : [];
    }

    scheduleProcess() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
        }

        this.timeoutId = window.setTimeout(() => {
            this.rafId = requestAnimationFrame(() => {
                this.processDOM();
            });
        }, 150);
    }

    private restoreDefaultMathRendering(formulas: LatexFormulaRange[]) {
        const mathElements = Array.from(
            this.view.dom.querySelectorAll(".cm-content .math"),
        ) as HTMLElement[];

        for (const mathSpan of mathElements) {
            const customContainer = mathSpan.querySelector("[data-sr-processed='true']") as
                | HTMLElement
                | null;
            if (!customContainer) {
                continue;
            }

            let domPos: number;
            try {
                domPos = this.view.posAtDOM(mathSpan);
            } catch {
                continue;
            }

            const matchedFormula = findMatchingFormula(formulas, domPos);
            if (!matchedFormula) {
                continue;
            }

            const defaultContainer = createRenderedMathContainer(
                matchedFormula.latex,
                matchedFormula.isBlock,
                false,
            );
            customContainer.replaceWith(defaultContainer);
        }
    }

    processDOM() {
        const docText = this.view.state.doc.toString();
        const allFormulas = findLatexFormulaRanges(docText);

        if (!isLatexClozePreprocessorEnabled()) {
            this.restoreDefaultMathRendering(allFormulas);
            return;
        }

        const selection = this.view.state.selection.main;
        const mathElements = Array.from(
            this.view.dom.querySelectorAll(".cm-content .math"),
        ) as HTMLElement[];

        for (const mathSpan of mathElements) {
            const existingMjx = mathSpan.querySelector("mjx-container");
            if (!existingMjx || existingMjx.hasAttribute("data-sr-processed")) {
                continue;
            }

            let domPos: number;
            try {
                domPos = this.view.posAtDOM(mathSpan);
            } catch {
                continue;
            }

            const matchedBlock = this.blocks.find(
                (block) => Math.abs(block.from - domPos) <= 2 || (domPos >= block.from && domPos <= block.to),
            );
            if (!matchedBlock) {
                continue;
            }

            const isEditing =
                selection.to >= matchedBlock.from && selection.from <= matchedBlock.to;
            if (isEditing) {
                continue;
            }

            const customContainer = createRenderedMathContainer(
                matchedBlock.latex,
                matchedBlock.isBlock,
                true,
            );
            existingMjx.replaceWith(customContainer);
        }
    }

    update(update: ViewUpdate) {
        const currentEnabledState = isLatexClozePreprocessorEnabled();
        const enabledChanged = currentEnabledState !== this.lastEnabledState;

        if (update.docChanged || enabledChanged) {
            this.lastEnabledState = currentEnabledState;
            this.updateBlocks();
        }

        if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            enabledChanged
        ) {
            this.scheduleProcess();
        }
    }

    destroy() {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    }
}

export const latexClozePreprocessorPlugin: Extension = ViewPlugin.fromClass(LatexClozeDOMPlugin);
