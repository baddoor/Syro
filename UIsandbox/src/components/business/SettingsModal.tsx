import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Layers, FileText, Calendar, Layout, HelpCircle, ChevronDown } from "lucide-react";

// 模拟设置类型
interface SRSettings {
    flashcardTags: string[];
    convertFoldersToDecks: boolean;
    noteFoldersToIgnore: string[];
    burySiblingCards: boolean;
    flashcardCardOrder: string;
    singleLineCardSeparator: string;
    multilineCardSeparator: string;
    tagsToReview: string[];
    autoNextNote: boolean;
    openRandomNote: boolean;
    cardAlgorithm: string;
    noteAlgorithm: string;
    baseEase: number;
    easyBonus: number;
    showStatusBar: boolean;
    openViewInNewTab: boolean;
    progressBarStyle: { color: string; rightToLeft: boolean };
    // 完形填空转换设置
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
}

const DEFAULT_SETTINGS: SRSettings = {
    flashcardTags: ["#flashcards"],
    convertFoldersToDecks: false,
    noteFoldersToIgnore: ["templates", "archive"],
    burySiblingCards: true,
    flashcardCardOrder: "DueFirstSequential",
    singleLineCardSeparator: "::",
    multilineCardSeparator: "?",
    tagsToReview: ["#review"],
    autoNextNote: true,
    openRandomNote: false,
    cardAlgorithm: "Fsrs",
    noteAlgorithm: "WeightedMultiplier",
    baseEase: 250,
    easyBonus: 1.3,
    showStatusBar: true,
    openViewInNewTab: false,
    progressBarStyle: { color: "#3b82f6", rightToLeft: false },
    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: true,
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSettings?: SRSettings;
    onSave?: (newSettings: SRSettings) => void;
}

// 顶部导航定义
const TABS = [
    { id: "flashcards", label: "Flashcards", icon: <Layers size={14} /> },
    { id: "notes", label: "Notes", icon: <FileText size={14} /> },
    { id: "algorithm", label: "Scheduling", icon: <Calendar size={14} /> },
    { id: "ui", label: "Interface", icon: <Layout size={14} /> },
    { id: "help", label: "Help", icon: <HelpCircle size={14} /> },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    initialSettings = DEFAULT_SETTINGS,
    onSave,
}) => {
    const [activeTab, setActiveTab] = useState("flashcards");
    const [settings, setSettings] = useState<SRSettings>(initialSettings);

    const handleChange = (key: keyof SRSettings, value: any) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
                    {/* 背景遮罩 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* 模态框本体：改为上下结构 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="
              relative w-full max-w-3xl h-[85vh] 
              bg-[#18181A]
              border border-white/[0.08] 
              rounded-xl shadow-2xl flex flex-col overflow-hidden
              text-zinc-200 font-sans
            "
                    >
                        {/* --- 1. Header & Tabs (顶部区域) --- */}
                        <div className="shrink-0 bg-[#202023] border-b border-white/[0.06]">
                            {/* 标题栏 */}
                            <div className="flex items-center justify-between px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400">
                                        <Layers size={18} />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white tracking-wide">
                                            Settings
                                        </h2>
                                        <p className="text-xs text-zinc-500">
                                            Spaced Repetition Plugin
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* 顶部标签导航 (Top Tabs) */}
                            <div className="flex items-center gap-1 px-6 overflow-x-auto custom-scrollbar">
                                {TABS.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`
                        relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap
                        ${isActive ? "text-blue-400" : "text-zinc-400 hover:text-zinc-200"}
                      `}
                                        >
                                            {tab.icon}
                                            {tab.label}
                                            {/* 底部游标 (Active Indicator) */}
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeTabIndicator"
                                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 shadow-[0_-2px_10px_rgba(59,130,246,0.5)]"
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* --- 2. Content Area (内容区域) --- */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#18181A]">
                            <div className="max-w-2xl mx-auto space-y-8 pb-20">
                                {activeTab === "flashcards" && (
                                    <FlashcardsTab settings={settings} onChange={handleChange} />
                                )}
                                {activeTab === "notes" && (
                                    <NotesTab settings={settings} onChange={handleChange} />
                                )}
                                {activeTab === "algorithm" && (
                                    <AlgorithmTab settings={settings} onChange={handleChange} />
                                )}
                                {activeTab === "ui" && (
                                    <UITab settings={settings} onChange={handleChange} />
                                )}
                                {activeTab === "help" && <HelpTab />}
                            </div>
                        </div>

                        {/* --- 3. Footer (底部按钮) --- */}
                        <div className="p-5 border-t border-white/[0.06] bg-[#202023] flex justify-between items-center shrink-0">
                            <span className="text-xs text-zinc-500">v1.12.0</span>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onSave?.(settings);
                                        onClose();
                                    }}
                                    className="
                      flex items-center gap-2 px-6 py-2 rounded-lg 
                      bg-blue-600 hover:bg-blue-500 
                      text-white font-bold text-sm
                      shadow-lg shadow-blue-500/20 
                      transition-all active:scale-95
                    "
                                >
                                    <Save size={16} /> Save Changes
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// ==========================================
// 子页面内容
// ==========================================

