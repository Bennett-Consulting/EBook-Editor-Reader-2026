/**
 * Task 4b — AI Streaming Module tests.
 *
 * All tests mock `fetch` using jest.fn(). No real network calls are made.
 * ReadableStream + TextEncoder are available globally in Node 18+.
 */

import { streamRequest } from '../../../src/lib/ai/streaming';
import type { StreamConfig, StreamCallbacks } from '../../../src/lib/ai/streaming';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function encodeLines(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

function makeCallbacks(): StreamCallbacks & {
  chunks: string[];
  done: string | null;
  errors: Error[];
} {
  const chunks: string[] = [];
  let done: string | null = null;
  const errors: Error[] = [];
  return {
    chunks,
    done: null as string | null,
    errors,
    onChunk: (t) => { chunks.push(t); },
    onDone: (full) => { done = full; },
    onError: (err) => { errors.push(err); },
    get done() { return done; },
    set done(v) { done = v; },
  };
}

function okResponse(lines: string[]): Response {
  return { ok: true, status: 200, statusText: 'OK', body: encodeLines(lines) } as unknown as Response;
}

function errorResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText, body: null } as unknown as Response;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── OpenAI SSE ───────────────────────────────────────────────────────────────

const OPENAI_CONFIG: StreamConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  prompt: 'Hello',
};

describe('streamRequest — OpenAI SSE', () => {
  it('delivers chunks in order', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OPENAI_CONFIG, cb);

    expect(cb.chunks).toEqual(['Hello', ' world']);
  });

  it('calls onDone with full concatenated text', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"choices":[{"delta":{"content":"Foo"}}]}',
        'data: {"choices":[{"delta":{"content":"Bar"}}]}',
        'data: [DONE]',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OPENAI_CONFIG, cb);

    expect(cb.done).toBe('FooBar');
  });

  it('throws on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      errorResponse(401, 'Unauthorized'),
    );

    const cb = makeCallbacks();
    await expect(streamRequest(OPENAI_CONFIG, cb)).rejects.toThrow('HTTP 401');
  });

  it('skips malformed data lines and calls onError', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"choices":[{"delta":{"content":"Good"}}]}',
        'data: NOT_JSON',
        'data: [DONE]',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OPENAI_CONFIG, cb);

    expect(cb.chunks).toEqual(['Good']);
    expect(cb.errors).toHaveLength(1);
  });

  it('sends Authorization header with Bearer token', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(['data: [DONE]']));
    const cb = makeCallbacks();
    await streamRequest(OPENAI_CONFIG, cb);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
  });

  it('includes system prompt in messages when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(['data: [DONE]']));
    const cb = makeCallbacks();
    await streamRequest({ ...OPENAI_CONFIG, systemPrompt: 'You are a writer.' }, cb);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: Array<{role: string}> };
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a writer.' });
  });

  it('uses custom baseUrl when provider is custom', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(['data: [DONE]']));
    const cb = makeCallbacks();
    await streamRequest({ ...OPENAI_CONFIG, provider: 'custom', baseUrl: 'https://my-proxy.com' }, cb);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('https://my-proxy.com');
  });
});

// ─── Anthropic SSE ───────────────────────────────────────────────────────────

const ANTHROPIC_CONFIG: StreamConfig = {
  provider: 'anthropic',
  apiKey: 'anthropic-key',
  model: 'claude-haiku-4-5-20251001',
  prompt: 'Hello',
};

describe('streamRequest — Anthropic SSE', () => {
  it('delivers content_block_delta chunks in order', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_01"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(ANTHROPIC_CONFIG, cb);

    expect(cb.chunks).toEqual(['Hi', ' there']);
  });

  it('calls onDone with full text from all deltas', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Alpha"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Beta"}}',
        'data: {"type":"message_stop"}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(ANTHROPIC_CONFIG, cb);

    expect(cb.done).toBe('AlphaBeta');
  });

  it('ignores non-content_block_delta events', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"type":"message_start","message":{"id":"msg_01"}}',
        'data: {"type":"ping"}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Only"}}',
        'data: {"type":"message_stop"}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(ANTHROPIC_CONFIG, cb);

    expect(cb.chunks).toEqual(['Only']);
    expect(cb.done).toBe('Only');
  });

  it('uses x-api-key header instead of Authorization', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(['data: {"type":"message_stop"}']));
    const cb = makeCallbacks();
    await streamRequest(ANTHROPIC_CONFIG, cb);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('anthropic-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('throws on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse(403, 'Forbidden'));
    const cb = makeCallbacks();
    await expect(streamRequest(ANTHROPIC_CONFIG, cb)).rejects.toThrow('HTTP 403');
  });
});

