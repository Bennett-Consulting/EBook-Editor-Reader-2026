# Portable Module Reference

Every module listed here follows the same contract:

- **Zero app-level imports.** No `storage.ts`, AsyncStorage, React Native, Expo, or any other app-specific code.
- **Caller provides everything.** Text, provider config, cached data, screen dimensions — the module never reaches outside what it is given.
- **Only standard platform APIs.** Pure TypeScript, `fetch`, and `AbortController`. Node 18+, React Native 0.71+, and all modern browsers are supported.
- **Copy the folder, add the import, done.** No setup, no registration, no initialisation.

---

## Contents

| Module | What it solves |
|--------|---------------|
| [paginationEngine](#1-paginationengine) | Split large text into screen-sized pages |
| [usePagination + PageNavBar](#2-usepagination--pagenavbar) | React Native hook + nav UI for paginated text |
| [ai/context](#3-aicontext) | Assemble a token-budgeted AI prompt from book context |
| [ai/streaming](#4-aistreaming) | Stream token-by-token responses from any AI provider |
| [ai/analysis](#5-aianalysis) | Map-reduce whole-book analysis via any AI provider |
| [ai/discovery](#6-aidiscovery) | Auto-discover AI servers on org networks and local LAN |

---

## 1. paginationEngine

**What it does.** Splits a long text string into an array of page strings that each fit within given screen dimensions. Uses character-width heuristics calibrated to common book fonts. Handles word boundaries, paragraph continuity, and a 5% vertical safety buffer.

### Files to copy

```
src/lib/paginationEngine.ts          ← single file, no subdirectory
```

### Peer dependencies

None. Pure TypeScript.

### Import

```typescript
import {
  paginate,
  clampPageIndex,
  getPageMetrics,
  type PaginationConfig,
} from './paginationEngine';
```

### API

```typescript
// Split text into screen-sized pages.
paginate(
  text: string,
  containerWidth: number,          // px / dp — available width
  containerHeight: number,         // px / dp — available height (minus chrome)
  config?: Partial<PaginationConfig>
): string[]

// Safe page-index restore. Returns 0 for any invalid saved value.
clampPageIndex(savedIndex: number, totalPages: number): number

// Inspect computed metrics without splitting (debug / UI display).
getPageMetrics(containerWidth, containerHeight, config?): {
  charsPerLine: number;
  linesPerPage: number;
  lineHeightPx: number;
  charWidth: number;
}

interface PaginationConfig {
  fontSize: number;                // default 18
  lineHeightMultiplier: number;    // default 1.5
  fontFamily: 'serif' | 'sans-serif';
  paddingHorizontal: number;       // default 16
  paddingVertical: number;         // default 16
}
```

### Usage

```typescript
const { width, height } = Dimensions.get('window');
const CHROME_HEIGHT = 120; // header + bottom bar

const pages = paginate(bookContent, width, height - CHROME_HEIGHT);

// Restore last-read position safely
const startPage = clampPageIndex(savedScrollY, pages.length);

// Render only the current page
const currentPageText = pages[currentPage];
```

### Output handling

`paginate()` returns `string[]`. Each element is a text slice that fits the screen. The concatenation of all pages equals the original text (minus leading whitespace trimmed between pages). Empty input returns `['']`.

---

## 2. usePagination + PageNavBar

**What it does.** A React Native hook that wraps `paginationEngine` with state management, page navigation, scroll-to-top on page change, and progress tracking. Books below 50,000 characters are served as a plain scroll view — no pagination overhead. `PageNavBar` is a companion prev/next UI component.

### Files to copy

```
src/hooks/usePagination.ts
src/components/PageNavBar.tsx
```

### Peer dependencies

```
react
react-native      (ScrollView, Dimensions, View, Text, TouchableOpacity, StyleSheet)
```

`paginationEngine.ts` must also be present (see §1).

### Import

```typescript
import { usePagination, splitPageText, computePageParaOffset, PAGINATION_THRESHOLD }
  from './hooks/usePagination';
import PageNavBar from './components/PageNavBar';
```

### API — hook

```typescript
usePagination(
  content: string,
  screenW: number,
  screenH: number,
  options?: {
    chromeHeight?: number;          // toolbar height to subtract (default 120)
    savedPageIndex?: number;        // restored from storage on first load
    onPageChange?: (pageIndex: number, progress: number) => void;
    onPageWillChange?: () => void;  // clear layout caches before flip
    paginationConfig?: Partial<PaginationConfig>;
  }
): {
  pages: string[] | null;           // null = short book, use scroll mode
  currentPage: number;              // 0-based
  currentPageText: string;
  goToPage: (idx: number) => void;
  scrollRef: React.RefObject<ScrollView>;
}
```

### API — pure helpers

```typescript
// Split a page string into display paragraphs.
splitPageText(text: string): string[]

// How many global paragraphs precede the current page.
// Use this to map page-local annotation indices to global indices.
computePageParaOffset(pages: string[], currentPage: number): number

// Threshold below which pagination is skipped.
PAGINATION_THRESHOLD: 50_000   // characters
```

### API — PageNavBar

```typescript
<PageNavBar
  currentPage={number}           // 0-based
  totalPages={number}
  onPrev={() => void}
  onNext={() => void}
  backgroundColor?: string
  textColor?: string
  activeColor?: string
  borderColor?: string
  testIDPrefix?: string          // e.g. "reader-" → testID "reader-page-prev"
/>
```

### Usage

```typescript
const { width, height } = Dimensions.get('window');

const { pages, currentPage, currentPageText, goToPage, scrollRef } =
  usePagination(book.content, width, height, {
    savedPageIndex: book.scrollY,
    onPageChange: (idx, progress) => saveBook({ ...book, scrollY: idx, progress }),
    onPageWillChange: () => { paraOffsetsRef.current = []; },
  });

// Annotation index fix for paginated mode
const pageParaOffset = pages
  ? computePageParaOffset(pages, currentPage) : 0;

const paragraphs = splitPageText(currentPageText);
paragraphs.map((para, i) => {
  const globalIdx = pageParaOffset + i;   // use globalIdx for annotations
});

// Navigation
{pages && (
  <PageNavBar
    currentPage={currentPage}
    totalPages={pages.length}
    onPrev={() => goToPage(currentPage - 1)}
    onNext={() => goToPage(currentPage + 1)}
  />
)}
```

### Output handling

`pages` is `null` for short books — the caller renders a plain `ScrollView` instead of the paged view. `currentPageText` is always the correct text to render regardless of mode. `progress` in `onPageChange` is a 0–1 fraction for progress bars and "X% read" displays.

---

## 3. ai/context

**What it does.** Assembles a token-budgeted AI prompt from the current text, surrounding context, a whole-book summary, and a style profile. Sections are prioritised and dropped in order when the token budget is tight. Designed to be the first step before any AI call — its output is passed directly as `prompt` to `streamRequest()`.

### Files to copy

```
src/lib/ai/context/
  index.ts
  types.ts
```

### Peer dependencies

None. Pure TypeScript.

### Import

```typescript
import { buildContext, extractStyleProfile, estimateTokens } from './ai/context';
import type { ContextRequest, ContextResult, StyleProfile } from './ai/context';
```

### API

```typescript
buildContext(request: ContextRequest): ContextResult

interface ContextRequest {
  currentText: string;             // the text the AI should work on — always included
  precedingText?: string;          // text before currentText (only tail used)
  followingText?: string;          // text after currentText (only head used)
  bookSummary?: string;            // pre-computed whole-book summary
  styleProfile?: StyleProfile;     // pre-computed style profile
  taskInstruction: string;         // what the AI should do
  tailLength?: number;             // chars to take from preceding/following (default 1000)
  tokenBudget?: number;            // max tokens for the assembled prompt (default 4000)
}

interface ContextResult {
  prompt: string;                  // ready to send to any AI provider
  tokenEstimate: number;
  sections: {                      // which sections made it in
    styleProfile: boolean;
    bookSummary: boolean;
    precedingTail: boolean;
    currentText: boolean;          // always true
    followingHead: boolean;
    taskInstruction: boolean;      // always true
  };
}

// Extract a style profile from a text sample (e.g. first 3 chapters).
extractStyleProfile(sampleText: string): StyleProfile

interface StyleProfile {
  dominantTense: 'past' | 'present' | 'unknown';
  pointOfView: 'first' | 'second' | 'third' | 'unknown';
  avgSentenceLength: number;       // words
  recurringNouns: string[];        // top 10 proper nouns
  rawSample: string;               // first 500 chars used
}

// Rough token estimator (4 chars ≈ 1 token). Used for budget enforcement.
estimateTokens(text: string): number
```

### Budget drop order

When the assembled prompt exceeds `tokenBudget`, sections are dropped in this order until it fits:

1. `followingHead` (first dropped — context behind is more useful for writing)
2. `precedingTail`
3. `bookSummary`
4. `styleProfile` (last — always valuable for voice consistency)

`currentText` and `taskInstruction` are never dropped. If they alone exceed the budget, `currentText` is clamped.

### Usage

```typescript
// Assemble a prompt for a "continue writing" task
const { prompt, sections } = buildContext({
  currentText: chapter.text,
  precedingText: previousChapter?.text,
  bookSummary: cachedSummary ?? undefined,
  styleProfile: cachedStyle ?? undefined,
  taskInstruction: 'Continue this passage in the same style and tense.',
  tokenBudget: 4000,
});

// Log what was included (useful for debugging context budget issues)
console.log('Context sections included:', sections);

// Pass to streamRequest
await streamRequest({ ...providerConfig, prompt }, callbacks);
```

### Output handling

Use `result.prompt` directly as the `prompt` field in `StreamConfig`. Check `result.sections` to tell the user which context was available (e.g. "Writing with book summary" vs "Writing without context — run Book Analysis first").

---

## 4. ai/streaming

**What it does.** Streams token-by-token AI responses from any provider. A single function routes to the correct per-provider implementation. Throws on fatal errors (non-200 HTTP). Calls `onError` for recoverable per-chunk parse failures. Always calls `onDone` with the full concatenated text at the end.

### Files to copy

```
src/lib/ai/streaming/
  index.ts
  types.ts
  streamUtils.ts
  providers/
    openai.ts       ← OpenAI, Groq, any OpenAI-compatible (custom baseUrl)
    anthropic.ts    ← Anthropic
    ollama.ts       ← Ollama (/api/chat) and BitNet (/api/generate)
    gemini.ts       ← Google Gemini
```

### Peer dependencies

`fetch` and `AbortController` — standard in Node 18+, React Native 0.71+, all modern browsers.

### Import

```typescript
import { streamRequest } from './ai/streaming';
import type { StreamConfig, StreamCallbacks } from './ai/streaming';
```

### API

```typescript
streamRequest(config: StreamConfig, callbacks: StreamCallbacks): Promise<void>
// Throws on fatal error. Calls callbacks.onDone() when stream ends.

interface StreamConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama' | 'bitnet' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;                // required for ollama / bitnet / custom
  prompt: string;                  // assembled prompt from buildContext()
  systemPrompt?: string;
  maxTokens?: number;              // default 1024
  temperature?: number;            // default 0.7
}

interface StreamCallbacks {
  onChunk: (text: string) => void; // each token / chunk
  onDone: (fullText: string) => void;
  onError: (error: Error) => void; // non-fatal chunk parse error
}
```

### Provider routing

| `provider` value | Endpoint | Auth header |
|---|---|---|
| `openai` | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer {key}` |
| `groq` | `https://api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer {key}` |
| `custom` | `{baseUrl}/v1/chat/completions` | `Authorization: Bearer {key}` |
| `anthropic` | `https://api.anthropic.com/v1/messages` | `x-api-key: {key}` |
| `ollama` | `{baseUrl}/api/chat` | none |
| `bitnet` | `{baseUrl}/api/generate` | none |
| `google` | Gemini SSE endpoint | key in query param |

For any **org-internal OpenAI-compatible server** (vLLM, LM Studio, LocalAI, etc.) set `provider: 'custom'` and `baseUrl: 'https://your-internal-server'`.

### Usage

```typescript
let output = '';

await streamRequest(
  {
    provider: 'openai',
    apiKey: userKey,
    model: 'gpt-4o',
    prompt: assembledPrompt,     // from buildContext()
    maxTokens: 512,
  },
  {
    onChunk: (chunk) => {
      output += chunk;
      setDisplayText(output);    // update UI token by token
    },
    onDone: (fullText) => {
      setDisplayText(fullText);
      setLoading(false);
    },
    onError: (err) => {
      console.warn('Chunk error:', err.message);
    },
  },
);
```

### Output handling

`onChunk` is called for each token as it arrives — append to a string and update your UI state. `onDone` is called exactly once with the complete concatenated response. If the stream is aborted or the connection drops before `onDone`, the Promise rejects — wrap the `await streamRequest(...)` call in try/catch.

---

## 5. ai/analysis

**What it does.** Map-reduce whole-book analysis using any AI provider. Splits the book into chunks (default 8,000 chars — fits BitNet / small Ollama models), summarises each chunk independently (map), then pair-wise combines summaries until one remains (reduce). Returns an `AnalysisResult` with a final summary, style profile, chunk count, and token estimate. Yields live progress events so the UI can show a progress bar.

### Files to copy

```
src/lib/ai/analysis/
  index.ts
  mapReduce.ts
  types.ts
```

Also requires `ai/context/` (for `extractStyleProfile`, `estimateTokens`) and `ai/streaming/` (for `streamRequest`).

### Peer dependencies

Same as `ai/streaming` — only `fetch`.

### Import

```typescript
import { analyzeBook, summarizeChunks } from './ai/analysis';
import type { AnalysisRequest, AnalysisResult, AnalysisProgress } from './ai/analysis';
```

### API

```typescript
// Full map-reduce analysis. AsyncGenerator — yields progress, then returns result.
analyzeBook(request: AnalysisRequest):
  AsyncGenerator<AnalysisProgress, AnalysisResult>

interface AnalysisRequest {
  fullText: string;
  providerConfig: StreamConfig;    // from ai/streaming/types.ts
  chunkSize?: number;              // chars per chunk (default 8000)
  task?: 'summarize' | 'themes' | 'characters' | 'plot-holes';  // default 'summarize'
}

interface AnalysisProgress {
  stage: 'chunking' | 'summarizing' | 'combining' | 'done';
  chunksTotal: number;
  chunksDone: number;
  currentChunkPreview: string;     // first 80 chars of the chunk being processed
}

interface AnalysisResult {
  summary: string;
  styleProfile: StyleProfile;      // extracted from first 3 chunks
  chunksProcessed: number;
  tokensEstimated: number;
}

// Summarize an array of pre-split chunks into a single string.
// Useful when you manage chunking yourself.
summarizeChunks(
  chunks: string[],
  config: StreamConfig,
  task?: string,
  onProgress?: (done: number, total: number) => void
): Promise<string>
```

### Usage

```typescript
// Consuming the AsyncGenerator
const gen = analyzeBook({
  fullText: book.content,
  providerConfig: {
    provider: 'openai',
    apiKey: userKey,
    model: 'gpt-4o-mini',
    prompt: '',                    // overridden per chunk by analyzeBook
  },
  task: 'summarize',
});

let result: AnalysisResult;
for await (const progress of gen) {
  // Progress events
  updateProgressBar(progress.chunksDone / progress.chunksTotal);
  setStatusText(`${progress.stage} — chunk ${progress.chunksDone}/${progress.chunksTotal}`);
}
// After the loop, the generator return value is the AnalysisResult
// Access it via the iterator protocol if you need it in the loop body:

// Alternative — manual iteration to capture return value:
let iter = await gen.next();
while (!iter.done) {
  updateUI(iter.value as AnalysisProgress);
  iter = await gen.next();
}
result = iter.value as AnalysisResult;

// Cache results for use in buildContext()
await AsyncStorage.setItem(`@app/summary/${book.id}`, result.summary);
await AsyncStorage.setItem(`@app/style/${book.id}`, JSON.stringify(result.styleProfile));
```

### Output handling

`AnalysisResult.summary` is the final text to cache and pass as `bookSummary` in future `buildContext()` calls. `AnalysisResult.styleProfile` is passed as `styleProfile` in `buildContext()`. Both should be stored so they survive app restarts — the analysis only needs to run once per book (or when the user edits substantially).

---

## 6. ai/discovery

**What it does.** Discovers AI server URLs on organisation networks and local LAN without requiring the user to type a URL manually. Three complementary strategies run concurrently: (1) `.well-known/ai-server` JSON manifest at the org domain, (2) subdomain heuristics (`ai.*`, `llm.*`, `openai.*`, `ollama.*`, `gpt.*`, `ml.*`), (3) mDNS hostnames supplied by the caller. Results are deduplicated by canonical URL and sorted fastest-first.

mDNS scanning requires a native module (`react-native-zeroconf` on React Native, `mdns-js` in Node). This module accepts already-resolved hostnames so it stays dep-free — the caller handles the scan.

### Files to copy

```
src/lib/ai/discovery/
  index.ts
  types.ts
  probe.ts
  candidates.ts
```

### Peer dependencies

`fetch` and `AbortController` only.

### Import

```typescript
import { discoverAIServers, probeServer } from './ai/discovery';
import type {
  DiscoveryOptions,
  DiscoveredServer,
  DiscoveryResult,
} from './ai/discovery';
```

### API

```typescript
// Discover from all sources concurrently.
discoverAIServers(options: DiscoveryOptions): Promise<DiscoveryResult>

interface DiscoveryOptions {
  orgDomain?: string;      // 'company.gov' — enables .well-known + subdomain probing
  mdnsHosts?: string[];    // e.g. ['ollama.local', 'ai-server.local'] from mDNS scan
  timeoutMs?: number;      // per-probe timeout ms (default 3000)
}

interface DiscoveryResult {
  servers: DiscoveredServer[];   // sorted fastest-first
  probed: number;                // total URLs attempted
  errors: string[];              // non-fatal diagnostic messages
}

interface DiscoveredServer {
  url: string;                   // canonical base URL — use as baseUrl in StreamConfig
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  name?: string;                 // from .well-known name field
  models: string[];              // live model IDs from the probe
  source: 'well-known' | 'subdomain' | 'mdns' | 'manual';
  latencyMs: number;
}

// Probe a single URL directly (useful for manual URL validation in settings UI).
probeServer(
  url: string,
  source: DiscoveredServer['source'],
  timeoutMs?: number,
  name?: string
): Promise<DiscoveredServer | null>
```

### .well-known/ai-server format

Organisations publish a JSON file at `https://{orgDomain}/.well-known/ai-server`:

```json
{
  "url": "https://ai-server.company.gov",
  "name": "Agency AI Gateway",
  "provider": "openai",
  "description": "Internal LLM server — contact IT for access"
}
```

Only `url` is required. The module probes the returned URL directly.

### Provider classification (automatic)

| Response shape | Classified as |
|---|---|
| `{ data: [{ id: '...' }] }` | `openai` (OpenAI-compat: vLLM, LM Studio, LocalAI, etc.) |
| `{ models: [{ name: '...' }] }` | `ollama` |
| 200 on `/v1/models` but other shape | `custom` |
| Only `/api/tags` responds | `ollama` |

### Usage

```typescript
// Step 1 (caller): scan mDNS — example with react-native-zeroconf
import Zeroconf from 'react-native-zeroconf';
const zc = new Zeroconf();
const mdnsHosts: string[] = [];
zc.on('resolved', service => mdnsHosts.push(service.host));
zc.scan('_http._tcp.', 'local.');
await new Promise(r => setTimeout(r, 2000));  // scan for 2 seconds
zc.stop();

// Step 2: discover using all strategies
const result = await discoverAIServers({
  orgDomain: 'company.gov',
  mdnsHosts,
  timeoutMs: 3000,
});

if (result.servers.length === 0) {
  showMessage('No AI servers found. Enter the URL manually.');
} else {
  // Present the list to the user
  result.servers.forEach(server => {
    console.log(`${server.name ?? server.url}  (${server.provider}, ${server.latencyMs}ms)`);
    console.log(`  Models: ${server.models.join(', ') || 'unknown'}`);
    console.log(`  Source: ${server.source}`);
  });

  // Auto-select the fastest (already sorted)
  const best = result.servers[0];
  setCustomBaseUrl(best.url);
  setProvider(best.provider);
}

// Step 3: validate a user-entered URL manually
const validated = await probeServer(
  'https://ai.internal.company.gov',
  'manual',
  5000,
);
if (validated) {
  console.log('Server validated:', validated.provider, validated.models);
} else {
  showError('Cannot reach that server.');
}
```

### Output handling

`DiscoveredServer.url` is the canonical base URL. Pass it directly as `baseUrl` in `StreamConfig` and set `provider` to `DiscoveredServer.provider`. `DiscoveredServer.models` is the live model list as of discovery — present it in the model picker so the user never sees a stale dropdown. `result.errors` contains non-fatal diagnostic strings useful for a "discovery log" in a settings debug panel.

---

## Typical composition

These modules are designed to be used together in a pipeline:

```
discoverAIServers()     →  find the server URL and live model list
         ↓
analyzeBook()           →  run once per book; cache summary + styleProfile
         ↓
buildContext()          →  assemble a token-budgeted prompt for each AI call
         ↓
streamRequest()         →  stream the response token-by-token to the UI
```

Each step is optional and independently testable. A minimal integration uses only `buildContext` + `streamRequest`. A full integration uses all four.

## Copying to a new project

1. Copy the folder(s) as listed in each module's **Files to copy** section.
2. Adjust the relative import paths in `index.ts` if your directory layout differs.
3. Modules that depend on each other (`analysis` → `streaming` + `context`) must all be present.
4. No registration, no providers, no context setup. Import and call.
