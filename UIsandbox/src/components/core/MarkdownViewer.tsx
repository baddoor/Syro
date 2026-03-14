/**
 * MarkdownViewer 组件
 *
 * 用于在 React 组件中渲染 Markdown 内容
 *
 * ## 在 Sandbox 中
 * - 直接使用 dangerouslySetInnerHTML 渲染 HTML 字符串
 *
 * ## 在 Obsidian 插件中
 * - 需要使用 Obsidian 的 MarkdownRenderer.render() API
 * - 这个组件会被替换为使用 useRef + useEffect 的实现
 * - 参考: https://docs.obsidian.md/Reference/TypeScript+API/MarkdownRenderer/render
 *
 * @example
 * // 在 Obsidian 插件中的实现思路：
 * const containerRef = useRef<HTMLDivElement>(null);
 * useEffect(() => {
 *   if (containerRef.current) {
 *     containerRef.current.empty();
 *     MarkdownRenderer.render(
 *       app,
 *       markdownContent,
 *       containerRef.current,
 *       sourcePath,
 *       plugin
 *     );
 *   }
 * }, [markdownContent]);
 */

interface MarkdownViewerProps {
    /** HTML 字符串 (Sandbox) 或 Markdown 原文 (插件) */
    content: string;

    /** 是否为原始 Markdown (需要渲染) 或已渲染的 HTML */
    isRaw?: boolean;

    /** 自定义类名 */
    className?: string;

    /** 源文件路径 (Obsidian 渲染时需要，用于解析相对链接) */
    sourcePath?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
    content,
    isRaw = false,
    className = "",
    sourcePath,
}) => {
    // Sandbox 版本：直接渲染 HTML
    // 在插件中，这里需要使用 Obsidian 的渲染 API

    if (isRaw) {
        // TODO: 在插件中，这里需要调用 Obsidian 的 MarkdownRenderer
        // 目前只是展示原始文本
        return (
            <div className={`markdown-preview ${className}`}>
                <pre className="whitespace-pre-wrap text-sm text-zinc-400">{content}</pre>
            </div>
        );
    }

    // 已渲染的 HTML，直接显示
    return (
        <div
            className={`markdown-preview ${className}`}
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
};

export default MarkdownViewer;
