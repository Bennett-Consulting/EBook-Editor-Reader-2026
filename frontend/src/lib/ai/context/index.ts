/**
 * AI Context Module — portable sliding context window assembly.
 *
 * Portable: zero app-level dependencies. No AsyncStorage, no React Native,
 * no Expo. The caller reads cached summaries / style profiles from storage
 * and passes them in. This module only does text manipulation and math.
 *
 * Public API:
 *   buildContext(request)        — assemble a token-budgeted prompt
 *   extractStyleProfile(text)    — derive tense, POV, nouns from sample text
 *   estimateTokens(text)         — rough 4-chars-per-token estimate
 */

export type { ContextRequest, ContextResult, StyleProfile } from "./types";
import type { ContextRequest, ContextResult, StyleProfile } from "./types";

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token estimator: 4 characters ≈ 1 token for English prose.
 * Good enough for budget enforcement; not a substitute for a real tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Style profile ────────────────────────────────────────────────────────────

/** Words that look capitalised but are not proper nouns. */
const COMMON_CAPS = new Set([
  "The", "This", "That", "These", "Those", "Then", "There", "When",
  "But", "And", "For", "With", "From", "Into", "Upon", "After",
  "Before", "While", "Though", "Through", "Because", "Since",
]);

/**
 * Extract a style profile from a representative text sample (chapters 1–3
 * or the first ~10 000 chars of a book).
 */
export function extractStyleProfile(sampleText: string): StyleProfile {
  const rawSample = sampleText.slice(0, 500);

  // ── Dominant tense ───────────────────────────────────────────────────────
  const pastCount = (sampleText.match(
    /\b(was|were|had|said|told|walked|ran|looked|felt|seemed|went|came|saw|knew|thought|heard)\b/gi
  ) ?? []).length;
  const presentCount = (sampleText.match(
    /\b(is|are|has|says|tells|walks|runs|looks|feels|seems|goes|comes|sees|knows|thinks|hears)\b/gi
  ) ?? []).length;
  const dominantTense =
    pastCount > presentCount * 1.5 ? "past"
    : presentCount > pastCount * 1.5 ? "present"
    : "unknown";

  // ── Point of view ────────────────────────────────────────────────────────
  const firstPerson = (sampleText.match(/\b(I|me|my|mine|myself|we|us|our|ours)\b/g) ?? []).length;
  const secondPerson = (sampleText.match(/\b(you|your|yours|yourself|yourselves)\b/gi) ?? []).length;
  const thirdPerson = (sampleText.match(/\b(he|she|they|him|her|his|hers|their|them|it|its)\b/gi) ?? []).length;
  const maxPOV = Math.max(firstPerson, secondPerson, thirdPerson);
  const pointOfView =
    maxPOV === 0 ? "unknown"
    : firstPerson === maxPOV ? "first"
    : secondPerson === maxPOV ? "second"
    : "third";

  // ── Average sentence length ──────────────────────────────────────────────
  const sentences = sampleText.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const totalWords = sentences.reduce(
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0
  );
  const avgSentenceLength =
    sentences.length > 0 ? Math.round(totalWords / sentences.length) : 0;

  // ── Recurring proper nouns ───────────────────────────────────────────────
  // Match capitalised words that do NOT immediately follow a sentence-ending
  // punctuation mark (those are just normal sentence-start capitalisation).
  // Match any capitalised word (3+ chars). Sentence-start noise is eliminated
  // by the COMMON_CAPS blocklist and the count >= 2 gate below — proper nouns
  // (character names, places) naturally recur while generic sentence openers don't.
  const wordCounts: Record<string, number> = {};
  const properNounRe = /\b([A-Z][a-z]{2,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = properNounRe.exec(sampleText)) !== null) {
    const word = m[1];
    if (!COMMON_CAPS.has(word)) {
      wordCounts[word] = (wordCounts[word] ?? 0) + 1;
    }
  }
  const recurringNouns = Object.entries(wordCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return { dominantTense, pointOfView, avgSentenceLength, recurringNouns, rawSample };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function formatStyleProfile(p: StyleProfile): string {
  const parts = [
    `Tense: ${p.dominantTense}`,
    `POV: ${p.pointOfView}-person`,
    `Avg sentence: ${p.avgSentenceLength} words`,
  ];
  if (p.recurringNouns.length > 0) {
    parts.push(`Key names: ${p.recurringNouns.slice(0, 5).join(", ")}`);
  }
  return parts.join(" | ");
}

// ─── buildContext ─────────────────────────────────────────────────────────────

/**
 * Assemble a prompt within a token budget for AI writing assistance.
 *
 * Always includes: currentText + taskInstruction.
 * Optional sections dropped in priority order when over budget:
 *   followingHead → precedingTail → bookSummary → styleProfile
 */
export function buildContext(request: ContextRequest): ContextResult {
  const {
    currentText,
    precedingText,
    followingText,
    bookSummary,
    styleProfile,
    taskInstruction,
    tailLength = 1000,
    tokenBudget = 4000,
  } = request;

  const sections: ContextResult["sections"] = {
    styleProfile: false,
    bookSummary: false,
    precedingTail: false,
    currentText: true,
    followingHead: false,
    taskInstruction: true,
  };

  // Mandatory tokens
  const mandatoryTokens =
    estimateTokens(currentText) + estimateTokens(taskInstruction);

  // Clamp currentText if even the minimum won't fit
  if (mandatoryTokens > tokenBudget) {
    const maxCurrentChars = Math.max(100, (tokenBudget - estimateTokens(taskInstruction)) * 4);
    const clampedText = currentText.slice(0, maxCurrentChars);
    const prompt = `[Current Text]\n${clampedText}\n\n[Task]\n${taskInstruction}`;
    return { prompt, tokenEstimate: estimateTokens(prompt), sections };
  }

  let remaining = tokenBudget - mandatoryTokens;

  // Prepare optional strings
  const precedingTail = precedingText ? precedingText.slice(-tailLength) : null;
  const followingHead = followingText ? followingText.slice(0, tailLength) : null;
  const styleStr = styleProfile ? formatStyleProfile(styleProfile) : null;

  // Fill budget — highest priority first
  // Priority: styleProfile > bookSummary > precedingTail > followingHead
  // (followingHead is most expendable — context behind is more useful for writing)
  if (styleStr) {
    const t = estimateTokens(styleStr);
    if (t <= remaining) { sections.styleProfile = true; remaining -= t; }
  }
  if (bookSummary) {
    const t = estimateTokens(bookSummary);
    if (t <= remaining) { sections.bookSummary = true; remaining -= t; }
  }
  if (precedingTail) {
    const t = estimateTokens(precedingTail);
    if (t <= remaining) { sections.precedingTail = true; remaining -= t; }
  }
  if (followingHead) {
    const t = estimateTokens(followingHead);
    if (t <= remaining) { sections.followingHead = true; remaining -= t; }
  }

  // Assemble in reading order
  const parts: string[] = [];
  if (sections.styleProfile && styleStr) {
    parts.push(`[Author Style]\n${styleStr}`);
  }
  if (sections.bookSummary && bookSummary) {
    parts.push(`[Book Summary]\n${bookSummary}`);
  }
  if (sections.precedingTail && precedingTail) {
    parts.push(`[Preceding Context]\n${precedingTail}`);
  }
  parts.push(`[Current Text]\n${currentText}`);
  if (sections.followingHead && followingHead) {
    parts.push(`[Following Context]\n${followingHead}`);
  }
  parts.push(`[Task]\n${taskInstruction}`);

  const prompt = parts.join("\n\n");
  return { prompt, tokenEstimate: estimateTokens(prompt), sections };
}
