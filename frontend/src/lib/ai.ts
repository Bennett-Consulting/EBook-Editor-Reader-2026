/**
 * AI Assistant — Uses the Universal AI Gateway
 *
 * No backend required. Calls the AI provider directly from the device
 * using the user's own API key stored locally.
 */

import { getActiveAIKey } from "./storage";
import {
  chat,
  discoverModels,
  pickBestModel,
  type TaskType,
} from "./aiGateway";

export type AIMode = "continue" | "improve" | "shorten" | "expand";

function systemPrompt(mode: AIMode): string {
  const base =
    "You are an expert co-writing assistant inside an ebook editor. " +
    "You help authors continue, improve and refine their prose. " +
    "Match the author's tone, voice and tense. " +
    "Return only the new text, no preamble, no markdown fences, no quotes.";

  switch (mode) {
    case "continue":
      return (
        base +
        " The user wants you to continue writing from where they left off. Add 1–3 sentences that flow naturally."
      );
    case "improve":
      return (
        base +
        " The user wants you to rewrite the given passage to improve clarity, flow and vividness. Keep the same meaning and length."
      );
    case "shorten":
      return (
        base +
        " Rewrite the passage more concisely while keeping the meaning."
      );
    case "expand":
      return (
        base +
        " Expand the passage with more sensory detail and depth (about 2x length)."
      );
  }
}

export async function aiSuggest(
  context: string,
  mode: AIMode = "continue",
  _sessionId?: string
): Promise<{ suggestion: string; session_id: string; model: string; provider: string }> {
  // 1. Get the active AI key
  const activeKey = await getActiveAIKey();
  if (!activeKey) {
    throw new Error(
      "No AI provider configured. Go to Settings → AI Providers to add your API key."
    );
  }

  // 2. Discover available models and pick the best one for this task
  const models = await discoverModels(
    activeKey.provider,
    activeKey.apiKey,
    activeKey.customBaseUrl
  );
  const best = pickBestModel(models, mode as TaskType);
  if (!best) {
    throw new Error(
      `No models available from ${activeKey.provider}. Check your API key.`
    );
  }

  // 3. Build messages and call the gateway
  const tail = context.length > 1500 ? context.slice(-1500) : context;
  const result = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: systemPrompt(mode) },
      {
        role: "user",
        content: `Mode: ${mode}\n\n---\n${tail}\n---\n\nOutput only the resulting text.`,
      },
    ],
    maxTokens: 1000,
    temperature: 0.7,
  });

  return {
    suggestion: result,
    session_id: _sessionId || Date.now().toString(36),
    model: best.id,
    provider: activeKey.provider,
  };
}