const FlashcardsTab = ({ settings, onChange }: any) => (
    <>
        <Section title="Behavior">
            <SelectRow
                label="Card Order"
                desc="Sort order within a deck during review."
                value={settings.flashcardCardOrder}
                options={[
                    { label: "Due first, then New (Sequential)", value: "DueFirstSequential" },
                    { label: "Due first, then New (Random)", value: "DueFirstRandom" },
                    { label: "New first, then Due (Sequential)", value: "NewFirstSequential" },
                    { label: "New first, then Due (Random)", value: "NewFirstRandom" },
                ]}
                onChange={(v: string) => onChange("flashcardCardOrder", v)}
            />
            <ToggleRow
                label="Bury Siblings"
                desc="Defer sibling cards until the next day."
                value={settings.burySiblingCards}
                onChange={(v: boolean) => onChange("burySiblingCards", v)}
            />
        </Section>

        <Section title="Cloze Conversion (完形填空)">
            <div className="space-y-4">
                <ToggleRow
                    label="Highlight to Cloze"
                    desc="Convert ==highlights== to clozes."
                    value={settings.convertHighlightsToClozes}
                    onChange={(v: boolean) => onChange("convertHighlightsToClozes", v)}
                />
                <ToggleRow
                    label="Bold to Cloze"
                    desc="Convert **bold text** to clozes."
                    value={settings.convertBoldTextToClozes}
                    onChange={(v: boolean) => onChange("convertBoldTextToClozes", v)}
                />
                <ToggleRow
                    label="Curly Brackets"
                    desc="Convert {{curly brackets}} to clozes."
                    value={settings.convertCurlyBracketsToClozes}
                    onChange={(v: boolean) => onChange("convertCurlyBracketsToClozes", v)}
                />
            </div>
        </Section>

        <Section title="Separators">
            <InputRow
                label="Inline Separator"
                value={settings.singleLineCardSeparator}
                onChange={(v: string) => onChange("singleLineCardSeparator", v)}
            />
            <InputRow
                label="Multiline Separator"
                value={settings.multilineCardSeparator}
                onChange={(v: string) => onChange("multilineCardSeparator", v)}
            />
        </Section>
    </>
);

const NotesTab = ({ settings, onChange }: any) => (
    <>
        <Section title="Review Queue">
            <TextAreaRow
                label="Tags to Review"
                desc="Enter tags separated by spaces."
                value={settings.tagsToReview.join(" ")}
                onChange={(v: string) => onChange("tagsToReview", v.split(/\s+/))}
            />
            <ToggleRow
                label="Auto Next Note"
                desc="Automatically open next note."
                value={settings.autoNextNote}
                onChange={(v: boolean) => onChange("autoNextNote", v)}
            />
            <ToggleRow
                label="Open Random Note"
                desc="If disabled, notes are ordered by importance."
                value={settings.openRandomNote}
                onChange={(v: boolean) => onChange("openRandomNote", v)}
            />
        </Section>
    </>
);

const AlgorithmTab = ({ settings, onChange }: any) => (
    <>
        <Section title="Algorithm Selection">
            <SelectRow
                label="Card Algorithm"
                desc="Choose the spaced repetition algorithm."
                value={settings.cardAlgorithm}
                options={[
                    { label: "FSRS (Recommended)", value: "Fsrs" },
                    { label: "Default (Modified Anki)", value: "Default" },
                    { label: "Anki (SM-2)", value: "Anki" },
                ]}
                onChange={(v: string) => onChange("cardAlgorithm", v)}
            />
            <SelectRow
                label="Note Algorithm"
                desc="Algorithm for note-level scheduling."
                value={settings.noteAlgorithm}
                options={[
                    { label: "Weighted Multiplier", value: "WeightedMultiplier" },
                    { label: "Default", value: "Default" },
                ]}
                onChange={(v: string) => onChange("noteAlgorithm", v)}
            />
        </Section>

        {settings.cardAlgorithm === "Fsrs" ? (
            <div className="p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl text-sm text-blue-300">
                FSRS parameters are managed automatically. Advanced tuning coming soon.
            </div>
        ) : (
            <Section title="Parameters">
                <InputRow
                    label="Base Ease"
                    value={settings.baseEase}
                    onChange={(v: string) => onChange("baseEase", parseInt(v))}
                    desc="Minimum 130"
                />
                <InputRow
                    label="Easy Bonus"
                    value={settings.easyBonus}
                    onChange={(v: string) => onChange("easyBonus", parseFloat(v))}
                    desc="Multiplier for Easy response"
                />
            </Section>
        )}
    </>
);

