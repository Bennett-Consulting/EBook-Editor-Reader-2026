/**
 * Types for the AI server discovery module.
 * No imports from app code — works in any JS/TS environment.
 */

export interface DiscoveryOptions {
  /**
   * Organisation domain, e.g. "company.com".
   * Enables: (1) .well-known/ai-server fetch, (2) common subdomain probing.
   */
  orgDomain?: string;
  /**
   * mDNS-discovered hostnames supplied by the caller (the caller uses
   * react-native-zeroconf or similar; this module stays native-dep-free).
   * e.g. ["ollama.local", "ai-server.local"]
   */
  mdnsHosts?: string[];
  /** Per-probe timeout in milliseconds (default 3000). */
  timeoutMs?: number;
}

export interface DiscoveredServer {
  /** Canonical base URL, e.g. "https://ai.company.com" */
  url: string;
  /** Inferred provider type based on the probe response shape. */
  provider: "openai" | "anthropic" | "ollama" | "custom";
  /** Human-readable name from .well-known response or /v1/models metadata. */
  name?: string;
  /** Model IDs returned by the successful probe (may be empty). */
  models: string[];
  /** How this server was found. */
  source: "well-known" | "subdomain" | "mdns" | "manual";
  /** Round-trip time of the successful probe in milliseconds. */
  latencyMs: number;
}

export interface DiscoveryResult {
  servers: DiscoveredServer[];
  /** Total candidate URLs attempted (including failures). */
  probed: number;
  /** Non-fatal error descriptions for diagnostics. */
  errors: string[];
}

/** Shape of a .well-known/ai-server JSON response. */
export interface WellKnownAIServer {
  url: string;
  name?: string;
  provider?: "openai" | "anthropic" | "ollama" | "custom";
  description?: string;
}
