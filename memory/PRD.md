# Ebook Reader & Editor — PRD

## Vision
A dark-first, premium mobile ebook reader and editor that runs on Android via Expo Go. Users can import their own .txt and .md books, read them with comfortable typography, highlight passages, write entirely new books with a rich-text-style editor, and get AI assistance while writing.

## User Choices (provided by user)
- Formats: TXT / Markdown / EPUB (best fidelity for .txt and .md; .epub imported as raw text)
- Editor: rich text editor + annotations on existing books
- Storage: local-only (AsyncStorage on the device)
- AI feature: AI writing assistant
- Design: modern, dark-first

## Tech Stack
- **Frontend**: React Native + Expo SDK 54, expo-router (file-based routing), TypeScript
- **Backend**: FastAPI (only used as a thin proxy for the AI assistant)
- **AI**: `emergentintegrations` LlmChat with `gpt-4o-mini` (Emergent Universal Key)
- **Local storage**: `@react-native-async-storage/async-storage`
- **File picking**: `expo-document-picker` + `expo-file-system`

## Routes
- `/(tabs)/index` — Library (book grid, import, create new)
- `/(tabs)/write` — Drafts list + new draft button
- `/(tabs)/settings` — Reading preferences, erase data
- `/reader/[id]` — Immersive reader with toolbar, settings sheet, annotations sheet, long-press highlight modal
- `/editor/[id]` — Editor with floating toolbar (B/i/H/list/quote/undo/redo) + AI drawer (continue/improve/shorten/expand) + cover meta sheet

## Backend Endpoints
- `POST /api/ai/suggest` — body: `{ context, mode, session_id? }`, returns `{ suggestion, session_id }`. Modes: `continue | improve | shorten | expand`.
- `GET /api/` — health check
- `GET/POST /api/status` — original status check (kept)

## Data Model (local)
```ts
Book {
  id, title, author, content, format, coverColor, coverEmoji?,
  createdAt, updatedAt, progress, scrollY?,
  annotations: Annotation[], isDraft
}
Annotation { id, text, note?, start, end, color?, createdAt }
ReaderPrefs { fontSize, lineHeight, paperMode, serif }
```

## Key Features
1. **Library grid** with book covers (color + emoji), draft badge, reading progress bar.
2. **Import** .txt / .md (and best-effort .epub) via DocumentPicker.
3. **Create new book** modal with title, author, cover color palette.
4. **Reader** with adjustable font size, line height, serif toggle, paper mode (light sepia), scroll-position persistence, Markdown-ish heading rendering.
5. **Long-press paragraph → highlight** with optional note. Highlights list view + delete.
6. **Editor** with floating toolbar: undo/redo, **B**/*i*, headings, bullet & numbered lists, blockquote, AI button.
7. **AI Assistant drawer** with 4 modes (continue / improve / shorten / expand), accept-into-book action.
8. **Settings**: persistent reading prefs + erase all data.

## How to run on Android
1. Install **Expo Go** on the Android device from Play Store.
2. Open the preview link or scan the QR code from the Emergent preview / Metro tunnel.
3. The app will load directly inside Expo Go — fully offline-capable for reading & writing; AI requests go to the Emergent backend.

## Smart enhancement (revenue/utility hook)
**AI writing modes as a soft paywall lane**: today all 4 modes (continue / improve / shorten / expand) are free. A trivial follow-up is to gate `expand` and `improve` behind a Pro tier — these are the modes power-users hit most when finishing a draft, giving a natural conversion moment without hurting the free reader experience.

## Status
MVP complete. AI endpoint verified. UI loads on web preview & Android via Expo Go.
