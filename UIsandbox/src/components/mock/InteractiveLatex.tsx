/**
 * InteractiveLatex - 可交互的 LaTeX 组件
 * 支持实时同步更新
 */

import React, { useState, useEffect } from "react";
import { LatexRenderer } from "../common/LatexRenderer";
import { RenderMode } from "../../utils/latexUtils";

interface InteractiveLatexProps {
    /** 初始 LaTeX 内容 */
    initialTex: string;
    /** 渲染模式 */
    mode?: RenderMode;
    /** 点击编辑回调 */
    onEdit: (currentTex: string, onSave: (newTex: string) => void, target: HTMLElement) => void;
}

export const InteractiveLatex: React.FC<InteractiveLatexProps> = ({
    initialTex,
    mode = "editor",
    onEdit,
}) => {
    const [tex, setTex] = useState(initialTex);
    const [isHovered, setIsHovered] = useState(false);

    // 只有当 initialTex 真正改变时才重置
    useEffect(() => {
        setTex(initialTex);
    }, [initialTex]);

    const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        e.preventDefault();

        onEdit(
            tex,
            (newTex) => setTex(newTex), // 这个回调被 Modal 实时调用
            e.currentTarget,
        );
    };

    return (
        <span
            className="cm-math-widget"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                cursor: "pointer",
                display: "inline-block",
                verticalAlign: "middle",
                padding: "2px 4px",
                borderRadius: "4px",
                transition: "all 0.2s",
                border: isHovered ? "1px solid #444" : "1px solid transparent",
                background: isHovered ? "rgba(255,255,255,0.03)" : "transparent",
            }}
            title="点击编辑挖空"
        >
            <LatexRenderer tex={tex} mode={mode} displayMode={false} />
        </span>
    );
};

export default InteractiveLatex;
