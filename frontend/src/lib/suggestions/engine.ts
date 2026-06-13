/**
 * Core suggestion engine: builds a token-budgeted prompt and calls the AI.
 * Returns the raw AI response string — parsing is handled by presenter.ts.
 *
 * Portable: zero app-level imports. Caller provides the providerConfig.
 */

import { buildContext } from '../ai/context';
import { streamRequest } from '../ai/streaming';
import type { StreamConfig } from '../ai/streaming/types';
import type { SuggestionMode, SuggestionRequest } from './types';

// ─── Per-mode prompt configuration ───────────────────────────────────────────

function getTaskInstruction(mode: SuggestionMode): string {
  switch (mode) {
    case 'continue':
      return (
        'Continue this passage seamlessly. Match the established style, tense, and voice. ' +
        'Write only the continuation — do not repeat any of the existing text.'
      );
    case 'improve':
      return (
        'Rewrite this passage to improve clarity, flow, and impact while preserving the ' +
        'meaning and voice. Return only the rewritten text.'
      );
    case 'shorten':
      return (
        'Condense this passage to its essential content. Remove redundancy and verbose phrasing. ' +
        'Return only the shortened text.'
      );
    case 'expand':
      return (
        'Expand this passage with additional detail, description, or dialogue that fits ' +
        'naturally. Return only the expanded text.'
      );
    case 'grammar':
      return (
        'Find all grammar, spelling, and punctuation errors in the [Current Text] and return ' +
        'them as JSON corrections.'
      );
    case 'rephrase':
      return (
        'Rewrite the [Current Text] in 3 distinct ways. Vary sentence structure, vocabulary, ' +
        'and approach while preserving the core meaning. ' +
        'Separate each version with exactly this line: ---OPTION---\n' +
        'Return only the 3 versions and the separators.'
      );
  }
}

function getSystemPrompt(mode: SuggestionMode): string | undefined {
  if (mode === 'grammar') {
    return (
      'You are a grammar, spelling, and punctuation checker. ' +
      'Respond ONLY with a JSON array of corrections. ' +
      'Each item: {"original":"exact text from the passage (copy verbatim)","correction":"fixed version"}. ' +
      'No markdown fences, no explanations, no other text. ' +
      'If there are no corrections needed, respond with [].'
    );
  }
  return undefined;
}

function getMaxTokens(mode: SuggestionMode): number {
  switch (mode) {
    case 'shorten':  return 512;
    case 'grammar':  return 256;
    case 'continue': return 512;
    default:         return 1024;
  }
}

function getTemperature(mode: SuggestionMode): number {
  if (mode === 'grammar') return 0.1;
  if (mode === 'rephrase') return 0.9;
  return 0.7;
}

// ─── AI call ──────────────────────────────────────────────────────────────────

export async function callAI(request: SuggestionRequest): Promise<string> {
  const { mode } = request;

  const ctx = buildContext({
    currentText: request.originalText,
    precedingText: request.precedingContext,
    followingText: request.followingContext,
    bookSummary: request.bookSummary,
    styleProfile: request.styleProfile,
    taskInstruction: getTaskInstruction(mode),
    tokenBudget: 4000,
  });

  const config: StreamConfig = {
    ...request.providerConfig,
    prompt: ctx.prompt,
    systemPrompt: getSystemPrompt(mode),
    maxTokens: getMaxTokens(mode),
    temperature: getTemperature(mode),
  };

  return new Promise<string>((resolve, reject) => {
    streamRequest(config, {
      onChunk: () => {},
      onDone: (fullText) => resolve(fullText),
      onError: (err) => console.warn('[suggestions/engine] chunk error:', err.message),
    }).then(
      () => {},
      reject,
    );
  });
}
