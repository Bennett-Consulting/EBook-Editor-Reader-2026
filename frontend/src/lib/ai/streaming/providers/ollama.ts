/**
 * Ollama / BitNet streaming provider.
 * Protocol: NDJSON — one JSON object per line.
 *
 * Ollama /api/chat:     { message: { content: "token" }, done: false }
 * Ollama /api/generate: { response: "token", done: false }  (BitNet-compatible)
 */

import type { StreamConfig, StreamCallbacks } from '../types';
import { readLines } from '../streamUtils';

export async function streamOllama(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const baseUrl = config.baseUrl ?? 'http://localhost:11434';
  const isBitNet = config.provider === 'bitnet';

  // BitNet uses /api/generate; Ollama prefers /api/chat but supports both.
  const url = `${baseUrl}${isBitNet ? '/api/generate' : '/api/chat'}`;

  const requestBody = isBitNet
    ? JSON.stringify({
        model: config.model,
        prompt: config.prompt,
        stream: true,
      })
    : JSON.stringify({
        model: config.model,
        messages: [
          ...(config.systemPrompt
            ? [{ role: 'system', content: config.systemPrompt }]
            : []),
          { role: 'user', content: config.prompt },
        ],
        stream: true,
        options: {
          num_predict: config.maxTokens ?? 1024,
          temperature: config.temperature ?? 0.7,
        },
      });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let fullText = '';

  await readLines(response.body!, (line) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as {
        response?: string;
        message?: { content?: string };
        done?: boolean;
      };
      // /api/generate uses `response`; /api/chat uses `message.content`
      const chunk = parsed.response ?? parsed.message?.content ?? '';
      if (chunk) {
        fullText += chunk;
        callbacks.onChunk(chunk);
      }
    } catch (err) {
      callbacks.onError(new Error(`Malformed Ollama chunk: ${String(err)}`));
    }
  });

  callbacks.onDone(fullText);
}
