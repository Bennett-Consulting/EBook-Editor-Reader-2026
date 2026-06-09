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

- **EPUB import into Library UI** — parser works (`epubParser.ts` 9/9 tests pass) but not wired to the import button yet
- **DOCX import** — not implemented at all
- **Long document support** — 400+ page books will freeze; `paginationEngine.ts` exists but is not wired into the editor/reader
- **AI memory for long docs** — no sliding context window; AI only sees the text passed directly
- **Spell/grammar checking** — no implementation; AI modes are prose continuation only
- **Export on Android** — not verified on device; only web-tested (which is broken for print/sharing)

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

### Task 4 — AI Sliding Context Window for Long Documents

**Scope:** `frontend/src/lib/aiGateway.ts` only.

**Prompt:**
Implement a `buildContext()` function in `src/lib/aiGateway.ts` that assembles a sliding context window for AI calls on long documents. It must: (1) accept `{books: Book[], currentBookId: string, currentChapterIndex: number, selectedText: string, task: string}`, (2) load the current chapter's full text, (3) append the last 1,000 characters of the previous chapter (if exists) as "preceding context", (4) prepend the first 1,000 characters of the next chapter (if exists) as "following context", (5) generate and cache a book summary (max 500 tokens) stored in AsyncStorage key `@ebook/summary/{bookId}` — regenerate only if the book has been edited since last summary, (6) extract a style profile from chapters 1–3 (dominant tense, POV, average sentence length, any recurring proper nouns) stored as `@ebook/style/{bookId}`, (7) assemble the final prompt within a 4,000-token budget: `[style profile] + [book summary] + [prev tail] + [current chapter] + [next head] + [task instruction]`. Write Jest tests verifying: context includes prev/next chapter tails, respects token budget, summary is cached and not regenerated on second call, style profile is extracted correctly. Run `npx jest --testPathPattern=aiGateway` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Task 5 — Spell & Grammar Checking

**Scope:** `frontend/src/lib/aiGateway.ts` (add grammar mode), `frontend/src/components/editor/AIEditingPanel.tsx` only.

**Prompt:**
Add a `grammar` mode to `aiGateway.ts` and wire it into `AIEditingPanel.tsx`. Requirements: (1) the grammar prompt instructs the AI to return a JSON array of corrections: `[{offset: number, length: number, original: string, suggestion: string, reason: string}]`, (2) corrections are displayed inline in the editor with the original text highlighted and the suggestion shown on tap, (3) each correction has Accept (testID `grammar-accept-{n}`) and Ignore (testID `grammar-ignore-{n}`) buttons, (4) accepting a correction applies it to the text and records it in `editHistory`, (5) the style profile from Task 4 is passed as context so the AI does not flag intentional stylistic choices. Write Jest tests verifying: grammar prompt returns valid JSON structure, accept applies the correction, ignore removes it from the list. Run `npx jest --testPathPattern=grammar` and paste output. Update `test_result.md`. **Guardrails apply.**

---

### Task 6 — Export Verified on Android

**Scope:** `frontend/src/lib/exporter.ts` only.

**Prompt:**
Verify and fix all 5 export formats (PDF, EPUB, DOCX, MD, TXT) in `exporter.ts` to produce real files on a connected Android device or emulator running via `npx expo run:android`. For each format: (1) export the 7-chapter synthetic EPUB fixture from the epubParser tests, (2) verify the file exists at the returned URI using `expo-file-system`, (3) verify file size > 0. Fix any format that fails. Do not touch any UI components — only `exporter.ts`. Document each format pass/fail with file size evidence in `test_result.md`. **Guardrails apply.**
