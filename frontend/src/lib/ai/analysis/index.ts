/**
 * AI Analysis Module — portable map-reduce whole-book analysis.
 *
 * Portable: zero app-level dependencies. Uses streamRequest (../streaming)
 * and extractStyleProfile/estimateTokens (../context). The caller loads book
 * content and passes it in; this module never touches AsyncStorage or React.
 *
 * Public API:
 *   analyzeBook(request)        — AsyncGenerator yielding progress then result
 *   summarizeChunks(chunks, …)  — map-reduce used recursively by analyzeBook
 */

export type { AnalysisRequest, AnalysisResult, AnalysisProgress } from './types';

import type { AnalysisRequest, AnalysisResult, AnalysisProgress } from './types';
import type { StreamConfig } from '../streaming/types';
import {
  splitIntoChunks,
  summarizeChunk,
  reduceToOne,
  DEFAULT_CHUNK_SIZE,
} from './mapReduce';
import { extractStyleProfile, estimateTokens } from '../context';

/**
 * Summarize an array of text chunks into a single summary string.
 * Map phase: one `streamRequest` per chunk; reduce phase: pair-combine until one.
 */
export async function summarizeChunks(
  chunks: string[],
  config: StreamConfig,
  task = 'summarize',
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  if (chunks.length === 0) return '';

  // Map phase — summarize each chunk
  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const summary = await summarizeChunk(chunks[i], task, config);
    summaries.push(summary);
    onProgress?.(i + 1, chunks.length);
  }

  // Reduce phase — recursively combine
  return reduceToOne(summaries, task, config);
}

/**
 * Full map-reduce analysis of an entire book.
 *
 * Yields `AnalysisProgress` events after each chunk completes so the UI can
 * display a live progress bar. The final `return` value is `AnalysisResult`.
 */
export async function* analyzeBook(
  request: AnalysisRequest,
): AsyncGenerator<AnalysisProgress, AnalysisResult> {
  const {
    fullText,
    providerConfig,
    chunkSize = DEFAULT_CHUNK_SIZE,
    task = 'summarize',
  } = request;

  // ── Chunking phase ─────────────────────────────────────────────────────────
  const chunks = splitIntoChunks(fullText, chunkSize);
  const chunksTotal = chunks.length;

  yield {
    stage: 'chunking',
    chunksTotal,
    chunksDone: 0,
    currentChunkPreview: chunks[0]?.slice(0, 80) ?? '',
  };

  // ── Style profile — extracted from first 3 chunks (representative sample) ──
  const sampleText = chunks.slice(0, 3).join('\n\n');
  const styleProfile = extractStyleProfile(sampleText);

  // ── Map phase — summarize each chunk ──────────────────────────────────────
  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    yield {
      stage: 'summarizing',
      chunksTotal,
      chunksDone: i,
      currentChunkPreview: chunks[i].slice(0, 80),
    };

    const summary = await summarizeChunk(chunks[i], task, providerConfig);
    summaries.push(summary);
  }

  // ── Reduce phase — combine summaries ──────────────────────────────────────
  yield {
    stage: 'combining',
    chunksTotal,
    chunksDone: chunksTotal,
    currentChunkPreview: '',
  };

  const finalSummary = await reduceToOne(summaries, task, providerConfig);

  const tokensEstimated = estimateTokens(fullText);

  yield {
    stage: 'done',
    chunksTotal,
    chunksDone: chunksTotal,
    currentChunkPreview: '',
  };

  return {
    summary: finalSummary,
    styleProfile,
    chunksProcessed: chunks.length,
    tokensEstimated,
  };
}
