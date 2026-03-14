import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    BarChart3,
    ChevronRight,
    Check,
} from "lucide-react";

// ==========================================
// 类型定义 & Mock 数据 (保持不变)
// ==========================================

export interface QueueItem {
    id: string;
    title: string;
    category: string;
    priority: number;
    dueLabel: string;
    dueColor: string;
}

export interface QueueSection {
    id: string;
    title: string;
    icon: "alert" | "calendar" | "check";
    color: string;
    items: QueueItem[];
}

export interface ReviewLog {
    id: string;
    message: string;
    timestamp: string;
}

export interface NewSidebarData {
    queue: QueueSection[];
}

export const MOCK_NEW_SIDEBAR_DATA: NewSidebarData = {
    queue: [
        {
            id: "overdue",
            title: "OVERDUE",
            icon: "alert",
            color: "text-red-500",
            items: [
                {
                    id: "o1",
                    title: "TLön, Uqbar, Orbis Tertius",
                    category: "Literature",
                    priority: 5,
                    dueLabel: "9d overdue",
                    dueColor: "text-red-400",
                },
                {
                    id: "o2",
                    title: "The Call of Cthulhu",
                    category: "Literature",
                    priority: 5,
                    dueLabel: "7d overdue",
                    dueColor: "text-red-400",
                },
                {
                    id: "o3",
                    title: "React Hooks Lifecycle",
                    category: "React",
                    priority: 3,
                    dueLabel: "3d overdue",
                    dueColor: "text-orange-400",
                },
                {
                    id: "o4",
                    title: "HTTP Status Codes",
                    category: "Web",
                    priority: 2,
                    dueLabel: "1d overdue",
                    dueColor: "text-orange-400",
                },
            ],
        },
        {
            id: "today",
            title: "DUE TODAY",
            icon: "calendar",
            color: "text-green-500",
            items: [
                {
                    id: "t1",
                    title: "RAG Architecture",
                    category: "AI",
                    priority: 1,
                    dueLabel: "Due today",
                    dueColor: "text-green-500",
                },
                {
                    id: "t2",
                    title: "Qwen 0.6B Parameters",
                    category: "AI",
                    priority: 1,
                    dueLabel: "Due today",
                    dueColor: "text-green-500",
                },
            ],
        },
    ],
};

// ==========================================
// 主组件
// ==========================================

type Tab = "queue" | "stats";

interface NewSidebarProps {
    data?: NewSidebarData;
    onItemClick?: (item: QueueItem) => void;
}

export const NewSidebar: React.FC<NewSidebarProps> = ({
    data = MOCK_NEW_SIDEBAR_DATA,
    onItemClick,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>("queue");
    const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);

    // 状态：抽屉是否展开
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);

    // 状态：抽屉的高度 (默认 300px)
    const [timelineHeight, setTimelineHeight] = useState(300);

    // 拖拽相关状态
    const isDraggingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    const handleItemClick = (item: QueueItem) => {
        setSelectedItem(item);
        setIsTimelineOpen(true);
        onItemClick?.(item);
    };

    const toggleTimeline = () => {
        setIsTimelineOpen(!isTimelineOpen);
    };

    // --- 拖拽逻辑 ---
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // 防止选中文本
        isDraggingRef.current = true;
        startYRef.current = e.clientY;
        startHeightRef.current = timelineHeight;

        document.body.style.cursor = "row-resize"; // 强制全局鼠标样式
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;

        // 计算偏移量：向上拖动 (y减小) -> 高度增加
        const deltaY = startYRef.current - e.clientY;
        const newHeight = startHeightRef.current + deltaY;

        // 限制最小和最大高度
        // 最小 100px，最大 600px (或者视口高度的 80%)
        const clampedHeight = Math.max(100, Math.min(newHeight, window.innerHeight * 0.8));

        setTimelineHeight(clampedHeight);
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        document.body.style.cursor = ""; // 恢复鼠标样式
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    }, [handleMouseMove]);

    return (
        <div className="w-80 h-full max-h-screen bg-[#050505] border-r border-white/[0.08] flex flex-col font-sans text-zinc-300 select-none overflow-hidden">
            {/* 1. Header Tabs */}
            <div className="p-4 pb-2 flex-none">
                <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/[0.06]">
                    <TabButton
                        isActive={activeTab === "queue"}
                        onClick={() => setActiveTab("queue")}
                        label="Queue"
                    />
                    <TabButton
                        isActive={activeTab === "stats"}
                        onClick={() => setActiveTab("stats")}
                        label="Stats"
                    />
                </div>
            </div>

            {/* 2. List Content (Upper Pane) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-6 min-h-0">
                <AnimatePresence mode="wait">
                    {activeTab === "queue" ? (
                        <motion.div
                            key="queue"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-6 pb-4"
                        >
                            {data.queue.map((section) => (
                                <SectionGroup
                                    key={section.id}
                                    section={section}
                                    selectedId={selectedItem?.id || null}
                                    onItemClick={handleItemClick}
                                />
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="stats"
                            className="flex flex-col items-center justify-center h-64 text-zinc-600"
                        >
                            <BarChart3 size={48} className="mb-4 opacity-30" />
                            <span className="text-sm">统计功能即将推出</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 3. Bottom Drawer: Timeline / Commit Log */}
            {/* 
               拖拽把手 (Sash)
               仅在展开时显示，并且高度稍微加宽一点便于点击，视觉上只有1px 
            */}
            {isTimelineOpen && (
                <div
                    onMouseDown={handleMouseDown}
                    className="h-1 -mt-0.5 w-full cursor-row-resize z-10 hover:bg-[#0078d4] transition-colors flex items-center justify-center group"
                >
                    {/* 可选：显示一个小把手图标 */}
                    <div className="w-8 h-0.5 bg-transparent group-hover:bg-white/20 rounded-full"></div>
                </div>
            )}

            <div
                className="flex-none border-t border-[#2b2b2b] bg-[#181818]"
                style={{
                    // 动态高度，但如果折叠了，高度由内容决定（仅显示标题栏）
                    height: isTimelineOpen ? `${timelineHeight}px` : "auto",
                }}
            >
                <TimelinePane
                    isOpen={isTimelineOpen}
                    onToggle={toggleTimeline}
                    selectedItem={selectedItem}
                />
            </div>
        </div>
    );
};

