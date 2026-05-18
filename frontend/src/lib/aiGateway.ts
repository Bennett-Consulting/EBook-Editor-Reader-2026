/**
 * Universal AI Gateway — Model-Agnostic Provider System
 *
 * Paste any API key → auto-detect provider → discover models → smart routing.
 * Inspired by TomeMaster's Sovereign AI Gateway architecture.
 *
 * Supports: OpenAI, Google Gemini, Anthropic, Groq, Ollama, and any
 * OpenAI-compatible endpoint (gov/edu servers, local models, future providers).
 */

import { AIProvider, AIProviderConfig, AIModel, SavedAIKey } from "./types";

// ─── Provider Detection ─────────────────────────────────────────────────────

const KEY_PATTERNS: { pattern: RegExp; provider: AIProvider }[] = [
  { pattern: /^sk-ant-/, provider: "anthropic" },
  { pattern: /^sk-/, provider: "openai" },
  { pattern: /^AIza/, provider: "google" },
  { pattern: /^gsk_/, provider: "groq" },
];

/**
 * Auto-detect which AI provider an API key belongs to.
 * Returns "custom" if the key doesn't match any known pattern.
 */
export function detectProvider(apiKey: string): AIProvider {
  const trimmed = apiKey.trim();
  for (const { pattern, provider } of KEY_PATTERNS) {
    if (pattern.test(trimmed)) return provider;
  }
  return "custom";
}

/**
 * Mask an API key for display: "sk-abc...xyz"
 */
export function maskKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// ─── Provider Configurations ────────────────────────────────────────────────

const PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    icon: "🟢",
    keyPlaceholder: "sk-...",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelsEndpoint: "/models",
    chatEndpoint: "", // Gemini uses per-model endpoints
    authHeader: () => ({}), // Uses query param
    icon: "🔵",
    keyPlaceholder: "AIza...",
    consoleUrl: "https://aistudio.google.com/app/apikey",
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    modelsEndpoint: "/models",
    chatEndpoint: "/messages",
    authHeader: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
    icon: "🟠",
    keyPlaceholder: "sk-ant-...",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyOnlyShownOnce: true,
  },
  groq: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    icon: "⚡",
    keyPlaceholder: "gsk_...",
    consoleUrl: "https://console.groq.com/keys",
  },
  ollama: {
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434",
    modelsEndpoint: "/api/tags",
    chatEndpoint: "/api/chat",
    authHeader: () => ({}),
    icon: "🏠",
    keyPlaceholder: "http://localhost:11434",
  },
  custom: {
    name: "Custom / Other",
    baseUrl: "",
    modelsEndpoint: "/v1/models",
    chatEndpoint: "/v1/chat/completions",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    icon: "🔧",
    keyPlaceholder: "API key or URL",
  },
};

export function getProviderConfig(provider: AIProvider): AIProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

export function getAllProviderConfigs(): Record<AIProvider, AIProviderConfig> {
  return PROVIDER_CONFIGS;
}

// ─── Model Discovery ────────────────────────────────────────────────────────

/** Fetch available models from a provider. */
export async function discoverModels(
  provider: AIProvider,
  apiKey: string,
  customBaseUrl?: string
): Promise<AIModel[]> {
  try {
    const config = PROVIDER_CONFIGS[provider];
    const baseUrl = customBaseUrl || config.baseUrl;

    if (provider === "google") {
      return await _discoverGeminiModels(apiKey);
    }
    if (provider === "ollama") {
      return await _discoverOllamaModels(baseUrl);
    }

    // OpenAI-compatible providers (OpenAI, Groq, Custom)
    const url = `${baseUrl}${config.modelsEndpoint}`;
    const resp = await fetch(url, {
      headers: {
        ...config.authHeader(apiKey),
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();

    if (provider === "anthropic") {
      return _parseAnthropicModels(data);
    }

    // OpenAI / Groq / Custom format: { data: [{ id, ... }] }
    const models = (data.data || []) as any[];
    return models
      .filter((m: any) => {
        const id = (m.id || "").toLowerCase();
        // Filter to chat/completion models only
        if (provider === "openai") {
          return (
            id.includes("gpt") ||
            id.includes("o1") ||
            id.includes("o3") ||
            id.includes("o4")
          );
        }
        return true;
      })
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        provider,
        tier: _classifyTier(m.id, provider),
      }))
      .sort((a, b) => _tierRank(b.tier) - _tierRank(a.tier));
  } catch (e: any) {
    console.warn(`Model discovery failed for ${provider}:`, e?.message);
    return _getFallbackModels(provider);
  }
}

