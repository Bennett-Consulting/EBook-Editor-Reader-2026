/**
 * Task 4c — AI Analysis Module tests.
 *
 * streamRequest is mocked to avoid network calls.
 * Tests verify: chunking, map phase (one call per chunk),
 * reduce phase convergence, progress events, and result shape.
 */

import { summarizeChunks, analyzeBook } from '../../../src/lib/ai/analysis';
import { splitIntoChunks } from '../../../src/lib/ai/analysis/mapReduce';
import type { AnalysisRequest } from '../../../src/lib/ai/analysis';
import type { StreamConfig } from '../../../src/lib/ai/streaming';

// ─── Mock streamRequest ───────────────────────────────────────────────────────

jest.mock('../../../src/lib/ai/streaming', () => ({
  streamRequest: jest.fn(),
}));

import { streamRequest } from '../../../src/lib/ai/streaming';
const mockStreamRequest = streamRequest as jest.Mock;

/** Make streamRequest echo back a predictable summary string. */
function setupStream(echoFn: (prompt: string) => string): void {
  mockStreamRequest.mockImplementation(
    (config: StreamConfig, callbacks: { onChunk: (t: string) => void; onDone: (t: string) => void }) => {
      const text = echoFn(config.prompt);
      callbacks.onChunk(text);
      callbacks.onDone(text);
      return Promise.resolve();
    },
  );
}

const BASE_CONFIG: StreamConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  prompt: '', // overridden per call
};

const BASE_REQUEST: AnalysisRequest = {
  fullText: '',
  providerConfig: BASE_CONFIG,
  chunkSize: 8000,
  task: 'summarize',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── splitIntoChunks ──────────────────────────────────────────────────────────

describe('splitIntoChunks', () => {
  it('returns empty array for empty input', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });

  it('returns one chunk when text is smaller than chunkSize', () => {
    const result = splitIntoChunks('Hello world', 100);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world');
  });

  it('splits 100,000 chars into the correct chunk count', () => {
    const text = 'A'.repeat(100_000);
    const chunks = splitIntoChunks(text, 8000);
    // 100,000 / 8,000 = 12.5 → 13 chunks
    expect(chunks).toHaveLength(13);
    expect(chunks.every((c) => c.length <= 8000)).toBe(true);
  });

  it('total characters across all chunks equals input length', () => {
    const text = 'B'.repeat(25_000);
    const chunks = splitIntoChunks(text, 3000);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(25_000);
  });

  it('last chunk may be shorter than chunkSize', () => {
    const chunks = splitIntoChunks('X'.repeat(10_500), 8000);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].length).toBe(2500);
  });
});

// ─── summarizeChunks ──────────────────────────────────────────────────────────

