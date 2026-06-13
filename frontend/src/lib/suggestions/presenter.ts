/**
 * Parses raw AI text into a SuggestionSet with character-level diffs.
 * Pure functions — no fetch, no side effects, no app imports.
 */

import type { DiffChunk, Suggestion, SuggestionMode } from './types';

// ─── ID generation ────────────────────────────────────────────────────────────

let _seq = 0;
export function uid(): string {
  return `sg_${(++_seq).toString(36)}_${Date.now().toString(36)}`;
}

// ─── Character-level diff ─────────────────────────────────────────────────────

const MAX_DIFF_CELLS = 200_000;

/**
 * Compute a character-level edit script between two strings.
 * Uses LCS dynamic programming up to MAX_DIFF_CELLS, then falls back to
 * a simple delete/insert pair for very large inputs.
 */
export function computeDiff(original: string, suggested: string): DiffChunk[] {
  if (original === suggested) {
    return original.length > 0 ? [{ type: 'equal', text: original }] : [];
  }
  if (original.length === 0) {
    return [{ type: 'insert', text: suggested }];
  }
  if (suggested.length === 0) {
    return [{ type: 'delete', text: original }];
  }
  if (original.length * suggested.length > MAX_DIFF_CELLS) {
    return [
      { type: 'delete', text: original },
      { type: 'insert', text: suggested },
    ];
  }

  const m = original.length;
  const n = suggested.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (original[i - 1] === suggested[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Traceback (produces ops in reverse)
  const ops: Array<{ type: 'equal' | 'insert' | 'delete'; ch: string }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === suggested[j - 1]) {
      ops.push({ type: 'equal', ch: original[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', ch: suggested[j - 1] });
      j--;
    } else {
      ops.push({ type: 'delete', ch: original[i - 1] });
      i--;
    }
  }
  ops.reverse();

  // Merge consecutive same-type characters into chunks
  const chunks: DiffChunk[] = [];
  for (const { type, ch } of ops) {
    const last = chunks[chunks.length - 1];
    if (last?.type === type) {
      last.text += ch;
    } else {
      chunks.push({ type, text: ch });
    }
  }
  return chunks;
}

/**
 * Recompute the diff for a suggestion after the user edits its text.
 * Uses the same strategy as the initial parse for each mode.
 */
export function recomputeDiff(
  originalText: string,
  suggestion: Suggestion,
  mode: SuggestionMode,
  newText: string,
): DiffChunk[] {
  if (mode === 'continue') {
    return originalText.length > 0
      ? [{ type: 'equal', text: originalText }, { type: 'insert', text: newText }]
      : [{ type: 'insert', text: newText }];
  }
  if (mode === 'grammar') {
    const span = originalText.slice(suggestion.offset ?? 0, (suggestion.offset ?? 0) + (suggestion.length ?? 0));
    return computeDiff(span, newText);
  }
  return computeDiff(originalText, newText);
}

// ─── Grammar parsing ──────────────────────────────────────────────────────────

interface RawCorrection {
  original: string;
  correction: string;
}

/** Find the next non-overlapping occurrence of needle after offset, skipping used ranges. */
function findOffset(
  haystack: string,
  needle: string,
  usedRanges: Array<[number, number]>,
): number {
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) return -1;
    const end = idx + needle.length;
    const overlaps = usedRanges.some(([s, e]) => idx < e && end > s);
    if (!overlaps) {
      usedRanges.push([idx, end]);
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

export function parseGrammarResponse(aiText: string, originalText: string): Suggestion[] {
  // Strip markdown code fences if present
  const stripped = aiText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const jsonMatch = stripped.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let corrections: RawCorrection[];
  try {
    corrections = JSON.parse(jsonMatch[0]) as RawCorrection[];
  } catch {
    return [];
  }
  if (!Array.isArray(corrections)) return [];

  const usedRanges: Array<[number, number]> = [];
  const suggestions: Suggestion[] = [];

  for (const c of corrections) {
    if (
      typeof c !== 'object' || c === null ||
      typeof c.original !== 'string' || typeof c.correction !== 'string' ||
      c.original.length === 0
    ) {
      continue;
    }
    const offset = findOffset(originalText, c.original, usedRanges);
    if (offset === -1) continue;

    suggestions.push({
      id: uid(),
      text: c.correction,
      offset,
      length: c.original.length,
      diff: computeDiff(c.original, c.correction),
    });
  }
  return suggestions;
}

// ─── Rephrase parsing ─────────────────────────────────────────────────────────

const REPHRASE_DELIMITER = /^---OPTION---$/m;
const REPHRASE_COUNT = 3;

export function parseRephraseResponse(aiText: string, originalText: string): Suggestion[] {
  const parts = aiText.split(REPHRASE_DELIMITER).map((p) => p.trim()).filter(Boolean);
  const three = parts.slice(0, REPHRASE_COUNT);

  // Pad to exactly 3 — if the AI returned fewer, repeat the last option
  const fallback = three[0] ?? originalText;
  while (three.length < REPHRASE_COUNT) three.push(fallback);

  return three.map((text) => ({
    id: uid(),
    text,
    diff: computeDiff(originalText, text),
  }));
}

// ─── Prose suggestion parsing (continue / improve / shorten / expand) ─────────

export function parseProseSuggestion(
  aiText: string,
  originalText: string,
  mode: SuggestionMode,
): Suggestion[] {
  // continue mode: preserve leading whitespace — the AI response may start with a space
  // that separates the continuation from the last word of originalText.
  const text = mode === 'continue' ? aiText.trimEnd() : aiText.trim();
  if (!text) return [];

  let diff: DiffChunk[];
  if (mode === 'continue') {
    // Continuation always appends — represent directly as equal original + inserted tail.
    // Avoid running LCS on (original, original+text) because LCS tie-breaking can thread
    // through shared characters inside the appended portion rather than treating the
    // original prefix as one clean equal chunk.
    diff =
      originalText.length > 0
        ? [{ type: 'equal', text: originalText }, { type: 'insert', text }]
        : [{ type: 'insert', text }];
  } else {
    diff = computeDiff(originalText, text);
  }

  return [{ id: uid(), text, diff }];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseSuggestions(
  aiText: string,
  originalText: string,
  mode: SuggestionMode,
): Suggestion[] {
  switch (mode) {
    case 'grammar':
      return parseGrammarResponse(aiText, originalText);
    case 'rephrase':
      return parseRephraseResponse(aiText, originalText);
    default:
      return parseProseSuggestion(aiText, originalText, mode);
  }
}
