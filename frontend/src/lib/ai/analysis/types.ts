/**
 * Types for the AI analysis module (map-reduce whole-book analysis).
 * No imports from app code — this file must work in any JS/TS environment.
 */

import type { StreamConfig } from '../streaming/types';
import type { StyleProfile } from '../context/types';

export type { StreamConfig, StyleProfile };

export interface AnalysisRequest {
  /** Entire book content (can be hundreds of thousands of chars). */
  fullText: string;
  /** Which AI provider + model to use for summarization. */
  providerConfig: StreamConfig;
  /** Chars per chunk (default 8000 — fits BitNet / small Ollama models). */
  chunkSize?: number;
  /** Analysis task. Default "summarize". */
  task?: 'summarize' | 'themes' | 'characters' | 'plot-holes';
}

export interface AnalysisProgress {
  stage: 'chunking' | 'summarizing' | 'combining' | 'done';
  chunksTotal: number;
  chunksDone: number;
  /** First 80 chars of the chunk currently being processed. */
  currentChunkPreview: string;
}

export interface AnalysisResult {
  /** Final whole-book summary (or themes/characters/plot-holes list). */
  summary: string;
  /** Style profile extracted from the first three chunks (representative sample). */
  styleProfile: StyleProfile;
  chunksProcessed: number;
  tokensEstimated: number;
}
