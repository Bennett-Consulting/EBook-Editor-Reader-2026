# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

A premium eBook reader and editor for Android (Expo/React Native) with AI writing assistance. Target platform is **Android**. Web preview exists for development only — many features (export, file system, alerts) behave differently or are broken on web.

**Never claim a feature works based on web preview alone. Android device or emulator verification is required for any feature involving file I/O, export, Alert dialogs, or native APIs.**

## Commands

### Frontend (Expo)
```bash
cd frontend
npx expo start          # Start dev server (web + QR for device)
npx expo start --web    # Web-only preview
npx expo run:android    # Build and run on connected Android device/emulator
npx expo lint           # Lint
npx jest                # Run all tests
npx jest --testPathPattern=<name>  # Run single test file
```

### Backend (FastAPI + Python)
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
pytest tests/            # Run backend tests
pytest tests/test_ai_endpoints.py::TestHealth  # Run single test
```

Backend requires `OPENAI_API_KEY` in `backend/.env` OR passed as `Authorization: Bearer <key>` header per request (keyless mode).

## Architecture

### Frontend Stack
- **Expo Router** (file-based routing) — screens live in `frontend/app/`
- **React Native** + **react-native-web** for web preview
- **AsyncStorage** for book persistence (key: `@ebook/books`, prefs: `@ebook/prefs`)
- **expo-sqlite** available but not yet used for main storage

### Screen Structure
```
app/(tabs)/index.tsx     — Library (book grid, import, seed data)
app/(tabs)/write.tsx     — Drafts list with delete
app/(tabs)/settings.tsx  — Font/line-height prefs, AI provider config, erase
app/editor/[id].tsx      — Rich text editor with AI drawer
app/reader/[id].tsx      — Reader with highlights, annotations, export
```

### Key Libraries (`frontend/src/lib/`)
| File | Purpose |
|------|---------|
| `storage.ts` | All AsyncStorage CRUD — books, highlights, annotations |
| `types.ts` | Shared TypeScript types (Book, Highlight, Annotation, etc.) |
| `aiGateway.ts` | Multi-provider AI routing — routes to correct provider |
| `providers/` | One file per AI provider: openai, anthropic, gemini, local |
| `providerTable.ts` | Provider registry — model lists, capabilities |
| `epubParser.ts` | EPUB parsing (currently minimal — needs work) |
| `exporter.ts` | Export to PDF/EPUB/DOCX/MD/TXT via expo-print, JSZip |
| `paginationEngine.ts` | Chapter/page chunking for long documents |
| `reflowManager.ts` | Reflow text on font/size changes |
| `dialogs.ts` | `confirmAction()` — uses `window.confirm` on web, `Alert.alert` on native |
| `theme.ts` | Theme tokens matching `design_guidelines.json` |

### Components (`frontend/src/components/`)
- `ManuscriptEditor.tsx` — main editor component
- `ExportSheet.tsx` — export modal (testIDs: `export-{pdf|epub|docx|md|txt|cancel}`)
- `editor/AIEditingPanel.tsx` — AI drawer (continue/improve/shorten/expand)
- `editor/EditorToolbar.tsx` — floating formatting toolbar
- `reader/` — AnnotationsSheet, HighlightModal, ReaderSettingsSheet, TOCDrawer, SearchOverlay

### Backend
Single FastAPI app in `backend/server.py`. SQLite for status checks only. AI calls proxy through to OpenAI (or whichever key is passed). No server-side key storage — keys come from the client Authorization header.

## Design System

All UI must follow `design_guidelines.json`:
- **Dark theme** — background `#0A0A0B`, surface `#141416`
- **Brand color** — Amber `#FFB000`
- **UI font** — Manrope, **Reading font** — Spectral
- **All interactive elements must have `testID` attributes** for testability

## Testing Rules

**This is the most important section.**

1. **Every feature must be tested against a real file** — use a sample EPUB/DOCX/TXT before claiming import works.
2. **Tests must run on Android**, not just web. Web-only passing tests do not count for native features.
3. **Do not mark a task complete** until the test agent confirms it working, not just the main agent.
4. **`test_result.md`** must be updated with actual pass/fail results before calling the testing agent.
5. **One feature at a time** — implement, test, verify, commit. No bundling unverified features.
6. **Alert.alert is a no-op on react-native-web 0.21** — use `confirmAction()` from `src/lib/dialogs.ts` for all confirmation dialogs.

