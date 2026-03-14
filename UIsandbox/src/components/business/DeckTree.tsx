/** @jsxImportSource react */
/**
 * React DeckTree 组件 (从插件复制)
 *
 * 显示牌组树状结构，支持折叠/展开、点击进入复习
 */
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 牌组状态类型
export interface DeckState {
    deckName: string;
    fullPath: string;
    newCount: number;
    learningCount: number;
    dueCount: number;
    isCollapsed: boolean;
    subdecks: DeckState[];
}

// 内联 SVG 图标 (使用 framer-motion 实现旋转动画)
const CollapseIcon: React.FC<{ isCollapsed: boolean; className?: string }> = ({
    isCollapsed,
    className,
}) => (
    <motion.svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style={{
            width: "12px",
            height: "12px",
            display: "block",
        }}
        initial={false}
        animate={{ rotate: isCollapsed ? 0 : 90 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={className}
    >
        {/* 使用标准的向右三角形路径，旋转 90 度即为向下 */}
        <path fill="currentColor" d="M30,20 L80,50 L30,80 Z" />
    </motion.svg>
);

// 齿轮图标
const SettingsIcon: React.FC = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block" }}
    >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

// ==========================================
// 表头组件
// ==========================================
const DeckHeader: React.FC = () => (
    <div className="sr-deck-header hidden sm:flex">
        <div className="sr-deck-header-name">牌组</div>
        <div className="sr-deck-header-stat new">未学习</div>
        <div className="sr-deck-header-stat learning">学习中</div>
        <div className="sr-deck-header-stat due">待复习</div>
        <div className="sr-deck-header-action"></div>
    </div>
);

// ==========================================
// 单行牌组组件 (递归核心)
// ==========================================
interface DeckRowProps {
    deck: DeckState;
    level?: number;
    onDeckClick?: (deck: DeckState) => void;
    onSettingsClick?: (deckName: string, fullPath: string) => void;
    onCollapseChange?: (fullPath: string, isCollapsed: boolean) => void;
}

const DeckRow: React.FC<DeckRowProps> = ({
    deck,
    level = 0,
    onDeckClick,
    onSettingsClick,
    onCollapseChange,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(deck.isCollapsed);
    const hasChildren = deck.subdecks && deck.subdecks.length > 0;

    const toggleCollapse = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            const newState = !isCollapsed;
            setIsCollapsed(newState);
            if (onCollapseChange && deck.fullPath) {
                onCollapseChange(deck.fullPath, newState);
            }
        },
        [isCollapsed, deck.fullPath, onCollapseChange],
    );

    const handleRowClick = useCallback(() => {
        onDeckClick?.(deck);
    }, [deck, onDeckClick]);

    const handleSettingsClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onSettingsClick?.(deck.deckName, deck.fullPath || deck.deckName);
        },
        [deck, onSettingsClick],
    );

    return (
        <div>
            {/* 行内容 */}
            <div
                onClick={handleRowClick}
                className="sr-deck-row"
                data-level={level}
                style={{
                    paddingLeft: `${12 + level * 16}px`,
                    ["--level" as any]: level,
                }}
            >
                {/* 牌组名称列 */}
                <div className="sr-deck-name-col">
                    {/* 折叠箭头区域 - 固定宽度占位 */}
                    <span
                        onClick={hasChildren ? toggleCollapse : undefined}
                        className={`sr-deck-collapse-btn ${hasChildren ? (isCollapsed ? "sr-collapsed" : "sr-expanded") : ""}`}
                        style={{
                            width: "18px",
                            height: "18px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            cursor: hasChildren ? "pointer" : "default",
                            color: "var(--text-faint, #666)",
                        }}
                    >
                        {hasChildren && <CollapseIcon isCollapsed={isCollapsed} />}
                    </span>

                    {/* 牌组名 */}
                    <span className="sr-deck-name">{deck.deckName}</span>
                </div>

                {/* 统计数字 - 移动端紧凑排列 */}
                <div className="sr-deck-stats-group">
                    <div className={`sr-deck-stat new ${deck.newCount === 0 ? "zero" : ""}`}>
                        {deck.newCount}
                    </div>
                    <div
                        className={`sr-deck-stat learning ${deck.learningCount === 0 ? "zero" : ""}`}
                    >
                        {deck.learningCount}
                    </div>
                    <div className={`sr-deck-stat due ${deck.dueCount === 0 ? "zero" : ""}`}>
                        {deck.dueCount}
                    </div>
                </div>

                {/* 设置齿轮 */}
                <button
                    onClick={handleSettingsClick}
                    className="sr-deck-settings-btn"
                    style={{
                        width: "24px",
                        height: "24px",
                        minWidth: "24px",
                        minHeight: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        background: "transparent",
                        border: "none",
                    }}
                >
                    <SettingsIcon />
                </button>
            </div>

            {/* 子牌组 (递归渲染 + 动画) */}
            <AnimatePresence initial={false}>
                {!isCollapsed && hasChildren && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="sr-deck-children"
                        style={{ overflow: "hidden" }}
                    >
                        {deck.subdecks.map((subdeck) => (
                            <DeckRow
                                key={subdeck.fullPath || subdeck.deckName}
                                deck={subdeck}
                                level={level + 1}
                                onDeckClick={onDeckClick}
                                onSettingsClick={onSettingsClick}
                                onCollapseChange={onCollapseChange}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ==========================================
// 主容器组件
// ==========================================
interface DeckTreeProps {
    /** 牌组列表 */
    decks: DeckState[];
    /** 点击牌组回调 */
    onDeckClick?: (deck: DeckState) => void;
    /** 点击设置按钮回调 */
    onSettingsClick?: (deckName: string, fullPath: string) => void;
    /** 折叠状态变化回调 (用于持久化) */
    onCollapseChange?: (fullPath: string, isCollapsed: boolean) => void;
}

export const DeckTree: React.FC<DeckTreeProps> = ({
    decks,
    onDeckClick,
    onSettingsClick,
    onCollapseChange,
}) => {
    return (
        <div className="sr-deck-tree">
            <DeckHeader />
            <div>
                {decks.map((deck) => (
                    <DeckRow
                        key={deck.fullPath || deck.deckName}
                        deck={deck}
                        level={0}
                        onDeckClick={onDeckClick}
                        onSettingsClick={onSettingsClick}
                        onCollapseChange={onCollapseChange}
                    />
                ))}
            </div>
        </div>
    );
};

export default DeckTree;
