import { requestUrl } from "obsidian";
import {
    AiThemeLlmAdapterKind,
    AiThemeLlmModelOption,
    AiThemeLlmProviderConfigMap,
    AiThemeLlmProviderId,
    AiThemeRerankExecutionInput,
    AiThemeResolvedLlmConfig,
} from "src/aiTheme/types";

interface AiThemeHttpRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

interface AiThemeHttpResponse {
    status: number;
    text: string;
    json: unknown;
}

export interface AiThemeLlmTransport {
    request(input: AiThemeHttpRequest): Promise<AiThemeHttpResponse>;
}

interface ProviderDefaults {
    provider: AiThemeLlmProviderId;
    baseUrl?: string;
    host?: string;
    chatEndpoint?: string;
    modelsEndpoint?: string;
    timeoutMs: number;
    temperature: number;
    maxTokens: number;
    topP: number;
    strictJsonOutput: boolean;
    requiresApiKey: boolean;
    adapterKind: AiThemeLlmAdapterKind;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const PROVIDER_DEFAULTS: Record<AiThemeLlmProviderId, ProviderDefaults> = {
    lm_studio: {
        provider: "lm_studio",
        baseUrl: "http://localhost:1234",
        chatEndpoint: "/v1/chat/completions",
        modelsEndpoint: "/v1/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: false,
        adapterKind: "lm_studio",
    },
    ollama: {
        provider: "ollama",
        host: "http://localhost:11434",
        chatEndpoint: "/api/chat",
        modelsEndpoint: "/api/tags",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: false,
        adapterKind: "ollama",
    },
    openai: {
        provider: "openai",
        baseUrl: "https://api.openai.com",
        chatEndpoint: "/v1/chat/completions",
        modelsEndpoint: "/v1/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: true,
        adapterKind: "openai",
    },
    open_router: {
        provider: "open_router",
        baseUrl: "https://openrouter.ai",
        chatEndpoint: "/api/v1/chat/completions",
        modelsEndpoint: "/api/v1/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: true,
        adapterKind: "openai",
    },
    gemini: {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        modelsEndpoint: "/v1beta/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: true,
        adapterKind: "gemini",
    },
    anthropic: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        chatEndpoint: "/v1/messages",
        modelsEndpoint: "/v1/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: true,
        adapterKind: "anthropic",
    },
    azure_openai: {
        provider: "azure_openai",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: true,
        adapterKind: "azure_openai",
    },
    custom_openai_compatible: {
        provider: "custom_openai_compatible",
        baseUrl: "http://localhost:1234",
        chatEndpoint: "/v1/chat/completions",
        modelsEndpoint: "/v1/models",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        temperature: 0.1,
        maxTokens: 512,
        topP: 1,
        strictJsonOutput: true,
        requiresApiKey: false,
        adapterKind: "openai",
    },
};

export class RequestUrlAiThemeLlmTransport implements AiThemeLlmTransport {
    async request(input: AiThemeHttpRequest): Promise<AiThemeHttpResponse> {
        const response = await requestUrl({
            url: input.url,
            method: input.method ?? "POST",
            headers: input.headers,
            body: input.body,
        });
        return {
            status: response.status,
            text: response.text,
            json: response.json,
        };
    }
}

export function normalizeAiThemeLlmProviderId(value?: string): AiThemeLlmProviderId {
    const normalized = (value ?? "").trim().toLowerCase();
    switch (normalized) {
        case "lm_studio":
        case "ollama":
        case "openai":
        case "open_router":
        case "gemini":
        case "anthropic":
        case "azure_openai":
        case "custom_openai_compatible":
            return normalized;
        case "openrouter":
            return "open_router";
        case "azure":
            return "azure_openai";
        case "custom":
            return "custom_openai_compatible";
        default:
            return "openai";
    }
}

