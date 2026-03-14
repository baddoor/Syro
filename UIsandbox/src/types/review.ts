/**
 * 复习相关类型定义
 */
import { CardState } from "./card";
import { DeckState } from "./deck";

// 复习上下文 (整合 CardUI 中需要的一切)
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

// 统计信息 (源自 src/stats.ts Stats 类)
export interface StatsState {
    newCount: number; // 新卡片总数
    youngCount: number; // 年轻卡片 (interval < 32)
    matureCount: number; // 成熟卡片 (interval >= 32)
    onDueCount: number; // 当前到期

    // 用于绘制图表
    intervals: Record<number, number>; // interval值 -> 数量
    eases: Record<number, number>; // ease值 -> 数量
}

// RepetitionItem 基础信息 (源自 src/dataStore/repetitionItem.ts)
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
