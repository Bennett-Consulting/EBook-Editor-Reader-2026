/**
 * Universal AI Gateway — Model-Agnostic Provider Router
 *
 * Paste any API key → auto-detect provider → discover models → smart routing.
 * Inspired by TomeMaster's Sovereign AI Gateway architecture.
 *
 * Provider-specific logic lives in ./providers/*.ts (black-box engines).
 * This file is the router: detection, config, routing, fallback models.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { getActiveAIKey, getBook } from "./storage";
import { buildContext } from "./ai/context";
import type { StyleProfile } from "./ai/context";
import { streamRequest } from "./ai/streaming";
import type { StreamCallbacks, StreamConfig } from "./ai/streaming";
import { analyzeBook } from "./ai/analysis";
import type { AnalysisProgress, AnalysisResult } from "./ai/analysis";

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

  const preferred = tierPreference[task] || ["standard", "flash", "pro", "flagship"];
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

// ─── Fallback Models (LAST RESORT ONLY) ─────────────────────────────────────
//
// These are used ONLY when live model discovery fails (network down, rate-limited
// during discovery, etc.). They are a snapshot of well-known public model IDs and
// WILL become stale over time.
//
// For ALL real usage the model list comes from discoverModels() — which queries
// the provider's own /models endpoint at runtime. This supports:
//   - Any current or future OpenAI-compatible service
//   - Org-internal / government / educational AI servers (pass baseUrl)
//   - Ollama, vLLM, LM Studio, LocalAI, and any OpenAI-compat fork
//   - Custom providers with unknown key formats (provider = 'custom')
//
// custom, ollama, bitnet return [] here intentionally — we never guess model IDs
// for services whose model list is unknown. If discovery fails for these, the
// caller receives a clear error rather than a silently wrong model ID.

function _getFallbackModels(provider: AIProvider): AIModel[] {
  const fallbacks: Record<string, AIModel[]> = {
    // Known public cloud providers — stale snapshot, discovery is always preferred
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
    // Intentionally empty — model IDs for local/custom services cannot be guessed.
    ollama: [],
    bitnet: [],
    custom: [],
  };
  return fallbacks[provider] ?? [];
}

// ─── AsyncStorage keys for AI analysis cache ─────────────────────────────────

const summaryKey = (id: string) => `@ebook/summary/${id}`;
const styleKey = (id: string) => `@ebook/style/${id}`;

// ─── Stream AI Response ───────────────────────────────────────────────────────

/**
 * Stream an AI writing-assistance response for a specific book.
 *
 * Reads the active AI key from AsyncStorage. Reads cached book summary and
 * style profile (if available) and uses `buildContext()` to assemble the
 * prompt within the default token budget. Delegates to `streamRequest()`.
 *
 * Throws if no AI key is configured.
 */
export async function streamAIResponse(
  bookId: string,
  currentText: string,
  taskInstruction: string,
  callbacks: StreamCallbacks,
  opts?: {
    precedingText?: string;
    followingText?: string;
    tokenBudget?: number;
    model?: string;
  },
): Promise<void> {
  const activeKey = await getActiveAIKey();
  if (!activeKey) {
    throw new Error(
      "No AI provider configured. Go to Settings → AI Providers to add your API key.",
    );
  }

  // Read cached summary and style profile for this book
  const [summaryRaw, styleRaw] = await Promise.all([
    AsyncStorage.getItem(summaryKey(bookId)),
    AsyncStorage.getItem(styleKey(bookId)),
  ]);
  const bookSummary = summaryRaw ?? undefined;
  const styleProfile: StyleProfile | undefined = styleRaw
    ? (JSON.parse(styleRaw) as StyleProfile)
    : undefined;

  // Assemble context-budgeted prompt
  const { prompt } = buildContext({
    currentText,
    precedingText: opts?.precedingText,
    followingText: opts?.followingText,
    bookSummary,
    styleProfile,
    taskInstruction,
    tokenBudget: opts?.tokenBudget,
  });

  // Select model:
  //   1. Caller-supplied model override (highest priority)
  //   2. Live discovery from the provider's /models endpoint (covers any
  //      current, future, or org-internal AI engine — no hardcoded IDs)
  //   3. Snapshot fallback only if live discovery fails (network down, etc.)
  let model = opts?.model ?? "";
  if (!model) {
    let discovered: AIModel[] = [];
    try {
      discovered = await discoverModels(
        activeKey.provider,
        activeKey.apiKey,
        activeKey.customBaseUrl,
      );
    } catch {
      // Discovery failed — fall through to snapshot fallback below
    }
    if (discovered.length === 0) {
      discovered = _getFallbackModels(activeKey.provider);
    }
    model = pickBestModel(discovered, "continue")?.id ?? "";
  }

  if (!model) {
    throw new Error(
      `No models available for provider "${activeKey.provider}". ` +
      "Ensure the provider is reachable and your key has permission to list models.",
    );
  }

  const config: StreamConfig = {
    provider: activeKey.provider as StreamConfig["provider"],
    apiKey: activeKey.apiKey,
    model,
    baseUrl: activeKey.customBaseUrl,
    prompt,
  };

  return streamRequest(config, callbacks);
}

// ─── Run Book Analysis ────────────────────────────────────────────────────────

/**
 * Run a full map-reduce analysis of a book and cache the result.
 *
 * Loads the book content from storage, runs `analyzeBook()` from the analysis
 * module, and writes the resulting summary and style profile to AsyncStorage:
 *   `@ebook/summary/{bookId}` — plain text summary
 *   `@ebook/style/{bookId}`   — JSON-encoded StyleProfile
 *
 * Yields progress events to `onProgress` if provided.
 * Returns the final `AnalysisResult`.
 */
export async function runBookAnalysis(
  bookId: string,
  onProgress?: (p: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  const book = await getBook(bookId);
  if (!book) throw new Error(`Book not found: ${bookId}`);

  const activeKey = await getActiveAIKey();
  if (!activeKey) {
    throw new Error(
      "No AI provider configured. Go to Settings → AI Providers to add your API key.",
    );
  }

  // Live model discovery — same pattern as streamAIResponse.
  // Supports any provider, including org-internal engines at a custom baseUrl.
  let discovered: AIModel[] = [];
  try {
    discovered = await discoverModels(
      activeKey.provider,
      activeKey.apiKey,
      activeKey.customBaseUrl,
    );
  } catch {
    // Ignore — fall through to snapshot fallback
  }
  if (discovered.length === 0) {
    discovered = _getFallbackModels(activeKey.provider);
  }
  const model = pickBestModel(discovered, "improve")?.id ?? "";

  if (!model) {
    throw new Error(
      `No models available for provider "${activeKey.provider}". ` +
      "Ensure the provider is reachable and your key has permission to list models.",
    );
  }

  const providerConfig: StreamConfig = {
    provider: activeKey.provider as StreamConfig["provider"],
    apiKey: activeKey.apiKey,
    model,
    baseUrl: activeKey.customBaseUrl,
    prompt: "", // overridden per chunk by analyzeBook
  };

  const gen = analyzeBook({ fullText: book.content, providerConfig });

  let result: AnalysisResult | undefined;
  let iteration = await gen.next();

  while (!iteration.done) {
    const progress = iteration.value as AnalysisProgress;
    onProgress?.(progress);
    iteration = await gen.next();
  }

  result = iteration.value as AnalysisResult;

  // Cache summary and style profile for future prompts
  await Promise.all([
    AsyncStorage.setItem(summaryKey(bookId), result.summary),
    AsyncStorage.setItem(styleKey(bookId), JSON.stringify(result.styleProfile)),
  ]);

  return result;
}
