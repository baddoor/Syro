export const SYRO_ANKI_MEDIA_FILES: Record<string, string> = {
    "_syro_anki_sync.css": `
body {
    margin: 0;
    padding: 0;
    background: #f5f7fb;
}

.card {
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 18px;
    line-height: 1.65;
    text-align: left;
    color: #1f2937;
    background: #f5f7fb;
}

.nightMode.card {
    background: #101827;
    color: #e5e7eb;
}

.syro-anki-shell {
    max-width: 860px;
    margin: 0 auto;
    padding: 20px 16px 28px;
}

.syro-anki-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
}

.syro-anki-breadcrumb {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #64748b;
    font-size: 13px;
}

.syro-anki-breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.syro-anki-breadcrumb a:hover {
    color: #2563eb;
}

.syro-anki-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.06);
    white-space: nowrap;
}

.nightMode .syro-anki-badge {
    background: rgba(15, 23, 42, 0.92);
    border-color: rgba(148, 163, 184, 0.18);
    box-shadow: 0 12px 30px rgba(2, 6, 23, 0.32);
}

.syro-anki-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.syro-anki-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 70px;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid rgba(37, 99, 235, 0.16);
    background: rgba(37, 99, 235, 0.08);
    color: #1d4ed8;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
}

.syro-anki-action:hover {
    background: rgba(37, 99, 235, 0.14);
}

.nightMode .syro-anki-action {
    background: rgba(96, 165, 250, 0.16);
    border-color: rgba(96, 165, 250, 0.2);
    color: #bfdbfe;
}

.syro-anki-panel {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 18px;
    box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
    overflow: hidden;
}

.nightMode .syro-anki-panel {
    background: rgba(15, 23, 42, 0.94);
    border-color: rgba(148, 163, 184, 0.16);
    box-shadow: 0 18px 46px rgba(2, 6, 23, 0.35);
}

.syro-anki-main {
    padding: 28px 28px 24px;
}

.syro-anki-face {
    word-break: break-word;
}

.syro-anki-front-preview {
    opacity: 0.72;
}

.syro-anki-answer-divider {
    height: 1px;
    margin: 20px 0;
    background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.42), transparent);
}

.syro-anki-meta {
    padding: 0 28px 24px;
    display: grid;
    gap: 14px;
}

.syro-anki-meta-block {
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(241, 245, 249, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.18);
}

.nightMode .syro-anki-meta-block {
    background: rgba(30, 41, 59, 0.55);
    border-color: rgba(148, 163, 184, 0.15);
}

.syro-anki-meta-label {
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
}

.syro-anki-meta-value {
    color: inherit;
    font-size: 14px;
    line-height: 1.65;
}

.syro-anki-meta-value a {
    color: #2563eb;
}

.nightMode .syro-anki-meta-value a {
    color: #93c5fd;
}

.syro-anki-mask,
.syro-anki-answer,
.syro-anki-inline-cloze {
    display: inline-block;
    padding: 0 0.25em;
    border-radius: 0.38em;
    font-weight: 700;
}

.syro-anki-mask {
    color: #1d4ed8;
    background: rgba(59, 130, 246, 0.12);
}

.syro-anki-answer,
.syro-anki-inline-cloze {
    color: #0f766e;
    background: rgba(20, 184, 166, 0.14);
}

.nightMode .syro-anki-mask {
    color: #bfdbfe;
    background: rgba(96, 165, 250, 0.22);
}

.nightMode .syro-anki-answer,
.nightMode .syro-anki-inline-cloze {
    color: #99f6e4;
    background: rgba(45, 212, 191, 0.16);
}

.syro-anki-face mark,
.syro-anki-meta-value mark {
    color: inherit;
    background: rgba(250, 204, 21, 0.28);
    padding: 0 0.18em;
    border-radius: 0.32em;
}

.syro-anki-face pre {
    overflow-x: auto;
    padding: 14px 16px;
    border-radius: 14px;
    background: #0f172a;
    color: #e2e8f0;
}

.syro-anki-face code {
    font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
    font-size: 0.9em;
}

.syro-anki-face :not(pre) > code {
    padding: 0.14em 0.35em;
    border-radius: 0.35em;
    background: rgba(148, 163, 184, 0.18);
}

.syro-anki-face table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.8em 0;
}

.syro-anki-face th,
.syro-anki-face td {
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    text-align: left;
}

.syro-anki-face blockquote {
    margin: 0.9em 0;
    padding-left: 1em;
    border-left: 3px solid rgba(59, 130, 246, 0.35);
    color: #475569;
}

.nightMode .syro-anki-face blockquote {
    color: #cbd5e1;
}

.syro-anki-face img {
    max-width: 100%;
    height: auto;
}

.syro-anki-face ul,
.syro-anki-face ol {
    padding-left: 1.4em;
}
`,
    "_syro_anki_sync.js": `
(function() {
    function scrollToActive() {
        var target = document.querySelector(
            ".syro-anki-answer, .syro-anki-mask, .syro-anki-inline-cloze"
        );
        if (!target || typeof target.scrollIntoView !== "function") {
            return;
        }
        window.setTimeout(function() {
            target.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });
        }, 40);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scrollToActive, { once: true });
    } else {
        scrollToActive();
    }
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
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 18px;
    line-height: 1.65;
    text-align: left;
}
`;
}

