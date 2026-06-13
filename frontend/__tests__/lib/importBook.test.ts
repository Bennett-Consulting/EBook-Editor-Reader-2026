/**
 * Task 2 — import→save flow tests.
 *
 * Tests importEpubFromUri() from storage.ts directly — no component mounting needed.
 * Verifies: parseEpub called with URI, book saved to AsyncStorage, returned book
 * has correct title/author/format/content, and errors propagate correctly.
 */

// Mock epubParser before importing storage (dynamic import in importEpubFromUri)
jest.mock("../../src/lib/epubParser", () => ({
  parseEpub: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseEpub } from "../../src/lib/epubParser";
import { importEpubFromUri } from "../../src/lib/storage";

const mockParseEpub = parseEpub as jest.MockedFunction<typeof parseEpub>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;

const MOCK_PARSED = {
  title: "Pride and Prejudice",
  author: "Jane Austen",
  chapters: [
    { title: "Chapter I", content: "It is a truth universally acknowledged." },
    { title: "Chapter II", content: "Mr. Bennet was so odd a mixture." },
  ],
  content: "Chapter I\n\nIt is a truth universally acknowledged.\n\nChapter II\n\nMr. Bennet was so odd a mixture.",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParseEpub.mockResolvedValue(MOCK_PARSED);
  mockGetItem.mockResolvedValue(JSON.stringify([]));
});

describe("importEpubFromUri", () => {
  it("calls parseEpub with the provided URI", async () => {
    await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(mockParseEpub).toHaveBeenCalledWith("file:///cache/book.epub");
  });

  it("returns a book with correct title and author from parsed EPUB", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.title).toBe("Pride and Prejudice");
    expect(book.author).toBe("Jane Austen");
  });

  it("sets format to epub", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.format).toBe("epub");
  });

  it("stores the parsed content in the book", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.content).toContain("It is a truth universally acknowledged.");
  });

  it("uses the provided coverColor", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#AABBCC");
    expect(book.coverColor).toBe("#AABBCC");
  });

  it("saves the book to AsyncStorage", async () => {
    await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(mockSetItem).toHaveBeenCalledWith(
      "@ebook/books",
      expect.stringContaining("Pride and Prejudice")
    );
  });

  it("falls back to filename as title when parsed title is empty", async () => {
    mockParseEpub.mockResolvedValue({ ...MOCK_PARSED, title: "" });
    const book = await importEpubFromUri("file:///cache/my-story.epub", "my-story.epub", "#FFB000");
    expect(book.title).toBe("my-story");
  });

  it("uses Imported as author fallback when parsed author is empty", async () => {
    mockParseEpub.mockResolvedValue({ ...MOCK_PARSED, author: "" });
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.author).toBe("Imported");
  });

  it("throws when EPUB content is empty after sanitization", async () => {
    mockParseEpub.mockResolvedValue({ ...MOCK_PARSED, content: "   " });
    await expect(
      importEpubFromUri("file:///cache/empty.epub", "empty.epub", "#FFB000")
    ).rejects.toThrow("empty");
  });

  it("propagates parseEpub errors to the caller", async () => {
    mockParseEpub.mockRejectedValue(new Error("Invalid EPUB: missing META-INF/container.xml"));
    await expect(
      importEpubFromUri("file:///cache/bad.epub", "bad.epub", "#FFB000")
    ).rejects.toThrow("Invalid EPUB");
  });

  it("sets isDraft to false for imported books", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.isDraft).toBe(false);
  });

  it("sets initial progress to 0", async () => {
    const book = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    expect(book.progress).toBe(0);
  });

  it("returns a book with a unique id", async () => {
    const a = await importEpubFromUri("file:///cache/book.epub", "book.epub", "#FFB000");
    mockGetItem.mockResolvedValue(JSON.stringify([a]));
    const b = await importEpubFromUri("file:///cache/book2.epub", "book2.epub", "#FFB000");
    expect(a.id).not.toBe(b.id);
  });
});
