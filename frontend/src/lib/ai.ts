/**
 * AI Assistant — Uses the Universal AI Gateway
 *
 * No backend required. Calls the AI provider directly from the device
 * using the user's own API key stored locally.
 *
 * Two modes of operation:
 *   1. AI Assist — continue, improve, shorten, expand (surgical edits)
 *   2. Voice Edit — casual, professional, theatrical (full style rewrites)
 */

import { getActiveAIKey } from "./storage";
import {
  chat,
  discoverModels,
  pickBestModel,
  type TaskType,
} from "./aiGateway";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AIMode = "continue" | "improve" | "shorten" | "expand";

export type AIVoiceStyle = "casual" | "professional" | "theatrical";

// ─── AI Assist Prompts ──────────────────────────────────────────────────────

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

// ─── Voice Edit Prompts ─────────────────────────────────────────────────────

function voiceEditSystemPrompt(style: AIVoiceStyle): string {
  switch (style) {
    case "casual":
      return (
        "You are a skilled ghostwriter who rewrites text in a warm, conversational, " +
        "approachable voice. Think of a friend telling a great story over coffee.\n\n" +
        "Rules:\n" +
        "- Replace formal language with natural, everyday speech\n" +
        "- Use contractions (it's, don't, can't)\n" +
        "- Break up long sentences into shorter, punchier ones\n" +
        "- Add relatable observations or humor where appropriate\n" +
        "- Keep all facts, events, and meaning exactly the same\n" +
        "- Preserve all character names, places, and plot points\n" +
        "- Return only the rewritten text, no commentary, no preamble, no markdown fences"
      );
    case "professional":
      return (
        "You are a senior literary editor who rewrites text in polished, formal, " +
        "publication-quality prose. Think New York Times bestseller or Harvard Business Review.\n\n" +
        "Rules:\n" +
        "- Elevate vocabulary — precise, authoritative word choices\n" +
        "- Tighten structure — clean sentence architecture, active voice, no filler\n" +
        "- Add sophisticated transitions between ideas\n" +
        "- Maintain a confident, measured tone throughout\n" +
        "- Keep all facts, events, and meaning exactly the same\n" +
        "- Preserve all character names, places, and plot points\n" +
        "- Approximately the same length as input\n" +
        "- Return only the rewritten text, no commentary, no preamble, no markdown fences"
      );
    case "theatrical":
      return (
        "You are a Broadway playwright and screenwriter who transforms prose into a " +
        "vivid theatrical production script. The output should read like a stage play " +
        "ready for performance.\n\n" +
        "Format the output as a professional stage script:\n" +
        "- Start with a scene heading: SCENE [number] — [location/mood]\n" +
        "- Use STAGE DIRECTIONS in parentheses/italics for actions, " +
        "settings, lighting, and atmosphere\n" +
        "- Character names in ALL CAPS before their dialogue\n" +
        "- Include [Beat], [Pause], [Silence] for dramatic timing\n" +
        "- Add sensory stage directions: lighting shifts, sound effects, " +
        "physical movement\n" +
        "- Transform narration into spoken dialogue that reveals the same information\n" +
        "- Internal thoughts become monologues or asides to the audience\n" +
        "- Descriptions become vivid stage directions\n" +
        "- Preserve every plot point, character, and piece of information\n" +
        "- Make it dramatic, visual, and ALIVE\n" +
        "- Return only the theatrical script, no commentary, no preamble"
      );
  }
}

function voiceEditUserPrompt(style: AIVoiceStyle, text: string): string {
  const label =
    style === "casual"
      ? "casual, conversational voice"
      : style === "professional"
      ? "polished, professional voice"
      : "full theatrical production script";

  return (
    `Rewrite the following text in a ${label}.\n\n` +
    `--- BEGIN TEXT ---\n${text}\n--- END TEXT ---\n\n` +
    `Output only the rewritten text.`
  );
}

// ─── Shared: Resolve provider + model ───────────────────────────────────────

async function resolveProviderAndModel(taskType: TaskType) {
  const activeKey = await getActiveAIKey();
  if (!activeKey) {
    throw new Error(
      "No AI provider configured. Go to Settings → AI Providers to add your API key."
    );
  }

  const models = await discoverModels(
    activeKey.provider,
    activeKey.apiKey,
    activeKey.customBaseUrl
  );
  const best = pickBestModel(models, taskType);
  if (!best) {
    throw new Error(
      `No models available from ${activeKey.provider}. Check your API key.`
    );
  }

  return { activeKey, best };
}

// ─── AI Assist (continue / improve / shorten / expand) ──────────────────────

export async function aiSuggest(
  context: string,
  mode: AIMode = "continue",
  _sessionId?: string
): Promise<{
  suggestion: string;
  session_id: string;
  model: string;
  provider: string;
}> {
  const { activeKey, best } = await resolveProviderAndModel(mode as TaskType);

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

// ─── Voice Edit (casual / professional / theatrical) ────────────────────────

export async function aiVoiceEdit(
  text: string,
  style: AIVoiceStyle,
  _sessionId?: string
): Promise<{
  suggestion: string;
  session_id: string;
  model: string;
  provider: string;
  style: AIVoiceStyle;
}> {
  // Theatrical and Professional use high-reasoning models;
  // Casual uses fast models for quick turnaround
  const taskMapping: Record<AIVoiceStyle, TaskType> = {
    casual: "improve",       // standard/pro tier
    professional: "expand",  // pro/flagship tier
    theatrical: "expand",    // pro/flagship tier (longest output)
  };

  const { activeKey, best } = await resolveProviderAndModel(
    taskMapping[style]
  );

  // Theatrical gets more tokens — it outputs the entire chapter as a script
  const maxTokens =
    style === "theatrical" ? 4000 : style === "professional" ? 2000 : 1500;

  // Theatrical gets slightly higher temperature for creative flair
  const temperature =
    style === "theatrical" ? 0.85 : style === "professional" ? 0.5 : 0.7;

  const result = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: voiceEditSystemPrompt(style) },
      { role: "user", content: voiceEditUserPrompt(style, text) },
    ],
    maxTokens,
    temperature,
  });

  return {
    suggestion: result,
    session_id: _sessionId || Date.now().toString(36),
    model: best.id,
    provider: activeKey.provider,
    style,
  };
}
