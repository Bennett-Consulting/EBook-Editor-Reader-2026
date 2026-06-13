/**
 * AI Server Discovery Module
 *
 * Portable: zero app-level dependencies. No AsyncStorage, no React Native,
 * no Expo. Only uses fetch + AbortController (Node 18+ / React Native 0.71+).
 *
 * Portability contract (same as ai/context, ai/streaming, ai/analysis):
 *   - Caller provides everything: org domain, mDNS hosts, timeout
 *   - Module never reads config from storage or the environment
 *   - Drop-in reusable in any JS/TS app that has fetch
 *
 * Two discovery strategies — both feed the same DiscoveredServer result shape:
 *
 *   1. .well-known/ai-server   — RFC-style JSON at https://{orgDomain}/.well-known/ai-server
 *      Used by: enterprise, government, educational orgs that publish a server manifest
 *
 *   2. Subdomain heuristics    — probe ai.*, llm.*, openai.*, ollama.*, gpt.*, ml.*
 *      Used by: any org whose IT team chose an obvious subdomain but didn't add .well-known
 *
 *   3. mDNS hosts (caller-supplied) — probe hostnames found by react-native-zeroconf
 *      Used by: local-network / lab / campus / air-gapped deployments
 *
 * All probes run concurrently (Promise.allSettled). Results are deduplicated
 * by canonical URL and sorted fastest-first (lowest latency).
 *
 * Public API:
 *   probeServer(url, timeoutMs?)          — probe one URL, return info or null
 *   discoverAIServers(options)            — discover from all sources
 */

export type { DiscoveryOptions, DiscoveredServer, DiscoveryResult, WellKnownAIServer } from "./types";

import type { DiscoveryOptions, DiscoveredServer, DiscoveryResult } from "./types";
import { probeServer, canonicalUrl } from "./probe";
import {
  wellKnownUrl,
  parseWellKnown,
  subdomainCandidates,
  mdnsCandidates,
  type CandidateURL,
} from "./candidates";

export { probeServer } from "./probe";

/**
 * Discover AI servers from all available sources concurrently.
 *
 * Steps:
 *   1. If orgDomain: fetch .well-known/ai-server → if valid, probe the returned URL
 *   2. If orgDomain: probe all subdomain candidates in parallel
 *   3. If mdnsHosts: probe all mDNS-derived URLs in parallel
 *   4. Deduplicate by canonical URL, sort by latency (fastest first)
 */
export async function discoverAIServers(
  options: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const { orgDomain, mdnsHosts = [], timeoutMs = 3000 } = options;

  const candidates: CandidateURL[] = [];
  const errors: string[] = [];

  // ── Step 1: .well-known/ai-server ─────────────────────────────────────────
  if (orgDomain) {
    try {
      const wkUrl = wellKnownUrl(orgDomain);
      const res = await fetchWithTimeout(wkUrl, timeoutMs);
      if (res.ok) {
        const body = await res.json() as unknown;
        const wk = parseWellKnown(body);
        if (wk?.url) {
          candidates.push({ url: wk.url, source: "well-known", name: wk.name });
        }
      }
    } catch (err) {
      errors.push(`well-known probe failed: ${String(err)}`);
    }
  }

  // ── Step 2: subdomain heuristics ──────────────────────────────────────────
  if (orgDomain) {
    candidates.push(...subdomainCandidates(orgDomain));
  }

  // ── Step 3: mDNS hosts ────────────────────────────────────────────────────
  if (mdnsHosts.length > 0) {
    candidates.push(...mdnsCandidates(mdnsHosts));
  }

  // ── Step 4: probe all candidates concurrently ─────────────────────────────
  const results = await Promise.allSettled(
    candidates.map((c) => probeServer(c.url, c.source, timeoutMs, c.name)),
  );

  const found: DiscoveredServer[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      errors.push(`probe error for ${candidates[i].url}: ${String(result.reason)}`);
      continue;
    }
    const server = result.value;
    if (!server) continue;

    const key = canonicalUrl(server.url);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(server);
  }

  // Sort fastest-first so the UI can show the best option at the top
  found.sort((a, b) => a.latencyMs - b.latencyMs);

  return {
    servers: found,
    probed: candidates.length,
    errors,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
