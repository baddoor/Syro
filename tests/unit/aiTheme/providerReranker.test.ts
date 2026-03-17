import { AiThemeLlmTransport } from "src/aiTheme/providerReranker";
import {
    AiThemeRerankExecutionInput,
    AiThemeResolvedLlmConfig,
} from "src/aiTheme/types";
import {
    listAiThemeProviderModels,
    runAiThemeProviderRerank,
} from "src/aiTheme/providerReranker";

const DEFAULT_RESPONSE = {
    status: 200,
    text: "",
    json: {
        choices: [
            {
                message: {
                    content: '["p:/Vault/Plan.md"]',
                },
            },
        ],
    },
} as const;

function createTransport(response: unknown = DEFAULT_RESPONSE) {
    const request = jest.fn().mockResolvedValue(response);
    return { request } as AiThemeLlmTransport & { request: jest.Mock };
}

function createExecutionInput(config: AiThemeResolvedLlmConfig): AiThemeRerankExecutionInput {
    return {
        themePrompt: "topic",
        candidates: [
            {
                key: "p:/Vault/Plan.md",
                path: "Vault/Plan.md",
            },
        ],
        limit: 3,
        provider: config.provider,
        model: config.model,
        providerId: config.provider,
        resolvedConfig: config,
        strictJson: config.strictJsonOutput,
        systemPrompt: config.systemPrompt,
    };
}

describe("Provider reranker transport integration", () => {
    it("builds OpenAI-style request for LM Studio", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: {
                choices: [
                    {
                        message: {
                            content: '["p:/Vault/Plan.md"]',
                        },
                    },
                ],
            },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "lm_studio",
            model: "lm-model",
            systemPrompt: "Explain topic",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.2,
            maxTokens: 512,
            topP: 0.9,
            baseUrl: "http://localhost:1234",
            chatEndpoint: "/v1/chat/completions",
            headers: { "X-Test": "1" },
            adapterKind: "lm_studio",
        };

        await runAiThemeProviderRerank(createExecutionInput(config), transport);

        const requestArg = transport.request.mock.calls[0][0];
        expect(requestArg.url).toBe("http://localhost:1234/v1/chat/completions");
        expect(requestArg.method).toBe("POST");
        const body = JSON.parse(requestArg.body);
        expect(body.model).toBe("lm-model");
        const messages = body.messages as Array<{ role?: string }>;
        expect(messages.some((msg) => msg.role === "user")).toBe(true);
        expect(requestArg.headers["Content-Type"]).toBe("application/json");
        expect(requestArg.headers["X-Test"]).toBe("1");
    });

    it("routes Ollama requests through host and chat endpoint", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: {
                message: {
                    content: '["p:/Vault/Plan.md"]',
                },
            },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "ollama",
            model: "ollama-model",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 128,
            topP: 1,
            host: "http://localhost:11434",
            chatEndpoint: "/api/chat",
            headers: {},
            adapterKind: "ollama",
        };

        await runAiThemeProviderRerank(createExecutionInput(config), transport);

        const requestArg = transport.request.mock.calls[0][0];
        expect(requestArg.url).toBe("http://localhost:11434/api/chat");
        const body = JSON.parse(requestArg.body);
        expect(body.options.num_predict).toBe(128);
        expect(body.format).toBe("json");
    });

    it("builds Gemini requests with key query", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: {
                candidates: [
                    {
                        content: {
                            parts: [{ text: '["p:/Vault/Plan.md"]' }],
                        },
                    },
                ],
            },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "gemini",
            model: "gemini-1.5-pro",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 256,
            topP: 1,
            baseUrl: "https://generativelanguage.googleapis.com",
            headers: {},
            apiKey: "secret-key",
            adapterKind: "gemini",
        };

        await runAiThemeProviderRerank(createExecutionInput(config), transport);

        const requestArg = transport.request.mock.calls[0][0];
        expect(requestArg.url).toContain("/v1beta/models/gemini-1.5-pro:generateContent");
        expect(requestArg.url).toContain("key=secret-key");
    });

    it("builds Anthropics requests with headers and version", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: {
                content: [{ text: '["p:/Vault/Plan.md"]' }],
            },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "anthropic",
            model: "claude-2",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 256,
            topP: 1,
            baseUrl: "https://api.anthropic.com",
            headers: {},
            apiKey: "anthropic-key",
            anthropicVersion: "2023-06-01",
            adapterKind: "anthropic",
        };

        await runAiThemeProviderRerank(createExecutionInput(config), transport);

        const requestArg = transport.request.mock.calls[0][0];
        expect(requestArg.url).toBe("https://api.anthropic.com/v1/messages");
        expect(requestArg.headers["x-api-key"]).toBe("anthropic-key");
        expect(requestArg.headers["anthropic-version"]).toBe("2023-06-01");
    });

    it("builds Azure OpenAI requests using resource, deployment, version, and key", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: {
                choices: [
                    {
                        message: {
                            content: '["p:/Vault/Plan.md"]',
                        },
                    },
                ],
            },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "azure_openai",
            model: "gpt-35-turbo",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 256,
            topP: 1,
            headers: {},
            apiKey: "azure-key",
            azureResourceName: "my-resource",
            azureDeploymentName: "my-deployment",
            azureApiVersion: "2024-10-01-preview",
            adapterKind: "azure_openai",
        };

        await runAiThemeProviderRerank(createExecutionInput(config), transport);

        const requestArg = transport.request.mock.calls[0][0];
        expect(requestArg.url).toBe(
            "https://my-resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-10-01-preview",
        );
        expect(requestArg.headers["api-key"]).toBe("azure-key");
    });
});

describe("Provider model listing", () => {
    it("fetches OpenAI-style models", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: { data: [{ id: "gpt-5" }] },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "openai",
            model: "gpt-5",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 512,
            topP: 1,
            baseUrl: "https://api.openai.com",
            modelsEndpoint: "/v1/models",
            headers: {},
            apiKey: "openai-key",
            adapterKind: "openai",
        };

        const models = await listAiThemeProviderModels(config, transport);
        expect(transport.request).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "GET",
                url: "https://api.openai.com/v1/models",
            }),
        );
        expect(models).toEqual([{ id: "gpt-5", label: "gpt-5" }]);
    });

    it("fetches Gemini models with api key query", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: { models: [{ name: "models/gemini-1.5" }] },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "gemini",
            model: "gemini-1.5",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 512,
            topP: 1,
            baseUrl: "https://generativelanguage.googleapis.com",
            modelsEndpoint: "/v1beta/models",
            headers: {},
            apiKey: "gemini-key",
            adapterKind: "gemini",
        };

        const models = await listAiThemeProviderModels(config, transport);
        expect(transport.request).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "GET",
                url: expect.stringContaining("?key=gemini-key"),
            }),
        );
        expect(models[0].id).toBe("gemini-1.5");
    });

    it("fetches Ollama models", async () => {
        const transport = createTransport({
            status: 200,
            text: "",
            json: { models: [{ name: "ollama-model" }] },
        });
        const config: AiThemeResolvedLlmConfig = {
            provider: "ollama",
            model: "ollama-model",
            strictJsonOutput: true,
            timeoutMs: 30000,
            temperature: 0.1,
            maxTokens: 512,
            topP: 1,
            host: "http://localhost:11434",
            modelsEndpoint: "/api/tags",
            headers: {},
            adapterKind: "ollama",
        };

        const models = await listAiThemeProviderModels(config, transport);
        expect(transport.request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "http://localhost:11434/api/tags",
                method: "GET",
            }),
        );
        expect(models[0].id).toBe("ollama-model");
    });
});
