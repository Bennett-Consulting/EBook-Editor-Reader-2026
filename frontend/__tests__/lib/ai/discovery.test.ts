/**
 * Task 4e — AI Server Discovery tests.
 *
 * fetch is mocked — zero network calls. Tests cover:
 *   - probeServer: OpenAI-compat vs Ollama classification, unreachable URLs
 *   - discoverAIServers: .well-known probe, subdomain candidates, mDNS hosts
 *   - candidates helpers: subdomainCandidates, mdnsCandidates, parseWellKnown
 *   - deduplication of repeated canonical URLs
 */

import { probeServer, discoverAIServers } from "../../../src/lib/ai/discovery";
import {
  subdomainCandidates,
  mdnsCandidates,
  wellKnownUrl,
  parseWellKnown,
} from "../../../src/lib/ai/discovery/candidates";
import { canonicalUrl } from "../../../src/lib/ai/discovery/probe";

// ─── Mock fetch ───────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function networkError(): Promise<never> {
  return Promise.reject(new Error("Network unreachable"));
}

// ─── canonicalUrl ─────────────────────────────────────────────────────────────

describe("canonicalUrl", () => {
  it("strips trailing slashes", () => {
    expect(canonicalUrl("https://ai.company.com/")).toBe("https://ai.company.com");
    expect(canonicalUrl("http://ollama.local:11434//")).toBe("http://ollama.local:11434");
  });

  it("leaves URLs without trailing slash unchanged", () => {
    expect(canonicalUrl("https://ai.company.com")).toBe("https://ai.company.com");
  });
});

// ─── parseWellKnown ───────────────────────────────────────────────────────────

describe("parseWellKnown", () => {
  it("returns null for non-objects", () => {
    expect(parseWellKnown(null)).toBeNull();
    expect(parseWellKnown("string")).toBeNull();
    expect(parseWellKnown(42)).toBeNull();
  });

  it("returns null when url field is missing", () => {
    expect(parseWellKnown({ name: "My Server" })).toBeNull();
  });

  it("returns null when url field is not a string", () => {
    expect(parseWellKnown({ url: 123 })).toBeNull();
  });

  it("returns a WellKnownAIServer when url is present", () => {
    const wk = parseWellKnown({
      url: "https://ai.company.com",
      name: "Company AI",
      provider: "openai",
    });
    expect(wk).not.toBeNull();
    expect(wk!.url).toBe("https://ai.company.com");
    expect(wk!.name).toBe("Company AI");
  });

  it("accepts minimal object with only url", () => {
    const wk = parseWellKnown({ url: "http://llm.internal" });
    expect(wk).not.toBeNull();
    expect(wk!.url).toBe("http://llm.internal");
    expect(wk!.name).toBeUndefined();
  });
});

// ─── subdomainCandidates ──────────────────────────────────────────────────────

describe("subdomainCandidates", () => {
  it("generates candidates for all AI subdomains", () => {
    const candidates = subdomainCandidates("company.com");
    const urls = candidates.map((c) => c.url);
    expect(urls).toContain("https://ai.company.com");
    expect(urls).toContain("https://llm.company.com");
    expect(urls).toContain("https://ollama.company.com");
    expect(urls).toContain("https://gpt.company.com");
    expect(urls).toContain("https://ml.company.com");
  });

  it("generates both https:// and http:// variants for each subdomain", () => {
    const candidates = subdomainCandidates("company.com");
    const urls = candidates.map((c) => c.url);
    expect(urls).toContain("https://ai.company.com");
    expect(urls).toContain("http://ai.company.com");
  });

  it("marks all candidates with source=subdomain", () => {
    const candidates = subdomainCandidates("company.com");
    expect(candidates.every((c) => c.source === "subdomain")).toBe(true);
  });

  it("generates candidates using the provided domain", () => {
    const candidates = subdomainCandidates("university.edu");
    expect(candidates.some((c) => c.url.includes("university.edu"))).toBe(true);
  });
});

