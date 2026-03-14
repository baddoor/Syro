/**
 * LatexRenderer - 真实 LaTeX 渲染组件
 *
 * 使用 KaTeX 进行渲染，支持挖空语法的三种视觉状态
 */

import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { processLatexCloze, RenderMode } from "../../utils/latexUtils";
import "./LatexRenderer.css";

interface LatexRendererProps {
    /** LaTeX 源码（可包含 {{c1::...}} 语法） */
    tex: string;
    /** 渲染模式 */
    mode?: RenderMode;
    /** 是否为块级公式（默认 true） */
    displayMode?: boolean;
    /** 额外的 CSS 类 */
    className?: string;
    /** 点击事件 */
    onClick?: (e: React.MouseEvent) => void;
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({
    tex,
    mode = "editor",
    displayMode = true,
    className = "",
    onClick,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                // 1. 预处理：将 {{c1::...}} 转为 \htmlClass{...}{...}
                const processedTex = processLatexCloze(tex, mode);

                // 2. 使用 KaTeX 渲染
                katex.render(processedTex, containerRef.current, {
                    throwOnError: false,
                    displayMode: displayMode,
                    trust: true, // 关键：允许 \htmlClass 命令
                    strict: false,
                    output: "html",
                });
            } catch (e) {
                console.error("LaTeX render error:", e);
                if (containerRef.current) {
                    containerRef.current.innerHTML = `<span class="sr-latex-error">LaTeX Error: ${tex}</span>`;
                }
            }
        }
    }, [tex, mode, displayMode]);

    return (
        <div
            ref={containerRef}
            className={`sr-latex-container sr-latex-mode-${mode} ${className}`}
            onClick={onClick}
        />
    );
};

export default LatexRenderer;
