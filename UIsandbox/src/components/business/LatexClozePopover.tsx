/** @jsxImportSource react */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import katex from "katex";
import { extractClozeInfo } from "../../utils/latexUtils";
import "./LatexClozePopover.css";

interface LatexClozePopoverProps {
    isOpen: boolean;
    sourceCode: string; // 包含 {{c::}} 的完整 LaTeX 源码
    activeId: number | null; // 当前光标所在的 cloze ID
    anchorRect: DOMRect | null; // 公式所在编辑器区域的坐标，用于定位
}

/**
 * 将带有 Anki 挖空的 LaTeX 转换为可渲染的格式
 * Front 模式: 用 [...] 替换所有挖空内容
 * Back 模式: 高亮显示挖空内容
 */
function transformLatexForMode(sourceCode: string, mode: "front" | "back"): string {
    let result = "";
    let i = 0;

    while (i < sourceCode.length) {
        // 检测 Cloze 开始标记 {{cN::
        const match = sourceCode.slice(i).match(/^\{\{c(\d+)::/);

        if (match) {
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            // 使用括号计数寻找正确的结束符 }}
            while (j < sourceCode.length) {
                if (braceDepth === 0 && sourceCode.startsWith("}}", j)) {
                    break;
                }
                if (sourceCode[j] === "{") braceDepth++;
                else if (sourceCode[j] === "}") {
                    if (braceDepth > 0) braceDepth--;
                }
                j++;
            }

            // 提取内容
            const content = sourceCode.substring(startContent, j);
            // 递归处理内部内容（支持嵌套挖空）
            const processedContent = transformLatexForMode(content, mode);

            // 根据模式替换
            if (mode === "front") {
                // 遮罩效果: 显示蓝色的 [...]
                result += `{\\color{#60a5fa}\\mathbf{[\\cdot\\cdot\\cdot]}}`;
            } else {
                // 高亮显示原始内容
                result += `{\\color{#60a5fa}${processedContent}}`;
            }

            i = j + 2; // 跳过 }}
        } else {
            result += sourceCode[i];
            i++;
        }
    }

    return result;
}

/**
 * LaTeX Cloze 预览弹窗
 * 位于公式上方，显示当前填空的预览效果
 */
export const LatexClozePopover: React.FC<LatexClozePopoverProps> = ({
    isOpen,
    sourceCode,
    activeId,
    anchorRect,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<"front" | "back">("front");
    const [position, setPosition] = useState({ top: 0, left: 0 });

    // 获取所有 cloze 信息
    const clozeInfos = useMemo(() => extractClozeInfo(sourceCode), [sourceCode]);
    const uniqueIds = useMemo(() => {
        const ids = new Set(clozeInfos.map((c) => c.id));
        return Array.from(ids).sort((a, b) => a - b);
    }, [clozeInfos]);

    // 计算用于显示的 LaTeX 字符串
    const previewLatex = useMemo(() => {
        return transformLatexForMode(sourceCode, mode);
    }, [sourceCode, mode]);

    // 渲染 KaTeX
    useEffect(() => {
        if (!previewRef.current || !isOpen) return;

        try {
            katex.render(previewLatex, previewRef.current, {
                throwOnError: false,
                displayMode: true,
                trust: true,
                strict: false,
            });
        } catch (e) {
            previewRef.current.innerHTML = `<span style="color: #ef4444;">LaTeX Error: ${e}</span>`;
        }
    }, [previewLatex, isOpen]);

    // 智能定位逻辑（锁定在上方）
    useEffect(() => {
        if (!isOpen || !anchorRect || !popoverRef.current) return;

        const popover = popoverRef.current;
        const { height: popHeight, width: popWidth } = popover.getBoundingClientRect();
        const padding = 12;

        // 默认定位：在元素正上方
        let top = anchorRect.top - popHeight - padding;
        let left = anchorRect.left + (anchorRect.width - popWidth) / 2;

        // 边界检测：如果上方空间不足，移到下方
        if (top < 10) {
            top = anchorRect.bottom + padding;
        }

        // 边界检测：水平方向不溢出屏幕
        if (left + popWidth > window.innerWidth - padding) {
            left = window.innerWidth - popWidth - padding;
        }
        if (left < padding) left = padding;

        setPosition({ top, left });
    }, [isOpen, anchorRect, previewLatex]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={popoverRef}
            className="sr-latex-popover"
            style={{
                top: position.top,
                left: position.left,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* 预览区域 */}
            <div
                ref={previewRef}
                className="sr-latex-preview-box"
                onClick={() => setMode(mode === "front" ? "back" : "front")}
                title="点击切换显示/隐藏答案"
            />

            {/* 底部控制栏 */}
            <div className="sr-latex-controls">
                <div className="sr-latex-id-badges">
                    {uniqueIds.map((id) => (
                        <span
                            key={id}
                            className={`sr-latex-id-badge ${activeId === id ? "active" : ""}`}
                        >
                            c{id}
                        </span>
                    ))}
                </div>

                <div className="sr-latex-actions">
                    <button
                        className={`sr-icon-btn ${mode === "front" ? "active" : ""}`}
                        onClick={() => setMode("front")}
                        title="预览遮罩效果 (正面)"
                    >
                        <EyeOff size={14} />
                    </button>
                    <button
                        className={`sr-icon-btn ${mode === "back" ? "active" : ""}`}
                        onClick={() => setMode("back")}
                        title="查看原始内容 (背面)"
                    >
                        <Eye size={14} />
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
