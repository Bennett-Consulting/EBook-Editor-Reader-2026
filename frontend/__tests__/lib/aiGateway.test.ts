/**
 * aiGateway.ts tests — covers existing helpers (detectProvider, maskKey,
 * pickBestModel) plus Task 4d new functions (streamAIResponse, runBookAnalysis).
 *
 * All network-touching code is mocked. Model selection uses live discovery
 * (discoverModels) as the primary path; _getFallbackModels is last-resort only.
 */

// ─── Module mocks (hoisted by Jest) ──────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("../../src/lib/storage", () => ({
  getActiveAIKey: jest.fn(),
  getBook: jest.fn(),
}));

jest.mock("../../src/lib/ai/streaming", () => ({
  streamRequest: jest.fn(),
}));

jest.mock("../../src/lib/ai/analysis", () => ({
  analyzeBook: jest.fn(),
}));

// Mock provider engines to prevent real network calls during tests.
// discoverModels() uses these internally; tests override per-case via
// mockDiscoverOpenAIModels etc. to simulate a provider returning models.
jest.mock("../../src/lib/providers", () => ({
  chatOpenAICompat: jest.fn(),
  discoverOpenAIModels: jest.fn().mockResolvedValue([]),
  chatGemini: jest.fn(),
  discoverGeminiModels: jest.fn().mockResolvedValue([]),
  classifyGeminiTier: jest.fn(),
  chatAnthropic: jest.fn(),
  parseAnthropicModels: jest.fn().mockReturnValue([]),
  chatOllama: jest.fn(),
  discoverOllamaModels: jest.fn().mockResolvedValue([]),
  discoverBitnetModels: jest.fn().mockResolvedValue([]),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveAIKey, getBook } from "../../src/lib/storage";
import { streamRequest } from "../../src/lib/ai/streaming";
import { analyzeBook } from "../../src/lib/ai/analysis";
import { discoverOpenAIModels } from "../../src/lib/providers";
import {
  detectProvider,
  maskKey,
  pickBestModel,
  streamAIResponse,
  runBookAnalysis,
} from "../../src/lib/aiGateway";
import type { AIModel } from "../../src/lib/types";
import type { StreamCallbacks } from "../../src/lib/ai/streaming";

const mockAsyncGetItem = AsyncStorage.getItem as jest.Mock;
const mockAsyncSetItem = AsyncStorage.setItem as jest.Mock;
const mockGetActiveAIKey = getActiveAIKey as jest.Mock;
const mockGetBook = getBook as jest.Mock;
const mockStreamRequest = streamRequest as jest.Mock;
const mockAnalyzeBook = analyzeBook as jest.Mock;
const mockDiscoverOpenAIModels = discoverOpenAIModels as jest.Mock;

// ─── detectProvider ──────────────────────────────────────────────────────────

describe("detectProvider", () => {
  it("detects OpenAI keys", () => {
    expect(detectProvider("sk-abc123")).toBe("openai");
  });

  it("detects Anthropic keys", () => {
    expect(detectProvider("sk-ant-abc123")).toBe("anthropic");
  });

  it("detects Google keys", () => {
    expect(detectProvider("AIzaSyA123")).toBe("google");
  });

  it("detects Groq keys", () => {
    expect(detectProvider("gsk_abc123")).toBe("groq");
  });

  it("detects BitNet local", () => {
    expect(detectProvider("bitnet-local")).toBe("bitnet");
  });

  it("returns custom for unknown/org-internal key formats", () => {
    expect(detectProvider("unknown")).toBe("custom");
    expect(detectProvider("bearer-token-xyz")).toBe("custom");
    expect(detectProvider("org-internal-key-abc123")).toBe("custom");
  });
});

// ─── maskKey ─────────────────────────────────────────────────────────────────

describe("maskKey", () => {
  it("masks long keys", () => {
    expect(maskKey("sk-abcdefghijklmnopqrstuvwxyz")).toBe("sk-abc...wxyz");
  });

  it("returns bullets for short keys", () => {
    expect(maskKey("short").length).toBe(8);
  });
});

// ─── pickBestModel ────────────────────────────────────────────────────────────

describe("pickBestModel", () => {
  const models: AIModel[] = [
    { id: "flash", name: "Flash", provider: "openai", tier: "flash" },
    { id: "standard", name: "Standard", provider: "openai", tier: "standard" },
    { id: "pro", name: "Pro", provider: "openai", tier: "pro" },
  ];

  it("picks pro for improve", () => {
    expect(pickBestModel(models, "improve")?.id).toBe("pro");
  });

  it("picks standard for continue", () => {
    expect(pickBestModel(models, "continue")?.id).toBe("standard");
  });

  it("returns null for empty list", () => {
    expect(pickBestModel([], "continue")).toBeNull();
  });

  it("picks the only available model regardless of tier for continue", () => {
    const single: AIModel[] = [{ id: "only-model", name: "Only", provider: "custom", tier: "pro" }];
    expect(pickBestModel(single, "continue")?.id).toBe("only-model");
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAVED_KEY = {
  id: "key-1",
  provider: "openai" as const,
  apiKey: "sk-test-abc",
  label: "My Key",
  addedAt: "2025-01-01T00:00:00.000Z",
};

const DISCOVERED_MODELS: AIModel[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", tier: "pro" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", tier: "flash" },
];

const CUSTOM_ORG_KEY = {
  id: "org-key-1",
  provider: "custom" as const,
  apiKey: "bearer-token-org-internal",
  label: "Internal AI",
  customBaseUrl: "https://ai.internal.company.com",
  addedAt: "2025-01-01T00:00:00.000Z",
};

const ORG_MODELS: AIModel[] = [
  { id: "llama3-8b-internal", name: "LLaMA 3 8B Internal", provider: "custom", tier: "standard" },
  { id: "mistral-7b-internal", name: "Mistral 7B Internal", provider: "custom", tier: "flash" },
];

const SAMPLE_BOOK = {
  id: "book-1",
  title: "Test Book",
  content: "Once upon a time in a land far away.",
  format: "txt" as const,
  isDraft: false,
  progress: 0,
  scrollY: 0,
  coverColor: "#333",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function makeCallbacks(): StreamCallbacks & { chunks: string[]; done: string | null } {
  const chunks: string[] = [];
  let done: string | null = null;
  return {
    chunks,
    get done() { return done; },
    onChunk: (t) => chunks.push(t),
    onDone: (full) => { done = full; },
    onError: jest.fn(),
  };
}

// ─── streamAIResponse — core behavior ─────────────────────────────────────────

describe("streamAIResponse — core behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveAIKey.mockResolvedValue(SAVED_KEY);
    mockAsyncGetItem.mockResolvedValue(null);
    mockStreamRequest.mockResolvedValue(undefined);
    // Live discovery returns real models
    mockDiscoverOpenAIModels.mockResolvedValue(DISCOVERED_MODELS);
  });

  it("reads the active AI key from storage", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "Some text.", "Continue.", cb);
    expect(mockGetActiveAIKey).toHaveBeenCalledTimes(1);
  });

  it("calls streamRequest with the active key's provider and apiKey", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "Some text.", "Continue.", cb);

    expect(mockStreamRequest).toHaveBeenCalledTimes(1);
    const [config] = mockStreamRequest.mock.calls[0] as [{ provider: string; apiKey: string }];
    expect(config.provider).toBe("openai");
    expect(config.apiKey).toBe("sk-test-abc");
  });

  it("uses a model from live discovery (not a hardcoded ID)", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ model: string }];
    // Model must be one that discoverModels returned, not a hardcoded constant
    expect(DISCOVERED_MODELS.map((m) => m.id)).toContain(config.model);
  });

  it("passes assembled context-budgeted prompt (via buildContext) to streamRequest", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "Some text.", "Continue.", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ prompt: string }];
    expect(config.prompt).toContain("Some text.");
    expect(config.prompt).toContain("Continue.");
  });

  it("reads cached summary from @ebook/summary/{bookId} and includes it in the prompt", async () => {
    mockAsyncGetItem.mockImplementation((key: string) =>
      key === "@ebook/summary/book-1"
        ? Promise.resolve("A detective story set in Victorian London.")
        : Promise.resolve(null),
    );

    const cb = makeCallbacks();
    await streamAIResponse("book-1", "Some text.", "Continue.", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ prompt: string }];
    expect(config.prompt).toContain("A detective story set in Victorian London.");
  });

  it("reads cached style profile from @ebook/style/{bookId} and includes it in the prompt", async () => {
    const styleProfile = {
      dominantTense: "past",
      pointOfView: "third",
      avgSentenceLength: 18,
      recurringNouns: ["Holmes", "Watson"],
      rawSample: "Holmes walked into the room.",
    };
    mockAsyncGetItem.mockImplementation((key: string) =>
      key === "@ebook/style/book-1"
        ? Promise.resolve(JSON.stringify(styleProfile))
        : Promise.resolve(null),
    );

    const cb = makeCallbacks();
    await streamAIResponse("book-1", "Some text.", "Continue.", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ prompt: string }];
    expect(config.prompt).toContain("Holmes");
  });

  it("passes callbacks through to streamRequest unchanged", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb);

    const [, callbacks] = mockStreamRequest.mock.calls[0] as [unknown, StreamCallbacks];
    expect(typeof callbacks.onChunk).toBe("function");
    expect(typeof callbacks.onDone).toBe("function");
    expect(typeof callbacks.onError).toBe("function");
  });

  it("throws if no AI key is configured", async () => {
    mockGetActiveAIKey.mockResolvedValue(null);

    const cb = makeCallbacks();
    await expect(streamAIResponse("book-1", "text", "task", cb)).rejects.toThrow(
      "No AI provider configured",
    );
    expect(mockStreamRequest).not.toHaveBeenCalled();
  });

  it("uses caller-supplied model override without calling discoverModels", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb, { model: "gpt-4o-specific" });

    const [config] = mockStreamRequest.mock.calls[0] as [{ model: string }];
    expect(config.model).toBe("gpt-4o-specific");
    // discoverOpenAIModels should NOT have been called when model is explicitly provided
    expect(mockDiscoverOpenAIModels).not.toHaveBeenCalled();
  });
});

