import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight,
    MoreHorizontal,
    FileText,
    Search,
    Filter,
    Plus,
    FolderOpen,
} from "lucide-react";
import { MOCK_SIDEBAR_DATA } from "../mockData";
import { SidebarItem, SidebarSection } from "../types";

// ==========================================
// Sidebar 主容器 (日夜模式适配)
// ==========================================
export const Sidebar = () => {
    return (
        <div className="w-64 h-full bg-gray-50 dark:bg-[#121212] border-r border-zinc-200 dark:border-white/[0.06] flex flex-col select-none transition-colors duration-300">
            {/* 1. Header & Actions */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-200 dark:border-white/[0.04] shrink-0">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-300 tracking-wide">
                    Review Queue
                </span>
                <div className="flex items-center gap-1">
                    <IconButton icon={<Search size={14} />} />
                    <IconButton icon={<Filter size={14} />} />
                    <IconButton icon={<Plus size={14} />} />
                </div>
            </div>

            {/* 2. Scrollable List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {MOCK_SIDEBAR_DATA.map((section) => (
                    <SectionGroup key={section.id} section={section} />
                ))}
            </div>

            {/* 3. Footer / Status */}
            <div className="p-3 border-t border-zinc-200 dark:border-white/[0.04] text-[10px] text-zinc-400 dark:text-zinc-600 font-mono flex justify-between bg-zinc-100/50 dark:bg-transparent">
                <span>Total: 25 notes</span>
                <span>Synced</span>
            </div>
        </div>
    );
};

// ==========================================
// 分组组件 (可折叠 + 适配主题)
// ==========================================
const SectionGroup = ({ section }: { section: SidebarSection }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="mb-2">
            {/* Group Header */}
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="
          group flex items-center justify-between px-2 py-1.5 
          rounded-md cursor-pointer transition-colors
          hover:bg-zinc-200 dark:hover:bg-white/[0.04] 
          text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300
        "
            >
                <div className="flex items-center gap-1.5">
                    <motion.div
                        animate={{ rotate: isCollapsed ? 0 : 90 }}
                        transition={{ duration: 0.15 }}
                    >
                        <ChevronRight size={12} />
                    </motion.div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${section.color}`}>
                        {section.title}
                    </span>
                </div>
                <span className="text-[10px] font-mono opacity-50 group-hover:opacity-100 text-zinc-500 dark:text-zinc-500">
                    {section.count}
                </span>
            </div>

            {/* Group Items */}
            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-0.5 ml-2 pl-2 border-l border-zinc-200 dark:border-white/[0.04] py-1">
                            {section.items.map((item) => (
                                <NoteItem key={item.id} item={item} colorClass={section.color} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ==========================================
// 单个笔记项组件 (去光晕 + 适配主题)
// ==========================================
const NoteItem = ({ item, colorClass }: { item: SidebarItem; colorClass: string }) => {
    return (
        <div
            className="
      group flex items-center justify-between 
      px-2 py-1.5 rounded-md 
      cursor-pointer transition-all duration-150
      hover:bg-zinc-200 dark:hover:bg-white/[0.06] active:bg-zinc-300 dark:active:bg-white/[0.08]
    "
        >
            <div className="flex items-center gap-2.5 overflow-hidden">
                {/* Priority Badge (纯文字，无背景) */}
                <span
                    className={`
          shrink-0 font-mono text-[10px] font-bold 
          ${colorClass} opacity-80 group-hover:opacity-100
        `}
                >
                    [{item.priority}]
                </span>

                {/* Title */}
                <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 truncate transition-colors">
                    {item.title}
                </span>
            </div>

            {/* Hover Menu Trigger */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal
                    size={14}
                    className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-200"
                />
            </div>
        </div>
    );
};

// ==========================================
// 辅助小组件 (按钮适配)
// ==========================================
const IconButton = ({ icon }: { icon: React.ReactNode }) => (
    <button className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-md transition-colors">
        {icon}
    </button>
);
