/**
 * usePersistence — Auto-save editor state with debounce
 *
 * Bug fix: Previously fired persist on initial load (useEffect triggered
 * when book first loaded, causing unnecessary updatedAt bump).
 *
 * Now skips the first render cycle using a ready flag.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Book } from "../../lib/types";
import { getBook, saveBook } from "../../lib/storage";

const SAVE_DELAY_MS = 400;

interface EditorFields {
  title: string;
  author: string;
  content: string;
  coverColor: string;
}

export function usePersistence(bookId: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [fields, setFields] = useState<EditorFields>({
    title: "",
    author: "",
    content: "",
    coverColor: "",
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReady = useRef(false); // Guard: skip persist on initial load

  // ── Load book ──────────────────────────────────────────────────────────

  useEffect(() => {
    isReady.current = false;
    (async () => {
      const b = await getBook(bookId);
      if (b) {
        setBook(b);
        setFields({
          title: b.title,
          author: b.author,
          content: b.content,
          coverColor: b.coverColor,
        });
        // Mark ready after next tick so the initial setFields doesn't trigger save
        setTimeout(() => {
          isReady.current = true;
        }, 50);
      }
    })();
  }, [bookId]);

  // ── Auto-save on field changes ─────────────────────────────────────────

  useEffect(() => {
    if (!book || !isReady.current) return;

    const merged: Book = {
      ...book,
      title: fields.title,
      author: fields.author,
      content: fields.content,
      coverColor: fields.coverColor,
      updatedAt: new Date().toISOString(),
    };
    setBook(merged);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveBook(merged), SAVE_DELAY_MS);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.title, fields.author, fields.content, fields.coverColor]);

  // ── Field setters ──────────────────────────────────────────────────────

  const setTitle = useCallback((title: string) => {
    setFields((f) => ({ ...f, title }));
  }, []);

  const setAuthor = useCallback((author: string) => {
    setFields((f) => ({ ...f, author }));
  }, []);

  const setContent = useCallback((content: string) => {
    setFields((f) => ({ ...f, content }));
  }, []);

  const setCoverColor = useCallback((coverColor: string) => {
    setFields((f) => ({ ...f, coverColor }));
  }, []);

  return {
    book,
    setBook,
    title: fields.title,
    author: fields.author,
    content: fields.content,
    coverColor: fields.coverColor,
    setTitle,
    setAuthor,
    setContent,
    setCoverColor,
  };
}
