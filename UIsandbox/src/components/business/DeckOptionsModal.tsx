/**
 * DeckOptionsModal - 牌组选项弹窗 (从插件复制)
 *
 * 用于配置单个牌组的复习选项（方案选择、自动前进等）
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2 } from "lucide-react";

// 方案类型
interface DeckOptionsPreset {
    name: string;
    autoAdvance: boolean;
    autoAdvanceSeconds: number;
    showProgressBar: boolean;
    learningSteps: string;
    lapseSteps: string;
    maxNewCards: number;
    maxReviews: number;
}

// 默认方案
const DEFAULT_PRESET: DeckOptionsPreset = {
    name: "默认方案",
    autoAdvance: true,
    autoAdvanceSeconds: 8,
    showProgressBar: true,
    learningSteps: "1m 10m",
    lapseSteps: "10m",
    maxNewCards: 20,
    maxReviews: 200,
};

interface DeckOptionsModalProps {
    isOpen: boolean;
    deckName: string;
    onClose: () => void;
    onSave?: () => void;
}

export const DeckOptionsModal: React.FC<DeckOptionsModalProps> = ({
    isOpen,
    deckName,
    onClose,
    onSave,
}) => {
    // 模拟多个方案
    const [presets, setPresets] = useState<DeckOptionsPreset[]>([
        { ...DEFAULT_PRESET },
        { ...DEFAULT_PRESET, name: "快速复习", autoAdvanceSeconds: 5 },
    ]);
    const [currentPresetIndex, setCurrentPresetIndex] = useState(0);
    const currentPreset = presets[currentPresetIndex];

    const updatePreset = (updates: Partial<DeckOptionsPreset>) => {
        setPresets((prev) =>
            prev.map((p, i) => (i === currentPresetIndex ? { ...p, ...updates } : p)),
        );
    };

    const createNewPreset = () => {
        const newPreset = { ...DEFAULT_PRESET, name: `自定义方案 ${presets.length}` };
        setPresets([...presets, newPreset]);
        setCurrentPresetIndex(presets.length);
    };

    const deletePreset = () => {
        if (currentPresetIndex === 0) return;
        setPresets((prev) => prev.filter((_, i) => i !== currentPresetIndex));
        setCurrentPresetIndex(0);
    };

    const handleSave = () => {
        console.log("保存设置:", { deckName, preset: currentPreset });
        onSave?.();
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* 遮罩 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* 弹窗 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    >
                        <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                            {/* 头部 */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                                <h2 className="text-lg font-semibold text-white">
                                    {deckName} - 牌组选项
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* 内容 */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* 方案选择 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">
                                        使用方案
                                    </label>
                                    <div className="flex gap-2">
                                        <select
                                            value={currentPresetIndex}
                                            onChange={(e) =>
                                                setCurrentPresetIndex(parseInt(e.target.value))
                                            }
                                            className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {presets.map((p, i) => (
                                                <option key={i} value={i}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={createNewPreset}
                                            className="p-2 bg-zinc-800 border border-white/10 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>

                                <hr className="border-white/10" />

                                {/* 方案名称 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">
                                        方案名称
                                    </label>
                                    <input
                                        type="text"
                                        value={currentPreset.name}
                                        onChange={(e) => updatePreset({ name: e.target.value })}
                                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* 新卡片设置 */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        新卡片 (New Cards)
                                    </h4>

                                    <div className="space-y-2">
                                        <label className="text-sm text-zinc-300">
                                            初学间隔 (Learning Steps)
                                        </label>
                                        <input
                                            type="text"
                                            value={currentPreset.learningSteps}
                                            onChange={(e) =>
                                                updatePreset({ learningSteps: e.target.value })
                                            }
                                            placeholder="1m 10m"
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="text-xs text-zinc-500">
                                            间隔之间用空格分隔。支持 s(秒) m(分) h(时) d(天)
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-zinc-300">
                                            每日新卡片上限
                                        </label>
                                        <input
                                            type="number"
                                            value={currentPreset.maxNewCards}
                                            onChange={(e) =>
                                                updatePreset({
                                                    maxNewCards: parseInt(e.target.value) || 0,
                                                })
                                            }
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 遗忘设置 */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        遗忘 (Lapses)
                                    </h4>

                                    <div className="space-y-2">
                                        <label className="text-sm text-zinc-300">
                                            重学间隔 (Relearning Steps)
                                        </label>
                                        <input
                                            type="text"
                                            value={currentPreset.lapseSteps}
                                            onChange={(e) =>
                                                updatePreset({ lapseSteps: e.target.value })
                                            }
                                            placeholder="10m"
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 复习设置 */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        复习 (Reviews)
                                    </h4>

                                    <div className="space-y-2">
                                        <label className="text-sm text-zinc-300">
                                            每日复习上限
                                        </label>
                                        <input
                                            type="number"
                                            value={currentPreset.maxReviews}
                                            onChange={(e) =>
                                                updatePreset({
                                                    maxReviews: parseInt(e.target.value) || 0,
                                                })
                                            }
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 自动前进设置 */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        自动前进
                                    </h4>

                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-sm text-zinc-300">自动前进</span>
                                        <input
                                            type="checkbox"
                                            checked={currentPreset.autoAdvance}
                                            onChange={(e) =>
                                                updatePreset({ autoAdvance: e.target.checked })
                                            }
                                            className="w-4 h-4 rounded bg-zinc-800 border-white/20 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                                        />
                                    </label>

                                    {currentPreset.autoAdvance && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm text-zinc-300">
                                                    等待秒数
                                                </label>
                                                <input
                                                    type="number"
                                                    value={currentPreset.autoAdvanceSeconds}
                                                    onChange={(e) =>
                                                        updatePreset({
                                                            autoAdvanceSeconds:
                                                                parseFloat(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            <label className="flex items-center justify-between cursor-pointer">
                                                <span className="text-sm text-zinc-300">
                                                    显示进度条
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={currentPreset.showProgressBar}
                                                    onChange={(e) =>
                                                        updatePreset({
                                                            showProgressBar: e.target.checked,
                                                        })
                                                    }
                                                    className="w-4 h-4 rounded bg-zinc-800 border-white/20 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                                                />
                                            </label>
                                        </>
                                    )}
                                </div>

                                {/* 删除方案 */}
                                {currentPresetIndex > 0 && (
                                    <>
                                        <hr className="border-white/10" />
                                        <button
                                            onClick={deletePreset}
                                            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                            删除此方案
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* 底部 */}
                            <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    保存并刷新
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default DeckOptionsModal;
