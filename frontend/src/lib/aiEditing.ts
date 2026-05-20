/**
 * AI Editing Engine — Spell check, grammar, tone analysis, screenwriting
 *
 * Uses the Universal AI Gateway. Each mode sends a specialized prompt
 * and returns structured results the UI can render.
 */

import { getActiveAIKey } from "./storage";
import { chat, discoverModels, pickBestModel, type TaskType } from "./aiGateway";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EditingMode = "spellcheck" | "grammar" | "tone" | "screenplay";

export interface SpellIssue {
  word: string;
  suggestion: string;
  context: string; // surrounding text for locating the word
}

export interface GrammarIssue {
  original: string;
  suggestion: string;
  explanation: string;
}

export interface ToneAnalysis {
  overall: string;            // e.g. "formal", "casual", "dark", "inspirational"
  confidence: number;         // 0..1
  attributes: ToneAttribute[];
  rewriteSuggestion?: string; // optional rewrite in target tone
}

export interface ToneAttribute {
  name: string;               // e.g. "Formality", "Emotion", "Pace"
  value: string;              // e.g. "High", "Melancholic", "Slow"
  score: number;              // 0..1
}

export interface EditingResult {
  mode: EditingMode;
  model: string;
  provider: string;
  // Mode-specific payloads
  spellIssues?: SpellIssue[];
  grammarIssues?: GrammarIssue[];
  toneAnalysis?: ToneAnalysis;
  screenplayText?: string;
}

// ─── Shared: Resolve provider ───────────────────────────────────────────────

async function resolve(taskType: TaskType) {
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

// ─── Spell Check ────────────────────────────────────────────────────────────

const SPELL_SYSTEM = `You are a meticulous proofreader. Identify ONLY genuine spelling errors — not style choices, proper nouns, or intentional dialect.

Return a JSON array of objects. Each object has:
- "word": the misspelled word exactly as it appears
- "suggestion": the corrected spelling
- "context": 5–8 words surrounding the error for location

If there are no spelling errors, return an empty array [].
Return ONLY valid JSON, no markdown fences, no commentary.`;

export async function spellCheck(text: string): Promise<EditingResult> {
  const { activeKey, best } = await resolve("improve");
  const input = text.length > 6000 ? text.slice(0, 6000) : text;

  const raw = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: SPELL_SYSTEM },
      { role: "user", content: `Check this text for spelling errors:\n\n${input}` },
    ],
    maxTokens: 1500,
    temperature: 0.1,
  });

  let issues: SpellIssue[] = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    issues = JSON.parse(cleaned);
  } catch {
    // If JSON parse fails, return empty
    issues = [];
  }

  return {
    mode: "spellcheck",
    model: best.id,
    provider: activeKey.provider,
    spellIssues: issues,
  };
}

// ─── Grammar Check ──────────────────────────────────────────────────────────

const GRAMMAR_SYSTEM = `You are an expert copy editor. Identify grammar issues: subject-verb agreement, tense consistency, dangling modifiers, comma splices, run-on sentences, and misused words.

Do NOT flag style choices, creative fragments, or dialogue punctuation.

Return a JSON array of objects. Each object has:
- "original": the problematic phrase exactly as written
- "suggestion": the corrected version
- "explanation": brief reason (10 words max)

If the text is grammatically sound, return an empty array [].
Return ONLY valid JSON, no markdown fences, no commentary.`;

export async function grammarCheck(text: string): Promise<EditingResult> {
  const { activeKey, best } = await resolve("improve");
  const input = text.length > 6000 ? text.slice(0, 6000) : text;

  const raw = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: GRAMMAR_SYSTEM },
      { role: "user", content: `Check this text for grammar issues:\n\n${input}` },
    ],
    maxTokens: 2000,
    temperature: 0.1,
  });

  let issues: GrammarIssue[] = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    issues = JSON.parse(cleaned);
  } catch {
    issues = [];
  }

  return {
    mode: "grammar",
    model: best.id,
    provider: activeKey.provider,
    grammarIssues: issues,
  };
}

// ─── Tone Analysis ──────────────────────────────────────────────────────────

const TONE_SYSTEM = `You are a literary analyst. Analyze the tone and voice of the given text.

Return a JSON object with:
- "overall": one or two word tone label (e.g. "Dark & Introspective", "Warm & Conversational")
- "confidence": number 0 to 1
- "attributes": array of objects, each with:
  - "name": attribute name (e.g. "Formality", "Emotion", "Pace", "Imagery", "Voice")
  - "value": descriptor (e.g. "High", "Melancholic", "Measured", "Vivid", "First-person intimate")
  - "score": number 0 to 1
- "rewriteSuggestion": a 2-3 sentence example of how to shift the tone if the author wanted more emotional impact (optional)

Return ONLY valid JSON, no markdown fences, no commentary.`;

export async function analyzeTone(text: string): Promise<EditingResult> {
  const { activeKey, best } = await resolve("expand");
  const input = text.length > 4000 ? text.slice(0, 4000) : text;

  const raw = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: TONE_SYSTEM },
      { role: "user", content: `Analyze the tone of this text:\n\n${input}` },
    ],
    maxTokens: 1500,
    temperature: 0.3,
  });

  let analysis: ToneAnalysis = {
    overall: "Unknown",
    confidence: 0,
    attributes: [],
  };
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch {
    // fallback
  }

  return {
    mode: "tone",
    model: best.id,
    provider: activeKey.provider,
    toneAnalysis: analysis,
  };
}

// ─── Screenplay Conversion ─────────────────────────────────────────────────

const SCREENPLAY_SYSTEM = `You are a professional screenwriter. Convert the given prose into industry-standard screenplay format.

Rules:
- Scene headings: INT./EXT. LOCATION - TIME OF DAY (all caps)
- Action lines: Present tense, visual, concise
- Character names: ALL CAPS centered above dialogue
- Dialogue: Indented below character name
- Parentheticals: (beat), (sotto voce), (CONT'D) etc. in parentheses
- Transitions: CUT TO:, FADE IN:, FADE OUT. (all caps, right-aligned conceptually)
- Break narration into visual action and character dialogue
- Internal thoughts become voiceover (V.O.) or visual subtext
- Preserve all plot points, characters, and story beats
- Format naturally — not every paragraph needs to be a new scene

Return ONLY the screenplay text, no commentary.`;

export async function convertToScreenplay(text: string): Promise<EditingResult> {
  const { activeKey, best } = await resolve("expand");
  const input = text.length > 8000 ? text.slice(0, 8000) : text;

  const result = await chat({
    provider: activeKey.provider,
    apiKey: activeKey.apiKey,
    model: best.id,
    customBaseUrl: activeKey.customBaseUrl,
    messages: [
      { role: "system", content: SCREENPLAY_SYSTEM },
      {
        role: "user",
        content: `Convert this prose to screenplay format:\n\n${input}`,
      },
    ],
    maxTokens: 4000,
    temperature: 0.6,
  });

  return {
    mode: "screenplay",
    model: best.id,
    provider: activeKey.provider,
    screenplayText: result,
  };
}

// ─── Unified entry point ────────────────────────────────────────────────────

export async function runEditingMode(
  mode: EditingMode,
  text: string
): Promise<EditingResult> {
  switch (mode) {
    case "spellcheck":
      return spellCheck(text);
    case "grammar":
      return grammarCheck(text);
    case "tone":
      return analyzeTone(text);
    case "screenplay":
      return convertToScreenplay(text);
  }
}
