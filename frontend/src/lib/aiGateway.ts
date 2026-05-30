/**
 * Universal AI Gateway — Model-Agnostic Provider Router
 *
 * Paste any API key → auto-detect provider → discover models → smart routing.
 * Inspired by TomeMaster's Sovereign AI Gateway architecture.
 *
 * Provider-specific logic lives in ./providers/*.ts (black-box engines).
 * This file is the router: detection, config, routing, fallback models.
 */

import { AIProvider, AIProviderConfig, AIModel } from "./types";
import {
  chatOpenAICompat,
  discoverOpenAIModels,
  chatGemini,
  discoverGeminiModels,
  classifyGeminiTier,
  chatAnthropic,
  parseAnthropicModels,
  chatOllama,
  discoverOllamaModels,
  discoverBitnetModels,
} from "./providers";

// ─── Provider Detection ─────────────────────────────────────────────────────

const KEY_PATTERNS: { pattern: RegExp; provider: AIProvider }[] = [
  { pattern: /^sk-ant-/, provider: "anthropic" },
  { pattern: /^sk-/, provider: "openai" },
  { pattern: /^AIza/, provider: "google" },
  { pattern: /^gsk_/, provider: "groq" },
  { pattern: /^bitnet-local$/, provider: "bitnet" },
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

/** Mask an API key for display: "sk-abc...xyz" */
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
    chatEndpoint: "",
    authHeader: () => ({}),
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
  bitnet: {
    name: "BitNet (CPU)",
    baseUrl: "http://localhost:8080",
    modelsEndpoint: "/v1/models",
    chatEndpoint: "/v1/chat/completions",
    authHeader: () => ({}),
    icon: "⚛️",
    keyPlaceholder: "http://localhost:8080",
    consoleUrl: "https://github.com/microsoft/BitNet",
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

// ─── Model Discovery (routes to provider engines) ───────────────────────────

export async function discoverModels(
  provider: AIProvider,
  apiKey: string,
  customBaseUrl?: string
): Promise<AIModel[]> {
  try {
    const config = PROVIDER_CONFIGS[provider];
    const baseUrl = customBaseUrl || config.baseUrl;

    if (provider === "google") return await discoverGeminiModels(apiKey);
    if (provider === "ollama") return await discoverOllamaModels(baseUrl);
    if (provider === "bitnet") return await discoverBitnetModels(baseUrl);

    // Anthropic model list uses OpenAI-compat endpoint but custom parse
    if (provider === "anthropic") {
      const url = `${baseUrl}${config.modelsEndpoint}`;
      const resp = await fetch(url, {
        headers: { ...config.authHeader(apiKey), "Content-Type": "application/json" },
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return parseAnthropicModels(await resp.json());
    }

    // OpenAI-compatible (OpenAI, Groq, Custom)
    return await discoverOpenAIModels(
      baseUrl,
      config.modelsEndpoint,
      apiKey,
      config.authHeader(apiKey),
      provider
    );
  } catch (e: any) {
    console.warn(`Model discovery failed for ${provider}:`, e?.message);
    return _getFallbackModels(provider);
  }
}


// ─── Smart Model Routing ────────────────────────────────────────────────────

export type TaskType = "continue" | "improve" | "shorten" | "expand";
type ModelTier = "flash" | "standard" | "pro" | "flagship";

/** Pick the best model from available models for a given task. */
export function pickBestModel(models: AIModel[], task: TaskType): AIModel | null {
  if (models.length === 0) return null;

  const tierPreference: Record<TaskType, ModelTier[]> = {
    continue: ["standard", "flash", "pro"],
    improve: ["pro", "flagship", "standard"],
    shorten: ["standard", "flash", "pro"],
    expand: ["pro", "flagship", "standard"],
  };

  const preferred = tierPreference[task];
  for (const tier of preferred) {
    const match = models.find((m) => m.tier === tier);
    if (match) return match;
  }
  return models[0];
}

// ─── Unified Chat Interface (routes to provider engines) ────────────────────

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
    return chatGemini(apiKey, model, messages, maxTokens, temperature);
  }
  if (provider === "anthropic") {
    return chatAnthropic(apiKey, model, messages, maxTokens, temperature);
  }
  if (provider === "ollama") {
    const baseUrl = customBaseUrl || "http://localhost:11434";
    return chatOllama(baseUrl, model, messages, temperature);
  }
  if (provider === "bitnet") {
    const baseUrl = customBaseUrl || "http://localhost:8080";
    return chatOpenAICompat(
      `${baseUrl}/v1`, "", model, messages, maxTokens, temperature,
      { "Content-Type": "application/json" }
    );
  }

  // OpenAI-compatible (OpenAI, Groq, Custom)
  const config = PROVIDER_CONFIGS[provider];
  const baseUrl = customBaseUrl || config.baseUrl;
  return chatOpenAICompat(
    baseUrl, apiKey, model, messages, maxTokens, temperature,
    config.authHeader(apiKey)
  );
}

// ─── Key Validation ─────────────────────────────────────────────────────────

/** Quick validation: tries to list models with the key. Returns true if key works. */
export async function validateKey(
  provider: AIProvider,
  apiKey: string,
  customBaseUrl?: string
): Promise<{ valid: boolean; modelCount: number; error?: string }> {
  try {
    if (provider === "bitnet") {
      const baseUrl = customBaseUrl || "http://localhost:8080";
      const models = await discoverBitnetModels(baseUrl);
      return models.length > 0
        ? { valid: true, modelCount: models.length }
        : { valid: false, modelCount: 0, error: "BitNet server running but no models loaded" };
    }
    const models = await discoverModels(provider, apiKey, customBaseUrl);
    return models.length > 0
      ? { valid: true, modelCount: models.length }
      : { valid: false, modelCount: 0, error: "No models found" };
  } catch (e: any) {
    return { valid: false, modelCount: 0, error: e?.message || "Connection failed" };
  }
}

// ─── Fallback Models ────────────────────────────────────────────────────────

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
    bitnet: [],
    custom: [],
  };
  return fallbacks[provider] || [];
}