// ─── streamAIResponse — org-internal / custom provider ───────────────────────

describe("streamAIResponse — org-internal and custom providers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveAIKey.mockResolvedValue(CUSTOM_ORG_KEY);
    mockAsyncGetItem.mockResolvedValue(null);
    mockStreamRequest.mockResolvedValue(undefined);
    // Org-internal server returns its own model list at the custom baseUrl
    mockDiscoverOpenAIModels.mockResolvedValue(ORG_MODELS);
  });

  it("discovers models from the custom baseUrl (org-internal server)", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb);

    // discoverOpenAIModels should have been called (custom uses OpenAI-compat)
    expect(mockDiscoverOpenAIModels).toHaveBeenCalled();
    const [, , , , calledProvider] = mockDiscoverOpenAIModels.mock.calls[0] as unknown[];
    expect(calledProvider).toBe("custom");
  });

  it("uses a model from the org-internal discovery result", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ model: string }];
    expect(ORG_MODELS.map((m) => m.id)).toContain(config.model);
  });

  it("uses the org-internal key in the request", async () => {
    const cb = makeCallbacks();
    await streamAIResponse("book-1", "text", "task", cb);

    const [config] = mockStreamRequest.mock.calls[0] as [{ apiKey: string; baseUrl: string }];
    expect(config.apiKey).toBe("bearer-token-org-internal");
    expect(config.baseUrl).toBe("https://ai.internal.company.com");
  });

  it("throws a clear error when discovery fails and no fallback models exist for custom provider", async () => {
    mockDiscoverOpenAIModels.mockRejectedValue(new Error("Connection refused"));

    const cb = makeCallbacks();
    await expect(streamAIResponse("book-1", "text", "task", cb)).rejects.toThrow(
      "No models available for provider",
    );
  });

  it("falls back to hardcoded list only when discovery fails for known providers", async () => {
    // Simulate OpenAI discovery failing (network down)
    mockGetActiveAIKey.mockResolvedValue(SAVED_KEY);
    mockDiscoverOpenAIModels.mockRejectedValue(new Error("Network timeout"));

    const cb = makeCallbacks();
    // Should still succeed using the snapshot fallback for openai
    await streamAIResponse("book-1", "text", "task", cb);
    expect(mockStreamRequest).toHaveBeenCalled();
    const [config] = mockStreamRequest.mock.calls[0] as [{ model: string }];
    expect(config.model).toBeTruthy(); // fallback provided a model
  });
});

