/**
 * LatexClozePreviewModal - LaTeX 挖空预览模态框
 *
 * 功能：
 * - 显示 KaTeX 渲染的公式预览
 * - 默认在源码上方显示，不遮盖源码
 * - 实时响应源码变化
 */

import React, { useLayoutEffect, useRef, useState } from "react";
import { LatexRenderer } from "../common/LatexRenderer";
import "./LatexClozeModal.css";

interface LatexClozeModalProps {
    isOpen: boolean;
    /** 当前 LaTeX 源码 */
    latex: string;
    /** 渲染模式 */
    mode?: "editor" | "front" | "back";
    onClose: () => void;
    /** 源码区域的 DOMRect，用于定位 */
    targetRect: DOMRect | null;
}

export const LatexClozeModal: React.FC<LatexClozeModalProps> = ({
    isOpen,
    latex,
    mode = "editor",
    onClose,
    targetRect,
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [modalPos, setModalPos] = useState({ top: 0, left: 0 });

    // 智能定位：优先上方，不遮盖源码
    useLayoutEffect(() => {
        if (isOpen && targetRect && modalRef.current) {
            const modalHeight = modalRef.current.offsetHeight || 100;
            const modalWidth = modalRef.current.offsetWidth || 400;
            const gap = 8;

            let top: number;
            let left = targetRect.left;

            // 计算上方可用空间
            const spaceAbove = targetRect.top;
            // 计算下方可用空间
            const spaceBelow = window.innerHeight - targetRect.bottom;

            // 优先上方
            if (spaceAbove >= modalHeight + gap) {
                top = targetRect.top - modalHeight - gap;
            }
            // 上方不够，检查下方
            else if (spaceBelow >= modalHeight + gap) {
                top = targetRect.bottom + gap;
            }
            // 两边都不够，选择空间大的一边，但尽量不遮盖
            else {
                if (spaceAbove >= spaceBelow) {
                    top = Math.max(10, targetRect.top - modalHeight - gap);
                } else {
                    top = targetRect.bottom + gap;
                }
            }

            // 水平位置：居中于源码，但不超出屏幕
            const targetCenterX = targetRect.left + targetRect.width / 2;
            left = targetCenterX - modalWidth / 2;

            if (left + modalWidth > window.innerWidth - 20) {
                left = window.innerWidth - modalWidth - 20;
            }
            left = Math.max(10, left);

            setModalPos({ top, left });
        }
    }, [isOpen, targetRect, latex]);

    if (!isOpen) return null;

    return (
        <>
            {/* 透明遮罩 - 点击关闭 */}
            <div className="sr-preview-backdrop" onClick={onClose} />

            {/* 预览模态框 */}
            <div
                className="sr-preview-modal"
                ref={modalRef}
                style={{ top: modalPos.top, left: modalPos.left }}
            >
                <div className="sr-preview-content">
                    <LatexRenderer tex={latex} mode={mode} displayMode={false} />
                </div>

                {/* 模式指示器 */}
                <div className="sr-preview-mode-indicator">
                    {mode === "editor" ? "编辑预览" : mode === "front" ? "正面预览" : "背面预览"}
                </div>
            </div>
        </>
    );
};

export default LatexClozeModal;
