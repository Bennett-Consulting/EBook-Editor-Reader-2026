/**
 * AI Provider Table — seed data + AsyncStorage cache.
 *
 * Populated from a web scan at build time. Loaded once on first install,
 * cached locally. User can refresh on demand (phase 2: AI flash scan).
 *
 * Sorted: copyable-anytime providers first, shown-once providers second.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const TABLE_KEY = "@ebook/provider-table";

export interface ProviderEntry {
  id: string;
  name: string;
  icon: string;
  keyPrefix?: string;
  consoleUrl?: string;
  keyOnlyShownOnce: boolean;
  openaiCompatible: boolean;
  isCustom?: boolean;
  customBaseUrl?: string;
}

// ─── Seed Data (web scan 2026-05-18) ────────────────────────────────────────
// Top section: keys copyable anytime. Bottom: shown once only.

export const SEED_PROVIDERS: ProviderEntry[] = [
  // ── Copyable anytime ──────────────────────────────────────────────────────
  {
    id: "google",
    name: "Google Gemini",
    icon: "🔵",
    keyPrefix: "AIza",
    consoleUrl: "https://aistudio.google.com/apikey",
    keyOnlyShownOnce: false,
    openaiCompatible: false,
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    icon: "🤗",
    keyPrefix: "hf_",
    consoleUrl: "https://huggingface.co/settings/tokens",
    keyOnlyShownOnce: false,
    openaiCompatible: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    icon: "🏠",
    consoleUrl: "https://ollama.com/account/api",
    keyOnlyShownOnce: false,
    openaiCompatible: true,
  },
  {
    id: "bitnet",
    name: "BitNet (CPU)",
    icon: "⚛️",
    consoleUrl: "https://github.com/microsoft/BitNet",
    keyOnlyShownOnce: false,
    openaiCompatible: true,
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    icon: "💙",
    consoleUrl: "https://portal.azure.com",
    keyOnlyShownOnce: false,
    openaiCompatible: true,
  },
  {
    id: "aws",
    name: "AWS Bedrock",
    icon: "☁️",
    keyPrefix: "ABSK",
    consoleUrl: "https://console.aws.amazon.com/bedrock",
    keyOnlyShownOnce: false,
    openaiCompatible: false,
  },

  // ── Shown once only ───────────────────────────────────────────────────────
  {
    id: "openai",
    name: "OpenAI",
    icon: "🟢",
    keyPrefix: "sk-proj-",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "groq",
    name: "Groq",
    icon: "⚡",
    keyPrefix: "gsk_",
    consoleUrl: "https://console.groq.com/keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    icon: "🟠",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyOnlyShownOnce: true,
    openaiCompatible: false,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    icon: "🔴",
    consoleUrl: "https://console.mistral.ai/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    icon: "🟣",
    keyPrefix: "co_",
    consoleUrl: "https://dashboard.cohere.com/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: false,
  },
  {
    id: "together",
    name: "Together AI",
    icon: "🟡",
    consoleUrl: "https://api.together.ai/settings/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: "🔷",
    keyPrefix: "pplx-",
    consoleUrl: "https://www.perplexity.ai/settings/api",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "replicate",
    name: "Replicate",
    icon: "🎮",
    keyPrefix: "r8_",
    consoleUrl: "https://replicate.com/account/api-tokens",
    keyOnlyShownOnce: true,
    openaiCompatible: false,
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    icon: "🔥",
    keyPrefix: "fw_",
    consoleUrl: "https://fireworks.ai/account/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    icon: "🌐",
    consoleUrl: "https://deepinfra.com/dash/api_keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🛣️",
    keyPrefix: "sk-or-",
    consoleUrl: "https://openrouter.ai/settings/keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    icon: "⚫",
    keyPrefix: "xai-",
    consoleUrl: "https://console.x.ai/team/default/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🐋",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
  {
    id: "anyscale",
    name: "Anyscale",
    icon: "🌀",
    consoleUrl: "https://console.anyscale.com/v2/api-keys",
    keyOnlyShownOnce: true,
    openaiCompatible: true,
  },
];

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function getProviderTable(): Promise<ProviderEntry[]> {
  const raw = await AsyncStorage.getItem(TABLE_KEY);
  if (!raw) {
    await AsyncStorage.setItem(TABLE_KEY, JSON.stringify(SEED_PROVIDERS));
    return SEED_PROVIDERS;
  }
  try {
    const stored = JSON.parse(raw) as ProviderEntry[];
    // Merge: keep user custom entries, refresh known entries from seed
    const customEntries = stored.filter((e) => e.isCustom);
    return [...SEED_PROVIDERS, ...customEntries];
  } catch {
    return SEED_PROVIDERS;
  }
}

export async function addCustomProvider(entry: Omit<ProviderEntry, "isCustom">): Promise<void> {
  const current = await getProviderTable();
  const custom = current.filter((e) => e.isCustom);
  custom.push({ ...entry, isCustom: true });
  const next = [...SEED_PROVIDERS, ...custom];
  await AsyncStorage.setItem(TABLE_KEY, JSON.stringify(next));
}

export async function resetProviderTable(): Promise<void> {
  // Preserve custom entries, reset known providers to seed
  const raw = await AsyncStorage.getItem(TABLE_KEY);
  const custom = raw
    ? (JSON.parse(raw) as ProviderEntry[]).filter((e) => e.isCustom)
    : [];
  await AsyncStorage.setItem(TABLE_KEY, JSON.stringify([...SEED_PROVIDERS, ...custom]));
}

/** Detect provider from key prefix against the live table. */
export function detectProviderFromTable(
  key: string,
  table: ProviderEntry[]
): ProviderEntry | null {
  const trimmed = key.trim();
  // Sort by prefix length descending so longer prefixes match first (sk-ant- before sk-)
  const withPrefix = table
    .filter((e) => e.keyPrefix)
    .sort((a, b) => (b.keyPrefix?.length ?? 0) - (a.keyPrefix?.length ?? 0));
  return withPrefix.find((e) => trimmed.startsWith(e.keyPrefix!)) ?? null;
}
