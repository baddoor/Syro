/**
 * Card 相关类型定义
 * 源自 src/Card.ts
 */

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
