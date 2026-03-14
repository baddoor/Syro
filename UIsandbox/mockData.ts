import { CardState, DeckState, ReviewContext, StatsState, RepetitionItemState } from "./types";

// ===================================================
// Mock 卡片数据
// ===================================================
export const MOCK_CARD_NEW: CardState = {
    Id: 1001,
    cardIdx: 0,
    front: "<div>什么是 <strong>Zustand</strong> 的 Transient Updates?</div>",
    back: "<div>一种不需要通过组件重渲染就能更新状态的模式，适用于高频动画或游戏循环。</div>",
    rawFront: "什么是 **Zustand** 的 Transient Updates?",
    rawBack: "一种不需要通过组件重渲染就能更新状态的模式，适用于高频动画或游戏循环。",
    hasSchedule: false,
    isNew: true,
    isDue: false,
    learningStep: null,
    responseButtonLabels: ["重来", "1m", "10m", "4d"],
    isFlipped: false,
    isFloating: false,
};

export const MOCK_CARD_LEARNING: CardState = {
    Id: 1002,
    cardIdx: 1,
    front: "<div><strong>Anachronism</strong> 是什么意思？</div>",
    back: "<div>时代错误；不合时代的事物。</div>",
    rawFront: "**Anachronism** 是什么意思？",
    rawBack: "时代错误；不合时代的事物。",
    hasSchedule: true,
    isNew: false,
    isDue: false,
    learningStep: 1,
    responseButtonLabels: ["重来", "1m", "10m", "1d"],
    isFlipped: false,
    isFloating: false,
};

export const MOCK_CARD_DUE: CardState = {
    Id: 1003,
    cardIdx: 2,
    front: "<div>React 中 useEffect 的依赖数组为空数组时代表什么？</div>",
    back: "<div>仅在组件挂载时执行一次（类似 componentDidMount）。</div>",
    rawFront: "React 中 useEffect 的依赖数组为空数组时代表什么？",
    rawBack: "仅在组件挂载时执行一次（类似 componentDidMount）。",
    hasSchedule: true,
    isNew: false,
    isDue: true,
    learningStep: null,
    responseButtonLabels: ["重来", "较难 - 3d", "记得 - 8d", "简单 - 16d"],
    isFlipped: false,
    isFloating: false,
};

export const MOCK_CARDS: CardState[] = [MOCK_CARD_NEW, MOCK_CARD_LEARNING, MOCK_CARD_DUE];

