export interface LatexFormulaRange {
    from: number;
    to: number;
    contentFrom: number;
    contentTo: number;
    latex: string;
    isBlock: boolean;
}

export function findLatexFormulaRanges(text: string): LatexFormulaRange[] {
    const ranges: LatexFormulaRange[] = [];

    const blockRegex = /\$\$([\s\S]*?)\$\$/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(text)) !== null) {
        ranges.push({
            from: match.index,
            to: match.index + match[0].length,
            contentFrom: match.index + 2,
            contentTo: match.index + match[0].length - 2,
            latex: match[1],
            isBlock: true,
        });
    }

    const inlineRegex = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g;
    while ((match = inlineRegex.exec(text)) !== null) {
        const from = match.index;
        const to = match.index + match[0].length;
        const overlaps = ranges.some((range) => from < range.to && to > range.from);
        if (overlaps) {
            continue;
        }

        ranges.push({
            from,
            to,
            contentFrom: from + 1,
            contentTo: to - 1,
            latex: match[1],
            isBlock: false,
        });
    }

    ranges.sort((left, right) => left.from - right.from);
    return ranges;
}

export function findLatexFormulaAt(
    text: string,
    position: number,
): LatexFormulaRange | null {
    return (
        findLatexFormulaRanges(text).find(
            (range) => position >= range.from && position <= range.to,
        ) ?? null
    );
}

export function isPositionInsideLatexFormula(text: string, position: number): boolean {
    return findLatexFormulaAt(text, position) !== null;
}

export function selectionIntersectsLatexFormula(
    text: string,
    from: number,
    to: number,
): boolean {
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    if (start === end) {
        return isPositionInsideLatexFormula(text, start);
    }

    return findLatexFormulaRanges(text).some(
        (range) => start < range.to && end > range.from,
    );
}

export function hasSupportedAnkiCloze(text: string, enableLatexClozes: boolean): boolean {
    const regex = /\{\{c\d+::/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (enableLatexClozes || !isPositionInsideLatexFormula(text, match.index)) {
            return true;
        }
    }

    return false;
}

export function stripLatexAnkiClozeSyntax(text: string): string {
    const ranges = findLatexFormulaRanges(text);
    if (ranges.length === 0) {
        return text;
    }

    let result = "";
    let previousEnd = 0;

    for (const range of ranges) {
        result += text.slice(previousEnd, range.contentFrom);
        result += stripClozeSyntaxFromFragment(range.latex);
        result += text.slice(range.contentTo, range.to);
        previousEnd = range.to;
    }

    result += text.slice(previousEnd);
    return result;
}

function stripClozeSyntaxFromFragment(source: string): string {
    let result = "";
    let index = 0;

    while (index < source.length) {
        const match = source.slice(index).match(/^\{\{c\d+::/i);
        if (!match) {
            result += source[index];
            index++;
            continue;
        }

        const contentStart = index + match[0].length;
        let depth = 0;
        let cursor = contentStart;
        while (cursor < source.length) {
            if (depth === 0 && source.startsWith("}}", cursor)) {
                break;
            }

            if (source[cursor] === "{") {
                depth++;
            } else if (source[cursor] === "}" && depth > 0) {
                depth--;
            }

            cursor++;
        }

        if (cursor >= source.length || !source.startsWith("}}", cursor)) {
            result += source[index];
            index++;
            continue;
        }

        const content = source.slice(contentStart, cursor);
        result += stripClozeSyntaxFromFragment(splitClozeContent(content));
        index = cursor + 2;
    }

    return result;
}

function splitClozeContent(source: string): string {
    let depth = 0;

    for (let index = 0; index < source.length - 1; index++) {
        const current = source[index];
        const next = source[index + 1];

        if (current === "{") {
            depth++;
            continue;
        }

        if (current === "}" && depth > 0) {
            depth--;
            continue;
        }

        if (depth === 0 && current === ":" && next === ":") {
            return source.slice(0, index);
        }
    }

    return source;
}
