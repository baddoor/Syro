/** @jsxImportSource react */
import React, { useState, useRef, useMemo, useEffect } from "react";
import { LatexClozePopover } from "../business/LatexClozePopover";
import { extractClozeInfo } from "../../utils/latexUtils";
import "katex/dist/katex.min.css";

/**
 * 根据光标位置判断当前处于哪个 Cloze 内
 */
function getActiveClozeIdAtCursor(text: string, cursorPos: number): number | null {
    // 使用括号计数算法
    const regex = /\{\{c(\d+)::/g;
    let match;
    const matches: { id: number; start: number; contentStart: number }[] = [];

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            id: parseInt(match[1]),
            start: match.index,
            contentStart: match.index + match[0].length,
        });
    }

    // 按位置倒序检查
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m.start > cursorPos) continue;

        // 从 contentStart 开始找对应的 }}
        let depth = 0;
        for (let j = m.contentStart; j < text.length; j++) {
            if (text.startsWith("}}", j) && depth === 0) {
                // 找到了结束位置
                if (cursorPos >= m.start && cursorPos <= j + 2) {
                    return m.id;
                }
                break;
            }
            if (text[j] === "{") depth++;
            else if (text[j] === "}" && depth > 0) depth--;
        }
    }

    return null;
}

/**
 * LaTeX Cloze 交互式 Demo
 */
