export const SYRO_ANKI_MEDIA_FILES: Record<string, string> = {
    "_syro_anki_sync.css": `
:root {
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    --bg: #fafafa;
    --fg: #1a1a1a;
    --line: #e0e0e0;
    --badge-bg: #eaeaea;
    --badge-fg: #666666;
}

.nightMode {
    --bg: #121212;
    --fg: #efefef;
    --line: #333333;
    --badge-bg: #262626;
    --badge-fg: #888888;
}

.card {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    font-size: 20px;
    line-height: 1.8;
    text-align: left;
    margin: 0;
    padding: 20px 24px;
}

.syro-container {
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
}

.syro-header {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 16px;
    border-bottom: 2px solid var(--fg);
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 40px;
}

.syro-path {
    padding: 8px 0;
    letter-spacing: 0.08em;
    opacity: 0.5;
    flex-grow: 1;
    min-width: 0;
    word-break: break-word;
}

.syro-path a {
    color: inherit !important;
    text-decoration: none !important;
    pointer-events: auto;
}

.syro-path a:hover {
    color: var(--fg) !important;
}

.syro-brand {
    padding: 6px 14px;
    background-color: var(--badge-bg);
    color: var(--badge-fg);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    white-space: nowrap;
}

.syro-body {
    font-size: 20px;
    line-height: 1.8;
    letter-spacing: 0.02em;
}

.syro-body p {
    margin-top: 0;
    margin-bottom: 1.2em;
}

.syro-body ul,
.syro-body ol {
    margin-top: 0;
    margin-bottom: 1.2em;
    padding-left: 24px;
}

.syro-body li {
    margin-bottom: 0.5em;
}

.syro-body pre {
    overflow-x: auto;
    padding: 14px 16px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.06);
}

.nightMode .syro-body pre {
    background: rgba(255, 255, 255, 0.08);
}

.syro-body code {
    font-family: var(--font-mono);
}

.syro-body :not(pre) > code {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.06);
}

.nightMode .syro-body :not(pre) > code {
    background: rgba(255, 255, 255, 0.08);
}

.syro-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.2em 0;
}

.syro-body th,
.syro-body td {
    padding: 10px 12px;
    border: 1px solid var(--line);
    text-align: left;
}

.syro-body img {
    max-width: 100%;
    height: auto;
}

.cloze,
.syro-cloze,
.syro-anki-mask,
.syro-anki-answer,
.syro-anki-inline-cloze {
    color: #166534 !important;
    font-weight: 700 !important;
}

mark,
.syro-highlight {
    background-color: rgba(250, 204, 21, 0.35) !important;
    color: inherit !important;
    padding: 0 4px;
    border-radius: 2px;
}

.nightMode .cloze,
.nightMode .syro-cloze,
.nightMode .syro-anki-mask,
.nightMode .syro-anki-answer,
.nightMode .syro-anki-inline-cloze {
    color: #4ade80 !important;
}

.nightMode mark,
.nightMode .syro-highlight {
    background-color: rgba(250, 204, 21, 0.25) !important;
}
`,
    "_syro_anki_sync.js": `
(function() {
    function wrapTextNodes(root, pattern, replacer) {
        if (!root) {
            return;
        }
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var targets = [];
        var node;
        while ((node = walker.nextNode())) {
            if (!node.textContent || !pattern.test(node.textContent)) {
                pattern.lastIndex = 0;
                continue;
            }
            pattern.lastIndex = 0;
            targets.push(node);
        }

        targets.forEach(function(textNode) {
            var text = textNode.textContent || "";
            var frag = document.createDocumentFragment();
            var lastIndex = 0;
            text.replace(pattern, function(match) {
                var index = arguments[arguments.length - 2];
                if (index > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, index)));
                }
                var wrapper = document.createElement("span");
                wrapper.innerHTML = replacer.apply(null, arguments);
                while (wrapper.firstChild) {
                    frag.appendChild(wrapper.firstChild);
                }
                lastIndex = index + match.length;
                return match;
            });
            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }
            textNode.parentNode.replaceChild(frag, textNode);
        });
    }

    window.syroApplyTemplateFallback = function(elementId, side) {
        window.setTimeout(function() {
            var contentDiv = document.getElementById(elementId);
            if (!contentDiv) {
                return;
            }

            wrapTextNodes(contentDiv, /\[\.\.\.\]/g, function() {
                return '<span class="syro-cloze">[...]</span>';
            });

            if (side === "back") {
                wrapTextNodes(contentDiv, /\[([^\]<]+?)\]/g, function(match, inner) {
                    if (inner === "...") {
                        return match;
                    }
                    return '<span class="syro-cloze">[' + inner + ']</span>';
                });
            }

            wrapTextNodes(contentDiv, /==([^=]+)==/g, function(match, inner) {
                return '<mark>' + inner + '</mark>';
            });
        }, 10);
    };
})();
`,
};

export const SYRO_ANKI_MODEL_FIELDS = [
    "Front",
    "Back",
    "Context",
    "Source",
    "Breadcrumb",
    "OpenLink",
    "ExactLink",
    "syro_item_uuid",
    "syro_file_path",
    "syro_card_hash",
    "syro_snapshot",
    "syro_updated_at",
];

export function buildSyroAnkiModelCss(): string {
    return `
.card {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    text-align: left;
}
`;
}

export function buildSyroAnkiTemplateFront(): string {
    return `
<script src="_syro_anki_sync.js"></script>
<link rel="stylesheet" href="_syro_anki_sync.css">
<div class="syro-container">
    <div class="syro-header">
        <div class="syro-path">{{Breadcrumb}}</div>
        <div class="syro-brand">OB¡¤SYRO</div>
    </div>

    <div class="syro-body" id="syro-content">
        {{Front}}
    </div>
</div>

<script>
    if (window.syroApplyTemplateFallback) {
        window.syroApplyTemplateFallback("syro-content", "front");
    }
</script>
`;
}

export function buildSyroAnkiTemplateBack(): string {
    return `
<script src="_syro_anki_sync.js"></script>
<link rel="stylesheet" href="_syro_anki_sync.css">
<div class="syro-container">
    <div class="syro-header">
        <div class="syro-path">{{Breadcrumb}}</div>
        <div class="syro-brand">OB¡¤SYRO</div>
    </div>

    <div class="syro-body" id="syro-content-back">
        {{Back}}
    </div>
</div>

<script>
    if (window.syroApplyTemplateFallback) {
        window.syroApplyTemplateFallback("syro-content-back", "back");
    }
</script>
`;
}