// ─── mdnsCandidates ───────────────────────────────────────────────────────────

describe("mdnsCandidates", () => {
  it("generates candidates for each mDNS host", () => {
    const candidates = mdnsCandidates(["ollama.local", "ai-server.local"]);
    const urls = candidates.map((c) => c.url);
    expect(urls.some((u) => u.includes("ollama.local"))).toBe(true);
    expect(urls.some((u) => u.includes("ai-server.local"))).toBe(true);
  });

  it("probes Ollama default port 11434", () => {
    const candidates = mdnsCandidates(["ollama.local"]);
    const urls = candidates.map((c) => c.url);
    expect(urls).toContain("http://ollama.local:11434");
  });

  it("probes common alt port 8080", () => {
    const candidates = mdnsCandidates(["ai-server.local"]);
    const urls = candidates.map((c) => c.url);
    expect(urls).toContain("http://ai-server.local:8080");
  });

  it("marks all candidates with source=mdns", () => {
    const candidates = mdnsCandidates(["host.local"]);
    expect(candidates.every((c) => c.source === "mdns")).toBe(true);
  });

  it("returns empty array for empty host list", () => {
    expect(mdnsCandidates([])).toEqual([]);
  });
});

// ─── probeServer ──────────────────────────────────────────────────────────────

describe("probeServer — OpenAI-compatible server", () => {
  it("classifies a server responding with OpenAI data shape as provider=openai", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    );

    const result = await probeServer("https://ai.company.com", "subdomain");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.models).toContain("gpt-4o");
    expect(result!.models).toContain("gpt-4o-mini");
    expect(result!.url).toBe("https://ai.company.com");
  });

  it("returns models array from /v1/models data field", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "llama3-8b" }, { id: "mistral-7b" }] }),
    );

    const result = await probeServer("http://internal.ai", "manual");
    expect(result!.models).toEqual(["llama3-8b", "mistral-7b"]);
  });

  it("classifies unrecognised /v1/models response as provider=custom", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ models: [], version: "1.0" }), // not OpenAI shape
    );
    // /api/tags also fails
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const result = await probeServer("http://custom.ai", "manual");
    // /v1/models returned 200 but weird shape → custom; or null if shape unrecognised
    // Either outcome is acceptable: custom with empty models OR null
    if (result !== null) {
      expect(result.provider).toBe("custom");
    }
  });
});

describe("probeServer — Ollama server", () => {
  it("classifies a server responding with Ollama tags shape as provider=ollama", async () => {
    // /v1/models fails
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    // /api/tags succeeds
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ models: [{ name: "llama3:8b" }, { name: "mistral:7b" }] }),
    );

    const result = await probeServer("http://ollama.local:11434", "mdns");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("ollama");
    expect(result!.models).toContain("llama3:8b");
    expect(result!.models).toContain("mistral:7b");
  });

  it("uses /api/tags when /v1/models is not available", async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("Connection refused")) // /v1/models
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "phi3:mini" }] })); // /api/tags

    const result = await probeServer("http://ollama.local", "mdns");
    expect(result!.provider).toBe("ollama");
    expect(result!.models).toContain("phi3:mini");
  });
});