// ─── runBookAnalysis ──────────────────────────────────────────────────────────

describe("runBookAnalysis", () => {
  const MOCK_RESULT = {
    summary: "A boy discovers he is a wizard.",
    styleProfile: {
      dominantTense: "past" as const,
      pointOfView: "third" as const,
      avgSentenceLength: 15,
      recurringNouns: ["Harry", "Dumbledore"],
      rawSample: "Harry walked into the room.",
    },
    chunksProcessed: 3,
    tokensEstimated: 2000,
  };

  function makeAnalyzeBookGen(result: typeof MOCK_RESULT) {
    const progress = [
      { stage: "chunking", chunksTotal: 3, chunksDone: 0, currentChunkPreview: "Once upon" },
      { stage: "summarizing", chunksTotal: 3, chunksDone: 1, currentChunkPreview: "Chapter 1" },
      { stage: "done", chunksTotal: 3, chunksDone: 3, currentChunkPreview: "" },
    ];
    let idx = 0;
    return {
      async next() {
        if (idx < progress.length) return { value: progress[idx++], done: false };
        return { value: result, done: true };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveAIKey.mockResolvedValue(SAVED_KEY);
    mockGetBook.mockResolvedValue(SAMPLE_BOOK);
    mockAsyncSetItem.mockResolvedValue(undefined);
    mockAnalyzeBook.mockReturnValue(makeAnalyzeBookGen(MOCK_RESULT));
    mockDiscoverOpenAIModels.mockResolvedValue(DISCOVERED_MODELS);
  });

  it("uses live model discovery (not hardcoded IDs)", async () => {
    await runBookAnalysis("book-1");
    expect(mockDiscoverOpenAIModels).toHaveBeenCalled();
  });

  it("writes summary to @ebook/summary/{bookId}", async () => {
    await runBookAnalysis("book-1");
    expect(mockAsyncSetItem).toHaveBeenCalledWith(
      "@ebook/summary/book-1",
      MOCK_RESULT.summary,
    );
  });

  it("writes style profile JSON to @ebook/style/{bookId}", async () => {
    await runBookAnalysis("book-1");
    expect(mockAsyncSetItem).toHaveBeenCalledWith(
      "@ebook/style/book-1",
      JSON.stringify(MOCK_RESULT.styleProfile),
    );
  });

  it("returns the AnalysisResult from analyzeBook", async () => {
    const result = await runBookAnalysis("book-1");
    expect(result.summary).toBe(MOCK_RESULT.summary);
    expect(result.chunksProcessed).toBe(3);
  });

  it("calls onProgress for each yielded progress event", async () => {
    const stages: string[] = [];
    await runBookAnalysis("book-1", (p) => stages.push(p.stage));
    expect(stages).toContain("chunking");
    expect(stages).toContain("summarizing");
  });

  it("loads the book content from storage by bookId", async () => {
    await runBookAnalysis("book-1");
    expect(mockGetBook).toHaveBeenCalledWith("book-1");
  });

  it("throws a clear error if the book is not found", async () => {
    mockGetBook.mockResolvedValue(null);
    await expect(runBookAnalysis("missing-id")).rejects.toThrow("Book not found");
  });

  it("throws if no AI key is configured", async () => {
    mockGetActiveAIKey.mockResolvedValue(null);
    await expect(runBookAnalysis("book-1")).rejects.toThrow("No AI provider configured");
  });

  it("throws a clear error when discovery fails and provider has no fallback models", async () => {
    mockGetActiveAIKey.mockResolvedValue(CUSTOM_ORG_KEY);
    mockDiscoverOpenAIModels.mockRejectedValue(new Error("Connection refused"));

    await expect(runBookAnalysis("book-1")).rejects.toThrow("No models available for provider");
  });
});