export const LatexClozeDemo: React.FC = () => {
    const [latex, setLatex] = useState(
        String.raw`\iint_D f(x,y)dxdy = \int_a^b dx \int_{ {{c1::\varphi_1(x)}} }^{ {{c2::\varphi_2(x)}} } f(x,y)dy`,
    );
    const [cursorPos, setCursorPos] = useState(0);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(true);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 初始化 anchorRect
    useEffect(() => {
        if (textareaRef.current && !anchorRect) {
            const rect = textareaRef.current.getBoundingClientRect();
            setAnchorRect(rect);
        }
    }, []);

    // 计算 active ID
    const activeId = useMemo(() => {
        return getActiveClozeIdAtCursor(latex, cursorPos);
    }, [latex, cursorPos]);

    // 获取所有 cloze 信息
    const clozeInfos = useMemo(() => extractClozeInfo(latex), [latex]);

    // 模拟光标移动
    const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        setCursorPos(target.selectionStart);

        // 计算定位
        const rect = target.getBoundingClientRect();
        setAnchorRect(rect);
    };

    return (
        <div className="sr-bg-zinc-900 sr-min-h-screen sr-p-8 sr-text-zinc-200">
            <div className="sr-max-w-4xl sr-mx-auto">
                <h1 className="sr-text-2xl sr-font-bold sr-mb-2">LaTeX Cloze Preview Demo</h1>
                <p className="sr-text-zinc-400 sr-mb-8">
                    在输入框中移动光标到{" "}
                    <code className="sr-bg-zinc-800 sr-px-2 sr-py-1 sr-rounded">{`{{c1::...}}`}</code>{" "}
                    内部，上方弹窗会实时预览效果
                </p>

                {/* 控制按钮 */}
                <div className="sr-flex sr-gap-4 sr-mb-6">
                    <button
                        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                        className="sr-px-4 sr-py-2 sr-bg-blue-600 sr-text-white sr-rounded-lg sr-text-sm sr-font-medium hover:sr-bg-blue-700 sr-transition"
                    >
                        {isPopoverOpen ? "关闭预览" : "打开预览"}
                    </button>
                    <button
                        onClick={() =>
                            setLatex(String.raw`f(x) = {{c1::a}}x^2 + {{c2::b}}x + {{c3::c}}`)
                        }
                        className="sr-px-4 sr-py-2 sr-bg-zinc-700 sr-text-zinc-200 sr-rounded-lg sr-text-sm sr-font-medium hover:sr-bg-zinc-600 sr-transition"
                    >
                        示例 1: 二次函数
                    </button>
                    <button
                        onClick={() =>
                            setLatex(
                                String.raw`\iint_D f(x,y)dxdy = \int_a^b dx \int_{ {{c1::\varphi_1(x)}} }^{ {{c2::\varphi_2(x)}} } f(x,y)dy`,
                            )
                        }
                        className="sr-px-4 sr-py-2 sr-bg-zinc-700 sr-text-zinc-200 sr-rounded-lg sr-text-sm sr-font-medium hover:sr-bg-zinc-600 sr-transition"
                    >
                        示例 2: 二重积分
                    </button>
                </div>

                {/* 编辑区 */}
                <div className="sr-mb-8" style={{ marginTop: 80 }}>
                    <label className="sr-block sr-text-sm sr-font-medium sr-mb-2 sr-text-zinc-400">
                        LaTeX 源码编辑
                    </label>
                    <textarea
                        ref={textareaRef}
                        value={latex}
                        onChange={(e) => setLatex(e.target.value)}
                        onSelect={handleSelect}
                        onKeyUp={handleSelect}
                        onMouseUp={handleSelect}
                        onClick={handleSelect}
                        className="sr-w-full sr-p-4 sr-bg-zinc-800 sr-text-zinc-100 sr-border sr-border-zinc-700 sr-rounded-lg sr-font-mono sr-text-sm"
                        style={{ minHeight: 120, resize: "vertical" }}
                        placeholder="输入包含 {{c1::...}} 的 LaTeX 公式..."
                    />
                </div>

                {/* 调试信息 */}
                <div className="sr-grid sr-grid-cols-3 sr-gap-4 sr-mb-8">
                    <div className="sr-bg-zinc-800 sr-p-4 sr-rounded-lg">
                        <div className="sr-text-xs sr-text-zinc-500 sr-mb-1">光标位置</div>
                        <div className="sr-text-lg sr-font-mono">{cursorPos}</div>
                    </div>
                    <div className="sr-bg-zinc-800 sr-p-4 sr-rounded-lg">
                        <div className="sr-text-xs sr-text-zinc-500 sr-mb-1">当前 Cloze</div>
                        <div className="sr-text-lg sr-font-mono">
                            {activeId !== null ? (
                                `c${activeId}`
                            ) : (
                                <span className="sr-text-zinc-500">无</span>
                            )}
                        </div>
                    </div>
                    <div className="sr-bg-zinc-800 sr-p-4 sr-rounded-lg">
                        <div className="sr-text-xs sr-text-zinc-500 sr-mb-1">Cloze 总数</div>
                        <div className="sr-text-lg sr-font-mono">{clozeInfos.length}</div>
                    </div>
                </div>

                {/* Cloze 列表 */}
                <div className="sr-bg-zinc-800 sr-p-4 sr-rounded-lg">
                    <div className="sr-text-sm sr-font-medium sr-mb-3 sr-text-zinc-400">
                        检测到的 Cloze
                    </div>
                    <div className="sr-space-y-2">
                        {clozeInfos.map((info, idx) => (
                            <div
                                key={idx}
                                className={`sr-flex sr-items-center sr-gap-3 sr-p-3 sr-rounded-lg sr-transition ${
                                    activeId === info.id
                                        ? "sr-bg-blue-500/20 sr-border sr-border-blue-500/30"
                                        : "sr-bg-zinc-700/50"
                                }`}
                            >
                                <span className="sr-font-mono sr-text-blue-400 sr-text-sm sr-font-bold">
                                    c{info.id}
                                </span>
                                <span className="sr-font-mono sr-text-zinc-300 sr-text-sm sr-flex-1">
                                    {info.content}
                                </span>
                            </div>
                        ))}
                        {clozeInfos.length === 0 && (
                            <div className="sr-text-zinc-500 sr-text-sm">没有检测到 Cloze 语法</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Popover */}
            <LatexClozePopover
                isOpen={isPopoverOpen}
                sourceCode={latex}
                activeId={activeId}
                anchorRect={anchorRect}
            />
        </div>
    );
};
