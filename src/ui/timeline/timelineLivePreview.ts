import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    keymap,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { App, Component, MarkdownRenderer } from "obsidian";

import {
    findTimelineLivePreviewSegments,
    getTimelineDurationPrefixSegment,
    type TimelineDisplayDuration,
    type TimelineLivePreviewSegment,
} from "./timelineMessage";

function isCursorInRange(
    cursorFrom: number,
    cursorTo: number,
    rangeFrom: number,
    rangeTo: number,
): boolean {
    return !(cursorTo < rangeFrom || cursorFrom > rangeTo);
}

function selectionTouchesRange(
    selectionFrom: number,
    selectionTo: number,
    rangeFrom: number,
    rangeTo: number,
): boolean {
    return !(selectionTo < rangeFrom || selectionFrom > rangeTo);
}

class TimelineDurationWidget extends WidgetType {
    constructor(private readonly duration: TimelineDisplayDuration) {
        super();
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement("span");
        wrap.className = "sr-timeline-live-duration-widget";

        const pill = document.createElement("span");
        pill.className = "sr-timeline-duration-pill";
        pill.title = `${this.duration.totalDays}d`;
        pill.textContent = this.duration.raw;

        wrap.appendChild(pill);
        return wrap;
    }
}

class TimelineInlineTextWidget extends WidgetType {
    constructor(
        private readonly className: string,
        private readonly text: string,
        private readonly tagName: "span" | "code" = "span",
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const el = document.createElement(this.tagName);
        el.className = this.className;
        el.textContent = this.text;
        return el;
    }
}

class TimelineMathWidget extends WidgetType {
    constructor(
        private readonly app: App,
        private readonly text: string,
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const container = document.createElement("span");
        container.className = "sr-timeline-live-math";

        const renderComponent = new Component();
        renderComponent.load();
        void MarkdownRenderer.render(this.app, `$${this.text}$`, container, "", renderComponent);
        (container as HTMLElement & { __srRenderComponent?: Component }).__srRenderComponent =
            renderComponent;

        return container;
    }

    destroy(dom: HTMLElement): void {
        (dom as HTMLElement & { __srRenderComponent?: Component }).__srRenderComponent?.unload();
    }
}

function createTimelineSegmentDecoration(
    app: App,
    segment: TimelineLivePreviewSegment,
): Decoration | null {
    switch (segment.kind) {
        case "duration-prefix":
            if (!segment.duration) return null;
            return Decoration.replace({
                widget: new TimelineDurationWidget(segment.duration),
            });
        case "bold":
            return Decoration.replace({
                widget: new TimelineInlineTextWidget("sr-timeline-live-bold", segment.text),
            });
        case "italic":
            return Decoration.replace({
                widget: new TimelineInlineTextWidget("sr-timeline-live-italic", segment.text),
            });
        case "strikethrough":
            return Decoration.replace({
                widget: new TimelineInlineTextWidget(
                    "sr-timeline-live-strikethrough",
                    segment.text,
                ),
            });
        case "highlight":
            return Decoration.replace({
                widget: new TimelineInlineTextWidget("sr-timeline-live-highlight", segment.text),
            });
        case "inline-code":
            return Decoration.replace({
                widget: new TimelineInlineTextWidget(
                    "sr-timeline-live-code",
                    segment.text,
                    "code",
                ),
            });
        case "math":
            return Decoration.replace({
                widget: new TimelineMathWidget(app, segment.text),
            });
        default:
            return null;
    }
}

function buildTimelineDecorations(
    view: EditorView,
    app: App,
    enableDurationPrefixSyntax: boolean,
): { decorations: DecorationSet; atomicRanges: DecorationSet } {
    const decorationBuilder = new RangeSetBuilder<Decoration>();
    const atomicBuilder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const selection = view.state.selection.main;
    const segments = findTimelineLivePreviewSegments(text, enableDurationPrefixSyntax);

    for (const segment of segments) {
        if (segment.kind === "duration-prefix") {
            const decoration = createTimelineSegmentDecoration(app, segment);
            if (decoration) {
                decorationBuilder.add(segment.from, segment.to, decoration);
                atomicBuilder.add(segment.from, segment.to, Decoration.mark({}));
            }
            continue;
        }

        if (isCursorInRange(selection.from, selection.to, segment.from, segment.to)) continue;

        const decoration = createTimelineSegmentDecoration(app, segment);
        if (!decoration) continue;
        decorationBuilder.add(segment.from, segment.to, decoration);
    }

    return {
        decorations: decorationBuilder.finish(),
        atomicRanges: atomicBuilder.finish(),
    };
}

