/**
 * Local Model Providers — Ollama & BitNet
 *
 * Both run on the user's machine (no cloud, no API key).
 * - Ollama: /api/chat + /api/tags (custom format)
 * - BitNet: OpenAI-compatible /v1/chat/completions (llama-server)
 *
 * Sovereign inference — conversations never leave the device.
 */

import { AIModel, AIProvider } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Ollama ─────────────────────────────────────────────────────────────────

/**
 * Send chat to a local Ollama instance.
 */
export async function chatOllama(
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

/**
 * Discover models running on a local Ollama instance.
 */
export async function discoverOllamaModels(baseUrl: string): Promise<AIModel[]> {
  const resp = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) throw new Error(`Ollama: ${resp.status}`);
  const data = await resp.json();
  return (data.models || []).map((m: any) => ({
    id: m.name,
    name: m.name,
    provider: "ollama" as AIProvider,
    tier: "pro" as const, // Local models — no cost
  }));
}

// ─── BitNet ─────────────────────────────────────────────────────────────────

/**
 * Discover models on a local BitNet llama-server (OpenAI-compat /v1/models).
 */
export async function discoverBitnetModels(baseUrl: string): Promise<AIModel[]> {
  const resp = await fetch(`${baseUrl}/v1/models`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) throw new Error(`BitNet: ${resp.status}`);
  const data = await resp.json();
  return (data.data || []).map((m: any) => ({
    id: m.id,
    name: m.id,
    provider: "bitnet" as AIProvider,
    tier: "pro" as const, // Local CPU — sovereign, no cost
  }));
}
