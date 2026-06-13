/**
 * Server probing — hit a candidate URL, classify what it is, return metadata.
 * Only uses fetch + AbortController (Node 18+ / React Native 0.71+).
 */

import type { DiscoveredServer } from "./types";

const DEFAULT_TIMEOUT_MS = 3000;

/** Strip trailing slashes from a URL for canonical comparison. */
export function canonicalUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Fetch a URL with an AbortController-based timeout.
 * Returns the Response or throws on timeout/network error.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a single base URL for a known AI server endpoint.
 *
 * Tries /v1/models first (OpenAI-compatible — covers OpenAI, vLLM, LM Studio,
 * LocalAI, enterprise forks, and any other OpenAI-compat server).
 * Falls back to /api/tags (Ollama native).
 *
 * Returns a DiscoveredServer on success, null if unreachable or unrecognised.
 */
export async function probeServer(
  baseUrl: string,
  source: DiscoveredServer["source"],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  name?: string,
): Promise<DiscoveredServer | null> {
  const base = canonicalUrl(baseUrl);
  const start = Date.now();

  // ── Try OpenAI-compatible /v1/models ────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(`${base}/v1/models`, timeoutMs);
    if (res.ok) {
      const latencyMs = Date.now() - start;
      const body = await res.json() as unknown;
      const { provider, models } = classifyOpenAIResponse(body);
      return { url: base, provider, name, models, source, latencyMs };
    }
  } catch {
    // Non-fatal — try next endpoint
  }

  // ── Try Ollama /api/tags ─────────────────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, timeoutMs);
    if (res.ok) {
      const latencyMs = Date.now() - start;
      const body = await res.json() as unknown;
      const models = extractOllamaModels(body);
      return { url: base, provider: "ollama", name, models, source, latencyMs };
    }
  } catch {
    // Server unreachable at both endpoints
  }

  return null;
}

// ─── Response classification ──────────────────────────────────────────────────

function classifyOpenAIResponse(body: unknown): {
  provider: DiscoveredServer["provider"];
  models: string[];
} {
  if (
    body !== null &&
    typeof body === "object" &&
    "data" in body &&
    Array.isArray((body as Record<string, unknown>).data)
  ) {
    const data = (body as { data: unknown[] }).data;
    const models = data
      .map((m) =>
        m !== null && typeof m === "object" && "id" in m
          ? String((m as { id: unknown }).id)
          : null,
      )
      .filter((id): id is string => id !== null);
    return { provider: "openai", models };
  }
  // Responded to /v1/models but shape doesn't match OpenAI — still treat as custom
  return { provider: "custom", models: [] };
}

function extractOllamaModels(body: unknown): string[] {
  if (
    body !== null &&
    typeof body === "object" &&
    "models" in body &&
    Array.isArray((body as Record<string, unknown>).models)
  ) {
    return (body as { models: unknown[] }).models
      .map((m) =>
        m !== null && typeof m === "object" && "name" in m
          ? String((m as { name: unknown }).name)
          : null,
      )
      .filter((n): n is string => n !== null);
  }
  return [];
}
