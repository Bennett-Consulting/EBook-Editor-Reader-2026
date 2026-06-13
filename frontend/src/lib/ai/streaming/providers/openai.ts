/**
 * OpenAI-compatible streaming provider.
 * Handles: openai, groq (same API shape), custom (caller provides baseUrl).
 * Protocol: SSE — each line is `data: <json>` or `data: [DONE]`.
 */

import type { StreamConfig, StreamCallbacks } from '../types';
import { readLines } from '../streamUtils';

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  groq: 'https://api.groq.com/openai',
};

export async function streamOpenAI(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const baseUrl = config.baseUrl ?? BASE_URLS[config.provider] ?? 'https://api.openai.com';
  const url = `${baseUrl}/v1/chat/completions`;

  const messages: Array<{ role: string; content: string }> = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: config.prompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      max_tokens: config.maxTokens ?? 1024,
      temperature: config.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let fullText = '';

  await readLines(response.body!, (line) => {
    if (!line.startsWith('data: ')) return;
    const data = line.slice(6).trim();
    if (data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const chunk = parsed.choices?.[0]?.delta?.content ?? '';
      if (chunk) {
        fullText += chunk;
        callbacks.onChunk(chunk);
      }
    } catch (err) {
      callbacks.onError(new Error(`Malformed OpenAI chunk: ${String(err)}`));
    }
  });

  callbacks.onDone(fullText);
}
