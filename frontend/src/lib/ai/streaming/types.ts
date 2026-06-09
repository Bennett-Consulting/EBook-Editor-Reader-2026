/**
 * Types for the AI streaming module.
 * No imports from app code — this file must work in any JS/TS environment.
 */

export interface StreamConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama' | 'bitnet' | 'custom';
  apiKey: string;
  model: string;
  /** Required for ollama / bitnet / custom providers. */
  baseUrl?: string;
  /** Fully assembled prompt — typically from buildContext(). */
  prompt: string;
  systemPrompt?: string;
  /** Default 1024. */
  maxTokens?: number;
  /** Default 0.7. */
  temperature?: number;
}

export interface StreamCallbacks {
  /** Called for each text chunk received from the provider. */
  onChunk: (text: string) => void;
  /** Called once when the stream ends, with the full concatenated response. */
  onDone: (fullText: string) => void;
  /** Called on a recoverable in-stream error (malformed chunk, etc.). */
  onError: (error: Error) => void;
}
