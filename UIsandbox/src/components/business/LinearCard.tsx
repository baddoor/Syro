import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    RotateCcw,
    ThumbsDown,
    Check,
    Zap,
    ChevronRight,
    MoreHorizontal,
    ArrowLeft,
    FileText,
    Edit3,
    Info,
    Clock,
    Trash2,
    Undo2,
} from "lucide-react";
import { CardState } from "../types";
import { CardDebugModal } from "./CardDebugModal";

interface LinearCardProps {
    card?: CardState;
    deckPath?: string;
    stats?: { new: number; learning: number; due: number };
    type?: "basic" | "cloze";
    breadcrumbs?: string[];
    filename?: string;
    autoAdvanceSeconds?: number;
    onAnswer?: (rating: number) => void;
    onShowAnswer?: () => void;
}

// 模拟 Toast 类型
type ToastMsg = { icon: React.ReactNode; text: string; id: number };

// 模拟详细调试数据
const MOCK_DEBUG_INFO = {
    basic: {
        nextReview: "2025-12-15 09:24:38",
        learningStep: "null",
        priority: 5,
        ID: 6035,
        fileIndex: 88,
        itemType: "card",
        deckName: "#我现在在关心，以及归档",
        timesReviewed: 1,
        timesCorrect: 1,
        errorStreak: 0,
    },
    data: {
        due: "Mon Dec 15 2025 09:24:38 GMT+0800",
        stability: 2.3065,
        difficulty: 2.1181,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 1,
        lapses: 0,
        learning_steps: 1,
        state: 1,
        last_review: "Wed Dec 10 2025 10:40:26 GMT+0800",
    },
};

