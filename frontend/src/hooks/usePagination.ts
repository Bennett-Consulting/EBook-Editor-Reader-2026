/**
 * usePagination — reusable pagination hook for long text documents.
 *
 * Portable: zero app-level dependencies. All app-specific logic (save,
 * clear layout caches, etc.) is delegated back to the caller via callbacks.
 *
 * Pure helpers (splitPageText, computePageParaOffset) are exported separately
 * so callers can compute paragraph-level state without the hook, and so they
 * can be unit-tested in a node environment without a React renderer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView } from "react-native";
import {
  paginate,
  clampPageIndex,
  PaginationConfig,
} from "../lib/paginationEngine";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Books at or below this character count are displayed as a single scroll. */
export const PAGINATION_THRESHOLD = 50_000;

// ─── Pure helpers (exported for use outside the hook and for testing) ─────────

/**
 * Split a page's raw text into display paragraphs using the standard split
 * pattern (double newline). Trims each paragraph, drops blanks.
 */
export function splitPageText(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Count how many global paragraphs come before the given page.
 * Used to map a page-local paragraph index back to its global index in the
 * full book — required for annotation and highlight lookups.
 */
export function computePageParaOffset(
  pages: string[],
  currentPage: number
): number {
  let count = 0;
  for (let i = 0; i < currentPage; i++) {
    count += splitPageText(pages[i] ?? "").length;
  }
  return count;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsePaginationOptions {
  /** Height of toolbars/chrome to subtract from screen height (default 120). */
  chromeHeight?: number;
  /** Saved page index to restore on initial load (e.g. from Book.scrollY). */
  savedPageIndex?: number;
  /**
   * Called after every successful page navigation.
   * Receives the new 0-based page index and the new progress fraction (0..1).
   * Use this to persist the page index to storage.
   */
  onPageChange?: (pageIndex: number, progress: number) => void;
  /**
   * Called just before the current page changes — use to clear any layout
   * caches that are indexed by paragraph position (e.g. paraOffsetsRef).
   */
  onPageWillChange?: () => void;
  /** Override paginationEngine defaults (font size, family, padding). */
  paginationConfig?: Partial<PaginationConfig>;
}

export interface UsePaginationResult {
  /**
   * Array of page strings produced by paginate().
   * Null when the book is at or below PAGINATION_THRESHOLD (scroll mode).
   */
  pages: string[] | null;
  /** 0-based index of the currently displayed page. */
  currentPage: number;
  /**
   * Text of the current page. For short books (pages === null) this is the
   * full book content, matching the behaviour of the plain scroll view.
   */
  currentPageText: string;
  /** Navigate to a page by 0-based index. No-ops if out of range. */
  goToPage: (idx: number) => void;
  /** Ref to pass to the ScrollView so goToPage can scroll it back to the top. */
  scrollRef: React.RefObject<ScrollView>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePagination(
  content: string,
  screenW: number,
  screenH: number,
  options: UsePaginationOptions = {}
): UsePaginationResult {
  const {
    chromeHeight = 120,
    savedPageIndex = 0,
    onPageChange,
    onPageWillChange,
    paginationConfig,
  } = options;

  const [pages, setPages] = useState<string[] | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Re-paginate whenever the content or screen dimensions change.
  // savedPageIndex is intentionally NOT in the dep array — it should only
  // influence the starting position on first paginate, not trigger a reset
  // every time the user navigates (which updates book.scrollY each page turn).
  useEffect(() => {
    if (!content || content.length <= PAGINATION_THRESHOLD) {
      setPages(null);
      setCurrentPage(0);
      return;
    }
    const pg = paginate(content, screenW, screenH - chromeHeight, paginationConfig);
    setPages(pg);
    // savedPageIndex is read from the closure at the time this effect fires.
    // Since the effect fires when content changes (i.e. a new book loaded),
    // the closure captures the correct savedPageIndex for that book.
    setCurrentPage(clampPageIndex(savedPageIndex, pg.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, screenW, screenH, chromeHeight]);

  const goToPage = useCallback(
    (idx: number) => {
      if (!pages || idx < 0 || idx >= pages.length) return;
      onPageWillChange?.();
      setCurrentPage(idx);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      onPageChange?.(idx, (idx + 1) / pages.length);
    },
    [pages, onPageChange, onPageWillChange]
  );

  const currentPageText = pages ? (pages[currentPage] ?? "") : content;

  return { pages, currentPage, currentPageText, goToPage, scrollRef };
}
