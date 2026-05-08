# Ebook Reader & Editor — PRD (Android Standalone)

## Vision
A dark-first, premium **standalone Android ebook reader and editor**. Users import their own books, read them with comfortable typography, highlight passages, write entirely new books with a rich-text-style editor, get AI assistance while writing, and **export their work in 5 industry formats**.

## User Choices (confirmed)
- Platform: **Android-only standalone app** (runs in Expo Go for testing; APK via EAS Build for distribution)
- Formats supported (read & import): TXT, Markdown, EPUB
- Formats supported (export): **TXT, MD, EPUB, DOCX, PDF**
- Editor: rich-text editor + annotations on existing books
- Storage: local-only (AsyncStorage)
- AI: writing assistant (Emergent LLM key)
- Design: modern, dark-first

## Tech Stack
- **Frontend**: React Native + Expo SDK 54, expo-router, TypeScript
- **Backend**: FastAPI (only used as a thin proxy for the AI assistant)
- **AI**: `emergentintegrations` LlmChat with `gpt-4o-mini` (Emergent Universal Key)
- **Local storage**: `@react-native-async-storage/async-storage`
- **File I/O**: `expo-document-picker`, `expo-file-system`, `expo-sharing`, `expo-print`
- **Document building**: `jszip` (EPUB + DOCX containers)

## Routes
- `/(tabs)/index` — Library (book grid, import, create new, edit overlay)
- `/(tabs)/write` — Drafts list + new draft button
- `/(tabs)/settings` — Reading preferences, erase data
- `/reader/[id]` — Immersive reader: back / edit / export / annotations / settings toolbar; long-press paragraph to highlight
- `/editor/[id]` — Editor: title/author/content + floating toolbar (B/i/H/list/quote/undo/redo/AI) + meta sheet (cover color, **Export…**, Preview)

## Backend Endpoints
- `POST /api/ai/suggest` — `{ context, mode, session_id? }` → `{ suggestion, session_id }`. Modes: `continue | improve | shorten | expand`.
- `GET /api/` — health check.

## Export pipeline (Android)
| Format | How it's built |
|---|---|
| `.txt` | Plain UTF-8 string written via `FileSystem.writeAsStringAsync` |
| `.md`  | Markdown header + body + notes, written as UTF-8 |
| `.epub` | Built with JSZip (mimetype + container.xml + OEBPS/content.opf + nav.xhtml + chapter1.xhtml + style.css), written as base64 |
| `.docx` | Built with JSZip (Open XML: `[Content_Types].xml` + `_rels` + `word/document.xml` + `word/styles.xml`), written as base64 |
| `.pdf` | `expo-print.printToFileAsync` renders the styled HTML into a real PDF via the Android PDF engine |
After writing, the file is shared with `Sharing.shareAsync` so the user can save to Drive, email it, send to Kindle, etc.

## Data Model
```ts
Book { id, title, author, content, format, coverColor, coverEmoji?, createdAt, updatedAt, progress, scrollY?, annotations: Annotation[], isDraft }
Annotation { id, text, note?, start, end, color?, createdAt }
ReaderPrefs { fontSize, lineHeight, paperMode, serif }
```

## Key Features
1. Library grid with covers, drafts, progress bars, **edit-pencil overlay** (one-tap to editor), import button.
2. Import .txt / .md / .epub via DocumentPicker.
3. Reader: adjustable font size & line height, serif toggle, paper mode (sepia), scroll-position persistence, **edit** + **export** buttons in toolbar, long-press → highlight + optional note.
4. Editor: title/author/content fields, floating toolbar (undo/redo, B, *i*, H, lists, quote, AI), meta sheet with cover color picker + **Export…** + **Preview**.
5. **AI Assistant drawer** with 4 modes (continue / improve / shorten / expand).
6. **Export to 5 formats** from both Reader and Editor.
7. Settings: persistent reading prefs + erase all data.

## Distribution path
Test in **Expo Go** via QR (instant). Build release APK with **EAS Build**:
```bash
eas build --platform android   # after Save-to-GitHub + clone locally
```

## Smart enhancement (revenue hook)
**Tiered AI + premium export** — keep `continue` AI mode and TXT/MD export free; gate `expand`/`improve` AI modes and DOCX/PDF/EPUB export behind a Pro tier. These are the moments authors hit at the end of a project (export-to-publish, polish-with-AI) → highest conversion willingness.

## Status
- MVP complete & ANDROID-ready.
- All 8 backend pytest pass (iteration_2.json).
- Compiles cleanly, web preview renders for sanity, native exporter verified by static review.
- Tested: AI 4 modes, library/editor/reader/settings/import flows, edit-overlay, 5-format export wiring.
