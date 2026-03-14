/** @jsxImportSource react */
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Merge, SplitSquareHorizontal, Layers } from "lucide-react";

// =========================================
// 定义文本片段类型
// =========================================
interface Segment {
    id: string;
    text: string;
    clozeId?: string;
}

interface ClozeGroup {
    id: string;
    content: string;
    count: number;
}

// 初始数据
const INITIAL_SEGMENTS: Segment[] = [
    { id: "s1", text: "此处，" },
    { id: "s2", text: "压力", clozeId: "3" },
    { id: "s3", text: "指的是因快速变" },
    { id: "s4", text: "化导致压力激素（儿茶酚胺、ACTH、皮质醇等）的增加", clozeId: "3" },
    { id: "s5", text: "。化可能来自冲突、疾病、亲属去世或失业。如果十年时间吓到了你，请记住" },
    { id: "s6", text: "严格", clozeId: "1" },
    { id: "s7", text: "地遵循这些规则，你会对" },
    { id: "s8", text: "自己", clozeId: "2" },
    { id: "s9", text: "在十年内取得的进步感到惊奇。" },
];

// =========================================
// 单个预览卡片组件（简化版 - 仅预览用）
// =========================================
const PreviewCard = ({
    activeClozeId,
    segments,
}: {
    activeClozeId: string;
    segments: Segment[];
}) => {
    const [showAnswer, setShowAnswer] = useState(false);

    // 统计这张卡片有多少个 [...]
    const clozeCount = segments.filter((s) => s.clozeId === activeClozeId).length;

    return (
        <div className="sr-bg-[#1E1E1E] sr-border sr-border-white/[0.08] sr-rounded-xl sr-overflow-hidden sr-shadow-lg sr-flex sr-flex-col sr-shrink-0">
            {/* 卡片头部 */}
            <div className="sr-px-6 sr-py-3 sr-border-b sr-border-white/[0.06] sr-text-xs sr-text-zinc-500">
                卡片 c{activeClozeId} ({clozeCount} 个填空)
            </div>

            {/* 卡片内容 */}
            <div className="sr-p-6 sr-text-base sr-leading-loose sr-text-zinc-300 sr-flex-1">
                <span className="sr-mr-2">•</span>
                {segments.map((seg) => {
                    if (!seg.clozeId) {
                        return <span key={seg.id}>{seg.text}</span>;
                    }

                    const isTarget = seg.clozeId === activeClozeId;

                    if (isTarget) {
                        return showAnswer ? (
                            <span key={seg.id} className="sr-mx-1 sr-font-bold sr-text-[#60a5fa]">
                                {seg.text}
                            </span>
                        ) : (
                            <span key={seg.id} className="sr-mx-1 sr-font-bold sr-text-[#60a5fa]">
                                [...]
                            </span>
                        );
                    } else {
                        return (
                            <span key={seg.id} className="sr-font-medium">
                                {seg.text}
                            </span>
                        );
                    }
                })}
            </div>

            {/* 卡片底部按钮 */}
            <div className="sr-px-6 sr-pb-6 sr-pt-4 sr-border-t sr-border-white/[0.06]">
                <button
                    onClick={() => setShowAnswer(!showAnswer)}
                    className="sr-w-full sr-bg-blue-600 hover:sr-bg-blue-500 sr-text-white sr-text-sm sr-font-medium sr-py-3 sr-rounded-lg sr-transition-colors"
                >
                    {showAnswer ? "隐藏答案" : "显示答案"}
                </button>
            </div>
        </div>
    );
};

// =========================================
// Cloze 管理模态框
// =========================================
interface ClozeManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentId: string;
    currentContent: string;
    otherGroups: ClozeGroup[];
    onMerge: (targetId: string) => void;
    onSplit: () => void;
    onMergeAll: () => void;
    renderPreview?: () => React.ReactNode;
}