export const LinearCard: React.FC<LinearCardProps> = ({
    card,
    stats: initialStats = { new: 45, learning: 12, due: 68 },
    type = "basic",
    breadcrumbs = ["编程", "JavaScript", "React"],
    filename = "React基础.md",
    autoAdvanceSeconds = 10,
    onAnswer,
    onShowAnswer,
}) => {
    const [stats, setStats] = useState(initialStats);
    const [currentType, setCurrentType] = useState<"new" | "learning" | "due">("learning");
    const [isFlipped, setIsFlipped] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [size, setSize] = useState({ width: 720, height: 520 });
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const [isDeleted, setIsDeleted] = useState(false);
    const [timeExpired, setTimeExpired] = useState(false);

    useEffect(() => {
        if (!isFlipped) {
            setTimeExpired(false);
        }
    }, [isFlipped]);

    const showToast = useCallback((text: string, icon: React.ReactNode) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { text, icon, id }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2000);
    }, []);

    const handleAnswerInternal = useCallback(
        (rating: number) => {
            if (isDeleted) return;
            const key =
                currentType === "new" ? "new" : currentType === "learning" ? "learning" : "due";
            setStats((prev) => ({
                ...prev,
                [key]: Math.max(0, prev[key] - 1),
            }));
            const types: ("new" | "learning" | "due")[] = ["new", "learning", "due"];
            const nextType =
                Math.random() > 0.6 ? types[Math.floor(Math.random() * types.length)] : currentType;
            setCurrentType(nextType);
            setIsFlipped(false);
            onAnswer?.(rating);
        },
        [currentType, isDeleted, onAnswer],
    );

    const handleMenuAction = useCallback(
        (action: string) => {
            setShowMenu(false);
            switch (action) {
                case "UNDO":
                    showToast("已撤销上一次操作", <Undo2 size={14} />);
                    break;
                case "OPEN":
                    showToast("已在 Obsidian 中打开", <FileText size={14} />);
                    break;
                case "EDIT":
                    showToast("进入编辑模式", <Edit3 size={14} />);
                    break;
                case "INFO":
                    setShowInfo((prev) => !prev);
                    break;
                case "POSTPONE":
                    showToast("卡片已推迟 1 天", <Clock size={14} />);
                    handleAnswerInternal(0);
                    break;
                case "DELETE":
                    setIsDeleted(true);
                    setTimeout(() => {
                        setIsDeleted(false);
                        handleAnswerInternal(0);
                        showToast("卡片已删除", <Trash2 size={14} />);
                    }, 600);
                    break;
            }
        },
        [handleAnswerInternal, showToast],
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
                return;

            switch (e.key.toLowerCase()) {
                case " ":
                    e.preventDefault();
                    if (!isFlipped) {
                        setIsFlipped(true);
                        onShowAnswer?.();
                    } else {
                        handleAnswerInternal(2);
                    }
                    break;
                case "u":
                    handleMenuAction("UNDO");
                    break;
                case "1":
                    if (isFlipped) handleAnswerInternal(0);
                    break;
                case "2":
                    if (isFlipped) handleAnswerInternal(1);
                    break;
                case "3":
                    if (isFlipped) handleAnswerInternal(2);
                    break;
                case "4":
                    if (isFlipped) handleAnswerInternal(3);
                    break;
                case "o":
                    handleMenuAction("OPEN");
                    break;
                case "e":
                    handleMenuAction("EDIT");
                    break;
                case "i":
                    handleMenuAction("INFO");
                    break;
                case "p":
                    handleMenuAction("POSTPONE");
                    break;
                case "delete":
                case "backspace":
                    handleMenuAction("DELETE");
                    break;
                case "escape":
                    if (showInfo) setShowInfo(false);
                    if (showMenu) setShowMenu(false);
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFlipped, handleAnswerInternal, handleMenuAction, onShowAnswer, showInfo, showMenu]);

    const handleResizeStart = (e: React.MouseEvent, direction: "x" | "y") => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = size.width;
        const startHeight = size.height;

        const doDrag = (dragEvent: MouseEvent) => {
            if (direction === "x") {
                const delta = (dragEvent.clientX - startX) * 2;
                setSize((s) => ({ ...s, width: Math.max(500, startWidth + delta) }));
            } else {
                const delta = (dragEvent.clientY - startY) * 2;
                setSize((s) => ({ ...s, height: Math.max(400, startHeight + delta) }));
            }
        };

        const stopDrag = () => {
            document.removeEventListener("mousemove", doDrag);
            document.removeEventListener("mouseup", stopDrag);
            document.body.style.cursor = "";
        };

        document.addEventListener("mousemove", doDrag);
        document.addEventListener("mouseup", stopDrag);
        document.body.style.cursor = direction === "x" ? "ew-resize" : "ns-resize";
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#09090b] text-zinc-600 dark:text-zinc-300 font-sans flex items-center justify-center p-6 relative select-none overflow-hidden transition-colors duration-300">
            {/* Toast 容器 */}
            <div className="fixed bottom-10 inset-x-0 flex flex-col items-center gap-2 z-[100] pointer-events-none">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 dark:bg-[#252628] border border-white/10 rounded-full text-xs text-zinc-200 shadow-2xl backdrop-blur-md"
                        >
                            {toast.icon}
                            <span>{toast.text}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* 卡片本体 */}
            <motion.div
                layout
                animate={
                    isDeleted
                        ? {
                              opacity: 0,
                              scale: 0.9,
                              y: 20,
                              filter: "blur(8px)",
                          }
                        : {
                              opacity: 1,
                              scale: 1,
                              y: 0,
                              filter: "blur(0px)",
                          }
                }
                transition={{ duration: 0.2 }}
                style={{ width: size.width, height: size.height }}
                className="
          flex flex-col
          bg-white dark:bg-[#121212] 
          border border-zinc-200 dark:border-white/[0.08] 
          rounded-xl 
          shadow-xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
          relative z-10 group
          overflow-hidden
          transition-colors duration-300
        "
            >
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-white/[0.08] to-transparent pointer-events-none z-20" />

                {/* Header - 按插件布局调整 */}
                <div className="h-12 px-3 sm:px-4 border-b border-zinc-100 dark:border-white/[0.06] flex justify-between items-center bg-white/50 dark:bg-[#121212] shrink-0 relative z-30 gap-2 sm:gap-4">
                    {/* 左侧：返回按钮 + 面包屑 */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                        {/* 返回按钮 */}
                        <button
                            onClick={() => showToast("返回牌组选择", <ArrowLeft size={14} />)}
                            className="shrink-0 p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                            title="返回"
                        >
                            <ArrowLeft size={16} />
                        </button>

                        {/* 面包屑区域 */}
                        <div className="flex items-center min-w-0 text-xs text-zinc-400 dark:text-zinc-500 font-mono gap-1.5">
                            {/* 文件名 badge (在最前面) */}
                            <div
                                onClick={() => handleMenuAction("OPEN")}
                                className="shrink-0 flex items-center gap-1.5 bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 px-2 py-0.5 rounded-md cursor-pointer group/name hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors"
                            >
                                <FileText
                                    size={10}
                                    className="shrink-0 text-zinc-500 dark:text-zinc-500 group-hover/name:text-zinc-700 dark:group-hover/name:text-zinc-300"
                                />
                                <span className="text-zinc-600 dark:text-zinc-200 font-medium">
                                    {filename
                                        .replace(/\.md$/i, "")
                                        .split("/")
                                        .pop()
                                        ?.split("\\")
                                        .pop() || filename}
                                </span>
                            </div>

                            {/* 面包屑路径：移动端隐藏 */}
                            <div className="hidden sm:flex items-center gap-1.5 overflow-hidden min-w-0">
                                {breadcrumbs.map((crumb, index) => (
                                    <React.Fragment key={index}>
                                        <ChevronRight size={10} className="opacity-40 shrink-0" />
                                        <span className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer truncate max-w-[80px]">
                                            {crumb}
                                        </span>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 右侧：状态计数器 + 更多菜单 */}
                    <div className="shrink-0 flex items-center gap-2 sm:gap-3">
                        {/* 药丸计数器 */}
                        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-black/40 p-0.5 rounded-lg border border-zinc-200 dark:border-white/[0.06]">
                            <StatBadge
                                type="new"
                                count={stats.new}
                                isActive={currentType === "new"}
                                bg="bg-blue-500"
                                color="text-blue-500 dark:text-blue-400"
                            />
                            <div className="w-px h-3 bg-zinc-300 dark:bg-white/[0.08] mx-0.5" />
                            <StatBadge
                                type="learn"
                                count={stats.learning}
                                isActive={currentType === "learning"}
                                bg="bg-orange-500"
                                color="text-orange-500 dark:text-orange-400"
                            />
                            <div className="w-px h-3 bg-zinc-300 dark:bg-white/[0.08] mx-0.5" />
                            <StatBadge
                                type="due"
                                count={stats.due}
                                isActive={currentType === "due"}
                                bg="bg-emerald-500"
                                color="text-emerald-500 dark:text-emerald-400"
                            />
                        </div>

                        {/* 更多菜单按钮 */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className={`p-1.5 rounded-md transition-colors ${showMenu ? "bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-zinc-200" : "hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                            >
                                <MoreHorizontal size={16} />
                            </button>

                            <AnimatePresence>
                                {showMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowMenu(false)}
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                            transition={{ duration: 0.1 }}
                                            className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#18181A] border border-zinc-200 dark:border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden origin-top-right text-zinc-600 dark:text-zinc-300"
                                        >
                                            <MenuItem
                                                onClick={() => handleMenuAction("UNDO")}
                                                icon={<Undo2 size={14} />}
                                                label="撤销"
                                                kbd="U"
                                            />
                                            <div className="h-px bg-zinc-100 dark:bg-white/[0.08] my-1" />
                                            <MenuItem
                                                onClick={() => handleMenuAction("OPEN")}
                                                icon={<FileText size={14} />}
                                                label="打开位置"
                                                kbd="O"
                                            />
                                            <MenuItem
                                                onClick={() => handleMenuAction("EDIT")}
                                                icon={<Edit3 size={14} />}
                                                label="编辑卡片"
                                                kbd="E"
                                            />
                                            <MenuItem
                                                onClick={() => handleMenuAction("INFO")}
                                                icon={<Info size={14} />}
                                                label="卡片信息"
                                                kbd="I"
                                            />
                                            <MenuItem
                                                onClick={() => handleMenuAction("POSTPONE")}
                                                icon={<Clock size={14} />}
                                                label="推迟一天"
                                                kbd="P"
                                            />
                                            <div className="h-px bg-zinc-100 dark:bg-white/[0.08] my-1" />
                                            <MenuItem
                                                onClick={() => handleMenuAction("DELETE")}
                                                icon={<Trash2 size={14} />}
                                                label="删除卡片"
                                                intent="danger"
                                                kbd="Del"
                                            />
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* 极简时间条 */}
                <div className="h-[2px] w-full bg-zinc-100 dark:bg-white/[0.04] relative overflow-hidden shrink-0">
                    <AnimatePresence mode="wait">
                        {!isFlipped && (
                            <TimerBar
                                duration={autoAdvanceSeconds}
                                onComplete={() => {
                                    setTimeExpired(true);
                                    setIsFlipped(true);
                                    onShowAnswer?.();
                                }}
                                timeExpired={timeExpired}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* 面包屑路径 - 移动端在正文上方显示，无边框无分隔符 */}
                <div className="sm:hidden px-4 pt-3 pb-1">
                    <div className="flex items-center gap-2 text-[13px] text-zinc-400 dark:text-zinc-500 font-mono overflow-x-auto">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && <span className="opacity-40">/</span>}
                                <span className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer whitespace-nowrap">
                                    {crumb}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative flex flex-col bg-white dark:bg-[#121212]">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 sm:p-10">
                        {type === "cloze" ? (
                            <ClozeContent isFlipped={isFlipped} />
                        ) : (
                            <BasicContent
                                isFlipped={isFlipped}
                                card={card || ({ front: "Q", back: "A" } as any)}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 bg-zinc-50 dark:bg-[#121212] border-t border-zinc-100 dark:border-white/[0.06] shrink-0 z-30">
                    <AnimatePresence mode="wait" initial={false}>
                        {!isFlipped ? (
                            <motion.div
                                key="show-answer"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.1 }}
                            >
                                <button
                                    onClick={() => {
                                        setIsFlipped(true);
                                        onShowAnswer?.();
                                    }}
                                    className="w-full py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-medium text-sm hover:bg-blue-500/20 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                                >
                                    显示答案{" "}
                                    <span className="text-[10px] opacity-60 font-mono ml-1">
                                        SPACE
                                    </span>
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="rating-buttons"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.1 }}
                                className="grid grid-cols-4 gap-3"
                            >
                                {/* Modified LinearButtons with requested style */}
                                <LinearButton
                                    icon={<RotateCcw size={12} />}
                                    label="重来"
                                    sub={card?.responseButtonLabels?.[0] || "1m"}
                                    shortcut="1"
                                    onClick={() => handleAnswerInternal(0)}
                                    colorClass="text-zinc-400 group-hover/btn:text-red-400"
                                />
                                <LinearButton
                                    icon={<ThumbsDown size={12} />}
                                    label="较难"
                                    sub={card?.responseButtonLabels?.[1] || "10m"}
                                    shortcut="2"
                                    onClick={() => handleAnswerInternal(1)}
                                    colorClass="text-zinc-400 group-hover/btn:text-orange-400"
                                />
                                <LinearButton
                                    icon={<Check size={12} />}
                                    label="记得"
                                    sub={card?.responseButtonLabels?.[2] || "3d"}
                                    shortcut="3"
                                    onClick={() => handleAnswerInternal(2)}
                                    colorClass="text-zinc-400 group-hover/btn:text-green-400"
                                />
                                <LinearButton
                                    icon={<Zap size={12} />}
                                    label="简单"
                                    sub={card?.responseButtonLabels?.[3] || "7d"}
                                    shortcut="4"
                                    onClick={() => handleAnswerInternal(3)}
                                    colorClass="text-zinc-400 group-hover/btn:text-blue-400"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 隐形对称手柄 */}
                <div
                    className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/10 transition-colors z-50 opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => handleResizeStart(e, "x")}
                />
                <div
                    className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/10 transition-colors z-50 opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => handleResizeStart(e, "y")}
                />
            </motion.div>

            {/* Card Debug Modal */}
            <CardDebugModal
                isOpen={showInfo}
                onClose={() => setShowInfo(false)}
                data={MOCK_DEBUG_INFO}
            />
        </div>
    );
};

// ==========================================
// 辅助组件
// ==========================================

const TimerBar = ({
    duration,
    onComplete,
    timeExpired,
}: {
    duration: number;
    onComplete: () => void;
    timeExpired: boolean;
}) => (
    <motion.div
        initial={{ width: "0%", opacity: 1 }}
        animate={{
            width: "100%",
            backgroundColor: ["#3b82f6", "#3b82f6", "#ef4444"],
        }}
        exit={
            timeExpired
                ? { opacity: 0, transition: { duration: 0.3 } }
                : { width: "0%", transition: { duration: 0.3, ease: "circOut" } }
        }
        transition={{
            width: { duration: duration, ease: "linear" },
            backgroundColor: { times: [0, 0.7, 1], duration: duration, ease: "linear" },
        }}
        onAnimationComplete={(definition) => {
            if (
                definition === "animate" ||
                (typeof definition === "object" &&
                    "width" in definition &&
                    definition.width === "100%")
            ) {
                onComplete();
            }
        }}
        className="h-full absolute left-0 top-0 bg-blue-500"
    />
);

// ==========================================
// StatBadge - 移动端变色数字，桌面端带圆点
// ==========================================
const StatBadge = ({ type, count, isActive, bg, color }: any) => (
    <div className="relative">
        {isActive && (
            <motion.div
                layoutId="badge-highlight"
                className="absolute inset-0 bg-zinc-200 dark:bg-white/[0.08] border border-transparent dark:border-white/[0.05] rounded-md shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
        )}
        <div
            className={`
            relative z-10 flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-md transition-all duration-200
            ${isActive ? "" : "opacity-40 hover:opacity-70"}
        `}
        >
            {/* 状态圆点 - 移动端隐藏 */}
            <span
                className={`hidden sm:inline-block w-1.5 h-1.5 rounded-full shrink-0 ${bg}`}
            ></span>

            <div className="flex items-center gap-1.5">
                {/* 移动端隐藏文字标签 */}
                <span
                    className={`hidden sm:inline text-[10px] font-bold uppercase tracking-wider ${isActive ? color : "text-zinc-500 dark:text-zinc-500"}`}
                >
                    {type}
                </span>

                {/* 数字容器 - 移动端带颜色 */}
                <div className="relative h-4 min-w-[14px] overflow-hidden font-mono text-xs font-medium">
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                            key={count}
                            initial={{ y: 15, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -15, opacity: 0 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className={`absolute inset-0 flex items-center justify-center ${
                                isActive
                                    ? `${color} sm:text-zinc-800 sm:dark:text-zinc-200`
                                    : "text-zinc-500"
                            }`}
                        >
                            {count}
                        </motion.span>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    </div>
);

const MenuItem = ({ icon, label, kbd, intent = "neutral", onClick }: any) => {
    const colors =
        intent === "danger"
            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5";
    return (
        <button
            onClick={onClick}
            className={`w-full px-3 py-1.5 flex items-center justify-between text-xs transition-colors ${colors}`}
        >
            <div className="flex items-center gap-2">
                <span className="opacity-70">{icon}</span>
                <span>{label}</span>
            </div>
            {kbd && (
                <span className="text-[10px] font-mono opacity-40 border border-current px-1 rounded min-w-[18px] text-center">
                    {kbd}
                </span>
            )}
        </button>
    );
};

// ==========================================
// 修改后的 LinearButton - 水平布局，图标在左
// ==========================================
const LinearButton = ({
    icon,
    label,
    sub,
    shortcut,
    onClick,
    colorClass = "text-zinc-400 group-hover/btn:text-zinc-200",
}: any) => {
    return (
        <button
            onClick={onClick}
            className={`
                group/btn relative flex items-start justify-center gap-1.5
                py-1.5 px-2 rounded-[6px]
                bg-white dark:bg-[rgb(18,18,18)] 
                border border-zinc-200 dark:border-white/10
                hover:dark:bg-white/5 
                transition-all duration-200 
                active:scale-[0.98]
                shadow-sm dark:shadow-none
            `}
        >
            {/* Shortcut indicator */}
            <span className="absolute top-1 right-1.5 text-[9px] font-mono text-zinc-300 dark:text-zinc-600 opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {shortcut}
            </span>

            {/* Icon */}
            <div
                className={`${colorClass} opacity-80 group-hover/btn:opacity-100 transition-all transform group-hover/btn:scale-110 duration-200 shrink-0 mt-0.5`}
            >
                {icon}
            </div>

            {/* Label + Sub */}
            <div className="flex flex-col items-start min-w-0">
                <span className="text-xs font-semibold tracking-wide text-zinc-700 dark:text-zinc-300 group-hover/btn:dark:text-white">
                    {label}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tracking-tight">
                    {sub}
                </span>
            </div>
        </button>
    );
};

const ClozeContent = ({ isFlipped }: { isFlipped: boolean }) => (
    <div className="text-lg leading-relaxed text-zinc-800 dark:text-zinc-300 space-y-6">
        <ul className="space-y-6 list-none">
            <li className="relative pl-6 before:content-['•'] before:absolute before:left-0 before:text-zinc-400 dark:before:text-zinc-600 text-zinc-600 dark:text-zinc-200">
                英雄联盟和无畏契约，对我来讲属于两种不同的游戏。
            </li>
            <li className="relative pl-6 before:content-['•'] before:absolute before:left-0 before:text-zinc-400 dark:before:text-zinc-600">
                <span>联盟基本上从未玩过娱乐外的模式。</span>
                <motion.span
                    layout
                    className={`inline-flex items-center justify-center mx-1.5 px-2.5 py-0.5 rounded-md text-sm font-bold min-w-[3rem] h-[1.8em] transition-all duration-200 ${isFlipped ? "bg-blue-100 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.1)]" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"}`}
                >
                    <AnimatePresence mode="wait">
                        {isFlipped ? (
                            <motion.span key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                听歌
                            </motion.span>
                        ) : (
                            <motion.span
                                key="m"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="tracking-widest font-mono text-[11px]"
                            >
                                [...]
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.span>
                <span>，随便打打真是惬意。</span>
            </li>
            <li className="relative pl-6 before:content-['•'] before:absolute before:left-0 before:text-zinc-400 dark:before:text-zinc-600 opacity-60">
                而瓦罗兰特则需要时刻全神贯注，调动视力和听力...
            </li>
        </ul>
    </div>
);

const BasicContent = ({ isFlipped, card }: { isFlipped: boolean; card: CardState }) => (
    <div className="flex flex-col gap-8">
        <div>
            <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mb-2 uppercase tracking-wider">
                Question
            </div>
            <div
                className="text-xl font-medium text-zinc-800 dark:text-zinc-100 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: card.front || "Question Content" }}
            />
        </div>
        <AnimatePresence>
            {isFlipped && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="overflow-hidden"
                >
                    <div className="w-full h-px bg-zinc-200 dark:bg-white/[0.08] mb-6" />
                    <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mb-2 uppercase tracking-wider">
                        Answer
                    </div>
                    <div
                        className="text-zinc-600 dark:text-zinc-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: card.back || "Answer Content" }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);
