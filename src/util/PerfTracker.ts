import { App, TFile, Notice } from "obsidian";

export class PerfTracker {
    private static marks: Record<string, number> = {};
    private static logs: string[] = ["Action,Duration(ms),Timestamp"];

    /**
     * 开始计时
     * @param actionName 操作名称
     */
    static start(actionName: string) {
        this.marks[actionName] = performance.now();
    }

    /**
     * 结束计时并记录
     * @param actionName 操作名称
     */
    static end(actionName: string) {
        if (!this.marks[actionName]) return;
        const duration = performance.now() - this.marks[actionName];
        const timestamp = new Date().toISOString();

        this.logs.push(`${actionName},${duration.toFixed(2)},${timestamp}`);

        delete this.marks[actionName];
    }

    /**
     * 将测试结果导出到 Obsidian 库根目录的 CSV 中
     * @param app Obsidian App 实例
     * @param filename 导出的文件名
     */
    static async exportToCSV(app: App, filename = "syro_internal_perf.csv") {
        const csvContent = this.logs.join("\n");
        try {
            const fileExists = app.vault.getAbstractFileByPath(filename);
            if (fileExists && fileExists instanceof TFile) {
                await app.vault.modify(fileExists, csvContent);
            } else {
                await app.vault.create(filename, csvContent);
            }
            new Notice(`[PerfTracker] 性能数据已导出至 ${filename}`);
        } catch (e) {
            console.error("[PerfTracker] 导出失败:", e);
            new Notice("[PerfTracker] 导出失败，请查看控制台。");
        }
    }

    /**
     * 清空日志
     */
    static clear() {
        this.logs = ["Action,Duration(ms),Timestamp"];
        this.marks = {};
    }
}
