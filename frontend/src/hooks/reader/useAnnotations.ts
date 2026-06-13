/**
 * useAnnotations — Highlight & note management for the reader
 *
 * Bug fix: Previously matched annotations by full paragraph text
 * (a.text === paraText), which broke on duplicate paragraphs —
 * both would show as highlighted when only one was annotated.
 *
 * Now uses paragraph *index* as the primary identifier, with text
 * as a fallback for legacy annotations that don't have an index.
 * Also uses index-based content lookup instead of indexOf() which
 * always finds the first occurrence.
 */

import { useCallback } from "react";
import { Annotation, Book } from "../../lib/types";
import { saveBook } from "../../lib/storage";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAnnotations(
  book: Book | null,
  setBook: React.Dispatch<React.SetStateAction<Book | null>>,
  paragraphs: string[]
) {
  /**
   * Check if a paragraph at a given index is highlighted.
   * Falls back to text matching for legacy annotations without paraIndex.
   */
  const isHighlighted = useCallback(
    (paraIndex: number, paraText: string): boolean => {
      if (!book) return false;
      return book.annotations.some(
        (a) =>
          (a.paraIndex !== undefined && a.paraIndex === paraIndex) ||
          (a.paraIndex === undefined && a.text === paraText)
      );
    },
    [book]
  );

  /**
   * Get the annotation for a paragraph, if any.
   */
  const annotationFor = useCallback(
    (paraIndex: number, paraText: string): Annotation | undefined => {
      if (!book) return undefined;
      return book.annotations.find(
        (a) =>
          (a.paraIndex !== undefined && a.paraIndex === paraIndex) ||
          (a.paraIndex === undefined && a.text === paraText)
      );
    },
    [book]
  );

  /**
   * Add a highlight/note annotation for a paragraph.
   */
  const addAnnotation = useCallback(
    async (paraIndex: number, paraText: string, note?: string) => {
      if (!book) return;

      // Calculate start/end from paragraph offsets in full content
      // Use paragraph index to find the correct occurrence
      let charOffset = 0;
      const blocks = book.content.split(/\n\s*\n/);
      for (let i = 0; i < Math.min(paraIndex, blocks.length); i++) {
        charOffset += blocks[i].length + 2; // +2 for the \n\n separator
      }
      const start = charOffset;
      const end = start + paraText.length;

      const ann: Annotation = {
        id: makeId(),
        text: paraText,
        paraIndex,
        note: note?.trim() || undefined,
        start,
        end,
        color: "#FFB000", // theme.brand
        createdAt: new Date().toISOString(),
      };

      const next = { ...book, annotations: [...book.annotations, ann] };
      setBook(next);
      await saveBook(next);
    },
    [book, setBook]
  );

  /**
   * Remove an annotation by ID.
   */
  const removeAnnotation = useCallback(
    async (annId: string) => {
      if (!book) return;
      const next = {
        ...book,
        annotations: book.annotations.filter((a) => a.id !== annId),
      };
      setBook(next);
      await saveBook(next);
    },
    [book, setBook]
  );

  /**
   * Toggle a quick bookmark at a paragraph index.
   */
  const toggleBookmark = useCallback(
    async (paraIndex: number) => {
      if (!book || paragraphs.length === 0) return;
      const paraText = paragraphs[paraIndex];
      if (!paraText) return;

      const existing = annotationFor(paraIndex, paraText);
      if (existing) {
        await removeAnnotation(existing.id);
      } else {
        await addAnnotation(paraIndex, paraText, "📌 Bookmark");
      }
    },
    [book, paragraphs, annotationFor, removeAnnotation, addAnnotation]
  );

  return {
    isHighlighted,
    annotationFor,
    addAnnotation,
    removeAnnotation,
    toggleBookmark,
  };
}