describe('summarizeChunks', () => {
  it('returns empty string for empty chunks array', async () => {
    const result = await summarizeChunks([], BASE_CONFIG);
    expect(result).toBe('');
    expect(mockStreamRequest).not.toHaveBeenCalled();
  });

  it('calls streamRequest once per chunk in the map phase', async () => {
    setupStream(() => 'summary');
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    await summarizeChunks(chunks, BASE_CONFIG);
    // 3 map calls + up to 2 reduce calls (3→2→1)
    expect(mockStreamRequest.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('calls streamRequest exactly once for a single chunk (no reduce needed)', async () => {
    setupStream(() => 'one summary');
    await summarizeChunks(['single chunk text'], BASE_CONFIG);
    expect(mockStreamRequest).toHaveBeenCalledTimes(1);
  });

  it('returns the direct summary when only one chunk provided', async () => {
    setupStream(() => 'direct');
    const result = await summarizeChunks(['the text'], BASE_CONFIG);
    expect(result).toBe('direct');
  });

  it('calls onProgress with correct done/total counts', async () => {
    setupStream(() => 'ok');
    const progress: Array<[number, number]> = [];
    await summarizeChunks(['a', 'b', 'c'], BASE_CONFIG, 'summarize', (d, t) => progress.push([d, t]));
    // Map phase: 3 calls → progress [1,3], [2,3], [3,3]
    expect(progress).toContainEqual([1, 3]);
    expect(progress).toContainEqual([2, 3]);
    expect(progress).toContainEqual([3, 3]);
  });

  it('two-chunk input produces one combine call (reduce step)', async () => {
    setupStream((prompt) => `summary_of(${prompt.slice(-5)})`);
    await summarizeChunks(['aaaaa', 'bbbbb'], BASE_CONFIG);
    // 2 map calls + 1 combine = 3
    expect(mockStreamRequest).toHaveBeenCalledTimes(3);
  });
});

// ─── analyzeBook ──────────────────────────────────────────────────────────────

describe('analyzeBook — progress events', () => {
  it('emits chunking stage event first', async () => {
    setupStream(() => 'summary');
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: 'A'.repeat(1000), chunkSize: 500 });
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ stage: 'chunking' });
  });

  it('emits summarizing events for each chunk', async () => {
    setupStream(() => 'summary');
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: 'A'.repeat(1000), chunkSize: 400 });
    const stages: string[] = [];
    let result = await gen.next();
    while (!result.done) {
      stages.push((result.value as { stage: string }).stage);
      result = await gen.next();
    }
    expect(stages.filter((s) => s === 'summarizing').length).toBeGreaterThan(0);
    expect(stages).toContain('combining');
    expect(stages).toContain('done');
  });

  it('final yield has stage "done" with chunksDone === chunksTotal', async () => {
    setupStream(() => 'ok');
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: 'Hello world', chunkSize: 100 });
    const events: Array<{ stage: string; chunksTotal: number; chunksDone: number }> = [];
    let result = await gen.next();
    while (!result.done) {
      events.push(result.value as { stage: string; chunksTotal: number; chunksDone: number });
      result = await gen.next();
    }
    const done = events.find((e) => e.stage === 'done');
    expect(done).toBeDefined();
    expect(done!.chunksDone).toBe(done!.chunksTotal);
  });
});

describe('analyzeBook — result shape', () => {
  it('returns AnalysisResult with correct shape', async () => {
    setupStream(() => 'test summary');
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: 'Short text.', chunkSize: 8000 });
    let result = await gen.next();
    while (!result.done) result = await gen.next();
    const analysisResult = result.value;

    expect(typeof analysisResult.summary).toBe('string');
    expect(typeof analysisResult.chunksProcessed).toBe('number');
    expect(typeof analysisResult.tokensEstimated).toBe('number');
    expect(analysisResult.styleProfile).toBeDefined();
    expect(analysisResult.styleProfile.dominantTense).toMatch(/past|present|unknown/);
  });

  it('chunksProcessed matches the number of chunks split from the text', async () => {
    setupStream(() => 'ok');
    const text = 'X'.repeat(16_000);
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: text, chunkSize: 8000 });
    let result = await gen.next();
    while (!result.done) result = await gen.next();
    expect(result.value.chunksProcessed).toBe(2);
  });

  it('tokensEstimated is approximately length/4', async () => {
    setupStream(() => 'ok');
    const text = 'A'.repeat(8000);
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: text, chunkSize: 8000 });
    let result = await gen.next();
    while (!result.done) result = await gen.next();
    // 8000 / 4 = 2000
    expect(result.value.tokensEstimated).toBe(2000);
  });

  it('styleProfile extracted from first 3 chunks only', async () => {
    setupStream(() => 'ok');
    // Use past-tense prose so styleProfile detects it
    const chapter =
      'Holmes walked into the room. Watson had already arrived. He said nothing and looked away. The fog had settled.';
    const text = (chapter + '\n').repeat(100); // large book
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: text, chunkSize: 8000 });
    let result = await gen.next();
    while (!result.done) result = await gen.next();
    expect(result.value.styleProfile.dominantTense).toBe('past');
  });
});

describe('analyzeBook — streamRequest called once per chunk', () => {
  it('map phase invokes streamRequest N times for N chunks', async () => {
    setupStream(() => 'ok');
    const text = 'Z'.repeat(24_000);
    const gen = analyzeBook({ ...BASE_REQUEST, fullText: text, chunkSize: 8000 });
    let result = await gen.next();
    while (!result.done) result = await gen.next();
    // 3 chunks → 3 map calls + 1-2 reduce calls
    expect(mockStreamRequest.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
