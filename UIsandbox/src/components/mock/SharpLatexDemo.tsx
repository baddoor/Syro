/** @jsxImportSource react */
import React, { useState, useMemo, useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "../business/SharpLatexStyles.css";

// 工具：解析 Cloze ID
const extractClozeIds = (text: string): string[] => {
    const regex = /\{\{c(\d+)::/g;
    const ids = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
        ids.add(match[1]);
    }
    return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
};

// 工具：转换 LaTeX
const transformLatex = (text: string, activeId: string | null, showAnswer: boolean): string => {
    let result = "";
    let i = 0;

    while (i < text.length) {
        const match = text.slice(i).match(/^\{\{c(\d+)::/);

        if (match) {
            const id = match[1];
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            while (j < text.length) {
                if (braceDepth === 0 && text.startsWith("}}", j)) break;
                if (text[j] === "{") braceDepth++;
                else if (text[j] === "}" && braceDepth > 0) braceDepth--;
                j++;
            }

            const content = text.substring(startContent, j);
            const processedContent = transformLatex(content, activeId, showAnswer);

            if (activeId === null || id === activeId) {
                if (showAnswer) {
                    result += `{\\color{#3b82f6}${processedContent}}`;
                } else {
                    result += `{\\color{#3b82f6}[\\ldots]}`;
                }
            } else {
                result += processedContent;
            }

            i = j + 2;
        } else {
            result += text[i];
            i++;
        }
    }

    return result;
};

// LaTeX 渲染组件
const LatexDisplay: React.FC<{ latex: string }> = ({ latex }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            try {
                katex.render(latex, ref.current, {
                    throwOnError: false,
                    displayMode: true,
                    trust: true,
                });
            } catch (e) {
                ref.current.innerText = `Error: ${e}`;
            }
        }
    }, [latex]);

    return <div ref={ref} />;
};

export const SharpLatexDemo: React.FC = () => {
    const [source, setSource] = useState(
        String.raw`\iint_D f(x,y)dxdy = \int_a^b dx \int_{ {{c1::\varphi_1(x)}} }^{ {{c2::\varphi_2(x)}} } f(x,y)dy`,
    );
    const [activeId, setActiveId] = useState<string | null>("1");
    const [showAnswer, setShowAnswer] = useState(false);

    const clozeIds = useMemo(() => extractClozeIds(source), [source]);
    const previewLatex = useMemo(
        () => transformLatex(source, activeId, showAnswer),
        [source, activeId, showAnswer],
    );

    useEffect(() => {
        if (clozeIds.length > 0 && (!activeId || !clozeIds.includes(activeId))) {
            setActiveId(clozeIds[0]);
        } else if (clozeIds.length === 0) {
            setActiveId(null);
        }
    }, [clozeIds, activeId]);

    return (
        <div className="sharp-container">
            {/* Popover 预览框 */}
            <div className="sharp-popover">
                {/* 左上角 Tab：只在有多个 cloze 时显示 */}
                {clozeIds.length > 1 && (
                    <div className="sharp-tabs-bar">
                        {clozeIds.map((id) => (
                            <button
                                key={id}
                                className={`sharp-tab-btn ${activeId === id ? "active" : ""}`}
                                onClick={() => setActiveId(id)}
                            >
                                C{id}
                            </button>
                        ))}
                    </div>
                )}

                {/* 预览内容 - 点击切换 */}
                <div
                    className="sharp-preview-content"
                    onClick={() => setShowAnswer(!showAnswer)}
                    title="点击切换显示/隐藏"
                >
                    <LatexDisplay latex={previewLatex} />
                </div>
            </div>

            {/* 编辑器（模拟正文） */}
            <div className="sharp-editor-wrapper">
                <div className="sharp-editor-label">LaTeX Source (Editor)</div>
                <textarea
                    className="sharp-textarea"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    spellCheck={false}
                    placeholder="在这里输入 LaTeX 公式..."
                />
            </div>
        </div>
    );
};
