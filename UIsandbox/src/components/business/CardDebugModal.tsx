import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Copy, Hash, Calendar, Tag, Activity, Database, AlertCircle } from "lucide-react";

interface CardDebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
}

export const CardDebugModal: React.FC<CardDebugModalProps> = ({ isOpen, onClose, data }) => {
    const [formData, setFormData] = useState(data);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* 1. 遮罩层 (纯黑半透明，聚焦视线) */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                    />

                    {/* 2. 模态框本体 (Linear 风格：实心、深色、精细边框) */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="
              relative w-full max-w-2xl max-h-[85vh] 
              bg-white dark:bg-[#1C1C1F] 
              border border-zinc-200 dark:border-white/[0.08] 
              rounded-xl shadow-2xl flex flex-col overflow-hidden
              text-zinc-800 dark:text-zinc-200
            "
                    >
                        {/* Header */}
                        <div className="h-12 px-5 border-b border-zinc-200 dark:border-white/[0.06] flex justify-between items-center bg-zinc-50 dark:bg-[#202124] shrink-0">
                            <div className="flex items-center gap-2">
                                <Database size={14} className="text-blue-500" />
                                <span className="text-sm font-bold tracking-tight">
                                    Item Debug Info
                                </span>
                                <span className="text-xs font-mono text-zinc-400 px-1.5 py-0.5 bg-zinc-200 dark:bg-white/10 rounded">
                                    ID: {data.basic.ID}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 transition-colors"
                                    title="Copy JSON"
                                >
                                    <Copy size={14} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Content (Scrollable) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                            {/* Section 1: 关键属性 (Identity) */}
                            <Section title="Identity & Context" icon={<Tag size={12} />}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <DebugField label="File Index" value={data.basic.fileIndex} />
                                    <DebugField label="Type" value={data.basic.itemType} />
                                    <DebugField label="Deck" value={data.basic.deckName} isBadge />
                                    <DebugField label="Priority" value={data.basic.priority} />
                                </div>
                            </Section>

                            {/* Section 2: 统计数据 (Stats) */}
                            <div className="h-px bg-zinc-100 dark:bg-white/[0.04] mx-5" />
                            <Section title="Statistics" icon={<Activity size={12} />}>
                                <div className="grid grid-cols-3 gap-4">
                                    <StatBox label="Reviewed" value={data.basic.timesReviewed} />
                                    <StatBox
                                        label="Correct"
                                        value={data.basic.timesCorrect}
                                        color="text-green-500"
                                    />
                                    <StatBox
                                        label="Streak"
                                        value={data.basic.errorStreak}
                                        color="text-orange-500"
                                    />
                                </div>
                            </Section>

                            {/* Section 3: 算法数据 (Editable Area) */}
                            <div className="h-px bg-zinc-100 dark:bg-white/[0.04] mx-5" />
                            <Section title="Algorithm Data (FSRS)" icon={<Hash size={12} />}>
                                <div className="space-y-3">
                                    {/* 可编辑的日期字段 */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                            <Calendar size={10} /> Next Review
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="
                           w-full bg-zinc-100 dark:bg-[#121212] 
                           border border-zinc-200 dark:border-white/10 
                           rounded px-3 py-1.5 
                           text-sm font-mono text-zinc-700 dark:text-zinc-300
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
                           transition-all
                         "
                                            defaultValue="2025-12-15T09:24"
                                        />
                                    </div>

                                    {/* 密集数据网格 */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                                        <DebugInput label="Stability" value={data.data.stability} />
                                        <DebugInput
                                            label="Difficulty"
                                            value={data.data.difficulty}
                                        />
                                        <DebugInput label="Reps" value={data.data.reps} />
                                        <DebugInput
                                            label="Lapses"
                                            value={data.data.lapses}
                                            intent="danger"
                                        />
                                        <DebugInput label="State" value={data.data.state} />
                                        <DebugInput
                                            label="Elapsed"
                                            value={data.data.elapsed_days + "d"}
                                            readOnly
                                        />
                                    </div>
                                </div>
                            </Section>

                            {/* Raw JSON Preview (Optional, for true debugging) */}
                            <div className="p-5 bg-zinc-50/50 dark:bg-black/20 border-t border-zinc-100 dark:border-white/[0.04]">
                                <div className="text-[10px] font-bold text-zinc-400 mb-2 uppercase">
                                    Raw Data
                                </div>
                                <pre className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 overflow-x-auto whitespace-pre-wrap break-words">
                                    {JSON.stringify(data.data, null, 2)}
                                </pre>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#202124] flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
                                <AlertCircle size={12} />
                                <span>修改算法参数可能影响复习排程</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
                                >
                                    <Save size={12} /> Save Changes
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// --- Sub Components ---

const Section = ({ title, icon, children }: any) => (
    <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
            <span className="text-zinc-400">{icon}</span>
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {title}
            </h3>
        </div>
        {children}
    </div>
);

const DebugField = ({ label, value, isBadge }: any) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] text-zinc-500 uppercase font-medium">{label}</span>
        {isBadge ? (
            <div className="self-start px-1.5 py-0.5 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded text-xs font-mono border border-blue-500/20">
                {value}
            </div>
        ) : (
            <div className="text-sm font-mono text-zinc-800 dark:text-zinc-200 break-all">
                {value}
            </div>
        )}
    </div>
);

const StatBox = ({ label, value, color = "text-zinc-800 dark:text-zinc-200" }: any) => (
    <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-lg p-2.5 flex flex-col items-center">
        <span className="text-[10px] text-zinc-500 uppercase font-bold">{label}</span>
        <span className={`text-lg font-mono font-bold ${color}`}>{value}</span>
    </div>
);

const DebugInput = ({ label, value, readOnly, intent }: any) => (
    <div className="flex flex-col gap-1">
        <span
            className={`text-[10px] uppercase font-bold ${intent === "danger" ? "text-red-400" : "text-zinc-500"}`}
        >
            {label}
        </span>
        <input
            type="text"
            defaultValue={value}
            readOnly={readOnly}
            className={`
        w-full bg-zinc-100 dark:bg-[#121212] 
        border ${intent === "danger" ? "border-red-500/30 focus:border-red-500" : "border-zinc-200 dark:border-white/10 focus:border-blue-500"}
        rounded px-2 py-1 
        text-xs font-mono text-zinc-700 dark:text-zinc-300
        focus:outline-none focus:ring-1 focus:ring-blue-500/50
        transition-all
        ${readOnly ? "opacity-50 cursor-not-allowed" : ""}
      `}
        />
    </div>
);

export default CardDebugModal;
