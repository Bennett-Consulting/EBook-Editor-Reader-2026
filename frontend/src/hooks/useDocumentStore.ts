/**
 * Document Store — Reactive State for the Page Engine
 *
 * Port of Android's DashboardViewModel.kt (page-related state & logic).
 * Manages the sliding window of document chunks, pagination, reflow,
 * and page-merge operations.
 *
 * Uses React hooks + refs for state management — no external deps.
 * All database operations go through the DAOs in db.ts.
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

      // Persist to SQLite
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
          const newCount = await triggerReflow(db, docId, index, width, height);
          setTotalChunkCount(newCount);

          // Reload window to pick up any reflow changes
          const updatedWindow = await chunksDao.loadWindow(db, docId, index);
          setChunkWindow(updatedWindow);
        }
      }, 500);
    },
    [currentDocumentId]
  );

  // ─── mergeWithPreviousPage ────────────────────────────────────────────

  const mergeWithPreviousPage = useCallback(
    async (db: SQLiteDatabase, currentIdx: number) => {
      if (currentIdx <= 0) return;
      const docId = currentDocumentId;
      if (!docId) return;

      const { width, height } = screenRef.current;

      // Get both chunks
      const prevChunk = await chunksDao.getChunk(db, docId, currentIdx - 1);
      const currChunk = await chunksDao.getChunk(db, docId, currentIdx);

      if (!prevChunk || !currChunk) return;

      // Merge text
      const mergedText =
        prevChunk.cleanContent + "\n\n" + currChunk.cleanContent;

      // Update the previous chunk with merged content
      await chunksDao.updateContent(db, docId, currentIdx - 1, mergedText);

      // Reflow from the merge point
      if (width > 0 && height > 0) {
        const newCount = await triggerReflow(
          db,
          docId,
          currentIdx - 1,
          width,
          height
        );
        setTotalChunkCount(newCount);
      }

      // Navigate to the merge target
      const updatedWindow = await chunksDao.loadWindow(
        db,
        docId,
        currentIdx - 1
      );
      setChunkWindow(updatedWindow);
      setCurrentIndex(currentIdx - 1);
    },
    [currentDocumentId]
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
    goToPage,
    reset,
  };
}

// ─── Reflow Engine ──────────────────────────────────────────────────────────
// Port of Android's ReflowManager.triggerGlobalReflow()

/**
 * Repaginate text from a given index forward through the current chapter.
 * Preserves chapter boundaries and atomically re-indexes the database.
 *
 * @returns New total chunk count.
 */
async function triggerReflow(
  db: SQLiteDatabase,
  docId: string,
  startIndex: number,
  containerWidth: number,
  containerHeight: number
): Promise<number> {
  // 1. Get all chunks to understand the full document structure
  const allChunks = await chunksDao.getAllForDocument(db, docId);

  // 2. Find the reflow stream: from startIndex to next chapter boundary
  const reflowChunks: DocumentChunk[] = [];
  for (const chunk of allChunks.filter((c) => c.chunkIndex >= startIndex)) {
    if (chunk.chunkIndex > startIndex && chunk.title != null) break;
    reflowChunks.push(chunk);
  }

  // 3. Combine into a fluid text stream
  const fullText = reflowChunks.map((c) => c.cleanContent).join("");

  if (fullText.trim().length === 0 && allChunks.length > 1) {
    // Empty page — delete it and shift remaining chunks down
    await chunksDao.deleteAllFollowing(db, docId, startIndex);

    const lastReflowIndex = reflowChunks[reflowChunks.length - 1]?.chunkIndex ?? -1;
    const remaining = allChunks.filter((c) => c.chunkIndex > lastReflowIndex);

    // Re-insert remaining with corrected indices
    const shifted: Omit<DocumentChunk, "id">[] = remaining.map(
      (chunk, idx) => ({
        documentId: docId,
        chunkIndex: startIndex + idx,
        rawContent: chunk.rawContent,
        cleanContent: chunk.cleanContent,
        mappingJson: chunk.mappingJson ?? "{}",
        title: chunk.title,
        timestamp: Date.now(),
      })
    );

    if (shifted.length > 0) {
      await chunksDao.bulkInsert(db, docId, [
        // Keep chunks before startIndex
        ...allChunks
          .filter((c) => c.chunkIndex < startIndex)
          .map((c) => ({
            documentId: c.documentId,
            chunkIndex: c.chunkIndex,
            rawContent: c.rawContent,
            cleanContent: c.cleanContent,
            mappingJson: c.mappingJson ?? "{}",
            title: c.title,
            timestamp: c.timestamp,
          })),
        ...shifted,
      ]);
    }
  } else {
    // 4. Repaginate with hardware metrics
    const newPages = paginate(fullText, containerWidth, containerHeight);

    // 5. Build new chunk entities
    const chapterTitle = reflowChunks[0]?.title ?? null;
    const newChunks: Omit<DocumentChunk, "id">[] = newPages.map(
      (text, idx) => ({
        documentId: docId,
        chunkIndex: startIndex + idx,
        rawContent: text,
        cleanContent: text,
        mappingJson: "{}",
        title: idx === 0 ? chapterTitle : null,
        timestamp: Date.now(),
      })
    );

    // 6. Collect chunks after the reflow zone, re-indexed
    const lastReflowIndex =
      reflowChunks[reflowChunks.length - 1]?.chunkIndex ?? -1;
    const subsequentChunks = allChunks.filter(
      (c) => c.chunkIndex > lastReflowIndex
    );
    const indexOffset = newPages.length - reflowChunks.length;
    const shiftedSubsequent: Omit<DocumentChunk, "id">[] =
      subsequentChunks.map((c) => ({
        documentId: c.documentId,
        chunkIndex: c.chunkIndex + indexOffset,
        rawContent: c.rawContent,
        cleanContent: c.cleanContent,
        mappingJson: c.mappingJson ?? "{}",
        title: c.title,
        timestamp: c.timestamp,
      }));

    // 7. Atomic replace: nuke from startIndex → rebuild
    const chunksBeforeReflow = allChunks
      .filter((c) => c.chunkIndex < startIndex)
      .map((c) => ({
        documentId: c.documentId,
        chunkIndex: c.chunkIndex,
        rawContent: c.rawContent,
        cleanContent: c.cleanContent,
        mappingJson: c.mappingJson ?? "{}",
        title: c.title,
        timestamp: c.timestamp,
      }));

    await chunksDao.bulkInsert(db, docId, [
      ...chunksBeforeReflow,
      ...newChunks,
      ...shiftedSubsequent,
    ]);
  }

  // 8. Return new total count
  return chunksDao.getCount(db, docId);
}
