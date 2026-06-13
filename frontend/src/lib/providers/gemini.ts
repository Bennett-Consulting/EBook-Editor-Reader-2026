/**
 * Google Gemini Chat Provider
 *
 * Handles Gemini-specific REST API format:
 *   - Per-model endpoint with ?key= auth
 *   - contents[] / systemInstruction format
 *   - Block reason & finish reason error handling
 */

import { AIModel, AIProvider } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type ModelTier = "flash" | "standard" | "pro" | "flagship";

/**
 * Send a chat completion to Google Gemini.
 */
export async function chatGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: any = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
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
    throw new Error(
      `Gemini returned no response${blockReason ? `: blocked (${blockReason})` : ""}`
    );
  }

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini stopped: ${finishReason} — try a different model or shorter text`);
  }

  const text = candidate?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/**
 * Discover available Gemini models for an API key.
 */
export async function discoverGeminiModels(apiKey: string): Promise<AIModel[]> {
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
      tier: classifyGeminiTier(m.name || ""),
    }))
    .sort((a: AIModel, b: AIModel) => tierRank(b.tier) - tierRank(a.tier));
}

export function classifyGeminiTier(modelId: string): ModelTier {
  const id = modelId.toLowerCase();
  if (id.includes("flash-lite")) return "flash";
  if (id.includes("flash")) return "standard";
  if (id.includes("pro")) return "pro";
  if (id.includes("ultra")) return "flagship";
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
