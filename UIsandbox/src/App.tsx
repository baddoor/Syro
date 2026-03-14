/**
 * 文件功能：
 * 这个文件是 UIsandbox 项目的主入口页面，相当于一个演示大厅。
 * 它主要解决的问题是：提供一个导航菜单，让开发者可以快速切换和预览不同的组件 demo（比如卡组树、复习卡片、LaTeX 演示、以及新开发的侧边栏）。
 *
 * 架构角色：界面层 (UI Layer) / 路由容器
 *
 * 依赖关系：
 * - 引用了 DeckTree (卡组树组件)
 * - 引用了 LinearCard (复习卡片组件)
 * - 引用了 SharpLatexDemo (LaTeX 渲染演示)
 * - 引用了 NewSidebar (新侧边栏组件)
 * - 引用了 DeckOptionsModal (设置弹窗)
 *
 * 被引用关系：
 * - 被 main.tsx 引用，作为 React 应用的根组件渲染
 */

import React, { useState } from "react";
import { SharpLatexDemo } from "./components/mock/SharpLatexDemo";
import { LinearCard } from "./components/business/LinearCard";
import { DeckTree, DeckState } from "./components/business/DeckTree";
import { DeckOptionsModal } from "./components/business/DeckOptionsModal";
import { NewSidebar } from "./components/NewSidebar";
import "./App.css";
import "./components/business/DeckTree.css";

type DemoPage = "latex" | "review" | "decks" | "sidebar";

// 模拟卡组数据
const MOCK_DECKS: DeckState[] = [
    {
        deckName: "编程",
        fullPath: "#编程",
        newCount: 15,
        learningCount: 3,
        dueCount: 28,
        isCollapsed: false,
        subdecks: [
            {
                deckName: "JavaScript",
                fullPath: "#编程/JavaScript",
                newCount: 8,
                learningCount: 2,
                dueCount: 15,
                isCollapsed: false,
                subdecks: [
                    {
                        deckName: "React",
                        fullPath: "#编程/JavaScript/React",
                        newCount: 5,
                        learningCount: 1,
                        dueCount: 10,
                        isCollapsed: false,
                        subdecks: [],
                    },
                    {
                        deckName: "Vue",
                        fullPath: "#编程/JavaScript/Vue",
                        newCount: 3,
                        learningCount: 1,
                        dueCount: 5,
                        isCollapsed: false,
                        subdecks: [],
                    },
                ],
            },
            {
                deckName: "TypeScript",
                fullPath: "#编程/TypeScript",
                newCount: 7,
                learningCount: 1,
                dueCount: 13,
                isCollapsed: false,
                subdecks: [],
            },
        ],
    },
    {
        deckName: "语言学习",
        fullPath: "#语言学习",
        newCount: 20,
        learningCount: 8,
        dueCount: 35,
        isCollapsed: false,
        subdecks: [
            {
                deckName: "英语",
                fullPath: "#语言学习/英语",
                newCount: 12,
                learningCount: 5,
                dueCount: 20,
                isCollapsed: false,
                subdecks: [],
            },
            {
                deckName: "日语",
                fullPath: "#语言学习/日语",
                newCount: 8,
                learningCount: 3,
                dueCount: 15,
                isCollapsed: false,
                subdecks: [],
            },
        ],
    },
    {
        deckName: "数学",
        fullPath: "#数学",
        newCount: 10,
        learningCount: 2,
        dueCount: 18,
        isCollapsed: true,
        subdecks: [
            {
                deckName: "微积分",
                fullPath: "#数学/微积分",
                newCount: 5,
                learningCount: 1,
                dueCount: 10,
                isCollapsed: false,
                subdecks: [],
            },
            {
                deckName: "线性代数",
                fullPath: "#数学/线性代数",
                newCount: 5,
                learningCount: 1,
                dueCount: 8,
                isCollapsed: false,
                subdecks: [],
            },
        ],
    },
];

function App() {
    const [currentPage, setCurrentPage] = useState<DemoPage>("sidebar");
    const [settingsModal, setSettingsModal] = useState<{ isOpen: boolean; deckName: string }>({
        isOpen: false,
        deckName: "",
    });

    const handleDeckClick = (deck: DeckState) => {
        console.log("选择牌组:", deck.deckName);
        setCurrentPage("review");
    };

    const handleSettingsClick = (deckName: string, fullPath: string) => {
        console.log("打开设置:", deckName, fullPath);
        setSettingsModal({ isOpen: true, deckName });
    };

    return (
        <div className="App relative bg-zinc-950 min-h-screen">
            {/* 页面切换按钮 */}
            <div className="fixed top-4 left-4 z-[200] flex gap-2 bg-zinc-900/80 backdrop-blur-md p-1.5 rounded-lg border border-white/10 shadow-xl">
                <button
                    onClick={() => setCurrentPage("decks")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        currentPage === "decks"
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                    }`}
                >
                    📚 卡组选择
                </button>
                <button
                    onClick={() => setCurrentPage("review")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        currentPage === "review"
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                    }`}
                >
                    📝 复习卡片
                </button>
                <button
                    onClick={() => setCurrentPage("latex")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        currentPage === "latex"
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                    }`}
                >
                    📐 LaTeX 演示
                </button>
                <button
                    onClick={() => setCurrentPage("sidebar")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        currentPage === "sidebar"
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                    }`}
                >
                    📑 Sidebar
                </button>
            </div>

            {/* 页面内容 */}
            {currentPage === "decks" && (
                <div className="min-h-screen bg-zinc-950 flex items-start justify-center p-6 pt-20">
                    <DeckTree
                        decks={MOCK_DECKS}
                        onDeckClick={handleDeckClick}
                        onSettingsClick={handleSettingsClick}
                    />
                </div>
            )}
            {currentPage === "latex" && <SharpLatexDemo />}
            {currentPage === "review" && <LinearCard type="basic" />}
            {currentPage === "sidebar" && (
                <div className="flex h-screen w-full items-start justify-start bg-black">
                    <NewSidebar />
                    <div className="flex-1 h-full flex items-center justify-center text-zinc-500">
                        Content Area
                    </div>
                </div>
            )}

            {/* 设置弹窗 */}
            <DeckOptionsModal
                isOpen={settingsModal.isOpen}
                deckName={settingsModal.deckName}
                onClose={() => setSettingsModal({ isOpen: false, deckName: "" })}
                onSave={() => console.log("设置已保存")}
            />
        </div>
    );
}

export default App;