### Known Web vs Android Gaps
| Feature | Web | Android |
|---------|-----|---------|
| `Alert.alert` | no-op | native dialog |
| `expo-print` | broken | works |
| `expo-sharing` | broken | works |
| `expo-file-system` | limited | full access |
| `expo-document-picker` | limited types | full |

## What Is Actually Broken / Not Built Yet

Be honest about this before starting any task:

- **EPUB import** — ✓ done (Tasks 1 + 2)
- **Long document pagination** — ✓ done (Tasks 3 + 3b): `usePagination` hook + `PageNavBar` component, portable
- **DOCX import** — not implemented at all
- **AI context module** — not built yet (Task 4): `src/lib/ai/context/` with `buildContext()` pure function
- **AI streaming** — ✓ done (Task 4b): `src/lib/ai/streaming/`
- **Whole-book analysis** — ✓ done (Task 4c): `src/lib/ai/analysis/`
- **AI context + wire-up** — ✓ done (Tasks 4 + 4d): `src/lib/ai/context/`, `aiGateway.ts`
- **AI server discovery** — ✓ done (Task 4e): `src/lib/ai/discovery/` — mDNS + .well-known + subdomain
- **AI suggestion engine** — ✓ done (Task 5): `src/lib/suggestions/` — requestSuggestions/apply/reject/edit, 6 modes, char-level diff
- **Spell/grammar checking** — ✓ handled by grammar mode in Task 5 (`src/lib/suggestions/`)
- **Export on Android** — not verified on device (Task 6); only web-tested (broken for print/sharing)

---

## Implementation Plan

### Guardrails — append to EVERY task prompt

> **Guardrails:**
> - Do only what this task describes. Touch no files outside the listed scope.
> - If you find a bug outside your task scope, document it in `test_result.md` but do not fix it.
> - Do not create placeholder or stub implementations — if you cannot finish it fully, say so and stop.
> - Run the actual test command and paste the output before marking `working: true` in `test_result.md`.
> - The last line of your response must be exactly: `Verified working: YES/NO — [one sentence of evidence]`

---

### Task 2 — Wire EPUB import into Library UI

**Scope:** `frontend/app/(tabs)/index.tsx`, `frontend/src/lib/storage.ts` only.

**Prompt:**
Wire `parseEpub()` from `src/lib/epubParser.ts` into the Library import button in `app/(tabs)/index.tsx`. When the user picks an `.epub` file via `expo-document-picker`: (1) show a loading indicator with testID `import-loading`, (2) call `parseEpub(uri)` to get structured chapters, (3) create a `Book` object where `content` is the flat joined text and store it via `storage.ts` `saveBook()`, (4) reload the library list, (5) on error show a user-visible message (not `Alert.alert` — use a state variable rendered as text with testID `import-error`). Do not change any other screen. Do not change `epubParser.ts`. Write a Jest test in `__tests__/lib/` that mocks `expo-document-picker` and `epubParser` and verifies the full import→save flow. Run `npx jest --testPathPattern=import` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Task 3 — Long Document Display (paginationEngine → reader)

**Scope:** `frontend/app/reader/[id].tsx`, `frontend/src/lib/paginationEngine.ts` only.

**Prompt:**
Wire `paginationEngine.ts` into `app/reader/[id].tsx` so books over 50,000 characters are split into pages and only one page is held in memory at a time. Requirements: (1) on book open, run `paginate()` to get a `string[]` of pages, (2) render only the current page index, (3) swipe left/right or tap arrows to advance pages, (4) save current page index to the `Book.scrollY` field via `storage.ts` so progress is restored on re-open, (5) display `Page X of Y` with testID `page-indicator`. Do not touch the editor, AI, or any other screen. Write Jest tests verifying: paginate splits a 100,000-char string into multiple pages, page index is saved and restored. Run `npx jest --testPathPattern=pagination` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Portable AI Module Architecture

All AI modules live under `frontend/src/lib/ai/` and follow the same portability contract as `paginationEngine.ts` and `suggestions/`:
- **Zero app-level imports** — no `storage.ts`, no AsyncStorage, no React Native, no Expo
- **Caller provides everything** — text, providerConfig, cached summaries; the module never reaches out
- **App-specific wiring is thin** — `aiGateway.ts` reads from AsyncStorage and hands data into the portable modules; it is the only file that knows about the app

```
frontend/src/lib/ai/
  context/           — Task 4:  buildContext() — sliding window assembly
  streaming/         — Task 4b: streamRequest() — token-by-token AI responses
  analysis/          — Task 4c: analyzeBook()  — map-reduce whole-book analysis
```

