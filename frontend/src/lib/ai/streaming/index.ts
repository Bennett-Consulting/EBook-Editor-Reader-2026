/**
 * AI Streaming Module — portable token-by-token AI responses.
 *
 * Portable: zero app-level dependencies. Only `fetch` (available in
 * React Native 0.71+ and Node 18+). The caller assembles the prompt
 * (typically via buildContext()) and passes in a StreamConfig.
 *
 * Public API:
 *   streamRequest(config, callbacks) — route to the correct provider
 */

export type { StreamConfig, StreamCallbacks } from './types';

import type { StreamConfig, StreamCallbacks } from './types';
import { streamOpenAI } from './providers/openai';
import { streamAnthropic } from './providers/anthropic';
import { streamOllama } from './providers/ollama';
import { streamGemini } from './providers/gemini';

/**
 * Stream a response from the configured AI provider.
 *
 * Throws on fatal errors (HTTP non-200, unreachable host).
 * Calls `callbacks.onError` for recoverable per-chunk parse failures.
 * Calls `callbacks.onDone` with the full concatenated text when the stream ends.
 */
export async function streamRequest(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  switch (config.provider) {
    case 'openai':
    case 'groq':
    case 'custom':
      return streamOpenAI(config, callbacks);
    case 'anthropic':
      return streamAnthropic(config, callbacks);
    case 'ollama':
    case 'bitnet':
      return streamOllama(config, callbacks);
    case 'google':
      return streamGemini(config, callbacks);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
