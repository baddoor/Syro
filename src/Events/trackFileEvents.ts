/**
 * [事件层：监听系统事件] [核心] 监听 Obsidian 的文件重命名、删除、修改事件，同步更新 DataStore。
 * 当检测到笔记修改导致卡片索引变化时，会触发防抖同步，并通过事件总线广播给打开的 UI 组件。
 *
 * 它在项目中属于：事件层
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/dataLocation.ts — 判断数据存储方式
 * 2. src/main.ts — 获取插件实例和 sync 方法
 * 3. src/lang/helpers.ts — 国际化翻译
 *
 * 哪些文件会用到它：
 * 1. src/main.ts — 插件启动时注册这些事件监听器
 */
import { Menu, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { DEFAULT_DECKNAME } from "src/constants";
import SRPlugin from "src/main";
import { t } from "src/lang/helpers";
import { Tags } from "src/tags";

export function registerTrackFileEvents(plugin: SRPlugin) {
    const logRuntimeDebug = (...args: unknown[]) => {
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.log(...args);
        }
    };

    // 1. 定义防抖同步函数 (2秒)
    const debouncedSync = debounce(
        async () => {
            logRuntimeDebug("[SR-DynSync] debouncedSync 触发，开始全局同步...");
            // 全局同步 (更新 Tree, 计算数量)
            await plugin.requestSync({ trigger: "file-event" });
            // 保存到硬盘
            await plugin.store.save();
            // 刷新 UI (侧边栏)
            // @ts-ignore
            if (plugin.reviewQueueView && plugin.reviewQueueView.redraw) {
                // @ts-ignore
                plugin.reviewQueueView.redraw();
            }
            logRuntimeDebug("[SR-DynSync] debouncedSync 完成");
        },
        2000,
        true,
    );

    // 2. 监听重命名
    plugin.registerEvent(
        plugin.app.vault.on("rename", async (file, old) => {
            const trackFile = plugin.store.getTrackedFile(old);
            if (trackFile != null) {
                trackFile.rename(file.path);
                await plugin.store.save();
                plugin.markSyncDirty();
                debouncedSync();
            }
        }),
    );

    // 3. 监听删除
    plugin.registerEvent(
        plugin.app.vault.on("delete", (file) => {
            if (plugin.store.getTrackedFile(file.path)) {
                plugin.store.untrackFile(file.path);
                plugin.store.save();
                plugin.markSyncDirty();
                debouncedSync();
            }
        }),
    );

    // 4. 监听修改
    plugin.registerEvent(
        plugin.app.vault.on("modify", async (file: TFile) => {
            if (file.extension === "md") {
                const trackedFile = plugin.store.getTrackedFile(file.path);
                if (plugin.store.isTrackedCardfile(file.path)) {
                    const trackFile = trackedFile;
                    const fileText = await plugin.app.vault.read(file);

                    // 内存中更新索引并收集消失的卡片 ID
                    const result = trackFile.syncNoteCardsIndex(fileText, plugin.data.settings);

                    // 局部即时清理：如果该文件中有卡片 ID 消失，立即从 DataStore 中注销
                    if (result.removedIds.length > 0) {
                        logRuntimeDebug(
                            `[SR-DynSync] 局部清理: 检测到 ${result.removedIds.length} 个消失的卡片 ID，文件:`,
                            file.path,
                        );
                        for (const id of result.removedIds) {
                            plugin.store.unTrackItem(id);
                        }
                    }

                    // 如果有任何变化（位置变化或卡片增减），触发防抖同步
                    if (result.hasChange) {
                        logRuntimeDebug(
                            "[SR-DynSync] modify 检测到变化，触发 debouncedSync，文件:",
                            file.path,
                        );
                        plugin.markSyncDirty();
                        debouncedSync();
                    } else {
                        logRuntimeDebug(
                            "[SR-DynSync] modify 无变化，不触发同步，文件:",
                            file.path,
                        );
                    }
                } else {
                    let shouldSync = false;

                    // 1. 检查是否包含增量阅读标签
                    const noteDeckName = Tags.getNoteDeckName(file, plugin.data.settings);
                    const previousTrackedDeck =
                        trackedFile?.isTrackedNote ? trackedFile.lastTag ?? null : null;
                    const reviewDeckChanged =
                        noteDeckName !== null
                            ? !trackedFile ||
                              !trackedFile.isTrackedNote ||
                              previousTrackedDeck !== noteDeckName
                            : trackedFile?.isTrackedNote === true &&
                              previousTrackedDeck !== null &&
                              previousTrackedDeck !== DEFAULT_DECKNAME &&
                              plugin.data.settings.tagsToReview.includes(previousTrackedDeck);
                    if (noteDeckName !== null && !trackedFile) {
                        plugin.store.trackFile(file.path, noteDeckName, false);
                    }
                    if (reviewDeckChanged) {
                        shouldSync = true;
                    }

                    // 2. 检查是否包含闪卡特征（快速字符串匹配，避免对所有普通笔记进行昂贵的完整解析）
                    const fileText = await plugin.app.vault.read(file);
                    const settings = plugin.data.settings;

                    const hasInlineSeparator =
                        fileText.includes(settings.singleLineCardSeparator) ||
                        fileText.includes(settings.singleLineReversedCardSeparator);
                    const hasMultilineSeparator =
                        fileText.includes(settings.multilineCardSeparator) ||
                        fileText.includes(settings.multilineReversedCardSeparator);
                    // 粗略匹配可能的 Anki 填空/高亮/加粗（根据用户设置开启的内容）
                    const hasCloze =
                        fileText.includes("{{c") ||
                        fileText.includes("{{C") ||
                        fileText.includes("==") ||
                        fileText.includes("**");

                    if (hasInlineSeparator || hasMultilineSeparator || hasCloze) {
                        const note = await plugin.loadNote(file);
                        if (note.questionList.length > 0) {
                            shouldSync = true;
                        }
                    }

                    if (shouldSync) {
                        logRuntimeDebug(
                            "[SR-DynSync] modify 发现新卡片或标签，已追踪并触发同步:",
                            file.path,
                        );
                        plugin.markSyncDirty();
                        debouncedSync();
                    } else {
                        logRuntimeDebug(
                            "[SR-DynSync] modify 文件未被追踪且无卡片/标签，跳过:",
                            file.path,
                        );
                    }
                }
            }
        }),
    );
}

