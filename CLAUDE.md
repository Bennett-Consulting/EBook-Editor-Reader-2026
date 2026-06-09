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

- **EPUB/DOCX import** — `epubParser.ts` exists but does not properly parse real EPUB files (chapters, TOC, images)
- **Long document support** — 400+ page books will freeze; `paginationEngine.ts` exists but is not wired into the editor/reader
- **AI memory for long docs** — no RAG/chunking; AI only sees the text passed directly, not the full book
- **Spell/grammar checking** — no implementation; AI modes are prose continuation only
- **Export on Android** — not verified on device; only web-tested (which is broken for print/sharing)
