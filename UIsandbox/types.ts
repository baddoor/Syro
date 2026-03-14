/**
 * UI Sandbox 数据契约 (Data Contract)
 *
 * 基于 Card.ts, Deck.ts, RepetitionItem.ts, Stats.ts 中的真实属性名定义。
 * 额外添加了 UI 专用字段用于动画和交互控制。
 */

// ===================================================
// Card 相关 (源自 src/Card.ts)
// ===================================================
export interface CardState {
    // 核心标识
    Id: number;
    cardIdx: number;

    // 显示内容 (源自 Card.front, Card.back)
    front: string; // 已渲染为 HTML 的字符串 (用于直接显示)
    back: string; // 已渲染为 HTML 的字符串

    // 原始 Markdown 文本 (用于"编辑卡片"功能)
    rawFront?: string;
    rawBack?: string;

    // 调度状态
    hasSchedule: boolean;
    isNew: boolean; // Card.isNew getter
    isDue: boolean; // Card.isDue getter

    // 学习步骤 (源自 Card.learningStep)
    learningStep: number | null;

    // 多填空 (Multi-Cloze)
    multiClozeIndex?: number;
    isMultiCloze?: boolean;

    // 评分按钮文本及间隔预览 (由 SrsAlgorithm 计算得出)
    // 例如: ["重来", "较差 - 10m", "记得 - 4d", "简单 - 14d"]
    responseButtonLabels: string[];

    // =====================
    // UI 效果专用字段 (不存磁盘，仅用于动画控制)
    // =====================
    isFlipped: boolean; // 当前是正面还是反面
    lastRating?: number; // 上一次按下的按钮索引 (用于撤销动效)
    isFloating?: boolean; // 是否处于"浮动"状态 (CSS 视差效果)
}

// ===================================================
// Deck 相关 (源自 src/Deck.ts)
// ===================================================
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

// ===================================================
// 复习上下文 (整合 CardUI 中需要的一切)
// ===================================================
export interface ReviewContext {
    // 当前牌组信息
    currentDeck: DeckState;

    // 当前卡片
    currentCard: CardState;

    // 上下文路径 (源自 Question.questionContext, 数组形式便于面包屑导航)
    questionContext: string[];

    // 当前卡片类型提示 (用于标题高亮)
    currentCardType: "new" | "learning" | "due";
}

// ===================================================
// 统计信息 (源自 src/stats.ts Stats 类)
// ===================================================
export interface StatsState {
    newCount: number; // 新卡片总数
    youngCount: number; // 年轻卡片 (interval < 32)
    matureCount: number; // 成熟卡片 (interval >= 32)
    onDueCount: number; // 当前到期

    // 用于绘制图表
    intervals: Record<number, number>; // interval值 -> 数量
    eases: Record<number, number>; // ease值 -> 数量
}

// ===================================================
// RepetitionItem 基础信息 (源自 src/dataStore/repetitionItem.ts)
// ===================================================
export interface RepetitionItemState {
    ID: number;
    nextReview: number; // timestamp
    deckName: string;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    priority: number; // 重要性 1-10
    interval: number; // 当前间隔(天)
    hasDue: boolean; // 是否有到期日
}