---

### Task 4 — AI Context Module (portable sliding context window)

**Scope:** New folder `frontend/src/lib/ai/context/` only. No changes to existing files.

**Architecture:**
```
frontend/src/lib/ai/context/
  index.ts     — public API (buildContext, extractStyleProfile, estimateTokens)
  types.ts     — ContextRequest, ContextResult, StyleProfile (no app imports)
```

**Public API (`index.ts`) must export:**
```typescript
// Assemble a prompt context window within a token budget
buildContext(request: ContextRequest): ContextResult

// Extract author style profile from sample text (chapters 1–3 or equivalent)
extractStyleProfile(sampleText: string): StyleProfile

// Rough token estimator (4 chars ≈ 1 token) — used for budget enforcement
estimateTokens(text: string): number
```

**Types (`types.ts`):**
```typescript
interface ContextRequest {
  currentText: string          // the chapter or selection being worked on
  precedingText?: string       // text before currentText (tail used, not full)
  followingText?: string       // text after currentText (head used, not full)
  bookSummary?: string         // pre-computed whole-book summary (from Task 4c)
  styleProfile?: StyleProfile  // pre-computed style profile
  taskInstruction: string      // what the AI should do ("continue", "improve", etc.)
  tailLength?: number          // chars to take from preceding/following (default 1000)
  tokenBudget?: number         // max tokens for assembled prompt (default 4000)
}

interface ContextResult {
  prompt: string               // assembled prompt ready to send to any AI provider
  tokenEstimate: number        // estimated token count of assembled prompt
  sections: {                  // what made it in and what was trimmed
    styleProfile: boolean
    bookSummary: boolean
    precedingTail: boolean
    currentText: boolean       // always true
    followingHead: boolean
    taskInstruction: boolean   // always true
  }
}

interface StyleProfile {
  dominantTense: 'past' | 'present' | 'unknown'
  pointOfView: 'first' | 'second' | 'third' | 'unknown'
  avgSentenceLength: number    // words
  recurringNouns: string[]     // top 10 proper nouns
  rawSample: string            // first 500 chars used for extraction
}
```

**Requirements:**
- Zero imports from outside `src/lib/ai/context/` — no app types, no storage, no React
- `buildContext()` must trim preceding/following to `tailLength` chars before assembling
- Token budget enforcement: fit as many sections as possible within `tokenBudget`, drop in priority order: followingHead → precedingTail → bookSummary → styleProfile
- Write Jest tests: context includes prev tail (1000 chars), token budget enforced (prompt ≤ budget), sections flags reflect what was included, style profile extracts tense/POV correctly from sample text, estimateTokens returns sensible values
- Run `npx jest --testPathPattern=ai/context` and paste output
- Update `test_result.md`
- **Guardrails apply.**

---

### Task 4b — AI Streaming Module (portable token-by-token responses)

**Scope:** New folder `frontend/src/lib/ai/streaming/` only. No changes to existing files.

**Architecture:**
```
frontend/src/lib/ai/streaming/
  index.ts           — public API (streamRequest)
  types.ts           — StreamConfig, StreamChunk, StreamCallbacks
  providers/
    openai.ts        — OpenAI / Groq / Custom (SSE, text/event-stream)
    anthropic.ts     — Anthropic (SSE with anthropic-specific event types)
    ollama.ts        — Ollama / BitNet (NDJSON, one JSON object per line)
    gemini.ts        — Google Gemini (SSE)
```

**Public API (`index.ts`) must export:**
```typescript
streamRequest(config: StreamConfig, callbacks: StreamCallbacks): Promise<void>
// Throws on fatal error (bad auth, unreachable host). Non-fatal chunks call onError.
```

**Types (`types.ts`):**
```typescript
interface StreamConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama' | 'bitnet' | 'custom'
  apiKey: string
  model: string
  baseUrl?: string             // required for ollama/bitnet/custom
  prompt: string               // fully assembled prompt (from buildContext)
  systemPrompt?: string
  maxTokens?: number           // default 1024
  temperature?: number         // default 0.7
}

interface StreamCallbacks {
  onChunk: (text: string) => void      // called for each token/chunk received
  onDone: (fullText: string) => void   // called once with complete response
  onError: (error: Error) => void      // called on recoverable error
}
```

