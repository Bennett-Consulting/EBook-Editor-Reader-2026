import AsyncStorage from "@react-native-async-storage/async-storage";
import { Book, ReaderPrefs } from "./types";

const BOOKS_KEY = "@ebook/books";
const PREFS_KEY = "@ebook/prefs";

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
