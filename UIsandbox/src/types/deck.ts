/**
 * Deck 相关类型定义
 * 源自 src/Deck.ts
 */

export interface DeckState {
    deckName: string;

    // 完整路径 (用于面包屑导航，例如 "编程/JavaScript/React")
    fullPath?: string;

    // 卡片计数 (源自 Deck.newFlashcards, Deck.dueFlashcards, Deck.learningFlashcards)
    newCount: number;
    dueCount: number;
    learningCount: number;

    // 子牌组
    subdecks: DeckState[];

    // UI 状态 (折叠)
    isCollapsed: boolean;

    // 层级深度 (用于递归渲染时的缩进计算)
    depth?: number;
}
