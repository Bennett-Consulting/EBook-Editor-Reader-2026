/**
 * Anthropic streaming provider.
 * Protocol: SSE — event lines (`event: <type>`) + data lines (`data: <json>`).
 * We filter for `content_block_delta` events with `delta.type === 'text_delta'`.
 */

import type { StreamConfig, StreamCallbacks } from '../types';
import { readLines } from '../streamUtils';

export async function streamAnthropic(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  const url = `${baseUrl}/v1/messages`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: 'user', content: config.prompt }],
    stream: true,
    max_tokens: config.maxTokens ?? 1024,
  };
  if (config.systemPrompt) body['system'] = config.systemPrompt;
  if (config.temperature !== undefined) body['temperature'] = config.temperature;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let fullText = '';

  await readLines(response.body!, (line) => {
    // `event:` lines are informational — the `data:` line carries the type field too.
    if (!line.startsWith('data: ')) return;
    const data = line.slice(6).trim();
    try {
      const parsed = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'text_delta'
      ) {
        const chunk = parsed.delta.text ?? '';
        if (chunk) {
          fullText += chunk;
          callbacks.onChunk(chunk);
        }
      }
    } catch (err) {
      callbacks.onError(new Error(`Malformed Anthropic chunk: ${String(err)}`));
    }
  });

  callbacks.onDone(fullText);
}