**Requirements:**
- Zero app imports — only `fetch` (available in React Native and Node 18+)
- Each provider file implements one function: `streamProvider(config, callbacks): Promise<void>`
- `index.ts` routes to the correct provider file based on `config.provider`
- Ollama provider must handle both `/api/generate` (BitNet-compatible) and `/api/chat` endpoints
- Anthropic provider must handle `content_block_delta` event type
- Write Jest tests using `jest.fn()` mocks for `fetch`: OpenAI SSE chunks arrive in order, Ollama NDJSON chunks arrive in order, onDone called with full concatenated text, onError called on non-200 response
- Run `npx jest --testPathPattern=ai/streaming` and paste output
- Update `test_result.md`
- **Guardrails apply.**

---

### Task 4c — AI Analysis Module (portable map-reduce whole-book analysis)

**Scope:** New folder `frontend/src/lib/ai/analysis/` only. Tasks 4 and 4b must be complete first.

**Architecture:**
```
frontend/src/lib/ai/analysis/
  index.ts       — public API (analyzeBook, summarizeChunks)
  mapReduce.ts   — chunk splitting and recursive summarize-combine logic
  types.ts       — AnalysisRequest, AnalysisResult, AnalysisProgress
```

**Public API (`index.ts`) must export:**
```typescript
// Full map-reduce analysis of an entire book. Returns an AsyncGenerator that
// yields progress events so the UI can show live status.
analyzeBook(request: AnalysisRequest): AsyncGenerator<AnalysisProgress, AnalysisResult>

// Summarize an array of text chunks into a single summary. Used recursively.
summarizeChunks(
  chunks: string[],
  config: StreamConfig,
  onProgress?: (done: number, total: number) => void
): Promise<string>
```

**Types (`types.ts`):**
```typescript
interface AnalysisRequest {
  fullText: string             // entire book content
  providerConfig: StreamConfig // which AI to use
  chunkSize?: number           // chars per chunk (default 8000 — fits most models)
  task?: string                // "summarize" | "themes" | "characters" | "plot-holes"
                               // default "summarize"
}

interface AnalysisProgress {
  stage: 'chunking' | 'summarizing' | 'combining' | 'done'
  chunksTotal: number
  chunksDone: number
  currentChunkPreview: string  // first 80 chars of chunk being processed
}

interface AnalysisResult {
  summary: string              // final whole-book summary
  styleProfile: StyleProfile   // extracted from first 3 chunks
  chunksProcessed: number
  tokensEstimated: number
}
```

**Requirements:**
- Zero app imports — uses `streamRequest` from `../streaming` and `buildContext`/`extractStyleProfile` from `../context`
- `chunkSize` defaults to 8000 chars (~2000 tokens) so it fits within BitNet/small Ollama models
- Map phase: summarize each chunk independently using `streamRequest`
- Reduce phase: if more than one summary, recursively combine pairs until one remains
- `analyzeBook` yields a progress event after each chunk completes so UI can show a live progress bar
- `styleProfile` extracted from first 3 chunks only (representative sample, not full book)
- Write Jest tests: chunking splits 100,000 chars into correct chunk count, summarizeChunks calls streamRequest once per chunk, recursive reduce converges to single result, progress events emitted in correct order
- Run `npx jest --testPathPattern=ai/analysis` and paste output
- Update `test_result.md`
- **Guardrails apply.**

---

### Task 4d — Wire AI Modules into App (thin app-level callers)

**Scope:** `frontend/src/lib/aiGateway.ts`, `frontend/src/components/editor/AIEditingPanel.tsx` only. Tasks 4, 4b, 4c must be complete first.

**Prompt:**
Wire the portable AI modules into the app. In `aiGateway.ts`: (1) replace the existing inline context assembly with a call to `buildContext()` from `src/lib/ai/context/`, reading preceding/following text and cached summaries from AsyncStorage keys `@ebook/summary/{bookId}` and `@ebook/style/{bookId}` before passing them in, (2) add a `streamAIResponse(bookId, prompt, callbacks)` function that reads the active AI key from AsyncStorage, builds a `StreamConfig`, and delegates to `streamRequest()` from `src/lib/ai/streaming/`, (3) add a `runBookAnalysis(bookId, onProgress)` function that loads the book content, calls `analyzeBook()` from `src/lib/ai/analysis/`, and writes the resulting summary and style profile back to AsyncStorage. In `AIEditingPanel.tsx`: replace any direct `fetch` calls with `streamAIResponse()` so responses stream token-by-token into the UI (append to a `useState` string). Do not touch any portable module files. Write Jest tests mocking AsyncStorage: `streamAIResponse` reads active key and calls `streamRequest`, `runBookAnalysis` writes summary to correct AsyncStorage key. Run `npx jest --testPathPattern=aiGateway` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Task 4e — AI Server Discovery (mDNS + .well-known + subdomain probing)