// ===================================================
// Mock 牌组树 (DeckTree) - 深度嵌套，体现无限层级
// ===================================================
export const MOCK_DECK_TREE: DeckState = {
    deckName: "root",
    fullPath: "",
    newCount: 85,
    dueCount: 180,
    learningCount: 25,
    isCollapsed: false,
    depth: 0,
    subdecks: [
        {
            deckName: "编程",
            fullPath: "编程",
            newCount: 45,
            dueCount: 100,
            learningCount: 15,
            isCollapsed: false,
            depth: 1,
            subdecks: [
                {
                    deckName: "JavaScript",
                    fullPath: "编程/JavaScript",
                    newCount: 20,
                    dueCount: 50,
                    learningCount: 8,
                    isCollapsed: false,
                    depth: 2,
                    subdecks: [
                        {
                            deckName: "React",
                            fullPath: "编程/JavaScript/React",
                            newCount: 10,
                            dueCount: 25,
                            learningCount: 3,
                            isCollapsed: false,
                            depth: 3,
                            subdecks: [
                                {
                                    deckName: "Hooks",
                                    fullPath: "编程/JavaScript/React/Hooks",
                                    newCount: 5,
                                    dueCount: 12,
                                    learningCount: 1,
                                    isCollapsed: true,
                                    depth: 4,
                                    subdecks: [],
                                },
                                {
                                    deckName: "状态管理",
                                    fullPath: "编程/JavaScript/React/状态管理",
                                    newCount: 5,
                                    dueCount: 13,
                                    learningCount: 2,
                                    isCollapsed: true,
                                    depth: 4,
                                    subdecks: [
                                        {
                                            deckName: "Zustand",
                                            fullPath: "编程/JavaScript/React/状态管理/Zustand",
                                            newCount: 3,
                                            dueCount: 8,
                                            learningCount: 1,
                                            isCollapsed: true,
                                            depth: 5,
                                            subdecks: [],
                                        },
                                        {
                                            deckName: "Redux",
                                            fullPath: "编程/JavaScript/React/状态管理/Redux",
                                            newCount: 2,
                                            dueCount: 5,
                                            learningCount: 1,
                                            isCollapsed: true,
                                            depth: 5,
                                            subdecks: [],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            deckName: "Vue",
                            fullPath: "编程/JavaScript/Vue",
                            newCount: 5,
                            dueCount: 15,
                            learningCount: 2,
                            isCollapsed: true,
                            depth: 3,
                            subdecks: [],
                        },
                        {
                            deckName: "Node.js",
                            fullPath: "编程/JavaScript/Node.js",
                            newCount: 5,
                            dueCount: 10,
                            learningCount: 3,
                            isCollapsed: true,
                            depth: 3,
                            subdecks: [],
                        },
                    ],
                },
                {
                    deckName: "TypeScript",
                    fullPath: "编程/TypeScript",
                    newCount: 15,
                    dueCount: 30,
                    learningCount: 5,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [
                        {
                            deckName: "类型体操",
                            fullPath: "编程/TypeScript/类型体操",
                            newCount: 8,
                            dueCount: 15,
                            learningCount: 2,
                            isCollapsed: true,
                            depth: 3,
                            subdecks: [],
                        },
                        {
                            deckName: "泛型",
                            fullPath: "编程/TypeScript/泛型",
                            newCount: 7,
                            dueCount: 15,
                            learningCount: 3,
                            isCollapsed: true,
                            depth: 3,
                            subdecks: [],
                        },
                    ],
                },
                {
                    deckName: "Python",
                    fullPath: "编程/Python",
                    newCount: 10,
                    dueCount: 20,
                    learningCount: 2,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [],
                },
            ],
        },
        {
            deckName: "英语",
            fullPath: "英语",
            newCount: 25,
            dueCount: 55,
            learningCount: 8,
            isCollapsed: false,
            depth: 1,
            subdecks: [
                {
                    deckName: "GRE词汇",
                    fullPath: "英语/GRE词汇",
                    newCount: 15,
                    dueCount: 35,
                    learningCount: 5,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [],
                },
                {
                    deckName: "日常口语",
                    fullPath: "英语/日常口语",
                    newCount: 10,
                    dueCount: 20,
                    learningCount: 3,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [],
                },
            ],
        },
        {
            deckName: "数学",
            fullPath: "数学",
            newCount: 15,
            dueCount: 25,
            learningCount: 2,
            isCollapsed: true,
            depth: 1,
            subdecks: [
                {
                    deckName: "线性代数",
                    fullPath: "数学/线性代数",
                    newCount: 8,
                    dueCount: 15,
                    learningCount: 1,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [],
                },
                {
                    deckName: "概率论",
                    fullPath: "数学/概率论",
                    newCount: 7,
                    dueCount: 10,
                    learningCount: 1,
                    isCollapsed: true,
                    depth: 2,
                    subdecks: [],
                },
            ],
        },
    ],
};

// 扁平化的牌组列表 (用于某些场景)
export const MOCK_DECKS: DeckState[] = MOCK_DECK_TREE.subdecks;

// ===================================================
// Mock 复习上下文 (CardUI 所需的全部数据)
// ===================================================
export const MOCK_REVIEW_CONTEXT: ReviewContext = {
    currentDeck: {
        deckName: "React",
        fullPath: "编程/JavaScript/React",
        newCount: 5,
        dueCount: 18,
        learningCount: 2,
        subdecks: [],
        isCollapsed: false,
        depth: 3,
    },
    currentCard: MOCK_CARD_DUE,
    // 数组形式，便于面包屑导航
    questionContext: ["编程", "JavaScript", "React", "状态管理", "Zustand"],
    currentCardType: "due",
};

// ===================================================
// Mock 统计数据 (用于 StatsModal)
// ===================================================
export const MOCK_STATS: StatsState = {
    newCount: 200,
    youngCount: 450,
    matureCount: 600,
    onDueCount: 75,
    intervals: {
        1: 50,
        3: 80,
        7: 120,
        14: 150,
        30: 100,
        60: 80,
        90: 40,
        180: 20,
    },
    eases: {
        200: 30,
        220: 50,
        250: 280,
        280: 350,
        300: 150,
        320: 50,
    },
};

// ===================================================
// Mock RepetitionItem (用于详情面板)
// ===================================================
export const MOCK_REPETITION_ITEM: RepetitionItemState = {
    ID: 1003,
    nextReview: Date.now() + 8 * 24 * 60 * 60 * 1000,
    deckName: "编程/JavaScript/React",
    timesReviewed: 12,
    timesCorrect: 10,
    errorStreak: 0,
    priority: 8,
    interval: 8,
    hasDue: true,
};