function normalizeResolvedEndpoints(config: AiThemeResolvedLlmConfig): AiThemeResolvedLlmConfig {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    const normalized = { ...config };
    const expectedChatEndpoint = config.chatEndpoint ?? defaults.chatEndpoint;

    if (expectedChatEndpoint) {
        if (normalized.baseUrl) {
            normalized.baseUrl = stripKnownEndpointSuffix(normalized.baseUrl, expectedChatEndpoint);
        }
        if (normalized.host) {
            normalized.host = stripKnownEndpointSuffix(normalized.host, expectedChatEndpoint);
        }
    }

    if (normalized.provider === "ollama" && !normalized.host && normalized.baseUrl) {
        normalized.host = normalized.baseUrl;
    }

    if (
        normalized.provider === "custom_openai_compatible" &&
        !normalized.adapterKind &&
        normalized.customAdapterKind
    ) {
        normalized.adapterKind = normalizeAdapterKind(normalized.customAdapterKind) ?? "openai";
    }

    return normalized;
}

export function resolveAiThemeLlmConfig(
    settings: unknown,
    providerOverride?: string,
    modelOverride?: string,
    systemPromptOverride?: string,
    strictJsonOverride?: boolean,
): AiThemeResolvedLlmConfig {
    const settingsRecord = asRecord(settings) ?? {};
    const provider = normalizeAiThemeLlmProviderId(
        providerOverride ??
            asString(settingsRecord.aiThemeLlmActiveProvider) ??
            asString(settingsRecord.aiThemeLlmProvider),
    );
    const defaults = PROVIDER_DEFAULTS[provider];
    const providerMap = asRecord(settingsRecord.aiThemeLlmProviders) as
        | AiThemeLlmProviderConfigMap
        | null;
    const providerConfig = asRecord(providerMap?.[provider]) ?? {};

    const headersJson =
        asString(providerConfig.headersJson) ??
        asString(settingsRecord.aiThemeLlmHeadersJson) ??
        "";

    const resolved: AiThemeResolvedLlmConfig = {
        provider,
        adapterKind:
            normalizeAdapterKind(
                asString(providerConfig.adapterKind) ??
                    asString(providerConfig.customAdapterKind) ??
                    asString(settingsRecord.aiThemeLlmAdapterKind) ??
                    asString(settingsRecord.aiThemeLlmCustomAdapterKind),
            ) ?? defaults.adapterKind,
        model:
            (modelOverride ?? asString(providerConfig.model) ?? asString(settingsRecord.aiThemeLlmModel) ?? "").trim(),
        baseUrl:
            asString(providerConfig.baseUrl) ??
            asString(settingsRecord.aiThemeLlmBaseUrl) ??
            defaults.baseUrl,
        host:
            asString(providerConfig.host) ?? asString(settingsRecord.aiThemeLlmHost) ?? defaults.host,
        apiKey:
            asString(providerConfig.apiKey) ?? asString(settingsRecord.aiThemeLlmApiKey) ?? undefined,
        headersJson,
        headers: parseHeadersJson(headersJson),
        timeoutMs:
            asNumber(providerConfig.timeoutMs) ??
            asNumber(settingsRecord.aiThemeLlmTimeoutMs) ??
            defaults.timeoutMs,
        temperature:
            asNumber(providerConfig.temperature) ??
            asNumber(settingsRecord.aiThemeLlmTemperature) ??
            defaults.temperature,
        maxTokens:
            asNumber(providerConfig.maxTokens) ??
            asNumber(settingsRecord.aiThemeLlmMaxTokens) ??
            defaults.maxTokens,
        topP:
            asNumber(providerConfig.topP) ??
            asNumber(settingsRecord.aiThemeLlmTopP) ??
            defaults.topP,
        chatEndpoint:
            asString(providerConfig.chatEndpoint) ??
            asString(settingsRecord.aiThemeLlmChatEndpoint) ??
            defaults.chatEndpoint,
        modelsEndpoint:
            asString(providerConfig.modelsEndpoint) ??
            asString(settingsRecord.aiThemeLlmModelsEndpoint) ??
            defaults.modelsEndpoint,
        systemPrompt:
            (systemPromptOverride ??
                asString(settingsRecord.aiThemeLlmPrompt) ??
                "You are selecting review entries relevant to a user theme. Return strict JSON only.").trim(),
        strictJsonOutput: strictJsonOverride ?? asBoolean(settingsRecord.aiThemeStrictJsonOutput) ?? defaults.strictJsonOutput,
        azureResourceName:
            asString(providerConfig.azureResourceName) ??
            asString(settingsRecord.aiThemeLlmAzureResourceName) ??
            undefined,
        azureDeploymentName:
            asString(providerConfig.azureDeploymentName) ??
            asString(settingsRecord.aiThemeLlmAzureDeploymentName) ??
            undefined,
        azureApiVersion:
            asString(providerConfig.azureApiVersion) ??
            asString(settingsRecord.aiThemeLlmAzureApiVersion) ??
            "2024-10-01-preview",
        anthropicVersion:
            asString(providerConfig.anthropicVersion) ??
            asString(settingsRecord.aiThemeLlmAnthropicVersion) ??
            "2023-06-01",
    };

    if (!resolved.model && resolved.provider === "azure_openai" && resolved.azureDeploymentName) {
        resolved.model = resolved.azureDeploymentName;
    }

    return normalizeResolvedEndpoints(resolved);
}