// ─── Ollama NDJSON ────────────────────────────────────────────────────────────

const OLLAMA_CONFIG: StreamConfig = {
  provider: 'ollama',
  apiKey: '',
  model: 'llama3',
  baseUrl: 'http://localhost:11434',
  prompt: 'Hello',
};

describe('streamRequest — Ollama NDJSON', () => {
  it('delivers /api/chat chunks in order', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        '{"model":"llama3","message":{"role":"assistant","content":"Hola"},"done":false}',
        '{"model":"llama3","message":{"role":"assistant","content":" amigo"},"done":false}',
        '{"model":"llama3","message":{"role":"assistant","content":""},"done":true}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OLLAMA_CONFIG, cb);

    expect(cb.chunks).toEqual(['Hola', ' amigo']);
  });

  it('calls onDone with full concatenated text', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        '{"model":"llama3","message":{"role":"assistant","content":"One"},"done":false}',
        '{"model":"llama3","message":{"role":"assistant","content":"Two"},"done":true}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OLLAMA_CONFIG, cb);

    expect(cb.done).toBe('OneTwo');
  });

  it('uses /api/generate endpoint for bitnet provider', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        '{"model":"bitnet","response":"Hi","done":false}',
        '{"model":"bitnet","response":"","done":true}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest({ ...OLLAMA_CONFIG, provider: 'bitnet' }, cb);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('/api/generate');
    expect(cb.chunks).toEqual(['Hi']);
  });

  it('reads `response` field for /api/generate format', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        '{"response":"A","done":false}',
        '{"response":"B","done":false}',
        '{"response":"","done":true}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest({ ...OLLAMA_CONFIG, provider: 'bitnet' }, cb);

    expect(cb.chunks).toEqual(['A', 'B']);
    expect(cb.done).toBe('AB');
  });

  it('throws on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));
    const cb = makeCallbacks();
    await expect(streamRequest(OLLAMA_CONFIG, cb)).rejects.toThrow('HTTP 500');
  });

  it('skips empty lines silently', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        '',
        '{"model":"llama3","message":{"role":"assistant","content":"X"},"done":true}',
        '',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(OLLAMA_CONFIG, cb);

    expect(cb.chunks).toEqual(['X']);
    expect(cb.errors).toHaveLength(0);
  });
});

// ─── Gemini SSE ───────────────────────────────────────────────────────────────

const GEMINI_CONFIG: StreamConfig = {
  provider: 'google',
  apiKey: 'gemini-key',
  model: 'gemini-1.5-flash',
  prompt: 'Hello',
};

describe('streamRequest — Gemini SSE', () => {
  it('delivers chunks from candidates[0].content.parts[0].text', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hey"}],"role":"model"}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":" there"}],"role":"model"}}]}',
      ]),
    );

    const cb = makeCallbacks();
    await streamRequest(GEMINI_CONFIG, cb);

    expect(cb.chunks).toEqual(['Hey', ' there']);
    expect(cb.done).toBe('Hey there');
  });

  it('embeds API key in the URL as query param', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse([]));
    const cb = makeCallbacks();
    await streamRequest(GEMINI_CONFIG, cb);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('key=gemini-key');
  });

  it('throws on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse(429, 'Too Many Requests'));
    const cb = makeCallbacks();
    await expect(streamRequest(GEMINI_CONFIG, cb)).rejects.toThrow('HTTP 429');
  });
});

// ─── Provider routing ────────────────────────────────────────────────────────

describe('streamRequest — provider routing', () => {
  it('routes groq to OpenAI-compatible endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(['data: [DONE]']));
    const cb = makeCallbacks();
    await streamRequest({ ...OPENAI_CONFIG, provider: 'groq' }, cb);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('groq.com');
  });

  it('throws on unknown provider', async () => {
    const cb = makeCallbacks();
    await expect(
      streamRequest({ ...OPENAI_CONFIG, provider: 'unknown' as 'openai' }, cb),
    ).rejects.toThrow('Unknown provider');
  });
});
