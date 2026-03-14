/**
 * [旧 UI 层 / 桥接层：Obsidian 原生 API 与 React 的混合地带] [控制器] 笔记复习模式的视图控制器，负责打开文件和调度。
 */
import { Notice, TFile } from "obsidian";
import { DataStore } from "src/dataStore/data";
import { itemToShedNote } from "src/dataStore/itemTrans";
import { reviewResponseModal } from "../modals/reviewresponse-modal";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { IReviewNote } from "src/reviewNote/review-note";
import { SRSettings } from "src/settings";

/**
 * ReviewView 类
 *
 * 负责处理笔记复习（Note Review）的核心逻辑和视图调度。
 * 这里的“复习”是指打开一个笔记文件进行回顾，而不是闪卡那种卡片式复习。
 *
 * 它实现了单例模式 (Singleton)，确保同一时间只有一个复习视图控制器在运行。
 */
export class ReviewView {
    private static _instance: ReviewView;
    itemId: number;

    private plugin: SRPlugin;
    private settings: SRSettings;

    // 工厂方法创建实例
    static create(plugin: SRPlugin, settings: SRSettings) {
        return new ReviewView(plugin, settings);
    }

    // 获取单例实例
    static getInstance() {
        if (!ReviewView._instance) {
            throw Error("there is not ReviewView instance.");
        }
        return ReviewView._instance;
    }

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.plugin = plugin;
        this.settings = settings;
        ReviewView._instance = this;
    }

    /**
     * 核心方法：召回并打开下一个复习笔记
     *
     * 这个方法会检查复习队列，获取下一个需要复习的笔记，
     * 然后在 Obsidian 的工作区中打开它，并显示评分栏 (reviewResponseModal)。
     */
    recallReviewNote(settings: SRSettings) {
        const plugin = this.plugin;
        let note: TFile;
        const store = DataStore.getInstance();
        const reviewFloatBar = reviewResponseModal.getInstance();

        // 获取复习队列
        const que = store.data.queues;
        que.buildQueue(); // 构建/刷新队列

        // 获取下一个复习项
        const item = store.getNext();

        // Obsidian 视图状态对象
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state: any = { mode: "empty" };

        if (item != null && item.isTracked) {
            this.itemId = item.ID;
            console.debug("item:", item, que.queueSize());

            const path = store.getFilePath(item);
            if (path != null) {
                // 根据路径获取文件对象
                note = plugin.app.vault.getAbstractFileByPath(path) as TFile;
                state.file = path;
                state.item = que.getNextId();
                // state.mode = "question";

                // 显示悬浮评分栏
                reviewFloatBar.display(item, async (opt) => {
                    // 用户评分后的回调 (opt 是评分结果索引)

                    // 1. 处理评分逻辑
                    IReviewNote.recallReviewResponse(this.itemId, String(opt));

                    // 2. 推迟响应/调度 (Postpone logic)
                    plugin.postponeResponse(note, itemToShedNote(item, note));

                    // 3. 如果开启了自动下一个，递归调用自己
                    if (settings.autoNextNote) {
                        this.recallReviewNote(settings);
                    }
                });
            }
        }

        // 在工作区打开文件 (Markdown 模式)
        const leaf = plugin.app.workspace.getLeaf();
        leaf.setViewState({
            type: "markdown",
            state: state,
        });

        plugin.app.workspace.setActiveLeaf(leaf);

        // 如果成功获取到 item，到这里就结束了
        if (item != null) {
            const newstate = leaf.getViewState();
            console.debug(newstate);
            return;
        }

        // 如果没有复习项了

        // 显示下次复习时间的提示通知
        ReviewView.nextReviewNotice(IReviewNote.minNextView, store.data.queues.laterSize);

        // 销毁悬浮评分栏
        reviewFloatBar.close();

        // 提示"全部完成"
        new Notice(t("ALL_CAUGHT_UP"));

        // 同步数据
        this.plugin.sync();
    }

    /**
     * 静态辅助方法：显示距离下次复习还有多久的通知
     */
    static nextReviewNotice(minNextView: number, laterSize: number) {
        if (minNextView > 0 && laterSize > 0) {
            const now = Date.now();
            // 计算分钟数
            const interval = Math.round((minNextView - now) / 1000 / 60);

            if (interval < 60) {
                new Notice(t("NEXT_REVIEW_MINUTES", { interval: interval }));
            } else if (interval < 60 * 5) {
                new Notice(t("NEXT_REVIEW_HOURS", { interval: Math.round(interval / 60) }));
            }
        }
    }
}