**Scope:** New folder `frontend/src/lib/ai/discovery/` only. No changes to existing files. Task 4d must be complete first.

**Why this exists:** Organizations running internal AI servers (government, enterprise, education) should not need to manually type a base URL. This module discovers candidate URLs automatically via two complementary strategies: (1) `.well-known/ai-server` DNS lookup at the org domain, and (2) mDNS/Zeroconf for local-network servers. Both feed the same `customBaseUrl` field in `StreamConfig`.

**Architecture:**
```
frontend/src/lib/ai/discovery/
  index.ts        — public API (discoverAIServers, probeServer)
  types.ts        — DiscoveryOptions, DiscoveredServer, DiscoveryResult
  probe.ts        — probeServer(): hit /v1/models or /api/tags, classify provider
  candidates.ts   — buildCandidateURLs(): .well-known + subdomain heuristics + mDNS hosts
```

**Public API (`index.ts`) must export:**
```typescript
// Probe a single URL — returns server info or null if unreachable/unrecognised
probeServer(url: string, timeoutMs?: number): Promise<DiscoveredServer | null>

// Discover AI servers from all available sources.
// mDNS scanning requires a native module (react-native-zeroconf) — the caller
// passes already-resolved hostnames so the module itself stays dep-free.
discoverAIServers(options: DiscoveryOptions): Promise<DiscoveryResult>
```

**Types (`types.ts`):**
```typescript
interface DiscoveryOptions {
  orgDomain?: string      // 'company.com' — enables .well-known + subdomain probing
  mdnsHosts?: string[]    // mDNS-discovered hostnames passed in by caller
  timeoutMs?: number      // per-probe timeout ms (default 3000)
}

interface DiscoveredServer {
  url: string             // canonical base URL, e.g. 'https://ai.company.com'
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom'
  name?: string           // from .well-known response or /v1/models metadata
  models: string[]        // model IDs returned by the probe (may be empty)
  source: 'well-known' | 'subdomain' | 'mdns' | 'manual'
  latencyMs: number       // round-trip time of the successful probe
}

interface DiscoveryResult {
  servers: DiscoveredServer[]
  probed: number          // total candidate URLs attempted
  errors: string[]        // non-fatal probe errors for diagnostics
}
```

**Behaviour rules:**
- Probing uses `AbortController` + `timeoutMs` (portable: Node 18+, React Native 0.71+)
- `probeServer` tries `/v1/models` first (OpenAI-compat); on 404/error tries `/api/tags` (Ollama)
- Provider classification: `{ data: [...] }` shape → `'openai'`; `{ models: [...] }` shape → `'ollama'`; others → `'custom'`
- `.well-known/ai-server` response shape: `{ url, name?, provider?, description? }` — if present, the `url` field is probed directly
- Subdomain candidates (tried for `orgDomain`): `ai.`, `llm.`, `openai.`, `ollama.`, `gpt.`, `ml.` — both `https://` and `http://`
- mDNS hosts probed as `http://{host}`, `http://{host}:11434` (Ollama default), `http://{host}:8080` (common alt)
- All probes run concurrently via `Promise.allSettled` — no serial waiting
- Results deduplicated by canonical URL (trailing slash stripped)
- Zero imports from app code, AsyncStorage, or React Native

**Requirements:**
- Write Jest tests mocking `fetch`: probeServer returns null for unreachable URLs, correctly classifies OpenAI-compat vs Ollama responses, discoverAIServers probes .well-known URL when orgDomain set, probes all subdomain candidates, probes mDNS hosts on correct ports, deduplicates results
- Run `npx jest --testPathPattern=ai/discovery` and paste output
- Update `test_result.md`
- **Guardrails apply.**

---

### Task 5 — AI Suggestion Engine (standalone reusable module)

**Scope:** New folder `frontend/src/lib/suggestions/` only. No UI changes. No changes to existing files. Tasks 4 and 4b must be complete first (suggestions module uses `StreamConfig` from `src/lib/ai/streaming/types.ts`).

**Architecture — this module must be self-contained and portable to other apps:**

```
frontend/src/lib/suggestions/
  index.ts          — public API, the only file other code imports from
  engine.ts         — core suggestion logic (uses streamRequest from ai/streaming)
  presenter.ts      — formats raw AI response into SuggestionSet
  types.ts          — all exported types (no imports from app code)
```

