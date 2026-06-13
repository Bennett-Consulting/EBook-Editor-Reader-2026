/**
 * OpenAI-Compatible Chat Provider
 *
 * Handles OpenAI, Groq, Custom, and BitNet (local llama-server)
 * via the standard /chat/completions endpoint.
 */

import { AIModel, AIProvider } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Send chat completion to any OpenAI-compatible endpoint.
 */
export async function chatOpenAICompat(
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

/**
 * Discover models from an OpenAI-compatible /models endpoint.
 * Filters OpenAI results to GPT/O-series only.
 */
export async function discoverOpenAIModels(
  baseUrl: string,
  modelsEndpoint: string,
  apiKey: string,
  headers: Record<string, string>,
  provider: AIProvider
): Promise<AIModel[]> {
  const url = `${baseUrl}${modelsEndpoint}`;
  const resp = await fetch(url, {
    headers: { ...headers, "Content-Type": "application/json" },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  const data = await resp.json();

  const models = (data.data || []) as any[];
  return models
    .filter((m: any) => {
      const id = (m.id || "").toLowerCase();
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
      tier: classifyOpenAITier(m.id, provider),
    }))
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
}

// ─── Tier Classification ────────────────────────────────────────────────────

type ModelTier = "flash" | "standard" | "pro" | "flagship";

export function classifyOpenAITier(modelId: string, provider: AIProvider): ModelTier {
  const id = modelId.toLowerCase();

  if (provider === "openai") {
    if (id.includes("mini")) return "flash";
    if (id.includes("gpt-4o") && !id.includes("mini")) return "pro";
    if (id.includes("o1") || id.includes("o3") || id.includes("o4")) return "flagship";
    if (id.includes("gpt-3.5")) return "flash";
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

function tierRank(tier: ModelTier): number {
  switch (tier) {
    case "flagship": return 4;
    case "pro": return 3;
    case "standard": return 2;
    case "flash": return 1;
  }
}