export function buildSyroAnkiTemplateFront(): string {
    return `
<script src="_syro_anki_sync.js"></script>
<link rel="stylesheet" href="_syro_anki_sync.css">
<div class="syro-anki-shell syro-anki-front">
    <div class="syro-anki-header">
        {{#Breadcrumb}}<div class="syro-anki-breadcrumb">{{Breadcrumb}}</div>{{/Breadcrumb}}
        <div class="syro-anki-actions">
            {{#OpenLink}}<a class="syro-anki-action" href="{{OpenLink}}" title="Open in Obsidian">Open</a>{{/OpenLink}}
            {{#ExactLink}}<a class="syro-anki-action" href="{{ExactLink}}" title="Locate exact source">Locate</a>{{/ExactLink}}
        </div>
    </div>
    <div class="syro-anki-panel">
        <div class="syro-anki-main">
            <div class="syro-anki-face">{{Front}}</div>
        </div>
    </div>
</div>
`;
}

export function buildSyroAnkiTemplateBack(): string {
    return `
<script src="_syro_anki_sync.js"></script>
<link rel="stylesheet" href="_syro_anki_sync.css">
<div class="syro-anki-shell syro-anki-back">
    <div class="syro-anki-header">
        {{#Breadcrumb}}<div class="syro-anki-breadcrumb">{{Breadcrumb}}</div>{{/Breadcrumb}}
        <div class="syro-anki-actions">
            {{#OpenLink}}<a class="syro-anki-action" href="{{OpenLink}}" title="Open in Obsidian">Open</a>{{/OpenLink}}
            {{#ExactLink}}<a class="syro-anki-action" href="{{ExactLink}}" title="Locate exact source">Locate</a>{{/ExactLink}}
        </div>
    </div>
    <div class="syro-anki-panel">
        <div class="syro-anki-main">
            <div class="syro-anki-face syro-anki-front-preview">{{Front}}</div>
            <div class="syro-anki-answer-divider"></div>
            <div class="syro-anki-face">{{Back}}</div>
        </div>
        <div class="syro-anki-meta">
            {{#Context}}
            <div class="syro-anki-meta-block">
                <div class="syro-anki-meta-label">Context</div>
                <div class="syro-anki-meta-value">{{Context}}</div>
            </div>
            {{/Context}}
            {{#Source}}
            <div class="syro-anki-meta-block">
                <div class="syro-anki-meta-label">Source</div>
                <div class="syro-anki-meta-value">{{Source}}</div>
            </div>
            {{/Source}}
        </div>
    </div>
</div>
`;
}
