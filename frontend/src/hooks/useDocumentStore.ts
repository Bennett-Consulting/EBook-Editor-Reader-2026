/**
 * Document Store — Reactive State for the Page Engine
 *
 * Port of Android's DashboardViewModel.kt (page-related state & logic).
 * Manages the sliding window of document chunks, pagination, reflow,
 * and page-merge operations.
 *
 * Uses React hooks + refs for state management — no external deps.
 * All database operations go through the DAOs in db.ts.
 * Reflow logic is delegated to reflowManager.ts for atomic safety.
 *
 * Key concepts preserved from Android:
 *   - Sliding window: only [center-5 .. center+10] chunks in memory
 *   - Debounced persistence: edits saved after 500ms idle
 *   - Atomic reflow: edit → debounce → save → repaginate affected section
 *   - Page merge: backspace at start of page → merge with previous
 */

import { useCallback, useRef, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import { chunksDao } from "../lib/db";
import { paginate } from "../lib/paginationEngine";
import { triggerReflow, mergeWithPrevious, rebuildToc } from "../lib/reflowManager";
import type { DocumentChunk } from "../lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TocEntry {
  chunkIndex: number;
  title: string;
}

export interface DocumentStoreState {
  /** Currently loaded chunks (sliding window around currentIndex) */
  chunkWindow: DocumentChunk[];
  /** Total number of pages in the document */
  totalChunkCount: number;
  /** Currently viewed page index (0-based) */
  currentIndex: number;
  /** True while importing + paginating a document */
  isDocumentLoading: boolean;
  /** Active document ID (URI string) */
  currentDocumentId: string | null;
  /** Table of contents (chapter-start chunks) */
  tocEntries: TocEntry[];
  /** Screen dimensions for pagination (set by layout measurement) */
  screenWidth: number;
  screenHeight: number;
  /** Debug/status string for development */
  debugStats: string;
}

export interface DocumentStoreActions {
  /**
   * Set screen dimensions. Call from the container's onLayout.
   */
  setScreenMetrics: (width: number, height: number) => void;

  /**
   * Finalize pagination: save chunks to DB and set up the reading view.
   * Called after EPUB import + paginate().
   *
   * Android equivalent: DashboardViewModel.finalizePagination()
   */
  finalizePagination: (
    db: SQLiteDatabase,
    documentId: string,
    chapters: Array<{ title: string | null; content: string }>
  ) => Promise<void>;

  /**
   * Load a window of chunks around the given center index.
   * The window covers [center-5 .. center+10] — 16 pages max.
   *
   * Android equivalent: DashboardViewModel.loadWindow()
   */
  loadWindow: (db: SQLiteDatabase, centerIndex: number) => Promise<void>;

  /**
   * Update a chunk's content (from user typing). Debounced to 500ms.
   * Immediately updates the in-memory window, then persists + reflows.
   *
   * Android equivalent: DashboardViewModel.updateChunkContent()
   */
  updateChunkContent: (
    db: SQLiteDatabase,
    index: number,
    newContent: string
  ) => void;

  /**
   * Merge current page into previous (backspace at position 0).
   * Combines text, repaginates from the merge point forward.
   *
   * Android equivalent: ReflowManager.mergeWithPrevious()
   */
  mergeWithPreviousPage: (
    db: SQLiteDatabase,
    currentIndex: number
  ) => Promise<void>;

  /**
   * Delete a page and reflow the document from that point forward.
   * Removes the page content and re-indexes subsequent pages.
   */
  deletePage: (db: SQLiteDatabase, index: number) => Promise<void>;

  /**
   * Navigate to a specific page (e.g., from TOC).
   */
  goToPage: (db: SQLiteDatabase, index: number) => Promise<void>;