export async function runAiThemeProviderRerank(
    input: AiThemeRerankExecutionInput,
    transport: AiThemeLlmTransport,
): Promise<string> {
    const config = input.resolvedConfig;
    validateConfig(config);

    const userPrompt = buildRerankUserPrompt(input);
    const systemPrompt = (config.systemPrompt ?? input.systemPrompt ?? "").trim();
    const adapterKind = config.adapterKind ?? "openai";

    if (adapterKind === "gemini") {
        const response = await transport.request(buildGeminiRequest(config, systemPrompt, userPrompt));
        return extractGeminiText(response.json);
    }
    if (adapterKind === "anthropic") {
        const response = await transport.request(
            buildAnthropicRequest(config, systemPrompt, userPrompt),
        );
        return extractAnthropicText(response.json);
    }
    if (adapterKind === "ollama") {
        const response = await transport.request(buildOllamaRequest(config, systemPrompt, userPrompt));
        return extractOllamaText(response.json);
    }
    if (adapterKind === "azure_openai") {
        const response = await transport.request(
            buildAzureOpenAiRequest(config, systemPrompt, userPrompt),
        );
        return extractOpenAiText(response.json);
    }

    const response = await transport.request(buildOpenAiStyleRequest(config, systemPrompt, userPrompt));
    return extractOpenAiText(response.json);
}

export async function listAiThemeProviderModels(
    config: AiThemeResolvedLlmConfig,
    transport: AiThemeLlmTransport,
): Promise<AiThemeLlmModelOption[]> {
    validateConfigForModelListing(config);
    const adapterKind = config.adapterKind ?? "openai";

    if (config.provider === "azure_openai") {
        if (config.azureDeploymentName) {
            return [{ id: config.azureDeploymentName, label: config.azureDeploymentName }];
        }
        return [];
    }

    if (adapterKind === "gemini") {
        const response = await transport.request(buildGeminiModelsRequest(config));
        return parseGeminiModels(response.json);
    }
    if (adapterKind === "anthropic") {
        const response = await transport.request(buildAnthropicModelsRequest(config));
        return parseAnthropicModels(response.json);
    }
    if (adapterKind === "ollama") {
        const response = await transport.request(buildOllamaModelsRequest(config));
        return parseOllamaModels(response.json);
    }

    const response = await transport.request(buildOpenAiModelsRequest(config));
    return parseOpenAiModels(response.json);
}

function buildOpenAiStyleRequest(
    config: AiThemeResolvedLlmConfig,
    systemPrompt: string,
    userPrompt: string,
): AiThemeHttpRequest {
    const url = joinUrl(requireBaseUrl(config), config.chatEndpoint ?? "/v1/chat/completions");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const body = {
        model: config.model,
        messages: buildOpenAiMessages(systemPrompt, userPrompt),
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        response_format: config.strictJsonOutput ? { type: "json_object" } : undefined,
    };
    return {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(removeUndefined(body)),
    };
}