async function _discoverGeminiModels(apiKey: string): Promise<AIModel[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gemini: ${resp.status}`);
  const data = await resp.json();
  return (data.models || [])
    .filter(
      (m: any) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        !m.name?.includes("embedding") &&
        !m.name?.includes("aqa")
    )
    .map((m: any) => ({
      id: m.name?.replace("models/", "") || m.name,
      name: m.displayName || m.name,
      provider: "google" as AIProvider,
      tier: _classifyTier(m.name || "", "google"),
    }))
    .sort((a: AIModel, b: AIModel) => _tierRank(b.tier) - _tierRank(a.tier));
}

async function _discoverOllamaModels(baseUrl: string): Promise<AIModel[]> {
  const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!resp.ok) throw new Error(`Ollama: ${resp.status}`);
  const data = await resp.json();
  return (data.models || []).map((m: any) => ({
    id: m.name,
    name: m.name,
    provider: "ollama" as AIProvider,
    tier: "pro" as const, // Local models are always "pro" tier (no cost)
  }));
}

function _parseAnthropicModels(data: any): AIModel[] {
  const models = data.data || [];
  return models.map((m: any) => ({
    id: m.id,
    name: m.display_name || m.id,
    provider: "anthropic" as AIProvider,
    tier: _classifyTier(m.id, "anthropic"),
  }));
}

// ─── Model Classification ───────────────────────────────────────────────────

type ModelTier = "flash" | "standard" | "pro" | "flagship";

function _classifyTier(modelId: string, provider: AIProvider): ModelTier {
  const id = modelId.toLowerCase();

  if (provider === "google") {
    if (id.includes("flash-lite")) return "flash";
    if (id.includes("flash")) return "standard";
    if (id.includes("pro")) return "pro";
    if (id.includes("ultra")) return "flagship";
    return "standard";
  }
  if (provider === "openai") {
    if (id.includes("mini")) return "flash";
    if (id.includes("gpt-4o") && !id.includes("mini")) return "pro";
    if (id.includes("o1") || id.includes("o3") || id.includes("o4")) return "flagship";
    if (id.includes("gpt-3.5")) return "flash";
    return "standard";
  }
  if (provider === "anthropic") {
    if (id.includes("haiku")) return "flash";
    if (id.includes("sonnet")) return "pro";
    if (id.includes("opus")) return "flagship";
    return "standard";
  }
  if (provider === "groq") {
    if (id.includes("llama") && id.includes("70b")) return "pro";
    if (id.includes("llama") && id.includes("8b")) return "flash";
    if (id.includes("mixtral")) return "standard";
    return "standard";
  }

  return "standard";
}

function _tierRank(tier: ModelTier): number {
  switch (tier) {
    case "flagship": return 4;
    case "pro": return 3;
    case "standard": return 2;
    case "flash": return 1;
  }
}

// ─── Fallback Models (when discovery fails) ─────────────────────────────────

function _getFallbackModels(provider: AIProvider): AIModel[] {
  const fallbacks: Record<string, AIModel[]> = {
    openai: [
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", tier: "pro" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", tier: "flash" },
    ],
    google: [
      { id: "gemini-2.5-flash-preview-05-20", name: "Gemini 2.5 Flash", provider: "google", tier: "standard" },
      { id: "gemini-2.5-pro-preview-05-06", name: "Gemini 2.5 Pro", provider: "google", tier: "pro" },
    ],
    anthropic: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", tier: "pro" },
      { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", tier: "flash" },
    ],
    groq: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "groq", tier: "pro" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "groq", tier: "flash" },
    ],
    ollama: [],
    custom: [],
  };
  return fallbacks[provider] || [];
}

// ─── Smart Model Routing ────────────────────────────────────────────────────

export type TaskType = "continue" | "improve" | "shorten" | "expand";

/** Pick the best model from available models for a given task. */
export function pickBestModel(
  models: AIModel[],
  task: TaskType
): AIModel | null {
  if (models.length === 0) return null;

  // Task → desired tier
  const tierPreference: Record<TaskType, ModelTier[]> = {
    continue: ["standard", "flash", "pro"],     // Fast creative output
    improve: ["pro", "flagship", "standard"],    // Smart rewriting
    shorten: ["standard", "flash", "pro"],       // Concise output
    expand: ["pro", "flagship", "standard"],     // Rich, detailed writing
  };

  const preferred = tierPreference[task];
  for (const tier of preferred) {
    const match = models.find((m) => m.tier === tier);
    if (match) return match;
  }
  return models[0]; // Fallback to first available
}

// ─── Unified Chat Interface ─────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatOptions {
  provider: AIProvider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  customBaseUrl?: string;
}

/** Send a chat completion to any provider. Returns the assistant's response text. */
export async function chat(opts: ChatOptions): Promise<string> {
  const {
    provider,
    apiKey,
    model,
    messages,
    maxTokens = 1000,
    temperature = 0.7,
    customBaseUrl,
  } = opts;

  if (provider === "google") {
    return _chatGemini(apiKey, model, messages, maxTokens, temperature);
  }
  if (provider === "anthropic") {
    return _chatAnthropic(apiKey, model, messages, maxTokens, temperature);
  }
  if (provider === "ollama") {
    const baseUrl = customBaseUrl || "http://localhost:11434";
    return _chatOllama(baseUrl, model, messages, temperature);
  }

  // OpenAI-compatible (OpenAI, Groq, Custom)
  const config = PROVIDER_CONFIGS[provider];
  const baseUrl = customBaseUrl || config.baseUrl;
  return _chatOpenAICompat(
    baseUrl,
    apiKey,
    model,
    messages,
    maxTokens,
    temperature,
    config.authHeader(apiKey)
  );
}

async function _chatOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  headers: Record<string, string>
): Promise<string> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${model}: ${resp.status} — ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function _chatGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  // Convert to Gemini format
  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: any = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini ${model}: ${resp.status} — ${err.slice(0, 200)}`);
  }
  const data = await resp.json();

  const candidate = data.candidates?.[0];
  if (!candidate) {
    const blockReason = data.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no response${blockReason ? `: blocked (${blockReason})` : ""}`);
  }

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini stopped: ${finishReason} — try a different model or shorter text`);
  }

  const text = candidate?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function _chatAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const nonSystem = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: any = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: nonSystem,
  };
  if (systemMsg) body.system = systemMsg;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude ${model}: ${resp.status} — ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text?.trim() || "";
}

async function _chatOllama(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  temperature: number
): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Ollama ${model}: ${resp.status} — ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.message?.content?.trim() || "";
}

// ─── Key Validation ─────────────────────────────────────────────────────────

/** Quick validation: tries to list models with the key. Returns true if key works. */
export async function validateKey(
  provider: AIProvider,
  apiKey: string,
  customBaseUrl?: string
): Promise<{ valid: boolean; modelCount: number; error?: string }> {
  try {
    const models = await discoverModels(provider, apiKey, customBaseUrl);
    if (models.length > 0) {
      return { valid: true, modelCount: models.length };
    }
    return { valid: false, modelCount: 0, error: "No models found" };
  } catch (e: any) {
    return { valid: false, modelCount: 0, error: e?.message || "Connection failed" };
  }
}