  /**
   * Clear all state (when closing a document).
   */
  reset: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useDocumentStore(): DocumentStoreState & DocumentStoreActions {
  // --- State ---
  const [chunkWindow, setChunkWindow] = useState<DocumentChunk[]>([]);
  const [totalChunkCount, setTotalChunkCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(
    null
  );
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [screenWidth, setScreenWidth] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const [debugStats, setDebugStats] = useState("");

  // --- Refs for debouncing & cancellation ---
  const reflowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef({ width: 0, height: 0 });

  // ─── setScreenMetrics ─────────────────────────────────────────────────

  const setScreenMetrics = useCallback((width: number, height: number) => {
    screenRef.current = { width, height };
    setScreenWidth(width);
    setScreenHeight(height);
  }, []);

  // ─── loadWindow ───────────────────────────────────────────────────────

  const loadWindow = useCallback(
    async (db: SQLiteDatabase, centerIndex: number) => {
      const docId = currentDocumentId;
      if (!docId) return;

      setCurrentIndex(centerIndex);

      const newChunks = await chunksDao.loadWindow(db, docId, centerIndex);

      setChunkWindow((prev) => {
        // Atomic swap: add new chunks that aren't already in window
        const existingIndices = new Set(prev.map((c) => c.chunkIndex));
        const merged = [...prev];

        for (const chunk of newChunks) {
          if (!existingIndices.has(chunk.chunkIndex)) {
            merged.push(chunk);
          } else {
            // Update existing chunk content if it changed in DB
            const idx = merged.findIndex(
              (c) => c.chunkIndex === chunk.chunkIndex
            );
            if (idx !== -1) {
              merged[idx] = chunk;
            }
          }
        }

        // Trim window to keep memory bounded (keep ±15 around center)
        return merged.filter(
          (c) =>
            c.chunkIndex >= centerIndex - 15 &&
            c.chunkIndex <= centerIndex + 15
        );
      });
    },
    [currentDocumentId]
  );

  // ─── refreshAfterReflow ───────────────────────────────────────────────

  const refreshAfterReflow = useCallback(
    async (db: SQLiteDatabase, docId: string, focusIndex: number) => {
      // Reload window from DB
      const updatedWindow = await chunksDao.loadWindow(db, docId, focusIndex);
      setChunkWindow(updatedWindow);

      // Rebuild TOC (lightweight — only queries titled chunks)
      const toc = await rebuildToc(db, docId);
      setTocEntries(toc);
    },
    []
  );

  // ─── finalizePagination ───────────────────────────────────────────────

  const finalizePagination = useCallback(
    async (
      db: SQLiteDatabase,
      documentId: string,
      chapters: Array<{ title: string | null; content: string }>
    ) => {
      setIsDocumentLoading(true);
      setCurrentDocumentId(documentId);

      const { width, height } = screenRef.current;
      if (width === 0 || height === 0) {
        console.warn(
          "[PageEngine] Screen metrics not set — call setScreenMetrics first"
        );
        setIsDocumentLoading(false);
        return;
      }

      // Paginate all chapters into chunks
      const chunks: Omit<DocumentChunk, "id">[] = [];
      const toc: TocEntry[] = [];
      let globalIndex = 0;

      for (const chapter of chapters) {
        const pages = paginate(chapter.content, width, height);

        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const isChapterStart = pageIndex === 0 && chapter.title != null;

          if (isChapterStart) {
            toc.push({ chunkIndex: globalIndex, title: chapter.title! });
          }

          chunks.push({
            documentId,
            chunkIndex: globalIndex,
            rawContent: pages[pageIndex],
            cleanContent: pages[pageIndex],
            mappingJson: "{}",
            title: isChapterStart ? chapter.title : null,
            timestamp: Date.now(),
          });

          globalIndex++;
        }
      }

      // Persist to SQLite (atomic — wrapped in transaction by bulkInsert)
      await chunksDao.bulkInsert(db, documentId, chunks);

      // Update state
      setTotalChunkCount(chunks.length);
      setTocEntries(toc);
      setDebugStats(
        `DOCUMENT SYNCHRONIZED\nCHUNKS: ${chunks.length}\nCHAPTERS: ${toc.length}`
      );

      // Load initial window
      setCurrentDocumentId(documentId);
      const initialWindow = await chunksDao.loadWindow(db, documentId, 0);
      setChunkWindow(initialWindow);
      setCurrentIndex(0);
      setIsDocumentLoading(false);
    },
    []
  );

  // ─── updateChunkContent ───────────────────────────────────────────────

  const updateChunkContent = useCallback(
    (db: SQLiteDatabase, index: number, newContent: string) => {
      // 1. Immediately update in-memory window (responsive UI)
      setChunkWindow((prev) =>
        prev.map((c) =>
          c.chunkIndex === index ? { ...c, cleanContent: newContent } : c
        )
      );

      // 2. Debounce persistence + reflow (500ms — matches Android)
      if (reflowTimer.current) {
        clearTimeout(reflowTimer.current);
      }

      reflowTimer.current = setTimeout(async () => {
        const docId = currentDocumentId;
        if (!docId) return;

        // Persist the edit
        await chunksDao.updateContent(db, docId, index, newContent);

        // Trigger reflow from the edited page forward
        const { width, height } = screenRef.current;
        if (width > 0 && height > 0) {
          const newCount = await triggerReflow(
            db,
            docId,
            index,
            width,
            height
          );
          setTotalChunkCount(newCount);
          await refreshAfterReflow(db, docId, index);
        }
      }, 500);
    },
    [currentDocumentId, refreshAfterReflow]
  );

  // ─── mergeWithPreviousPage ────────────────────────────────────────────

  const mergeWithPreviousPage = useCallback(
    async (db: SQLiteDatabase, currentIdx: number) => {
      if (currentIdx <= 0) return;
      const docId = currentDocumentId;
      if (!docId) return;

      const { width, height } = screenRef.current;
      if (width === 0 || height === 0) return;

      const newCount = await mergeWithPrevious(
        db,
        docId,
        currentIdx,
        width,
        height
      );
      setTotalChunkCount(newCount);

      // Navigate to the merge target and refresh
      setCurrentIndex(currentIdx - 1);
      await refreshAfterReflow(db, docId, currentIdx - 1);
    },
    [currentDocumentId, refreshAfterReflow]
  );

  // ─── deletePage ───────────────────────────────────────────────────────

  const deletePage = useCallback(
    async (db: SQLiteDatabase, index: number) => {
      const docId = currentDocumentId;
      if (!docId) return;

      const { width, height } = screenRef.current;
      if (width === 0 || height === 0) return;

      // Clear the page content and let reflow handle the cascade
      await chunksDao.updateContent(db, docId, index, "");

      const newCount = await triggerReflow(db, docId, index, width, height);
      setTotalChunkCount(newCount);

      // Stay at the same index (or go to last page if we were at the end)
      const safeIndex = Math.min(index, newCount - 1);
      setCurrentIndex(Math.max(0, safeIndex));
      await refreshAfterReflow(db, docId, Math.max(0, safeIndex));
    },
    [currentDocumentId, refreshAfterReflow]
  );

  // ─── goToPage ─────────────────────────────────────────────────────────

  const goToPage = useCallback(
    async (db: SQLiteDatabase, index: number) => {
      const docId = currentDocumentId;
      if (!docId) return;

      setCurrentIndex(index);
      const window = await chunksDao.loadWindow(db, docId, index);
      setChunkWindow(window);
    },
    [currentDocumentId]
  );

  // ─── reset ────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    if (reflowTimer.current) clearTimeout(reflowTimer.current);
    setChunkWindow([]);
    setTotalChunkCount(0);
    setCurrentIndex(0);
    setIsDocumentLoading(false);
    setCurrentDocumentId(null);
    setTocEntries([]);
    setDebugStats("");
  }, []);

  // ─── Return ───────────────────────────────────────────────────────────

  return {
    // State
    chunkWindow,
    totalChunkCount,
    currentIndex,
    isDocumentLoading,
    currentDocumentId,
    tocEntries,
    screenWidth,
    screenHeight,
    debugStats,
    // Actions
    setScreenMetrics,
    finalizePagination,
    loadWindow,
    updateChunkContent,
    mergeWithPreviousPage,
    deletePage,
    goToPage,
    reset,
  };
}
