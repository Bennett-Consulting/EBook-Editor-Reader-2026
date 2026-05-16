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
