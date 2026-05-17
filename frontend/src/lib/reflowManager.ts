/**
 * Reflow Manager — Atomic Chapter-Aware Repagination
 *
 * Port of Android's ReflowManager.kt (113 lines).
 * Handles the "cascade problem": when text is edited, deleted, or merged,
 * all pages from the edit point through the current chapter must be
 * repaginated and re-indexed in the database.
 *
 * Key guarantees:
 *   - Atomic: delete + re-insert wrapped in a single SQLite transaction
 *   - Chapter-aware: only reflows within the current chapter boundary
 *   - Index-safe: subsequent chapters are shifted, never corrupted
 *   - TOC-preserving: chapter titles survive reflow
 *
 * Usage:
 *   import { triggerReflow, mergeWithPrevious } from '../lib/reflowManager';
 *
 *   // After editing page content:
 *   const newCount = await triggerReflow(db, docId, editedPageIndex, width, height);
 *
 *   // After backspace at position 0:
 *   const newCount = await mergeWithPrevious(db, docId, currentIndex, width, height);
 */

import type { SQLiteDatabase } from "expo-sqlite";
import { chunksDao } from "./db";
import { paginate } from "./paginationEngine";
import type { DocumentChunk } from "./types";

// ─── Core Reflow ────────────────────────────────────────────────────────────

/**
 * Repaginate text from a given index forward through the current chapter.
 * Preserves chapter boundaries and atomically re-indexes the database.
 *
 * Android equivalent: ReflowManager.triggerGlobalReflow()
 *
 * @param db              - SQLite database handle
 * @param docId           - Document ID
 * @param startIndex      - Chunk index where the edit occurred
 * @param containerWidth  - Screen width for pagination
 * @param containerHeight - Screen height for pagination
 * @returns New total chunk count
 */
export async function triggerReflow(
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
    // Stop at the next chapter (but include the current chapter's start)
    if (chunk.chunkIndex > startIndex && chunk.title != null) break;
    reflowChunks.push(chunk);
  }

  if (reflowChunks.length === 0) {
    return chunksDao.getCount(db, docId);
  }

  // 3. Combine into a fluid text stream
  const fullText = reflowChunks.map((c) => c.cleanContent).join("");

  // 4. Identify the "tail" of the book (chapters after the reflow zone)
  const lastReflowIndex =
    reflowChunks[reflowChunks.length - 1]?.chunkIndex ?? -1;
  const subsequentChunks = allChunks.filter(
    (c) => c.chunkIndex > lastReflowIndex
  );

  if (fullText.trim().length === 0 && allChunks.length > 1) {
    // Empty page — delete it and shift remaining chunks down
    const shifted: Omit<DocumentChunk, "id">[] = subsequentChunks.map(
      (chunk, idx) => ({
        documentId: docId,
        chunkIndex: startIndex + idx,
        rawContent: chunk.rawContent,
        cleanContent: chunk.cleanContent,
        mappingJson: chunk.mappingJson ?? "{}",
        title: chunk.title,
        timestamp: chunk.timestamp,
      })
    );

    // Atomic: nuke from startIndex, re-insert shifted tail
    await chunksDao.atomicReplace(db, docId, startIndex, shifted);
  } else {
    // 5. Repaginate with hardware metrics
    const newPages = paginate(fullText, containerWidth, containerHeight);

    // 6. Build new chunk entities for the reflowed section
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

    // 7. Re-index subsequent chapters
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

    // 8. Atomic replace: delete from startIndex onward, insert new + shifted
    await chunksDao.atomicReplace(db, docId, startIndex, [
      ...newChunks,
      ...shiftedSubsequent,
    ]);
  }

  // 9. Return new total count for UI synchronization
  return chunksDao.getCount(db, docId);
}

// ─── Page Merge ─────────────────────────────────────────────────────────────

/**
 * Merge a page into the one before it and trigger reflow.
 * Called when the user presses backspace at position 0 of a page.
 *
 * Android equivalent: ReflowManager.mergeWithPrevious()
 *
 * @param db              - SQLite database handle
 * @param docId           - Document ID
 * @param currentIndex    - The page being merged (will be absorbed into currentIndex-1)
 * @param containerWidth  - Screen width for pagination
 * @param containerHeight - Screen height for pagination
 * @returns New total chunk count
 */
export async function mergeWithPrevious(
  db: SQLiteDatabase,
  docId: string,
  currentIndex: number,
  containerWidth: number,
  containerHeight: number
): Promise<number> {
  if (currentIndex <= 0) {
    return chunksDao.getCount(db, docId);
  }

  const prevChunk = await chunksDao.getChunk(db, docId, currentIndex - 1);
  const currChunk = await chunksDao.getChunk(db, docId, currentIndex);

  if (!prevChunk || !currChunk) {
    return chunksDao.getCount(db, docId);
  }

  // Merge text into the previous chunk
  const mergedText = prevChunk.cleanContent + "\n\n" + currChunk.cleanContent;
  await chunksDao.updateContent(db, docId, currentIndex - 1, mergedText);

  // Reflow from the merge target forward
  return triggerReflow(
    db,
    docId,
    currentIndex - 1,
    containerWidth,
    containerHeight
  );
}

// ─── TOC Rebuild ────────────────────────────────────────────────────────────

/**
 * Rebuild the Table of Contents from the database.
 * Queries only chunks with titles — lightweight compared to loading all chunks.
 *
 * @returns Array of { chunkIndex, title } entries
 */
export async function rebuildToc(
  db: SQLiteDatabase,
  docId: string
): Promise<Array<{ chunkIndex: number; title: string }>> {
  const tocChunks = await chunksDao.getTocEntries(db, docId);
  return tocChunks
    .filter((c) => c.title != null)
    .map((c) => ({
      chunkIndex: c.chunkIndex,
      title: c.title!,
    }));
}
