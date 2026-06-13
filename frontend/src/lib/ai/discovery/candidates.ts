/**
 * URL candidate generation for AI server discovery.
 * Pure functions — no fetch, no side effects.
 */

import type { WellKnownAIServer } from "./types";

/** Common subdomain prefixes used by org-internal AI servers. */
const AI_SUBDOMAINS = ["ai", "llm", "openai", "ollama", "gpt", "ml"];

/** Alternative ports commonly used by self-hosted AI servers. */
const MDNS_PORTS = [
  "",        // default (80/443)
  ":11434",  // Ollama default
  ":8080",   // common alternative
  ":8000",   // FastAPI / uvicorn default
  ":3000",   // common dev port
];

export interface CandidateURL {
  url: string;
  source: "well-known" | "subdomain" | "mdns";
  /** Server name hint from .well-known response, if known ahead of probing. */
  name?: string;
}

/**
 * Build the .well-known probe URL for an org domain.
 * This is fetched first; if it returns a valid {url} we add that candidate.
 */
export function wellKnownUrl(orgDomain: string): string {
  return `https://${orgDomain}/.well-known/ai-server`;
}

/**
 * Parse the body of a .well-known/ai-server response.
 * Returns null if the response is not a valid well-known config.
 */
export function parseWellKnown(body: unknown): WellKnownAIServer | null {
  if (
    body === null ||
    typeof body !== "object" ||
    !("url" in body) ||
    typeof (body as Record<string, unknown>).url !== "string"
  ) {
    return null;
  }
  return body as WellKnownAIServer;
}

/**
 * Generate subdomain candidate URLs for an org domain.
 * Yields both https:// and http:// variants (many internal servers lack TLS).
 */
export function subdomainCandidates(orgDomain: string): CandidateURL[] {
  const candidates: CandidateURL[] = [];
  for (const sub of AI_SUBDOMAINS) {
    const host = `${sub}.${orgDomain}`;
    candidates.push({ url: `https://${host}`, source: "subdomain" });
    candidates.push({ url: `http://${host}`, source: "subdomain" });
  }
  return candidates;
}

/**
 * Generate probe URLs for a list of mDNS-discovered hostnames.
 * Probes the base host plus common AI-server ports.
 */
export function mdnsCandidates(hosts: string[]): CandidateURL[] {
  const candidates: CandidateURL[] = [];
  for (const host of hosts) {
    const base = host.includes(":") ? host : host; // host may already include port
    for (const port of MDNS_PORTS) {
      candidates.push({ url: `http://${base}${port}`, source: "mdns" });
    }
  }
  return candidates;
}