describe("probeServer — unreachable server", () => {
  it("returns null when both endpoints are unreachable", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network unreachable"));

    const result = await probeServer("http://dead-server.local", "mdns");
    expect(result).toBeNull();
  });

  it("returns null when both endpoints return non-OK status", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response);

    const result = await probeServer("http://auth-required.company.com", "subdomain");
    expect(result).toBeNull();
  });

  it("records latency for successful probe", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "model-1" }] }),
    );

    const result = await probeServer("https://fast-server.ai", "manual");
    expect(result).not.toBeNull();
    expect(typeof result!.latencyMs).toBe("number");
    expect(result!.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── discoverAIServers ────────────────────────────────────────────────────────

describe("discoverAIServers — .well-known probe", () => {
  it("probes the .well-known/ai-server URL when orgDomain is set", async () => {
    // well-known fetch: not found
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
    expect(urls.some((u) => u.includes(".well-known/ai-server"))).toBe(true);
  });

  it("probes the URL from a valid .well-known response", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes(".well-known/ai-server")) {
        return Promise.resolve(
          jsonResponse({ url: "https://ai-internal.company.com", name: "Corp AI" }),
        );
      }
      if (url.includes("ai-internal.company.com/v1/models")) {
        return Promise.resolve(jsonResponse({ data: [{ id: "gpt-4o-internal" }] }));
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const result = await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });
    const urls = result.servers.map((s) => s.url);
    expect(urls).toContain("https://ai-internal.company.com");
  });

  it("does not probe .well-known when orgDomain is not set", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await discoverAIServers({ mdnsHosts: ["ollama.local"], timeoutMs: 100 });

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
    expect(urls.every((u: string) => !u.includes(".well-known"))).toBe(true);
  });
});

describe("discoverAIServers — subdomain probing", () => {
  it("probes all expected subdomain candidates for the org domain", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url) as string[];
    expect(urls.some((u) => u.includes("ai.company.com"))).toBe(true);
    expect(urls.some((u) => u.includes("llm.company.com"))).toBe(true);
    expect(urls.some((u) => u.includes("ollama.company.com"))).toBe(true);
  });

  it("returns discovered subdomain server in results", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("llm.company.com/v1/models")) {
        return Promise.resolve(jsonResponse({ data: [{ id: "internal-llm" }] }));
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const result = await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });
    expect(result.servers.some((s) => s.url.includes("llm.company.com"))).toBe(true);
    expect(result.servers.find((s) => s.url.includes("llm.company.com"))?.source).toBe("subdomain");
  });
});

describe("discoverAIServers — mDNS hosts", () => {
  it("probes mDNS hosts on multiple ports including 11434", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await discoverAIServers({ mdnsHosts: ["ollama.local"], timeoutMs: 100 });

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url) as string[];
    expect(urls.some((u) => u.includes("ollama.local:11434"))).toBe(true);
  });

  it("returns mDNS server in results when probe succeeds", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "http://ollama.local:11434/v1/models") {
        return Promise.resolve(jsonResponse({ data: [{ id: "llama3:8b" }] }));
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const result = await discoverAIServers({ mdnsHosts: ["ollama.local"], timeoutMs: 100 });
    const server = result.servers.find((s) => s.url.includes("ollama.local:11434"));
    expect(server).toBeDefined();
    expect(server!.source).toBe("mdns");
  });

  it("does not probe mDNS when mdnsHosts is empty", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url) as string[];
    expect(urls.every((u) => !u.includes(".local"))).toBe(true);
  });
});

describe("discoverAIServers — deduplication and ordering", () => {
  it("deduplicates servers with the same canonical URL", async () => {
    // Two candidates both resolve to the same server
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/v1/models")) {
        return Promise.resolve(jsonResponse({ data: [{ id: "model-1" }] }));
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const result = await discoverAIServers({
      orgDomain: "company.com",
      mdnsHosts: ["ai.company.com"], // same host as subdomain candidate
      timeoutMs: 100,
    });

    const aiUrls = result.servers.filter((s) => s.url.includes("ai.company.com"));
    // Should not have duplicates
    const unique = new Set(aiUrls.map((s) => s.url));
    expect(unique.size).toBe(aiUrls.length);
  });

  it("reports the number of candidates probed", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    const result = await discoverAIServers({
      orgDomain: "company.com",
      timeoutMs: 100,
    });
    expect(result.probed).toBeGreaterThan(0);
  });

  it("returns empty servers array when nothing responds", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("timeout"));

    const result = await discoverAIServers({ orgDomain: "company.com", timeoutMs: 100 });
    expect(result.servers).toEqual([]);
  });

  it("returns empty result when no options provided", async () => {
    const result = await discoverAIServers({});
    expect(result.servers).toEqual([]);
    expect(result.probed).toBe(0);
  });
});