**The public API (`index.ts`) must export only these:**
```typescript
requestSuggestions(input: SuggestionRequest): Promise<SuggestionSet>
applySuggestion(set: SuggestionSet, id: string): ApplyResult
rejectSuggestion(set: SuggestionSet, id: string): SuggestionSet
editSuggestion(set: SuggestionSet, id: string, newText: string): SuggestionSet
```

**Types (`types.ts`):**
```typescript
interface SuggestionRequest {
  originalText: string
  precedingContext?: string    // up to 1,000 chars — passed to buildContext()
  followingContext?: string
  styleProfile?: StyleProfile  // from src/lib/ai/context/types.ts
  bookSummary?: string
  mode: SuggestionMode
  providerConfig: StreamConfig // from src/lib/ai/streaming/types.ts
}

type SuggestionMode =
  | 'continue' | 'improve' | 'shorten' | 'expand' | 'grammar' | 'rephrase'

interface SuggestionSet {
  id: string
  mode: SuggestionMode
  originalText: string
  suggestions: Suggestion[]
  status: 'pending' | 'ready' | 'error'
  error?: string
  requestedAt: number
}

interface Suggestion {
  id: string
  text: string
  diff?: DiffChunk[]
  reason?: string
  offset?: number
  length?: number
}

interface DiffChunk {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

interface ApplyResult {
  newText: string
  updatedSet: SuggestionSet
}
```

**Presentation rules (enforced by `presenter.ts`):**
- Every suggestion must include a character-level diff (equal/insert/delete chunks)
- Grammar mode: one `Suggestion` per correction with `offset` + `length`
- Rephrase mode: exactly 3 `Suggestion` objects
- Prose modes: exactly 1 `Suggestion`

**Requirements:**
- Zero imports from app-level code (`storage.ts`, `aiGateway.ts`, React Native, Expo)
- `providerConfig` is passed in by the caller — never touches AsyncStorage
- Uses `buildContext()` from `../ai/context` to assemble the prompt
- Uses `streamRequest()` from `../ai/streaming` for the AI call
- Write Jest tests: all 6 modes return correct SuggestionSet shape, diff chunks correct for known input/output pair, applySuggestion produces correct newText, rejectSuggestion removes suggestion, editSuggestion updates text and regenerates diff
- Run `npx jest --testPathPattern=suggestions` and paste output
- Update `test_result.md`
- **Guardrails apply.**

---

### Task 5b — Wire Suggestion Engine into Editor UI

**Scope:** `frontend/src/components/editor/AIEditingPanel.tsx` only. Task 5 must be complete first.

**Prompt:**
Wire the suggestion engine from `src/lib/suggestions/` into `AIEditingPanel.tsx`. The UI must: (1) show a loading state while `requestSuggestions()` is in flight (testID `suggestion-loading`), (2) display each `Suggestion` in a card showing the diff — deleted text in red strikethrough, inserted text in green, unchanged text in normal color, (3) provide three buttons per suggestion: Accept (testID `suggestion-accept-{id}`), Edit (testID `suggestion-edit-{id}`), Reject (testID `suggestion-reject-{id}`), (4) Edit opens an inline text field pre-filled with `suggestion.text` — user edits and confirms, which calls `editSuggestion()` then re-renders the diff, (5) Accept calls `applySuggestion()` and inserts `newText` into the editor replacing `originalText`, (6) Reject calls `rejectSuggestion()` and dismisses that card, (7) if all suggestions are rejected the panel shows an empty state with a "Try again" button. Do not change `suggestions/` module code. Do not change any other component. Write Jest tests for the component render states (loading, ready with suggestions, empty after all rejected). Run `npx jest --testPathPattern=AIEditingPanel` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Task 6 — Export Verified on Android

**Scope:** `frontend/src/lib/exporter.ts` only.

**Prompt:**
Verify and fix all 5 export formats (PDF, EPUB, DOCX, MD, TXT) in `exporter.ts` to produce real files on a connected Android device or emulator running via `npx expo run:android`. For each format: (1) export the 7-chapter synthetic EPUB fixture from the epubParser tests, (2) verify the file exists at the returned URI using `expo-file-system`, (3) verify file size > 0. Fix any format that fails. Do not touch any UI components — only `exporter.ts`. Document each format pass/fail with file size evidence in `test_result.md`. **Guardrails apply.**
