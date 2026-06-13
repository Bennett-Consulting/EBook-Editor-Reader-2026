/**
 * AI Suggestion Engine — public API.
 *
 * Portable: zero app-level dependencies. No AsyncStorage, no React Native, no Expo.
 * Caller provides providerConfig and all context — this module never reads storage.
 *
 * Uses:
 *   ../ai/context   — to assemble a token-budgeted prompt
 *   ../ai/streaming — to stream the AI response
 *
 * Public API:
 *   requestSuggestions(input)           — call the AI, returns a SuggestionSet
 *   applySuggestion(set, id)            — apply one suggestion, returns newText
 *   rejectSuggestion(set, id)           — remove a suggestion from the set
 *   editSuggestion(set, id, newText)    — update suggestion text + regenerate diff
 */

export type {
  SuggestionRequest,
  SuggestionSet,
  Suggestion,
  SuggestionMode,
  DiffChunk,
  ApplyResult,
} from './types';

import type { SuggestionRequest, SuggestionSet, ApplyResult } from './types';
import { callAI } from './engine';
import { uid, parseSuggestions, recomputeDiff } from './presenter';

// ─── requestSuggestions ───────────────────────────────────────────────────────

/**
 * Request AI suggestions for the given text and mode.
 * Never throws — errors are returned as a SuggestionSet with status 'error'.
 *
 * Mode output counts:
 *   grammar   — one Suggestion per correction found (may be 0)
 *   rephrase  — exactly 3 Suggestions
 *   all other — exactly 1 Suggestion
 */
export async function requestSuggestions(
  input: SuggestionRequest,
): Promise<SuggestionSet> {
  const base: SuggestionSet = {
    id: uid(),
    mode: input.mode,
    originalText: input.originalText,
    suggestions: [],
    status: 'pending',
    requestedAt: Date.now(),
  };

  try {
    const rawText = await callAI(input);
    const suggestions = parseSuggestions(rawText, input.originalText, input.mode);
    return { ...base, status: 'ready', suggestions };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── applySuggestion ──────────────────────────────────────────────────────────

/**
 * Apply a suggestion, producing newText according to the mode:
 *   continue — originalText + suggestion.text (append)
 *   grammar  — splice correction at offset/length
 *   others   — suggestion.text replaces originalText entirely
 *
 * The applied suggestion is removed from updatedSet.suggestions.
 * Throws if the id is not found.
 */
export function applySuggestion(set: SuggestionSet, id: string): ApplyResult {
  const suggestion = set.suggestions.find((s) => s.id === id);
  if (!suggestion) throw new Error(`Suggestion "${id}" not found in set "${set.id}"`);

  let newText: string;
  switch (set.mode) {
    case 'continue':
      newText = set.originalText + suggestion.text;
      break;
    case 'grammar': {
      const off = suggestion.offset ?? 0;
      const len = suggestion.length ?? 0;
      newText =
        set.originalText.slice(0, off) +
        suggestion.text +
        set.originalText.slice(off + len);
      break;
    }
    default:
      newText = suggestion.text;
  }

  const updatedSet: SuggestionSet = {
    ...set,
    suggestions: set.suggestions.filter((s) => s.id !== id),
  };

  return { newText, updatedSet };
}

// ─── rejectSuggestion ─────────────────────────────────────────────────────────

/**
 * Remove a suggestion from the set without applying it.
 * Returns a new SuggestionSet with the rejected suggestion omitted.
 * If the id is not found, the set is returned unchanged.
 */
export function rejectSuggestion(set: SuggestionSet, id: string): SuggestionSet {
  return {
    ...set,
    suggestions: set.suggestions.filter((s) => s.id !== id),
  };
}

// ─── editSuggestion ───────────────────────────────────────────────────────────

/**
 * Update a suggestion's text and regenerate its diff.
 * The diff is recomputed relative to originalText using the same strategy as
 * the initial parse (continue → equal+insert, grammar → span diff, others → full diff).
 * Throws if the id is not found.
 */
export function editSuggestion(
  set: SuggestionSet,
  id: string,
  newText: string,
): SuggestionSet {
  const suggestion = set.suggestions.find((s) => s.id === id);
  if (!suggestion) throw new Error(`Suggestion "${id}" not found in set "${set.id}"`);

  const updatedSuggestion = {
    ...suggestion,
    text: newText,
    diff: recomputeDiff(set.originalText, suggestion, set.mode, newText),
  };

  return {
    ...set,
    suggestions: set.suggestions.map((s) => (s.id === id ? updatedSuggestion : s)),
  };
}