function buildAzureOpenAiRequest(
    config: AiThemeResolvedLlmConfig,
    systemPrompt: string,
    userPrompt: string,
): AiThemeHttpRequest {
    const resourceName = ensureValue(config.azureResourceName, "Azure resource name is required.");
    const deploymentName = ensureValue(
        config.azureDeploymentName,
        "Azure deployment name is required.",
    );
    const apiVersion = config.azureApiVersion ?? "2024-10-01-preview";
    const url = `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "api-key": ensureValue(config.apiKey, "Azure OpenAI API key is required."),
        ...config.headers,
    };
    const body = {
        messages: buildOpenAiMessages(systemPrompt, userPrompt),
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        response_format: config.strictJsonOutput ? { type: "json_object" } : undefined,
    };
    return {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(removeUndefined(body)),
    };
}

function buildGeminiRequest(
    config: AiThemeResolvedLlmConfig,
    systemPrompt: string,
    userPrompt: string,
): AiThemeHttpRequest {
    const baseUrl = requireBaseUrl(config);
    const model = encodeURIComponent(config.model);
    const apiKey = ensureValue(config.apiKey, "Gemini API key is required.");
    const url = joinUrl(baseUrl, `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`);
    const body = {
        systemInstruction: systemPrompt
            ? { parts: [{ text: systemPrompt }] }
            : undefined,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: config.temperature,
            topP: config.topP,
            maxOutputTokens: config.maxTokens,
            responseMimeType: config.strictJsonOutput ? "application/json" : undefined,
        },
    };
    return {
        url,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...config.headers,
        },
        body: JSON.stringify(removeUndefined(body)),
    };
}

function buildAnthropicRequest(
    config: AiThemeResolvedLlmConfig,
    systemPrompt: string,
    userPrompt: string,
): AiThemeHttpRequest {
    const url = joinUrl(requireBaseUrl(config), config.chatEndpoint ?? "/v1/messages");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": ensureValue(config.apiKey, "Anthropic API key is required."),
        "anthropic-version": config.anthropicVersion ?? "2023-06-01",
        ...config.headers,
    };
    const body = {
        model: config.model,
        system: systemPrompt || undefined,
        messages: [{ role: "user", content: userPrompt }],
        temperature: config.temperature,
        top_p: config.topP,
        max_tokens: config.maxTokens,
    };
    return {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(removeUndefined(body)),
    };
}

function buildOllamaRequest(
    config: AiThemeResolvedLlmConfig,
    systemPrompt: string,
    userPrompt: string,
): AiThemeHttpRequest {
    const url = joinUrl(requireHost(config), config.chatEndpoint ?? "/api/chat");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
    };
    const body = {
        model: config.model,
        stream: false,
        messages: buildOpenAiMessages(systemPrompt, userPrompt),
        options: {
            temperature: config.temperature,
            top_p: config.topP,
            num_predict: config.maxTokens,
        },
        format: config.strictJsonOutput ? "json" : undefined,
    };
    return {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(removeUndefined(body)),
    };
}

function buildOpenAiModelsRequest(config: AiThemeResolvedLlmConfig): AiThemeHttpRequest {
    const url = joinUrl(requireBaseUrl(config), config.modelsEndpoint ?? "/v1/models");
    const headers: Record<string, string> = {
        ...config.headers,
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    return {
        url,
        method: "GET",
        headers,
    };
}

function buildGeminiModelsRequest(config: AiThemeResolvedLlmConfig): AiThemeHttpRequest {
    const baseUrl = requireBaseUrl(config);
    const apiKey = ensureValue(config.apiKey, "Gemini API key is required.");
    const url = joinUrl(
        baseUrl,
        `${config.modelsEndpoint ?? "/v1beta/models"}?key=${encodeURIComponent(apiKey)}`,
    );
    return {
        url,
        method: "GET",
        headers: { ...config.headers },
    };
}

function buildAnthropicModelsRequest(config: AiThemeResolvedLlmConfig): AiThemeHttpRequest {
    const url = joinUrl(requireBaseUrl(config), config.modelsEndpoint ?? "/v1/models");
    return {
        url,
        method: "GET",
        headers: {
            "x-api-key": ensureValue(config.apiKey, "Anthropic API key is required."),
            "anthropic-version": config.anthropicVersion ?? "2023-06-01",
            ...config.headers,
        },
    };
}

function buildOllamaModelsRequest(config: AiThemeResolvedLlmConfig): AiThemeHttpRequest {
    const url = joinUrl(requireHost(config), config.modelsEndpoint ?? "/api/tags");
    return {
        url,
        method: "GET",
        headers: { ...config.headers },
    };
}

function buildOpenAiMessages(systemPrompt: string, userPrompt: string) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });
    return messages;
}

function buildRerankUserPrompt(input: AiThemeRerankExecutionInput): string {
    const candidates = input.candidates.slice(0, 200).map((candidate, index) => ({
        index,
        key: candidate.key,
        path: candidate.path,
        lineNo: candidate.lineNo,
        score: candidate.score,
        sourceText: trimSourceText(candidate.sourceText),
    }));

    return [
        "Select review entry keys relevant to the user's theme.",
        `Return at most ${input.limit} keys in best-to-worst order.`,
        "Output JSON only. Prefer either an array of keys or an object with a `keys` array.",
        "",
        `Theme: ${input.themePrompt}`,
        "",
        `Candidates: ${JSON.stringify(candidates, null, 2)}`,
    ].join("\n");
}

function trimSourceText(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.length <= 600) return normalized;
    return normalized.slice(0, 600) + "...";
}

function extractOpenAiText(json: unknown): string {
    const obj = asRecord(json);
    const choices = asArray(obj?.choices);
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice?.message);
    const content = message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        const joined = content
            .map((part) => (asRecord(part)?.text as string | undefined) ?? "")
            .filter(Boolean)
            .join("\n");
        if (joined) return joined;
    }
    throw new Error("OpenAI-compatible response did not contain assistant text.");
}

function extractGeminiText(json: unknown): string {
    const obj = asRecord(json);
    const candidates = asArray(obj?.candidates);
    const firstCandidate = asRecord(candidates[0]);
    const content = asRecord(firstCandidate?.content);
    const parts = asArray(content?.parts);
    const text = parts
        .map((part) => (asRecord(part)?.text as string | undefined) ?? "")
        .filter(Boolean)
        .join("");
    if (!text) throw new Error("Gemini response did not contain text.");
    return text;
}

function extractAnthropicText(json: unknown): string {
    const obj = asRecord(json);
    const content = asArray(obj?.content);
    const text = content
        .map((part) => {
            const record = asRecord(part);
            return typeof record?.text === "string" ? record.text : "";
        })
        .filter(Boolean)
        .join("\n");
    if (!text) throw new Error("Anthropic response did not contain text.");
    return text;
}

function extractOllamaText(json: unknown): string {
    const obj = asRecord(json);
    const message = asRecord(obj?.message);
    const text = asString(message?.content);
    if (!text) throw new Error("Ollama response did not contain text.");
    return text;
}

function parseOpenAiModels(json: unknown): AiThemeLlmModelOption[] {
    const obj = asRecord(json);
    const data = asArray(obj?.data);
    return (
        data
            .map((item) => {
                const record = asRecord(item);
                const id = asString(record?.id);
                if (!id) return null;
                return { id, label: id };
            })
            .filter(Boolean) as AiThemeLlmModelOption[]
    );
}

function parseGeminiModels(json: unknown): AiThemeLlmModelOption[] {
    const obj = asRecord(json);
    const models = asArray(obj?.models);
    return (
        models
            .map((item) => {
                const record = asRecord(item);
                const name = asString(record?.name);
                if (!name) return null;
                const normalizedName = name.replace(/^models\//, "");
                const contextWindow = asNumber(record?.inputTokenLimit);
                return contextWindow == null
                    ? {
                          id: normalizedName,
                          label: normalizedName,
                      }
                    : {
                          id: normalizedName,
                          label: normalizedName,
                          contextWindow,
                      };
            })
            .filter(Boolean) as AiThemeLlmModelOption[]
    );
}

function parseAnthropicModels(json: unknown): AiThemeLlmModelOption[] {
    const obj = asRecord(json);
    const data = asArray(obj?.data);
    return (
        data
            .map((item) => {
                const record = asRecord(item);
                const id = asString(record?.id);
                if (!id) return null;
                return { id, label: id };
            })
            .filter(Boolean) as AiThemeLlmModelOption[]
    );
}

function parseOllamaModels(json: unknown): AiThemeLlmModelOption[] {
    const obj = asRecord(json);
    const models = asArray(obj?.models);
    return (
        models
            .map((item) => {
                const record = asRecord(item);
                const name = asString(record?.name) ?? asString(record?.model);
                if (!name) return null;
                return { id: name, label: name };
            })
            .filter(Boolean) as AiThemeLlmModelOption[]
    );
}

function validateConfig(config: AiThemeResolvedLlmConfig): void {
    if (!config.model) throw new Error(`Model is required for provider ${config.provider}.`);
    const defaults = PROVIDER_DEFAULTS[config.provider];
    if (defaults.requiresApiKey && !config.apiKey) {
        throw new Error(`API key is required for provider ${config.provider}.`);
    }
    if (config.provider !== "azure_openai" && config.adapterKind !== "ollama" && !config.baseUrl && !config.host) {
        throw new Error(`Base URL/host is required for provider ${config.provider}.`);
    }
}

function validateConfigForModelListing(config: AiThemeResolvedLlmConfig): void {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    if (defaults.requiresApiKey && !config.apiKey && config.provider !== "azure_openai") {
        throw new Error(`API key is required to list models for provider ${config.provider}.`);
    }
}

function requireBaseUrl(config: AiThemeResolvedLlmConfig): string {
    return ensureValue(config.baseUrl, `Base URL is required for provider ${config.provider}.`);
}

function requireHost(config: AiThemeResolvedLlmConfig): string {
    return ensureValue(config.host ?? config.baseUrl, `Host is required for provider ${config.provider}.`);
}

function joinUrl(baseUrl: string, path: string): string {
    if (!path) return baseUrl;
    if (/^https?:\/\//i.test(path)) return path;
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return normalizedBase + normalizedPath;
}

function stripKnownEndpointSuffix(value: string, suffix: string): string {
    const trimmedValue = value.trim();
    const trimmedSuffix = suffix.trim();
    if (!trimmedValue || !trimmedSuffix) return trimmedValue;
    if (!/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
    if (!trimmedValue.endsWith(trimmedSuffix)) return trimmedValue;
    return trimmedValue.slice(0, trimmedValue.length - trimmedSuffix.length);
}

function normalizeAdapterKind(value?: string): AiThemeLlmAdapterKind | null {
    const normalized = (value ?? "").trim().toLowerCase();
    switch (normalized) {
        case "openai":
        case "ollama":
        case "gemini":
        case "anthropic":
        case "azure_openai":
        case "lm_studio":
            return normalized;
        case "azure":
            return "azure_openai";
        default:
            return null;
    }
}

function parseHeadersJson(headersJson: string): Record<string, string> {
    if (!headersJson.trim()) return {};
    try {
        const parsed = JSON.parse(headersJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
            if (typeof value === "string" && key.trim()) {
                acc[key.trim()] = value;
            }
            return acc;
        }, {});
    } catch {
        return {};
    }
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
    ) as T;
}

function ensureValue(value: string | undefined, message: string): string {
    if (!value) throw new Error(message);
    return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized ? normalized : undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    return undefined;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
