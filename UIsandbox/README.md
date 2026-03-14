# SR-Recall UI Sandbox Guide

这个文件夹是你的“前端实验室”。它的存在是为了让你脱离插件复杂的内部逻辑，专心制作精致的 UI。

## 如何开始

1.  **初始化 Vite 项目**：
    在你的桌面或其他地方运行：

    ```bash
    npm create vite@latest sr-ui-sandbox -- --template react-ts
    cd sr-ui-sandbox
    npm install -D tailwindcss postcss autoprefixer
    npx tailwindcss init -p
    npm install framer-motion zustand lucide-react
    ```

2.  **引入数据契约**：
    将此目录下的 `types.ts` 和 `mockData.ts` 复制到你 Vite 项目的 `src/` 目录中。

3.  **开始 Greenfield 开发**：
    - 使用 `mockData.ts` 里的 `MOCK_CARDS` 来渲染复习界面。
    - 使用 `MOCK_DECKS` 来渲染牌组选择树。
    - 在网页里实时调试 **Tailwind** 样式和 **Framer Motion** 动画。

## 核心原则

- **只传 Props**：你的 React 组件应该足够“笨”，它们只负责展示 JSON 数据。
- **不调 API**：绝对不要在 React 组件里尝试调用 Obsidian 的 `app`。所有的交互（如点击评分）都应该通过 `onAnswer(score)` 这样的回调函数传出去。
- **极致视觉**：利用 Vite 的瞬时刷新，打磨每一个像素细节。

当你在网页里觉得“这就是我要的感觉”时，再把它拷回插件的 `src/gui` 目录。
