/**
 * Chunk-splitting and recursive summarize-combine logic.
 * No app-level dependencies — only uses streamRequest from ../streaming.
 */

import { streamRequest } from '../streaming';
import type { StreamConfig } from '../streaming/types';

export const DEFAULT_CHUNK_SIZE = 8000;

/** Split text into roughly equal chunks of at most `chunkSize` chars. */
export function splitIntoChunks(text: string, chunkSize: number = DEFAULT_CHUNK_SIZE): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

/**
 * Summarize a single text chunk using the AI provider.
 * Returns the summary text.
 */
export async function summarizeChunk(
  chunk: string,
  task: string,
  config: StreamConfig,
): Promise<string> {
  const taskInstruction =
    task === 'themes'
      ? 'List the main themes present in this passage in 2-3 sentences.'
      : task === 'characters'
      ? 'List the characters mentioned in this passage and one key detail about each.'
      : task === 'plot-holes'
      ? 'Identify any logical inconsistencies or unresolved plot points in this passage.'
      : 'Summarize this passage in 2-4 sentences, preserving key plot points and character details.';

  return new Promise<string>((resolve, reject) => {
    let result = '';
    streamRequest(
      { ...config, prompt: `${taskInstruction}\n\n${chunk}` },
      {
        onChunk: (t) => { result += t; },
        onDone: (full) => { resolve(full || result); },
        onError: (err) => { reject(err); },
      },
    ).catch(reject);
  });
}

/**
 * Combine multiple summaries into a single summary.
 * Used recursively until one summary remains.
 */
export async function combineSummaries(
  summaries: string[],
  task: string,
  config: StreamConfig,
): Promise<string> {
  const combineInstruction =
    task === 'themes'
      ? 'Merge these theme lists into a single consolidated list, removing duplicates:'
      : task === 'characters'
      ? 'Merge these character lists into one, consolidating descriptions for each character:'
      : task === 'plot-holes'
      ? 'Consolidate these inconsistency lists, removing duplicates:'
      : 'Combine these summaries into one coherent summary of the full text, preserving key details:';

  const combinedInput = summaries.join('\n\n---\n\n');

  return new Promise<string>((resolve, reject) => {
    let result = '';
    streamRequest(
      { ...config, prompt: `${combineInstruction}\n\n${combinedInput}` },
      {
        onChunk: (t) => { result += t; },
        onDone: (full) => { resolve(full || result); },
        onError: (err) => { reject(err); },
      },
    ).catch(reject);
  });
}

/**
 * Recursively combine summaries pair-by-pair until one remains.
 * Uses a simple sequential reduce (not parallel) to stay within rate limits.
 */
export async function reduceToOne(
  summaries: string[],
  task: string,
  config: StreamConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  if (summaries.length === 0) return '';
  if (summaries.length === 1) return summaries[0];

  let current = summaries;
  let passTotal = Math.ceil(current.length / 2);
  let passDone = 0;

  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        const combined = await combineSummaries([current[i], current[i + 1]], task, config);
        next.push(combined);
      } else {
        // Odd item out — carry forward unchanged
        next.push(current[i]);
      }
      passDone++;
      onProgress?.(passDone, passTotal + current.length - 1);
    }
    current = next;
    passTotal = Math.ceil(current.length / 2);
  }

  return current[0];
}
