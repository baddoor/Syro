export type TimelineDurationUnit = "day" | "month";

export interface TimelineDurationPart {
    value: number;
    unit: TimelineDurationUnit;
}

export interface TimelineDurationPrefix {
    raw: string;
    normalized: string;
    totalDays: number;
    parts: TimelineDurationPart[];
}

export interface ParsedTimelineMessage {
    raw: string;
    body: string;
    durationPrefix: TimelineDurationPrefix | null;
}

const DURATION_UNIT_ALIASES: Record<string, TimelineDurationUnit> = {
    d: "day",
    day: "day",
    days: "day",
    mo: "month",
    month: "month",
    months: "month",
};

const PREFIX_CAPTURE = /^\s*((?:\d+\s*(?:days|day|d|months|month|mo)\s*)+)::\s*/i;
const PREFIX_SEGMENT = /(\d+)\s*(days|day|d|months|month|mo)/gi;

export function parseTimelineMessage(message: string): ParsedTimelineMessage {
    const raw = message ?? "";
    const match = raw.match(PREFIX_CAPTURE);
    if (!match) {
        return {
            raw,
            body: raw,
            durationPrefix: null,
        };
    }

    const rawPrefix = match[1];
    const parts: TimelineDurationPart[] = [];
    let consumed = "";
    let totalDays = 0;

    for (const partMatch of rawPrefix.matchAll(PREFIX_SEGMENT)) {
        const value = Number(partMatch[1]);
        const rawUnit = partMatch[2].toLowerCase();
        const unit = DURATION_UNIT_ALIASES[rawUnit];
        if (!unit || !Number.isFinite(value)) {
            return {
                raw,
                body: raw,
                durationPrefix: null,
            };
        }

        parts.push({ value, unit });
        consumed += `${partMatch[1]}${rawUnit}`;
        totalDays += unit === "month" ? value * 30 : value;
    }

    const compactRawPrefix = rawPrefix.replace(/\s+/g, "").toLowerCase();
    if (parts.length === 0 || consumed !== compactRawPrefix) {
        return {
            raw,
            body: raw,
            durationPrefix: null,
        };
    }

    const normalized = parts
        .map((part) => `${part.value}${part.unit === "month" ? "mo" : "d"}`)
        .join("");

    return {
        raw,
        body: raw.slice(match[0].length),
        durationPrefix: {
            raw: rawPrefix.replace(/\s+/g, ""),
            normalized,
            totalDays,
            parts,
        },
    };
}

export function normalizeTimelineInlineLines(body: string): string[] {
    return body.replace(/\r\n/g, "\n").split("\n");
}

export function sanitizeTimelineInlineMarkdown(line: string): string {
    if (!line) return "";

    let sanitized = line;

    if (/^\s*\|.*\|\s*$/.test(sanitized)) {
        sanitized = sanitized.replace(/\|/g, "\\|");
    }

    sanitized = sanitized.replace(/^(\s*)(#{1,6}\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(>\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)([-+*]\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(\d+[.)]\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(`{3,}|~{3,})/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(:{3,})/, "$1\\$2");

    return sanitized;
}
