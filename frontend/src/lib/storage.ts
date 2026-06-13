import AsyncStorage from "@react-native-async-storage/async-storage";
import { Book, ReaderPrefs, SavedAIKey } from "./types";

const BOOKS_KEY = "@ebook/books";
const PREFS_KEY = "@ebook/prefs";
const AI_KEYS_KEY = "@ebook/ai-keys";
const ACTIVE_KEY_KEY = "@ebook/active-ai-key";

export const defaultPrefs: ReaderPrefs = {
  fontSize: 18,
  lineHeight: 1.7,
  paperMode: false,
  serif: true,
};

export async function getBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(BOOKS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Book[];
    return list.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function getBook(id: string): Promise<Book | null> {
  const books = await getBooks();
  return books.find((b) => b.id === id) ?? null;
}

export async function saveBook(book: Book): Promise<void> {
  const books = await getBooks();
  const idx = books.findIndex((b) => b.id === book.id);
  const next = { ...book, updatedAt: new Date().toISOString() };
  if (idx >= 0) books[idx] = next;
  else books.unshift(next);
  await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

export async function deleteBook(id: string): Promise<void> {
  const books = await getBooks();
  const next = books.filter((b) => b.id !== id);
  await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(next));
}

export async function getPrefs(): Promise<ReaderPrefs> {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  if (!raw) return defaultPrefs;
  try {
    return { ...defaultPrefs, ...(JSON.parse(raw) as ReaderPrefs) };
  } catch {
    return defaultPrefs;
  }
}

export async function savePrefs(p: ReaderPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

// ─── AI Key Storage ─────────────────────────────────────────────────────────

export async function getAIKeys(): Promise<SavedAIKey[]> {
  const raw = await AsyncStorage.getItem(AI_KEYS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedAIKey[];
  } catch {
    return [];
  }
}

export async function saveAIKey(key: SavedAIKey): Promise<void> {
  const keys = await getAIKeys();
  const idx = keys.findIndex((k) => k.id === key.id);
  if (idx >= 0) keys[idx] = key;
  else keys.push(key);
  await AsyncStorage.setItem(AI_KEYS_KEY, JSON.stringify(keys));
}

export async function deleteAIKey(id: string): Promise<void> {
  const keys = await getAIKeys();
  const next = keys.filter((k) => k.id !== id);
  await AsyncStorage.setItem(AI_KEYS_KEY, JSON.stringify(next));
  // If this was the active key, clear it
  const active = await getActiveAIKeyId();
  if (active === id) {
    await AsyncStorage.removeItem(ACTIVE_KEY_KEY);
  }
}

export async function getActiveAIKeyId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY_KEY);
}

export async function setActiveAIKeyId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY_KEY, id);
}

/** Get the currently active AI key config, or null if none set. */
export async function getActiveAIKey(): Promise<SavedAIKey | null> {
  const activeId = await getActiveAIKeyId();
  if (!activeId) return null;
  const keys = await getAIKeys();
  return keys.find((k) => k.id === activeId) ?? null;
}

// ─── EPUB Import ─────────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeContent(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F﻿]/g, "")
    .trim();
}

/**
 * Parse an EPUB at the given URI, build a Book, save it, and return it.
 * Extracted here so the full import→save flow is testable without mounting a component.
 */
export async function importEpubFromUri(
  uri: string,
  filename: string,
  coverColor: string
): Promise<Book> {
  const { parseEpub } = await import("./epubParser");
  const parsed = await parseEpub(uri);

  const content = sanitizeContent(parsed.content);
  if (!content) throw new Error("This EPUB appears to be empty.");

  const title =
    parsed.title ||
    filename.replace(/\.epub$/i, "").slice(0, 80) ||
    "Untitled";

  const book: Book = {
    id: makeId(),
    title,
    author: parsed.author || "Imported",
    content,
    format: "epub",
    coverColor,
    coverEmoji: "📚",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    annotations: [],
    isDraft: false,
  };

  await saveBook(book);
  return book;
}
