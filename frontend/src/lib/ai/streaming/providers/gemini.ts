/**
 * Google Gemini streaming provider.
 * Protocol: SSE — each `data:` line is a JSON object containing candidates.
 * API key is passed as a query param (not Authorization header).
 */

import type { StreamConfig, StreamCallbacks } from '../types';
import { readLines } from '../streamUtils';

export async function streamGemini(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const baseUrl =
    config.baseUrl ?? 'https://generativelanguage.googleapis.com';
  const url = `${baseUrl}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

  // Gemini doesn't have a separate system prompt field in v1beta — prepend it.
  const userContent = config.systemPrompt
    ? `${config.systemPrompt}\n\n${config.prompt}`
    : config.prompt;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        maxOutputTokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let fullText = '';

  await readLines(response.body!, (line) => {
    if (!line.startsWith('data: ')) return;
    const data = line.slice(6).trim();
    try {
      const parsed = JSON.parse(data) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const chunk =
        parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (chunk) {
        fullText += chunk;
        callbacks.onChunk(chunk);
      }
    } catch (err) {
      callbacks.onError(new Error(`Malformed Gemini chunk: ${String(err)}`));
    }
  });

  callbacks.onDone(fullText);
}