const ClozeManageModal: React.FC<ClozeManageModalProps> = ({
    isOpen,
    onClose,
    currentId,
    currentContent,
    otherGroups,
    onMerge,
    onSplit,
    onMergeAll,
    renderPreview,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="sr-fixed sr-inset-0 sr-z-[200] sr-flex sr-items-center sr-justify-center sr-p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="sr-absolute sr-inset-0 sr-bg-black/80 sr-backdrop-blur-sm"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="sr-relative sr-w-full sr-bg-[#1F1F23] sr-border sr-border-white/[0.08] sr-rounded-xl sr-shadow-2xl sr-overflow-hidden sr-text-zinc-200 sr-font-sans sr-flex sr-flex-col"
                        style={{ maxWidth: "900px", maxHeight: "85vh" }}
                    >
                        {/* Header */}
                        <div className="sr-p-4 sr-border-b sr-border-white/[0.06] sr-flex sr-justify-between sr-items-center sr-bg-[#18181B]">
                            <div>
                                <h2 className="sr-text-base sr-font-bold sr-text-white">
                                    拆分或合并填空
                                </h2>
                                <p className="sr-text-xs sr-text-zinc-500">
                                    拆分两个填空会生成多张记忆卡片。合并两个填空生成一张记忆卡片。
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="sr-p-1.5 hover:sr-bg-white/10 sr-rounded-lg sr-text-zinc-400 sr-transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Main Body: 双栏 */}
                        <div className="sr-flex sr-flex-1 sr-overflow-hidden">
                            {/* Left Column: 操作区 */}
                            <div className="sr-w-2/5 sr-p-5 sr-space-y-6 sr-overflow-y-auto sr-bg-[#1F1F23] sr-border-r sr-border-white/[0.06]">
                                {/* 待合并填空 */}
                                <div className="sr-space-y-2">
                                    <label className="sr-text-xs sr-font-bold sr-text-zinc-400 sr-uppercase sr-tracking-wider">
                                        待合并填空
                                    </label>
                                    <div className="sr-flex sr-items-center sr-gap-3 sr-p-3 sr-bg-[#27272A] sr-rounded-lg sr-border sr-border-blue-500/30">
                                        <span className="sr-text-blue-400 sr-font-mono sr-text-xs sr-bg-blue-400/10 sr-px-1.5 sr-py-0.5 sr-rounded">
                                            c{currentId}
                                        </span>
                                        <span className="sr-text-sm sr-text-white sr-truncate sr-flex-1">
                                            {currentContent}
                                        </span>
                                    </div>
                                </div>

                                {/* 与...合并 - 仅当有其他组时显示 */}
                                {otherGroups.length > 0 && (
                                    <div className="sr-space-y-2">
                                        <label className="sr-text-xs sr-font-bold sr-text-zinc-400 sr-uppercase sr-tracking-wider">
                                            与...合并
                                        </label>
                                        <div className="sr-flex sr-flex-col sr-gap-2">
                                            {otherGroups.map((group) => (
                                                <button
                                                    key={group.id}
                                                    onClick={() => onMerge(group.id)}
                                                    className="sr-flex sr-items-center sr-gap-3 sr-p-3 sr-bg-[#27272A] hover:sr-bg-[#3F3F46] sr-rounded-lg sr-border sr-border-white/[0.04] sr-transition-all sr-text-left sr-group"
                                                >
                                                    <span className="sr-text-zinc-500 sr-font-mono sr-text-xs group-hover:sr-text-zinc-300">
                                                        c{group.id}
                                                    </span>
                                                    <span className="sr-text-sm sr-text-zinc-300 group-hover:sr-text-white sr-truncate sr-flex-1">
                                                        {group.content}
                                                    </span>
                                                    <Merge
                                                        size={14}
                                                        className="sr-text-zinc-600 group-hover:sr-text-blue-400"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 拆分填空按钮 */}
                                <button
                                    onClick={onSplit}
                                    className="sr-w-full sr-flex sr-items-center sr-justify-center sr-gap-2 sr-p-2.5 sr-bg-zinc-800 hover:sr-bg-zinc-700 sr-rounded-lg sr-border sr-border-white/10 sr-transition-colors sr-text-sm"
                                >
                                    <SplitSquareHorizontal size={14} />
                                    拆分填空
                                </button>

                                {/* 合并所有填空按钮 */}
                                <button
                                    onClick={onMergeAll}
                                    className="sr-w-full sr-flex sr-items-center sr-justify-center sr-gap-2 sr-p-2.5 sr-bg-zinc-800 hover:sr-bg-zinc-700 sr-rounded-lg sr-border sr-border-white/10 sr-transition-colors sr-text-sm"
                                >
                                    <Layers size={14} />
                                    合并所有填空
                                </button>
                            </div>

                            {/* Right Column: 预览区 */}
                            {renderPreview && (
                                <div className="sr-w-3/5 sr-bg-[#121214] sr-p-6 sr-overflow-y-auto sr-flex sr-flex-col sr-gap-6">
                                    {renderPreview()}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// =========================================
// 导出演示页面
// =========================================
export const ClozeModalDemoPage: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [segments, setSegments] = useState<Segment[]>(INITIAL_SEGMENTS);
    const [currentEditId, setCurrentEditId] = useState("3");

    // 计算 otherGroups - 排除当前编辑的 ID
    const otherGroups = useMemo(() => {
        const groups = new Map<string, { content: string; count: number }>();

        segments.forEach((seg) => {
            // 只收集非当前编辑 ID 的组
            if (seg.clozeId && seg.clozeId !== currentEditId) {
                const existing = groups.get(seg.clozeId);
                if (existing) {
                    existing.count++;
                } else {
                    groups.set(seg.clozeId, { content: seg.text, count: 1 });
                }
            }
        });

        return Array.from(groups.entries())
            .map(([id, info]) => ({
                id,
                content: info.content,
                count: info.count,
            }))
            .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }, [segments, currentEditId]);

    // 当前选中组的内容
    const currentContent = useMemo(() => {
        const segs = segments.filter((s) => s.clozeId === currentEditId);
        if (segs.length === 0) return "(无内容)";
        return segs.map((s) => s.text).join(" ... ");
    }, [segments, currentEditId]);

    // 所有唯一填空 ID
    const uniqueClozeIds = useMemo(() => {
        const ids = new Set<string>();
        segments.forEach((s) => {
            if (s.clozeId) ids.add(s.clozeId);
        });
        return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
    }, [segments]);

    // --- Actions ---

    // 合并：将当前 ID 的所有填空改为目标 ID
    const handleMerge = (targetId: string) => {
        setSegments((prev) =>
            prev.map((s) => (s.clozeId === currentEditId ? { ...s, clozeId: targetId } : s)),
        );
        // 合并后切换当前编辑 ID 到目标
        setCurrentEditId(targetId);
    };

    // 拆分：一次性将所有不连续的填空都拆分开，按顺序编号为 c1, c2, c3...
    const handleSplit = () => {
        // 按文档顺序遍历所有片段，为每个填空分配新的 ID
        let nextId = 1;
        const newSegments = segments.map((s) => {
            if (s.clozeId) {
                // 每个填空都分配一个新 ID
                const newClozeId = nextId.toString();
                nextId++;
                return { ...s, clozeId: newClozeId };
            }
            return s;
        });

        setSegments(newSegments);
        // 拆分后默认选中 c1
        setCurrentEditId("1");
    };

    // 合并所有：将所有填空都改成 c1
    const handleMergeAll = () => {
        setSegments((prev) => prev.map((s) => (s.clozeId ? { ...s, clozeId: "1" } : s)));
        setCurrentEditId("1");
    };

    return (
        <div className="sr-w-full sr-h-screen sr-bg-[#09090b] sr-flex sr-items-center sr-justify-center sr-p-8">
            <div className="sr-text-center sr-space-y-4">
                <h1 className="sr-text-2xl sr-font-bold sr-text-white">
                    RemNote 风格 Cloze 管理器演示
                </h1>
                <button
                    onClick={() => setIsOpen(true)}
                    className="sr-px-6 sr-py-3 sr-bg-blue-600 hover:sr-bg-blue-500 sr-text-white sr-rounded-lg sr-font-medium sr-transition-colors"
                >
                    打开演示
                </button>
                <button
                    onClick={() => setSegments(INITIAL_SEGMENTS)}
                    className="sr-ml-4 sr-px-6 sr-py-3 sr-bg-zinc-700 hover:sr-bg-zinc-600 sr-text-white sr-rounded-lg sr-font-medium sr-transition-colors"
                >
                    重置数据
                </button>
            </div>

            <ClozeManageModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                currentId={currentEditId}
                currentContent={currentContent}
                otherGroups={otherGroups}
                onMerge={handleMerge}
                onSplit={handleSplit}
                onMergeAll={handleMergeAll}
                renderPreview={() => (
                    <>
                        <div className="sr-text-xs sr-text-zinc-500 sr-mb-2">
                            当前共 {uniqueClozeIds.length} 张卡片
                        </div>
                        {uniqueClozeIds.map((id) => (
                            <PreviewCard key={id} activeClozeId={id} segments={segments} />
                        ))}
                        {uniqueClozeIds.length === 0 && (
                            <div className="sr-text-zinc-500 sr-text-center sr-py-10">
                                没有填空卡片
                            </div>
                        )}
                    </>
                )}
            />
        </div>
    );
};

export default ClozeModalDemoPage;
