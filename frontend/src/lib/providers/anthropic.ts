/**
 * Anthropic (Claude) Chat Provider
 *
 * Handles Anthropic-specific message format:
 *   - x-api-key + anthropic-version headers
 *   - system as top-level param (not in messages)
 *   - content[].text response format
 */

import { AIModel, AIProvider } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type ModelTier = "flash" | "standard" | "pro" | "flagship";

/**
 * Send a chat completion to Anthropic's Messages API.
 */
export async function chatAnthropic(
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

/**
 * Parse Anthropic model list response into AIModel[].
 */
export function parseAnthropicModels(data: any): AIModel[] {
  const models = data.data || [];
  return models.map((m: any) => ({
    id: m.id,
    name: m.display_name || m.id,
    provider: "anthropic" as AIProvider,
    tier: classifyAnthropicTier(m.id),
  }));
}

export function classifyAnthropicTier(modelId: string): ModelTier {
  const id = modelId.toLowerCase();
  if (id.includes("haiku")) return "flash";
  if (id.includes("sonnet")) return "pro";
  if (id.includes("opus")) return "flagship";
  return "standard";
}
