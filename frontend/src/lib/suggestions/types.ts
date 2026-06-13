/**
 * Types for the AI Suggestion Engine.
 * No imports from app code — portable to any JS/TS environment.
 */

import type { StyleProfile } from '../ai/context/types';
import type { StreamConfig } from '../ai/streaming/types';

export type SuggestionMode =
  | 'continue'
  | 'improve'
  | 'shorten'
  | 'expand'
  | 'grammar'
  | 'rephrase';

export interface SuggestionRequest {
  originalText: string;
  /** Up to 1,000 chars of text immediately preceding the selection. */
  precedingContext?: string;
  /** Up to 1,000 chars of text immediately following the selection. */
  followingContext?: string;
  styleProfile?: StyleProfile;
  bookSummary?: string;
  mode: SuggestionMode;
  providerConfig: StreamConfig;
}

export interface DiffChunk {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface Suggestion {
  id: string;
  text: string;
  diff: DiffChunk[];
  reason?: string;
  /** Character offset in originalText where this correction starts (grammar mode). */
  offset?: number;
  /** Number of characters in originalText replaced by this correction (grammar mode). */
  length?: number;
}

export interface SuggestionSet {
  id: string;
  mode: SuggestionMode;
  originalText: string;
  suggestions: Suggestion[];
  status: 'pending' | 'ready' | 'error';
  error?: string;
  requestedAt: number;
}

export interface ApplyResult {
  newText: string;
  updatedSet: SuggestionSet;
}