export function addFileMenuEvt(plugin: SRPlugin, menu: Menu, fileish: TAbstractFile) {
    const store = plugin.store;
    if (fileish instanceof TFolder) {
        const folder = fileish as TFolder;

        menu.addItem((item) => {
            item.setIcon("plus-with-circle");
            item.setTitle(t("MENU_TRACK_ALL_NOTES"));
            item.onClick(async (_evt) => {
                store.trackFilesInFolder(folder);
                await store.save();
                plugin.sync();
            });
        });

        menu.addItem((item) => {
            item.setIcon("minus-with-circle");
            item.setTitle(t("MENU_UNTRACK_ALL_NOTES"));
            item.onClick(async (_evt) => {
                store.untrackFilesInFolder(folder);
                await store.save();
                plugin.sync();
            });
        });
    } else if (fileish instanceof TFile) {
        if (store.getTrackedFile(fileish.path)?.isTrackedNote) {
            menu.addItem((item) => {
                item.setIcon("minus-with-circle");
                item.setTitle(t("MENU_UNTRACK_NOTE"));
                item.onClick(async (_evt) => {
                    store.untrackFile(fileish.path, true);
                    await store.save();
                    if (plugin.reviewFloatBar.isDisplay() && plugin.data.settings.autoNextNote) {
                        plugin.reviewNextNote(plugin.lastSelectedReviewDeck);
                    }
                    await plugin.sync();
                });
            });
        } else {
            menu.addItem((item) => {
                item.setIcon("plus-with-circle");
                item.setTitle(t("MENU_TRACK_NOTE"));
                item.onClick(async (_evt) => {
                    store.trackFile(fileish.path, undefined, true);
                    await store.save();
                    plugin.sync();
                });
            });
        }
    }
}