// ==========================================
// 底部 Timeline 抽屉组件
// ==========================================

interface TimelinePaneProps {
    isOpen: boolean;
    onToggle: () => void;
    selectedItem: QueueItem | null;
}

const TimelinePane: React.FC<TimelinePaneProps> = ({ isOpen, onToggle, selectedItem }) => {
    const [logs, setLogs] = useState<ReviewLog[]>([]);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (selectedItem) {
            setLogs([
                {
                    id: "1",
                    message: `Initialized review for ${selectedItem.title}`,
                    timestamp: "2 days ago",
                },
                { id: "2", message: "Initial memory consolidation", timestamp: "5 days ago" },
            ]);
            setMessage("");
        } else {
            setLogs([]);
        }
    }, [selectedItem]);

    const handleCommit = () => {
        if (!message.trim()) return;
        const newLog: ReviewLog = {
            id: Date.now().toString(),
            message: message.trim(),
            timestamp: "Just now",
        };
        setLogs([newLog, ...logs]);
        setMessage("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Ctrl + Enter 提交
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); // 防止换行
            handleCommit();
        }
        // 普通 Enter 默认会换行，这是 textarea 的原生行为，无需干预
    };

    return (
        <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div
                className="h-[22px] flex-none flex items-center px-1 bg-[#181818] cursor-pointer hover:bg-[#1f1f1f] select-none group border-b border-[#2b2b2b]"
                onClick={onToggle}
            >
                <div className="w-4 h-4 flex items-center justify-center text-[#cccccc] opacity-80 group-hover:opacity-100">
                    <ChevronRight
                        size={14}
                        className={`transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                    />
                </div>
                <h3 className="text-[11px] font-bold text-[#cccccc] uppercase ml-1 truncate">
                    Timeline {selectedItem ? `: ${selectedItem.title}` : ""}
                </h3>
            </div>

            {/* Body */}
            {isOpen && (
                <div className="flex-1 flex flex-col min-h-0 bg-[#181818]">
                    {!selectedItem ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-[#6e7681]">
                            Select an item to view timeline.
                        </div>
                    ) : (
                        <>
                            {/* Input Area - Modified for Multiline */}
                            <div className="p-3 pb-2 flex-none">
                                <div className="bg-[#252526] border border-[#3c3c3c] focus-within:border-[#0078d4] rounded-[2px] mb-2 flex flex-col">
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Review message (Ctrl+Enter to commit)"
                                        className="
                                            w-full bg-transparent text-[13px] text-[#cccccc] placeholder-[#989898] 
                                            px-2 py-2 
                                            h-[80px] /* 增加默认高度 */
                                            min-h-[60px] max-h-[200px] /* 允许手动调整大小的范围 */
                                            resize-y /* 允许用户在textarea右下角拖拽垂直高度 */
                                            outline-none font-sans block
                                            leading-relaxed custom-scrollbar
                                        "
                                        spellCheck={false}
                                    />
                                </div>
                                <button
                                    onClick={handleCommit}
                                    disabled={!message.trim()}
                                    className={`
                                        w-full py-[4px] text-[11px] rounded-[2px] font-medium text-white flex items-center justify-center gap-1.5
                                        transition-colors
                                        ${message.trim() ? "bg-[#0078d4] hover:bg-[#026ec1]" : "bg-[#2b2b2b] text-[#858585] cursor-not-allowed"}
                                    `}
                                >
                                    <Check size={12} />
                                    <span>Commit (Ctrl+Enter)</span>
                                </button>
                            </div>

                            {/* Timeline List */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 pt-1">
                                <div className="relative border-l border-[#2b2b2b] ml-1.5 pl-4 space-y-4 pt-1">
                                    {logs.map((log) => (
                                        <div key={log.id} className="relative group">
                                            {/* Dot on the timeline */}
                                            <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#181818] border-2 border-[#59a4f9]"></div>

                                            <div className="flex flex-col">
                                                {/* 这里处理多行文本的显示: whitespace-pre-wrap */}
                                                <span className="text-[13px] text-[#cccccc] leading-snug whitespace-pre-wrap break-words">
                                                    {log.message}
                                                </span>
                                                <span className="text-[11px] text-[#868686] mt-1">
                                                    {log.timestamp}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {logs.length === 0 && (
                                        <div className="text-[11px] text-[#6e7681] italic">
                                            No history yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ==========================================
// Tab 按钮 (保持原样)
// ==========================================

interface TabButtonProps {
    isActive: boolean;
    onClick: () => void;
    label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ isActive, onClick, label }) => (
    <button
        onClick={onClick}
        className={`
            flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200
            ${
                isActive
                    ? "bg-[#1e1e1e] text-zinc-100 shadow-sm border border-white/[0.04]"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
            }
        `}
    >
        {label}
    </button>
);

// ==========================================
// 分组组件 (保持原样)
// ==========================================

interface SectionGroupProps {
    section: QueueSection;
    selectedId: string | null;
    onItemClick: (item: QueueItem) => void;
}

const SectionGroup: React.FC<SectionGroupProps> = ({ section, selectedId, onItemClick }) => {
    const iconMap = {
        alert: AlertTriangle,
        calendar: Calendar,
        check: CheckCircle2,
    };
    const Icon = iconMap[section.icon] || Calendar;

    return (
        <div>
            {/* Section Title */}
            <div className="flex items-center gap-2 mb-3 px-2">
                <Icon size={12} className={section.color} />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    {section.title}
                </span>
            </div>

            {/* Items */}
            <div className="space-y-1">
                {section.items.map((item) => (
                    <ListItem
                        key={item.id}
                        item={item}
                        isSelected={selectedId === item.id}
                        onClick={() => onItemClick(item)}
                    />
                ))}
            </div>
        </div>
    );
};

// ==========================================
// 单个列表项 (保持原样)
// ==========================================

interface ListItemProps {
    item: QueueItem;
    isSelected: boolean;
    onClick: () => void;
}

const ListItem: React.FC<ListItemProps> = ({ item, isSelected, onClick }) => {
    return (
        <motion.div
            onClick={onClick}
            whileTap={{ scale: 0.98 }}
            className={`
                group flex items-start gap-3 p-2.5 rounded-lg cursor-pointer
                border transition-all duration-200
                ${
                    isSelected
                        ? "bg-[#1a1a1a] border-white/[0.08]"
                        : "border-transparent hover:border-white/[0.04] hover:bg-[#121212]"
                }
            `}
        >
            <div
                className={`
                shrink-0 w-6 h-6 flex items-center justify-center rounded-md mt-0.5
                border transition-colors
                ${
                    isSelected
                        ? "border-green-500/50 bg-green-500/10 text-green-400"
                        : "border-zinc-700/50 bg-zinc-900/50 text-zinc-500 group-hover:border-zinc-600 group-hover:text-zinc-300"
                }
            `}
            >
                <span className="text-[11px] font-mono font-semibold">{item.priority}</span>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex justify-between items-baseline gap-2">
                    <span
                        className={`
                        text-sm font-medium truncate transition-colors
                        ${isSelected ? "text-white" : "text-zinc-300 group-hover:text-white"}
                    `}
                    >
                        {item.title}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-600 group-hover:text-zinc-500 truncate">
                        {item.category}
                    </span>
                    <span className={`text-[10px] font-medium shrink-0 ${item.dueColor}`}>
                        {item.dueLabel}
                    </span>
                </div>
            </div>
        </motion.div>
    );
};

export default NewSidebar;
