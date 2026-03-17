/** @jsxImportSource react */
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { t } from "src/lang/helpers";
import { createAiDeckDraftInput } from "src/ui/adapters/aiDeckAdapter";
import { AiDeckDraftInput } from "src/ui/types/deckTypes";
import { AiThemeRetrieverStatusKind } from "src/ui/types/settingsTypes";
import {
    BaseComponent,
    InputRow,
    Section,
    SelectRow,
    TextAreaRow,
    ToggleRow,
} from "./common/SettingsComponents";

export interface AiDeckRetrieverStatusView {
    kind: AiThemeRetrieverStatusKind;
    source: string;
    message: string;
    canRetrieve: boolean;
}

export interface AiDeckLlmSummaryView {
    providerLabel: string;
    model: string;
    configured: boolean;
    strictJsonOutput: boolean;
    enabledByDefault: boolean;
}

interface AiDeckOptionsPanelProps {
    title: string;
    containerElement: HTMLElement | null;
    preferredWidth: number;
    initialValue?: Partial<AiDeckDraftInput>;
    retrieverStatus: AiDeckRetrieverStatusView;
    llmSummary: AiDeckLlmSummaryView;
    onClose: () => void;
    onSave: (draft: AiDeckDraftInput) => Promise<void> | void;
    onDelete?: () => Promise<void> | void;
}

interface PanelLayout {
    width: number;
    maxHeight: number;
    ready: boolean;
}

const RETRIEVER_KIND_LABEL: Record<AiThemeRetrieverStatusKind, string> = {
    "missing-plugin": "Missing plugin",
    "env-loading": "Environment loading",
    "smart-blocks-ready": "Smart blocks ready",
    "smart-sources-fallback": "Smart sources fallback",
    "unsupported-shape": "Unsupported interface shape",
    error: "Runtime error",
};

export const AiDeckOptionsPanel: React.FC<AiDeckOptionsPanelProps> = ({
    title,
    containerElement,
    preferredWidth,
    initialValue,
    retrieverStatus,
    llmSummary,
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
    const canSave = hasRequiredFields && retrieverStatus.canRetrieve;
    const retrieverPillClass = retrieverStatus.canRetrieve ? "is-ready" : "is-missing";

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
                    <Section title="AI Theme Pack">
                        <BaseComponent
                            label="Retriever status"
                            desc={retrieverStatus.message}
                        >
                            <div className="sr-ai-pack-panel-status">
                                <span className={`sr-settings-status-pill ${retrieverPillClass}`}>
                                    {retrieverStatus.canRetrieve ? "Ready" : "Unavailable"}
                                </span>
                                <span className="sr-ai-pack-panel-status-meta">
                                    {RETRIEVER_KIND_LABEL[retrieverStatus.kind]} | source:{" "}
                                    {retrieverStatus.source || "none"}
                                </span>
                            </div>
                        </BaseComponent>
                        <BaseComponent
                            label="Active LLM profile"
                            desc="Provider/model comes from global AI settings. This panel only controls whether this pack uses reranking."
                        >
                            <div className="sr-ai-pack-llm-summary">
                                <span>{llmSummary.providerLabel}</span>
                                <span>{llmSummary.model || "No model selected"}</span>
                                <span>
                                    {llmSummary.configured
                                        ? "LLM config looks ready"
                                        : "LLM missing model; rerank will fallback"}
                                </span>
                                <span>
                                    Strict JSON: {llmSummary.strictJsonOutput ? "On" : "Off"}
                                </span>
                            </div>
                        </BaseComponent>
                        <InputRow
                            label="Name"
                            value={draft.name}
                            onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                        />
                        <TextAreaRow
                            label="Theme prompt"
                            rows={4}
                            value={draft.themePrompt}
                            onChange={(value) => setDraft((prev) => ({ ...prev, themePrompt: value }))}
                        />
                        <InputRow
                            label="Final entry limit"
                            desc="Counted by final eligible text entries, not raw Smart Connections hits."
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
                            label="Order mode"
                            value={draft.orderMode}
                            options={[
                                { label: "Relevance", value: "relevance" },
                                { label: "Random", value: "random" },
                            ]}
                            onChange={(value) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    orderMode: value as AiDeckDraftInput["orderMode"],
                                }))
                            }
                        />
                        <ToggleRow
                            label="Enable LLM rerank for this pack"
                            desc={
                                llmSummary.enabledByDefault
                                    ? "Global default is enabled."
                                    : "Global default is disabled."
                            }
                            value={draft.llmEnabled}
                            onChange={(value) => setDraft((prev) => ({ ...prev, llmEnabled: value }))}
                        />
                    </Section>

                    <Section title="Actions">
                        <BaseComponent
                            label="Save theme pack"
                            desc="Saving will regenerate eligible entries and cache entryCount/cardCount/cardRefs."
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
                                        Delete
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
                                    {retrieverStatus.canRetrieve ? t("SAVE") : "Retriever unavailable"}
                                </button>
                            </div>
                        </BaseComponent>
                    </Section>
                </div>
            </div>
        </div>
    );
};
