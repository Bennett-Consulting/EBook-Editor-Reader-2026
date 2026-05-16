// ─── Database Entity Types (SQLite — mirrors Android Room schema) ────────────

/**
 * A single page of a document. Documents are split into chunks during
 * pagination, and the reader/editor works with one chunk at a time.
 *
 * Android equivalent: DocumentChunkEntity (AppDatabase)
 */
export interface DocumentChunk {
  id?: number;              // auto-increment PK
  documentId: string;       // which book this belongs to
  chunkIndex: number;       // sequential page number (0-based)
  rawContent: string;       // original imported text
  cleanContent: string;     // sanitized / edited text (displayed)
  mappingJson?: string;     // raw→clean character mapping (for highlights)
  title?: string | null;    // chapter title (non-null = chapter start)
  timestamp: number;        // last modified (epoch ms)
}

/**
 * A highlight or note attached to a specific position in a chunk.
 *
 * Android equivalent: AnnotationEntity (Build 7.3.0 chunk-based)
 */
export interface AnnotationEntry {
  id: string;
  documentId: string;
  chunkIndex: number;
  offset: number;           // char offset within chunk
  length: number;           // selection length
  note?: string | null;
  timestamp: number;
}

/**
 * Every AI or manual edit, tracked for undo and audit trail.
 * Stores the before/after text and the AI's rationale.
 *
 * Android equivalent: EditHistoryEntity
 */
export interface EditHistoryEntry {
  id: string;
  documentId: string;
  chunkIndex: number;
  originalText: string;
  updatedText: string;
  rationale?: string | null;
  timestamp: number;
}

/**
 * Voice command transcript and the AI's suggested edit.
 *
 * Android equivalent: VoiceNoteEntity
 */
export interface VoiceNoteEntry {
  id: string;
  documentId: string;
  chunkIndex: number;
  transcript: string;
  aiSuggestion?: string | null;
  isApplied: boolean;
  timestamp: number;
}

// ─── AI Provider Types ──────────────────────────────────────────────────────

export type AIProvider =
  | "openai"
  | "google"
  | "anthropic"
  | "groq"
  | "ollama"
  | "custom";

export interface AIProviderConfig {
  name: string;
  baseUrl: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  authHeader: (key: string) => Record<string, string>;
  icon: string;
  keyPlaceholder: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  tier: "flash" | "standard" | "pro" | "flagship";
}

export interface SavedAIKey {
  id: string;
  provider: AIProvider;
  apiKey: string;           // stored locally only
  label: string;            // user-facing name ("My OpenAI Key")
  customBaseUrl?: string;   // for custom/ollama providers
  addedAt: string;
  lastValidated?: string;
  modelCount?: number;      // how many models were discovered
}

// ─── Book Types ─────────────────────────────────────────────────────────────

export type BookFormat = "txt" | "md" | "epub";

export interface Annotation {
  id: string;
  text: string;       // selected text
  note?: string;      // user's note
  start: number;      // char index in content
  end: number;
  color?: string;     // highlight color
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  content: string;          // raw text / markdown
  format: BookFormat;
  coverColor: string;       // hex for generated cover
  coverEmoji?: string;      // optional emoji on cover
  createdAt: string;
  updatedAt: string;
  progress: number;         // 0..1 reading progress
  scrollY?: number;         // last scroll position px
  annotations: Annotation[];
  isDraft: boolean;         // true if user-authored
}

export interface ReaderPrefs {
  fontSize: number;       // 14..28
  lineHeight: number;     // 1.4..2.2
  paperMode: boolean;     // light "paper" mode
  serif: boolean;         // serif vs sans
}
