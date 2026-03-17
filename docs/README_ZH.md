# Syro

Syro 是一款面向 Obsidian 的间隔复习、flashcards、笔记复习与增量学习插件，帮助你在同一套工作流里完成卡片复习与整篇笔记复习。

- 英文说明: [../README.md](../README.md)
- 中文文档总入口: [./docs/zh/index.md](./docs/zh/index.md)
- 英文文档总入口: [./docs/en/index.md](./docs/en/index.md)
- 发布页: <https://github.com/baddoor/Syro/releases>

## 核心能力

- 在同一工作流中复习 flashcards 与整篇笔记
- 围绕笔记、文件夹与复习分组组织 incremental learning 流程
- 支持 FSRS 与多种复习队列策略
- 复习数据既可写回笔记，也可存放到独立数据文件
- 提供统计、延期、重排等维护工具

## 安装

### 社区插件

插件上架到 Obsidian Community Plugins 后，可直接搜索 `Syro` 安装。

### BRAT

在 BRAT 中添加仓库 `baddoor/Syro`，安装最新版本。

### 手动安装

1. 从发布页下载 `main.js`、`manifest.json`、`styles.css`
2. 在你的库中创建目录 `.obsidian/plugins/syro`
3. 将上述文件复制到该目录
4. 重启 Obsidian 并启用 `Syro`

当前 manifest / 插件 ID 为 `syro`。如果最终公开发布时插件 ID 有调整，手动安装目录也需要同步修改。

## 使用入口

你可以从以下入口开始使用 Syro：

- 命令面板中搜索 `Syro`
- 状态栏
- 侧边栏
- 笔记与文件夹的右键菜单

更多配置、功能详解、数据与排障说明请从 [./docs/zh/index.md](./docs/zh/index.md) 开始阅读。

## 迁移说明

- 如果你准备从其他复习插件迁移，请先完整备份库
- 如果你之前使用过旧的内部命名或历史目录名，请迁移到 `.obsidian/plugins/syro`
- `obsidian-Syro` 不再作为正式插件 ID 或正式安装目录使用

## 商业化与联网披露

此区块为未来收费、CDK、账号体系或联网能力预留。当前状态：

- 收费或 CDK 要求：暂未启用
- 账号登录要求：暂未启用
- 云同步或强制外部服务依赖：暂未启用
- 核心复习功能向第三方服务发送数据：暂未启用

## 致谢

Syro 借鉴并吸收了多个开源项目中的思路与实现。

- FSRS: <https://github.com/open-spaced-repetition/ts-fsrs>
- cMenu 灵感来源: <https://github.com/chetachiezikeuzor/cMenu-Plugin>
- Release Notes 灵感来源: <https://zsolt.blog>

授权信息见仓库内的许可证文件。