function deleteDurationToken(
    view: EditorView,
    enableDurationPrefixSyntax: boolean,
    direction: "backward" | "forward",
): boolean {
    const token = getTimelineDurationPrefixSegment(view.state.doc.toString(), enableDurationPrefixSyntax);
    if (!token) return false;

    const selection = view.state.selection.main;
    let changeFrom: number | null = null;
    let changeTo: number | null = null;

    if (!selection.empty) {
        if (!selectionTouchesRange(selection.from, selection.to, token.from, token.to)) {
            return false;
        }
        changeFrom = Math.min(selection.from, token.from);
        changeTo = Math.max(selection.to, token.to);
    } else if (direction === "backward" && selection.from === token.to) {
        changeFrom = token.from;
        changeTo = token.to;
    } else if (direction === "forward" && selection.from === token.from) {
        changeFrom = token.from;
        changeTo = token.to;
    } else {
        return false;
    }

    view.dispatch({
        changes: {
            from: changeFrom,
            to: changeTo,
            insert: "",
        },
        selection: { anchor: changeFrom },
    });

    return true;
}

export function createTimelineLivePreviewExtensions(opts: {
    app: App;
    enableDurationPrefixSyntax: boolean;
}): Extension[] {
    const { app, enableDurationPrefixSyntax } = opts;

    const plugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            atomicRanges: DecorationSet;

            constructor(view: EditorView) {
                const sets = buildTimelineDecorations(
                    view,
                    app,
                    enableDurationPrefixSyntax,
                );
                this.decorations = sets.decorations;
                this.atomicRanges = sets.atomicRanges;
            }

            update(update: ViewUpdate): void {
                if (update.docChanged || update.selectionSet || update.viewportChanged) {
                    const sets = buildTimelineDecorations(
                        update.view,
                        app,
                        enableDurationPrefixSyntax,
                    );
                    this.decorations = sets.decorations;
                    this.atomicRanges = sets.atomicRanges;
                }
            }
        },
        {
            decorations: (value) => value.decorations,
        },
    );

    const theme = EditorView.theme({
        ".sr-timeline-live-duration-widget": {
            display: "inline-flex",
            alignItems: "center",
            marginRight: "6px",
            verticalAlign: "baseline",
        },
        ".sr-timeline-live-bold": {
            fontWeight: "700",
        },
        ".sr-timeline-live-italic": {
            fontStyle: "italic",
        },
        ".sr-timeline-live-strikethrough": {
            textDecoration: "line-through",
        },
        ".sr-timeline-live-highlight": {
            backgroundColor: "var(--text-highlight-bg, rgba(255, 208, 0, 0.35))",
            borderRadius: "3px",
            padding: "0 2px",
        },
        ".sr-timeline-live-code": {
            fontFamily: "var(--font-monospace)",
            fontSize: "0.95em",
            backgroundColor: "var(--background-secondary-alt, var(--background-secondary))",
            borderRadius: "4px",
            padding: "1px 4px",
        },
        ".sr-timeline-live-math": {
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.2em",
        },
    });

    return [
        plugin,
        EditorView.atomicRanges.of(
            (view) => view.plugin(plugin)?.atomicRanges ?? Decoration.none,
        ),
        keymap.of([
            {
                key: "Backspace",
                run: (view) =>
                    deleteDurationToken(view, enableDurationPrefixSyntax, "backward"),
            },
            {
                key: "Delete",
                run: (view) =>
                    deleteDurationToken(view, enableDurationPrefixSyntax, "forward"),
            },
        ]),
        theme,
    ];
}
