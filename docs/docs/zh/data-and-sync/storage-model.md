# 存储模型

## 这是什么
- 当前正式口径是：普通用户以插件目录存储为准，不再把历史上的多种 `dataLocation` 方案当成推荐主线。
- 这一页解释主数据文件、Overlay、笔记复习数据、提交记录和 AI 主题包数据分别承担什么职责。

## 从哪里进入
- 当你查看插件目录下的 JSON 文件时，就是在接触存储模型。
- 备份、迁移、对账和排障时，这一页会成为你的参考底图。

## 适合什么场景
- 你想知道 `tracked_files.json`、`review_notes.json`、`review_commits.json` 之间是什么关系。
- 你准备做一次完整备份，不确定哪些文件必须一起带走。
- 你看到 `ai_theme_decks.json` 或 Overlay 文件，想判断它是不是异常残留。

## 具体步骤
1. 把 `tracked_files.json` 看成卡片与追踪主数据的核心承载文件。
2. 把 `tracked_files.review_overlay.json` 看成主数据落盘前的增量层；它不是无意义副本，而是状态一致性的重要组成部分。
3. 把 `review_notes.json` 理解成笔记复习的独立数据层，把 `review_commits.json` 理解成与 Timeline / 提交记录相关的补充层。
4. 如果你使用 AI 主题包，再把 `ai_theme_decks.json` 纳入备份集合，而不是只备份卡片主数据。

## 相关设置 / 相关命令
- 相关页面： [同步、缓存与 Overlay](./sync-cache-and-overlay.md)、[数据文件参考](../appendix/data-files-reference.md)。
- 旧模式和升级逻辑见 [旧存储迁移](./legacy-storage-migration.md)。

## 常见错误
- 只备份 `tracked_files.json`，忽略其他同样承载关键状态的文件。
- 把 Overlay 文件误判成可以随便删除的临时垃圾。
- 看到旧教程提到其他存储位置，就以为今天仍然推荐那样做。

## FAQ
- **为什么笔记复习不直接全塞进主文件**：因为它和卡片数据虽然相关，但生命周期、上下文和提交记录需求并不完全相同。
- **AI 主题包数据是不是核心功能必须备份**：如果你使用了 AI 主题包，就是必须一起备份的组成部分。
- **当前正式支持的存储方式是什么**：文档口径收敛为插件目录存储；历史其他模式只保留迁移说明。

## 排错与风险提示
- 手工删除 Overlay 或独立数据文件前，请先确认你理解它们是否仍承载未合并状态。
- 如果你要在多台机器之间手工搬运文件，最好一次性搬完整组，而不是分批猜测哪些更重要。

---

继续阅读：
- [同步、缓存与 Overlay](./sync-cache-and-overlay.md)
- [旧存储迁移](./legacy-storage-migration.md)
- [数据文件参考](../appendix/data-files-reference.md)
