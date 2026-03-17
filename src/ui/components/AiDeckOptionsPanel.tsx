/** @jsxImportSource react */
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { t } from "src/lang/helpers";
import { createAiDeckDraftInput } from "src/ui/adapters/aiDeckAdapter";
import { AiDeckDraftInput } from "src/ui/types/deckTypes";
import {
    BaseComponent,
    InputRow,
    Section,
    SelectRow,
    TextAreaRow,
    ToggleRow,
} from "./common/SettingsComponents";

interface AiDeckOptionsPanelProps {
    title: string;
    containerElement: HTMLElement | null;
    preferredWidth: number;
    initialValue?: Partial<AiDeckDraftInput>;
    retrieverAvailable: boolean;
    onClose: () => void;
    onSave: (draft: AiDeckDraftInput) => Promise<void> | void;
    onDelete?: () => Promise<void> | void;
}

interface PanelLayout {
    width: number;
    maxHeight: number;
    ready: boolean;
}

export const AiDeckOptionsPanel: React.FC<AiDeckOptionsPanelProps> = ({
    title,
    containerElement,
    preferredWidth,
    initialValue,
    retrieverAvailable,
    onClose,
    onSave,
    onDelete,
}) => {
    const titleId = useId();
    const [draft, setDraft] = useState<AiDeckDraftInput>(() => createAiDeckDraftInput(initialValue));
    const [layout, setLayout] = useState<PanelLayout>({
        width: 680,
        maxHeight: 640,
        ready: false,
    });

    useEffect(() => {
        setDraft(createAiDeckDraftInput(initialValue));
    }, [initialValue]);

    const recalculateLayout = useCallback(() => {
        if (!containerElement) return;
        const horizontalPadding = 48;
        const verticalPadding = 40;
        const availableWidth = Math.max(320, containerElement.clientWidth - horizontalPadding);
        const width = Math.max(320, Math.min(preferredWidth, availableWidth));
        const maxHeight = Math.max(360, containerElement.clientHeight - verticalPadding);
        setLayout({
            width,
            maxHeight,
            ready: true,
        });
    }, [containerElement, preferredWidth]);

    useLayoutEffect(() => {
        recalculateLayout();
    }, [recalculateLayout]);

    useEffect(() => {
        if (!containerElement) return;
        const handleResize = () => recalculateLayout();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const resizeObserver = new ResizeObserver(() => recalculateLayout());
        resizeObserver.observe(containerElement);

        window.addEventListener("resize", handleResize);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [containerElement, onClose, recalculateLayout]);

    const hasRequiredFields = useMemo(
        () => draft.name.trim().length > 0 && draft.themePrompt.trim().length > 0,
        [draft.name, draft.themePrompt],
    );
    const canSave = hasRequiredFields && retrieverAvailable;

    const handleSave = useCallback(async () => {
        if (!canSave) return;
        await onSave({
            ...draft,
            finalEntryLimit: Math.max(1, Number(draft.finalEntryLimit || 10)),
        });
        onClose();
    }, [canSave, draft, onClose, onSave]);

    return (
        <div className="sr-deck-options-overlay" onMouseDown={onClose}>
            <div
                className={`sr-settings-panel sr-deck-options-anchor-panel ${layout.ready ? "is-ready" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                style={{
                    width: `${layout.width}px`,
                    maxHeight: `${layout.maxHeight}px`,
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="sr-style-setting-header sr-deck-options-toolbar">
                    <div className="sr-style-setting-tab-group">
                        <div id={titleId} className="sr-deck-options-title-text">
                            {title}
                        </div>
                        <div className="sr-deck-options-toolbar-spacer" />
                        <button
                            type="button"
                            className="sr-deck-options-close-btn"
                            onClick={onClose}
                            aria-label={t("CANCEL")}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div className="sr-style-setting-content sr-deck-options-scroll">
                    <Section title="AI 主题包">
                        <BaseComponent
                            label="Smart Connections 状态"
                            desc={
                                retrieverAvailable
                                    ? "已检测到可用接口，可以创建或重生成主题包。"
                                    : "当前不可用。为避免保存出空包，已暂时禁用保存。"
                            }
                        >
                            <div className="sr-ai-pack-panel-status">
                                <span
                                    className={`sr-settings-status-pill ${
                                        retrieverAvailable ? "is-ready" : "is-missing"
                                    }`}
                                >
                                    {retrieverAvailable ? "可用" : "不可用"}
                                </span>
                            </div>
                        </BaseComponent>
                        <InputRow
                            label="名称"
                            value={draft.name}
                            onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                        />
                        <TextAreaRow
                            label="主题提示词"
                            rows={4}
                            value={draft.themePrompt}
                            onChange={(value) => setDraft((prev) => ({ ...prev, themePrompt: value }))}
                        />
                        <InputRow
                            label="最终条目数"
                            desc="这里按最终可映射的文本条目计数，不是 Smart Connections 的原始命中数。"
                            type="number"
                            value={draft.finalEntryLimit}
                            onChange={(value) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    finalEntryLimit: Math.max(1, Number(value || 10)),
                                }))
                            }
                        />
                        <SelectRow
                            label="排序方式"
                            value={draft.orderMode}
                            options={[
                                { label: "相关度", value: "relevance" },
                                { label: "随机", value: "random" },
                            ]}
                            onChange={(value) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    orderMode: value as AiDeckDraftInput["orderMode"],
                                }))
                            }
                        />
                        <ToggleRow
                            label="启用 LLM 精排"
                            value={draft.llmEnabled}
                            onChange={(value) => setDraft((prev) => ({ ...prev, llmEnabled: value }))}
                        />
                    </Section>

                    <Section title="操作">
                        <BaseComponent
                            label="保存主题包"
                            desc="保存时会重新执行条目筛选，并缓存 entryCount / cardCount 与 cardRefs。"
                        >
                            <div className="sr-ai-pack-panel-actions">
                                {onDelete && (
                                    <button
                                        type="button"
                                        className="mod-warning"
                                        onClick={() => {
                                            void Promise.resolve(onDelete()).then(() => {
                                                onClose();
                                            });
                                        }}
                                    >
                                        删除
                                    </button>
                                )}
                                <button type="button" onClick={onClose}>
                                    {t("CANCEL")}
                                </button>
                                <button
                                    type="button"
                                    className="mod-cta"
                                    disabled={!canSave}
                                    onClick={() => {
                                        void handleSave();
                                    }}
                                >
                                    {retrieverAvailable ? t("SAVE") : "Smart Connections 不可用"}
                                </button>
                            </div>
                        </BaseComponent>
                    </Section>
                </div>
            </div>
        </div>
    );
};
