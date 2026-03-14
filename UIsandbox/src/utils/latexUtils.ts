/**
 * LaTeX Cloze 预处理工具
 * 使用括号计数算法正确处理嵌套大括号
 */

export type RenderMode = "editor" | "front" | "back";

/**
 * 使用括号计数算法处理 LaTeX Cloze 语法
 * 将 {{c1::content}} 转换为 KaTeX 的 \htmlClass{...}{...}
 */
export const processLatexCloze = (rawLatex: string, mode: RenderMode): string => {
    let result = "";
    let i = 0;

    while (i < rawLatex.length) {
        // 检测 Cloze 开始标记 {{cN::
        const match = rawLatex.slice(i).match(/^\{\{c(\d+)::/);

        if (match) {
            const id = match[1];
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            // 使用括号计数寻找正确的结束符 }}
            while (j < rawLatex.length) {
                // 只有在深度为 0 时遇到 }} 才是真正的结束
                if (braceDepth === 0 && rawLatex.startsWith("}}", j)) {
                    break;
                }
                if (rawLatex[j] === "{") braceDepth++;
                else if (rawLatex[j] === "}") {
                    if (braceDepth > 0) braceDepth--;
                }
                j++;
            }

            // 提取内容
            const content = rawLatex.substring(startContent, j);
            // 递归处理内部内容（支持嵌套挖空）
            const processedContent = processLatexCloze(content, mode);

            // 根据模式替换
            if (mode === "front") {
                result += `\\htmlClass{sr-cloze-mask sr-c${id}}{${processedContent}}`;
            } else if (mode === "back") {
                result += `\\htmlClass{sr-cloze-reveal sr-c${id}}{${processedContent}}`;
            } else {
                // editor
                result += `\\htmlClass{sr-cloze-editor sr-c${id}}{${processedContent}}`;
            }

            i = j + 2; // 跳过 }}
        } else {
            result += rawLatex[i];
            i++;
        }
    }

    return result;
};

/**
 * 提取 Cloze 信息
 */
export const extractClozeInfo = (latex: string): { id: number; content: string }[] => {
    const results: { id: number; content: string }[] = [];
    let i = 0;

    while (i < latex.length) {
        const match = latex.slice(i).match(/^\{\{c(\d+)::/);

        if (match) {
            const id = parseInt(match[1]);
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            while (j < latex.length) {
                if (braceDepth === 0 && latex.startsWith("}}", j)) {
                    break;
                }
                if (latex[j] === "{") braceDepth++;
                else if (latex[j] === "}") {
                    if (braceDepth > 0) braceDepth--;
                }
                j++;
            }

            const content = latex.substring(startContent, j);
            results.push({ id, content });

            i = j + 2;
        } else {
            i++;
        }
    }

    return results;
};

/**
 * 获取下一个 Cloze ID
 */
export const getNextClozeId = (latex: string): number => {
    const infos = extractClozeInfo(latex);
    if (infos.length === 0) return 1;
    return Math.max(...infos.map((i) => i.id)) + 1;
};