const UITab = ({ settings, onChange }: any) => (
    <>
        <Section title="General">
            <ToggleRow
                label="Show Status Bar"
                desc="Display review stats in the status bar."
                value={settings.showStatusBar}
                onChange={(v: boolean) => onChange("showStatusBar", v)}
            />
            <ToggleRow
                label="Open in New Tab"
                desc="Open review view in a new tab."
                value={settings.openViewInNewTab}
                onChange={(v: boolean) => onChange("openViewInNewTab", v)}
            />
        </Section>

        <Section title="Progress Bar">
            <div className="flex justify-between items-center gap-4 min-h-[2.5rem]">
                <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">Bar Color</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Select progress bar color</div>
                </div>
                <input
                    type="color"
                    value={settings.progressBarStyle.color}
                    onChange={(e) =>
                        onChange("progressBarStyle", {
                            ...settings.progressBarStyle,
                            color: e.target.value,
                        })
                    }
                    className="h-8 w-14 rounded cursor-pointer bg-transparent border border-zinc-700"
                />
            </div>
            <ToggleRow
                label="Right to Left Animation"
                desc="Progress bar fills from right to left."
                value={settings.progressBarStyle.rightToLeft}
                onChange={(v: boolean) =>
                    onChange("progressBarStyle", { ...settings.progressBarStyle, rightToLeft: v })
                }
            />
        </Section>
    </>
);

const HelpTab = () => (
    <div className="space-y-6">
        <div className="p-6 bg-[#202023] border border-white/[0.06] rounded-xl flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-2xl">
                ❤️
            </div>
            <h3 className="font-bold text-white">Support Development</h3>
            <p className="text-sm text-zinc-500 max-w-xs">
                This plugin is a hobby project. If it helps your learning, consider supporting!
            </p>
            <button className="mt-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg shadow-lg shadow-pink-500/20 transition-all">
                Sponsor on GitHub
            </button>
        </div>

        <Section title="Links">
            <LinkRow label="Documentation / Wiki" />
            <LinkRow label="GitHub Repository" />
            <LinkRow label="Report an Issue" />
        </Section>
    </div>
);

// ==========================================
// 样式组件 (Card Style + High Contrast)
// ==========================================

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-[#202023] border border-white/[0.06] rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.02]">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="p-4 space-y-4">{children}</div>
    </div>
);

const SettingRow = ({
    label,
    desc,
    control,
}: {
    label: string;
    desc?: string;
    control: React.ReactNode;
}) => (
    <div className="flex justify-between items-center gap-4 min-h-[2.5rem]">
        <div className="flex-1">
            <div className="text-sm font-medium text-zinc-200">{label}</div>
            {desc && <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</div>}
        </div>
        <div className="shrink-0">{control}</div>
    </div>
);

// Toggle Switch (High Contrast)
const ToggleRow = ({
    label,
    desc,
    value,
    onChange,
}: {
    label: string;
    desc?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) => (
    <SettingRow
        label={label}
        desc={desc}
        control={
            <button
                onClick={() => onChange(!value)}
                className={`
          w-11 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out relative
          ${value ? "bg-blue-600" : "bg-zinc-700 hover:bg-zinc-600"}
        `}
            >
                <motion.div
                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                    animate={{ x: value ? 20 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
            </button>
        }
    />
);

// Input Field (High Contrast Background)
const InputRow = ({
    label,
    desc,
    value,
    onChange,
    type = "text",
}: {
    label: string;
    desc?: string;
    value: any;
    onChange: (v: string) => void;
    type?: string;
}) => (
    <SettingRow
        label={label}
        desc={desc}
        control={
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="
          w-48 bg-[#121212] border border-zinc-700 
          focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 
          rounded-md px-3 py-1.5 text-sm text-white placeholder-zinc-600
          outline-none transition-all font-mono
        "
            />
        }
    />
);

const TextAreaRow = ({
    label,
    desc,
    value,
    onChange,
}: {
    label: string;
    desc?: string;
    value: string;
    onChange: (v: string) => void;
}) => (
    <div className="space-y-2 py-2">
        <div>
            <div className="text-sm font-medium text-zinc-200">{label}</div>
            {desc && <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>}
        </div>
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="
        w-full bg-[#121212] border border-zinc-700 
        focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 
        rounded-md px-3 py-2 text-sm text-white resize-none font-mono
      "
        />
    </div>
);

// Select Dropdown (High Contrast)
const SelectRow = ({
    label,
    desc,
    value,
    options,
    onChange,
}: {
    label: string;
    desc?: string;
    value: string;
    options: { label: string; value: string }[];
    onChange: (v: string) => void;
}) => (
    <SettingRow
        label={label}
        desc={desc}
        control={
            <div className="relative group">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="
            appearance-none w-64
            bg-[#121212] border border-zinc-700 
            text-zinc-200 text-sm 
            rounded-md pl-3 pr-8 py-1.5 
            outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
            cursor-pointer transition-all hover:border-zinc-500
          "
                >
                    {options.map((opt) => (
                        <option
                            key={opt.value}
                            value={opt.value}
                            className="bg-[#18181A] text-zinc-300"
                        >
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <ChevronDown size={14} />
                </div>
            </div>
        }
    />
);

const LinkRow = ({ label }: { label: string }) => (
    <button className="w-full flex items-center justify-between py-2.5 text-left text-sm text-zinc-300 hover:text-white transition-colors group">
        <span>{label}</span>
        <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
    </button>
);

export default SettingsModal;
