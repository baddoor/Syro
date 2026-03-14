/**
 * React-based note review sidebar view.
 * It renders the note review queue and timeline interactions inside an Obsidian item view.
 */
















import { ItemView, WorkspaceLeaf, Menu, TFile, Notice, Scope } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import type SRPlugin from "src/main";
import { NoteReviewSidebar } from "src/ui/components/NoteReviewSidebar";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { NoteReviewItem, NoteReviewSidebarState } from "src/ui/types/noteReview";
import { ReviewCommitStore, ReviewCommitLog } from "src/dataStore/reviewCommitStore";
import { t } from "src/lang/helpers";
import { ContextAnchorService } from "src/util/ContextAnchor";
import { MarkdownView } from "obsidian";
import { LicenseManager } from "src/services/LicenseManager";
import { PerfTracker } from "src/util/PerfTracker";

// Stable view type id used when registering the sidebar view.
export const REACT_REVIEW_QUEUE_VIEW_TYPE = "react-review-queue-list-view";

/**
 * React item view for the note review queue.
 */


export class ReactNoteReviewView extends ItemView {
    private plugin: SRPlugin;
    private root: Root | null = null;

    // Timeline state
    private commitStore: ReviewCommitStore | null = null;
    private selectedItem: NoteReviewItem | null = null;
    private isTimelineOpen: boolean = false;
    private commitLogs: ReviewCommitLog[] = [];
    private timelineHeight: number = 300;
    private editingId: string | null = null;
    private unsubscribeSyncEvent: (() => void) | null = null;
    private isLoading: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: SRPlugin) {
        super(leaf);
        this.plugin = plugin;

        // Restore the last saved timeline height.
        this.timelineHeight = (this.plugin.data.settings as any).sidebarTimelineHeight || 300;

        // Register workspace and vault listeners.
        this.registerEvent(this.app.workspace.on("file-open", () => this.handleFileOpen()));
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                // Keep timeline entries in sync with renamed files.
                if (this.commitStore && oldPath) {
                    this.commitStore.renameFile(oldPath, file.path);
                    this.commitStore.save();
                }
                this.redraw();
            }),
        );
    }

    /** View type id. */
    public getViewType(): string {
        return REACT_REVIEW_QUEUE_VIEW_TYPE;
    }

    /** View title. */
    public getDisplayText(): string {
        return t("NOTES_REVIEW_QUEUE");
    }

    /** View icon. */
    public getIcon(): string {
        return "SpacedRepIcon";
    }

    /**
     * Header menu actions.
     */
    public onHeaderMenu(menu: Menu): void {
        menu.addItem((item) => {
            item.setTitle(t("CLOSE"))
                .setIcon("cross")
                .onClick(() => {
                    this.app.workspace.detachLeavesOfType(REACT_REVIEW_QUEUE_VIEW_TYPE);
                });
        });
    }

    /**
     * Open the view and mount the React root.
     */
    async onOpen(): Promise<void> {
        const contentEl = this.containerEl.children[1] as HTMLElement;
        contentEl.empty();
        contentEl.addClass("sr-react-note-review-view");
        contentEl.style.padding = "0";

        // Load the timeline store before first render.
        this.commitStore = new ReviewCommitStore(
            this.plugin.data.settings,
            this.plugin.manifest.dir,
        );
        await this.commitStore.load();

        // Mount the React tree.
        this.root = createRoot(contentEl);
        this.redraw();

        // Ensure this view has a scope instance for keyboard bindings.
        if (!this.scope) {
            this.scope = new Scope();
        }

        // Obsidian intercepts Ctrl+Enter before the DOM sees it, so bridge it via Scope.


        this.scope.register(["Mod"], "Enter", (evt: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.closest(".sr-react-note-review-view")) {
                evt.preventDefault();
                activeEl.dispatchEvent(new CustomEvent("sr-ctrl-enter", { bubbles: false }));
            }
            return false;
        });

        // Refresh automatically after sync completes.
        this.unsubscribeSyncEvent = this.plugin.syncEvents.on("sync-complete", () => {
            this.redraw();
        });
    }

    /**
     * Close the view and clean up resources.
     */
    async onClose(): Promise<void> {
        // Unsubscribe from sync events.
        if (this.unsubscribeSyncEvent) {
            this.unsubscribeSyncEvent();
            this.unsubscribeSyncEvent = null;
        }

        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }

    /**
     * Re-render the sidebar state.
     */
    public redraw(): void {
        PerfTracker.start("SidebarRedraw");
        if (!this.root) return;

        const activeFile = this.app.workspace.getActiveFile();
        const data = reviewDecksToSidebarState(this.plugin);

        this.root.render(
            React.createElement(NoteReviewSidebar, {
                data,
                activeFilePath: activeFile?.path,
                onNoteClick: (item) => this.handleNoteClick(item),
                onNoteContextMenu: (item, event) => this.handleNoteContextMenu(item, event),
                onTagDrop: (item, tag) => this.handleTagDrop(item, tag),
                onPriorityChange: (item, newPriority) =>
                    this.handlePriorityChange(item, newPriority),
                ignoredTags: this.plugin.data.settings.sidebarIgnoredTags || [],
                sortMode: this.plugin.data.settings.sidebarTagSortMode || "frequency",
                onSortModeChange: (mode) => this.handleSortModeChange(mode),
                customTagOrder: this.plugin.data.settings.sidebarCustomTagOrder || [],
                onCustomTagOrderChange: (order) => this.handleCustomTagOrderChange(order),
                filterBarHeight: this.plugin.data.settings.sidebarFilterBarHeight || 80,
                onFilterBarHeightChange: (height) => this.handleFilterBarHeightChange(height),
                onIgnoreTag: (tag) => this.handleIgnoreTag(tag),
                onShowTagContextMenu: (e, tag) => this.showTagContextMenu(e, tag),
                hideFilterBarHeader:
                    this.plugin.data.settings.hideNoteReviewSidebarFilters || false,
                selectedItem: this.selectedItem,
                commitLogs: this.commitLogs,
                onCommit: (path, message) => this.handleCommit(path, message),
                isTimelineOpen: this.isTimelineOpen,
                onTimelineToggle: () => this.handleTimelineToggle(),
                timelineHeight: this.timelineHeight,
                onTimelineHeightChange: (height) => this.handleTimelineHeightChange(height),
                onNoteSelect: (item) => this.handleNoteSelect(item),
                onNoteDoubleClick: (item) => this.handleNoteClick(item),
                onCommitContextMenu: (e, commitId) => this.handleCommitContextMenu(e, commitId),
                editingId: this.editingId,
                onEditCommit: (commitId, newMessage) => this.handleEditCommit(commitId, newMessage),
                onStartEdit: (commitId) => this.handleStartEdit(commitId),
                onCancelEdit: () => this.handleCancelEdit(),
                onCommitSelect: (log) => this.handleCommitSelect(log),
                isLoading: this.isLoading,
                showScrollPercentage: this.plugin.data.settings.showScrollPercentage,
            }),
        );
        PerfTracker.end("SidebarRedraw");
    }

    // ==========================================
    // Note interactions
    // ==========================================

    /**
     * Open the selected note.
     */
    private async handleNoteClick(item: NoteReviewItem): Promise<void> {
        // Remember the last selected deck for sidebar context.
        const pathParts = item.path.split("/");
        if (pathParts.length > 1) {
            this.plugin.lastSelectedReviewDeck = pathParts[0];
        }

        // Open the note in the workspace.
        await this.app.workspace.getLeaf().openFile(item.noteFile);

        // Show the floating review bar when the note is tracked.
        const store = this.plugin.store;
        if (store) {
            const repItem = store.getNoteItem(item.path);
            if (repItem) {
                this.plugin.reviewFloatBar.display(repItem);
            }
        }
    }

    /**
     * Open the note context menu.
     */
    private handleNoteContextMenu(item: NoteReviewItem, event: MouseEvent): void {
        const fileMenu = new Menu();

        // 1. Open actions
        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_IN_TAB"))
                .setIcon("file-plus")
                .onClick(() => {
                    this.app.workspace.getLeaf("tab").openFile(item.noteFile);
                });
        });

        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_TO_RIGHT"))
                .setIcon("separator-vertical")
                .onClick(() => {
                    this.app.workspace.getLeaf("split").openFile(item.noteFile);
                });
        });

        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_IN_NEW_WINDOW") || "Open in new window")
                .setIcon("scan-line")
                .onClick(() => {
                    this.app.workspace.openPopoutLeaf().openFile(item.noteFile);
                });
        });

        fileMenu.addSeparator();

        // 2. File operations (Rename, Copy, etc makes sense here, but keeping it simple for now as requested, just making it look native)
        // User specifically asked for "System commands".
        // Let's add Rename as it's standard.
        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("RENAME") || "Rename")
                .setIcon("pencil")
                .onClick(() => {
                    (this.app.fileManager as any).promptForFileRename(item.noteFile);
                });
        });

        fileMenu.addSeparator();

        // 3. Plugin items (trigger event so other plugins add here)
        this.app.workspace.trigger("file-menu", fileMenu, item.noteFile, "my-context-menu", null);

        fileMenu.addSeparator();

        // 4. Danger actions (Delete) at the very bottom
        fileMenu.addItem((menuItem) => {
            menuItem.setTitle(t("DELETE")).setIcon("trash");
            if (typeof (menuItem as any).setWarning === "function") {
                (menuItem as any).setWarning();
            }
            menuItem.onClick(async () => {
                await this.app.vault.trash(item.noteFile, true);
            });
        });

        fileMenu.showAtPosition({
            x: event.pageX,
            y: event.pageY,
        });
    }

    /**
     * Add a dropped tag into the note frontmatter.
     */
    private async handleTagDrop(item: NoteReviewItem, tag: string): Promise<void> {
        const file = item.noteFile;
        if (!file) return;

        try {
            const content = await this.app.vault.read(file);

            if (item.tags && item.tags.includes(tag)) {
                new Notice(t("SIDEBAR_TAG_EXISTS", { tag }));
                return;
            }

            const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(frontmatterRegex);

            let newContent: string;

            if (match) {
                const frontmatter = match[1];
                const tagsMatch = frontmatter.match(/^tags:\s*(.*)$/m);

                if (tagsMatch) {
                    const existingTagsStr = tagsMatch[1].trim();
                    let newTagsStr: string;

                    if (existingTagsStr.startsWith("[")) {
                        newTagsStr = existingTagsStr.slice(0, -1) + `, ${tag}]`;
                    } else {
                        newTagsStr = existingTagsStr ? `${existingTagsStr}, ${tag}` : tag;
                    }

                    const newFrontmatter = frontmatter.replace(
                        /^tags:\s*.*$/m,
                        `tags: ${newTagsStr}`,
                    );
                    newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
                } else {
                    const newFrontmatter = frontmatter + `\ntags: [${tag}]`;
                    newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
                }
            } else {
                newContent = `---\ntags: [${tag}]\n---\n\n${content}`;
            }

            await this.app.vault.modify(file, newContent);
            new Notice(t("SIDEBAR_TAG_ADDED", { tag }));

            const metadataHandler = () => {
                this.app.metadataCache.off("resolved", metadataHandler);
                this.redraw();
            };
            this.app.metadataCache.on("resolved", metadataHandler);

            setTimeout(() => {
                this.app.metadataCache.off("resolved", metadataHandler);
                this.redraw();
            }, 100);
        } catch (error) {
            console.error("Failed to add tag:", error);
            new Notice(t("SIDEBAR_TAG_ADD_FAILED"));
        }
    }

    /**
     * Update note priority.
     */
    private async handlePriorityChange(item: NoteReviewItem, newPriority: number): Promise<void> {
        const file = item.noteFile;
        if (!file) return;

        try {
            const store = this.plugin.store;
            const noteItem = store.getNoteItem(file.path);

            if (noteItem) {
                noteItem.priority = newPriority;
                await store.save();
                this.plugin.updateAndSortDueNotes();
                new Notice(`${t("PRIORITY")}: ${newPriority}`);
            } else {
                new Notice(t("SIDEBAR_NOTE_DATA_NOT_FOUND"));
            }
        } catch (error) {
            console.error("Failed to update priority:", error);
            new Notice(t("SIDEBAR_PRIORITY_CHANGE_FAILED"));
        }
    }

    // ==========================================
    // Settings interactions
    // ==========================================

    private handleSortModeChange(mode: "a-z" | "frequency" | "custom"): void {
        this.plugin.data.settings.sidebarTagSortMode = mode;
        this.plugin.savePluginData();
        this.redraw();
    }

    private handleCustomTagOrderChange(order: string[]): void {
        this.plugin.data.settings.sidebarCustomTagOrder = order;
        this.plugin.savePluginData();
        this.redraw();
    }

    private handleFilterBarHeightChange(height: number): void {
        this.plugin.data.settings.sidebarFilterBarHeight = height;
        this.plugin.savePluginData();
    }

    private handleIgnoreTag(tag: string): void {
        const ignoredTags = this.plugin.data.settings.sidebarIgnoredTags || [];
        if (!ignoredTags.includes(tag)) {
            ignoredTags.push(tag);
            this.plugin.data.settings.sidebarIgnoredTags = ignoredTags;
            this.plugin.savePluginData();
            new Notice(t("SIDEBAR_TAG_IGNORED", { tag }));
            this.redraw();
        }
    }

    private showTagContextMenu(e: React.MouseEvent, tag: string): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_IGNORE_TAG"))
                .setIcon("eye-off")
                .onClick(() => {
                    this.handleIgnoreTag(tag);
                });
        });

        menu.showAtMouseEvent(e.nativeEvent as MouseEvent);
    }

    // ==========================================
    // Timeline interactions
    // ==========================================

    /**
     * Select a note and load its timeline entries.
     */
    private handleNoteSelect(item: NoteReviewItem): void {
        this.selectedItem = item;

        if (this.commitStore) {
            this.commitLogs = this.commitStore.getCommits(item.path);
        }

        // Auto-expand the timeline if the setting allows it.
        if (this.plugin.data.settings.autoExpandTimeline && !this.isTimelineOpen) {
            this.isTimelineOpen = true;
        }

        this.redraw();
    }

    /**
     * Save a new timeline entry.
     */
    private async handleCommit(path: string, message: string): Promise<void> {
        if (!this.commitStore) return;

        // Free users are limited to five timeline entries per note.
        const existingCommits = this.commitStore.getCommits(path);
        if (existingCommits.length >= 5) {
            const hasAccess = await LicenseManager.getInstance(this.plugin).checkFeatureAccess(
                "Timeline",
            );
            if (!hasAccess) return;
        }

        // Capture context information for later navigation.
        let contextAnchor = undefined;
        let scrollPercentage = undefined;

        // Prefer the currently active markdown view, then fall back to matching leaves.
        let activeView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView);

        const leaves = this.app.workspace.getLeavesOfType("markdown");

        let targetLeaf = null;

        // 1. Prefer the active view if it matches the target path.
        if (activeView && activeView.file && activeView.file.path === path) {
            targetLeaf = activeView.leaf;
        }

        // 2. Otherwise search all matching markdown leaves.
        if (!targetLeaf) {
            const matchingLeaves = leaves.filter((leaf) => {
                const view = leaf.view as MarkdownView;
                return view.file && view.file.path === path;
            });

            // Prefer a visible leaf when multiple matches exist.
            let visibleLeaf = null;
            for (const leaf of matchingLeaves) {
                const view = leaf.view as MarkdownView;
                if (view.containerEl.offsetWidth > 0 || view.containerEl.offsetHeight > 0) {
                    visibleLeaf = leaf;
                    break;
                }
            }

            if (visibleLeaf) {
                targetLeaf = visibleLeaf;
            } else if (matchingLeaves.length > 0) {
                targetLeaf = matchingLeaves[0]; // Fallback to first if none visible
            }
        }

        if (targetLeaf) {
            activeView = targetLeaf.view as MarkdownView;
        } else {
            activeView = null; // Ensure activeView is null if no match found
        }

        if (activeView && activeView.file && activeView.file.path === path) {
            const editor = activeView.editor;

            // Capture the current cursor position from the matched editor.

            const cursor = editor.getCursor();
            const targetLine = cursor.line;
            const targetCh = cursor.ch;

            const text = editor.getValue();

            // Capture a text anchor near the cursor.
            const anchor = ContextAnchorService.capture(text, targetLine, targetCh);
            if (anchor) {
                contextAnchor = anchor;
            }

            // Also save a normalized character offset as a fallback.

            const totalChars = text.length;
            if (totalChars > 0) {
                const cursorOffset = editor.posToOffset({ line: targetLine, ch: targetCh });
                scrollPercentage = cursorOffset / totalChars;
            }
        }

        await this.commitStore.addCommit(path, message, contextAnchor, scrollPercentage);
        this.commitLogs = this.commitStore.getCommits(path);
        this.redraw();
    }

    /**
     * Toggle the timeline panel.
     */
    private handleTimelineToggle(): void {
        this.isTimelineOpen = !this.isTimelineOpen;
        this.redraw();
    }

    /**
     * Persist timeline height changes.
     */
    private handleTimelineHeightChange(height: number): void {
        this.timelineHeight = height;
        (this.plugin.data.settings as any).sidebarTimelineHeight = height;
        this.plugin.savePluginData();
    }

    /**
     * Open the context menu for a timeline entry.
     */
    private handleCommitContextMenu(e: React.MouseEvent, commitId: string): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_EDIT_COMMIT"))
                .setIcon("pencil")
                .onClick(() => {
                    this.handleStartEdit(commitId);
                });
        });

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_DELETE_COMMIT"))
                .setIcon("trash-2")
                .onClick(async () => {
                    if (!this.commitStore || !this.selectedItem) return;
                    await this.commitStore.deleteCommit(this.selectedItem.path, commitId);
                    this.commitLogs = this.commitStore.getCommits(this.selectedItem.path);
                    this.redraw();
                    new Notice(t("SIDEBAR_COMMIT_DELETED"));
                });
        });

        menu.showAtMouseEvent(e.nativeEvent as MouseEvent);
    }

    /**
     * Enter edit mode for a timeline entry.
     */
    private handleStartEdit(commitId: string): void {
        this.editingId = commitId;
        this.redraw();
    }

    /**
     * Cancel timeline entry editing.
     */
    private handleCancelEdit(): void {
        this.editingId = null;
        this.redraw();
    }

    /**
     * Jump back to the saved context for a timeline entry.
     */
    private async handleCommitSelect(log: ReviewCommitLog): Promise<void> {
        if (!log || !this.selectedItem) return;

        const file = this.app.vault.getAbstractFileByPath(this.selectedItem.path);
        if (!(file instanceof TFile)) return;

        // 1. Open the file if needed.
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const editor = view.editor;
            const text = editor.getValue();

            // 2. Prefer context-anchor navigation for precise restoration.
            if (log.contextAnchor) {
                const match = ContextAnchorService.findBestMatch(text, log.contextAnchor);
                if (match) {
                    editor.setCursor({ line: match.line, ch: match.ch });
                    editor.scrollIntoView(
                        {
                            from: { line: match.line, ch: match.ch },
                            to: { line: match.line, ch: match.ch },
                        },
                        true,
                    );
                    return;
                }
            }

            // 3. Fall back to the saved normalized offset.
            if (log.scrollPercentage !== undefined) {
                const scrollInfo = editor.getScrollInfo
                    ? (editor.getScrollInfo() as {
                          top: number;
                          left: number;
                          height: number;
                          clientHeight: number;
                      })
                    : null;
                if (scrollInfo && (editor as any).scrollTo) {
                    const targetTop =
                        log.scrollPercentage * (scrollInfo.height - scrollInfo.clientHeight);
                    (editor as any).scrollTo(0, targetTop);
                }
                return;
            }

            new Notice(t("UNABLE_TO_LOCATE_CONTEXT"));
        }
    }

    /**
     * Save edits to an existing timeline entry.
     */
    private async handleEditCommit(commitId: string, newMessage: string): Promise<void> {
        if (!this.commitStore || !this.selectedItem) return;
        await this.commitStore.editCommit(this.selectedItem.path, commitId, newMessage);
        this.commitLogs = this.commitStore.getCommits(this.selectedItem.path);
        this.editingId = null;
        this.redraw();
    }

    /**
     * Auto-select and expand the timeline when a reviewed file opens.
     */
    private async handleFileOpen(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.redraw();
            return;
        }

        // Only run auto-selection when the feature is enabled.
        if (this.plugin.data.settings.autoExpandTimeline) {
            // Check whether the active file exists in the current sidebar data.
            const data = reviewDecksToSidebarState(this.plugin);
            let foundItem: NoteReviewItem | null = null;

            for (const section of data.sections) {
                const item = section.items.find((i) => i.path === activeFile.path);
                if (item) {
                    foundItem = item;
                    break;
                }
            }

            if (foundItem) {
                this.selectedItem = foundItem;
                if (this.commitStore) {
                    this.commitLogs = this.commitStore.getCommits(foundItem.path);
                }
                if (!this.isTimelineOpen) {
                    this.isTimelineOpen = true;
                }
            }
        }

        this.redraw();
    }
}
