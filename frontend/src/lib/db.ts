/**
 * SQLite Data Layer — Chunked Document Storage
 *
 * Replaces the flat AsyncStorage blob for document content with a proper
 * relational database. Mirrors the Android Room schema from Build 7.3.0:
 *
 *   document_chunks  — paginated content, one row per page
 *   annotations      — highlights & notes tied to chunk index
 *   edit_history     — every AI or manual edit, for undo & audit
 *   voice_notes      — voice command transcripts & AI suggestions
 *
 * Usage:
 *   Wrap your app with <SQLiteProvider databaseName="ebook.db" onInit={initDatabase}>
 *   Inside components: const db = useSQLiteContext();
 *   Then call any DAO function: await chunksDao.loadWindow(db, docId, center);
 */

import type { SQLiteDatabase } from "expo-sqlite";
import {
  DocumentChunk,
  AnnotationEntry,
  EditHistoryEntry,
  VoiceNoteEntry,
} from "./types";

// ─── Schema & Migrations ────────────────────────────────────────────────────

const DATABASE_VERSION = 1;

/**
 * Initialize the database schema. Pass this as the `onInit` prop to SQLiteProvider.
 */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE IF NOT EXISTS document_chunks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id   TEXT    NOT NULL,
        chunk_index   INTEGER NOT NULL,
        raw_content   TEXT    NOT NULL,
        clean_content TEXT    NOT NULL,
        mapping_json  TEXT    DEFAULT '{}',
        title         TEXT,
        timestamp     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc
        ON document_chunks(document_id, chunk_index);

      CREATE TABLE IF NOT EXISTS annotations (
        id            TEXT    PRIMARY KEY NOT NULL,
        document_id   TEXT    NOT NULL,
        chunk_index   INTEGER NOT NULL,
        offset        INTEGER DEFAULT 0,
        length        INTEGER DEFAULT 0,
        note          TEXT,
        timestamp     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ann_doc
        ON annotations(document_id);

      CREATE TABLE IF NOT EXISTS edit_history (
        id            TEXT    PRIMARY KEY NOT NULL,
        document_id   TEXT    NOT NULL,
        chunk_index   INTEGER NOT NULL,
        original_text TEXT    NOT NULL,
        updated_text  TEXT    NOT NULL,
        rationale     TEXT,
        timestamp     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_edits_doc
        ON edit_history(document_id, timestamp);

      CREATE TABLE IF NOT EXISTS voice_notes (
        id            TEXT    PRIMARY KEY NOT NULL,
        document_id   TEXT    NOT NULL,
        chunk_index   INTEGER NOT NULL,
        transcript    TEXT    NOT NULL,
        ai_suggestion TEXT,
        is_applied    INTEGER DEFAULT 0,
        timestamp     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vnotes_doc
        ON voice_notes(document_id);
    `);
  }

  // Future migrations: if (currentVersion === 1) { ... currentVersion = 2; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// ─── Document Chunks DAO ────────────────────────────────────────────────────

export const chunksDao = {
  /**
   * Load a sliding window of chunks around a center index.
   * Android equivalent: DashboardViewModel.loadWindow()
   *
   * Loads [center-5 .. center+10] — the "memory window" that keeps
   * the app snappy without loading the entire document.
   */
  async loadWindow(
    db: SQLiteDatabase,
    documentId: string,
    centerIndex: number
  ): Promise<DocumentChunk[]> {
    const start = Math.max(0, centerIndex - 5);
    const end = centerIndex + 10;
    return db.getAllAsync<DocumentChunk>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              raw_content AS rawContent, clean_content AS cleanContent,
              mapping_json AS mappingJson, title, timestamp
       FROM document_chunks
       WHERE document_id = ? AND chunk_index BETWEEN ? AND ?
       ORDER BY chunk_index`,
      [documentId, start, end]
    );
  },

  /**
   * Get a specific chunk by document + index.
   */
  async getChunk(
    db: SQLiteDatabase,
    documentId: string,
    index: number
  ): Promise<DocumentChunk | null> {
    return db.getFirstAsync<DocumentChunk>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              raw_content AS rawContent, clean_content AS cleanContent,
              mapping_json AS mappingJson, title, timestamp
       FROM document_chunks
       WHERE document_id = ? AND chunk_index = ?`,
      [documentId, index]
    );
  },

  /**
   * Get ALL chunks for a document (for export, full-text search, etc).
   */
  async getAllForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<DocumentChunk[]> {
    return db.getAllAsync<DocumentChunk>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              raw_content AS rawContent, clean_content AS cleanContent,
              mapping_json AS mappingJson, title, timestamp
       FROM document_chunks
       WHERE document_id = ? ORDER BY chunk_index`,
      [documentId]
    );
  },

  /**
   * Get the total number of chunks (pages) for a document.
   */
  async getCount(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<number> {
    const result = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM document_chunks WHERE document_id = ?",
      [documentId]
    );
    return result?.cnt ?? 0;
  },

  /**
   * Get all chunks that have a title (= chapter start pages).
   * Used for Table of Contents generation.
   */
  async getTocEntries(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<DocumentChunk[]> {
    return db.getAllAsync<DocumentChunk>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              raw_content AS rawContent, clean_content AS cleanContent,
              mapping_json AS mappingJson, title, timestamp
       FROM document_chunks
       WHERE document_id = ? AND title IS NOT NULL
       ORDER BY chunk_index`,
      [documentId]
    );
  },

  /**
   * Bulk insert chunks (after pagination). Replaces any existing chunks
   * for the document. Used by finalizePagination().
   *
   * Android equivalent: DashboardViewModel.finalizePagination()
   */
  async bulkInsert(
    db: SQLiteDatabase,
    documentId: string,
    chunks: Omit<DocumentChunk, "id">[]
  ): Promise<void> {
    await db.withTransactionAsync(async () => {
      // Nuke existing chunks for this document
      await db.runAsync(
        "DELETE FROM document_chunks WHERE document_id = ?",
        [documentId]
      );
      // Insert new chunks
      for (const chunk of chunks) {
        await db.runAsync(
          `INSERT INTO document_chunks
             (document_id, chunk_index, raw_content, clean_content, mapping_json, title, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            chunk.documentId,
            chunk.chunkIndex,
            chunk.rawContent,
            chunk.cleanContent,
            chunk.mappingJson ?? "{}",
            chunk.title ?? null,
            chunk.timestamp,
          ]
        );
      }
    });
  },

  /**
   * Update a single chunk's content. Called on every edit keystroke (debounced).
   *
   * Android equivalent: DashboardViewModel.updateChunkContent()
   */
  async updateContent(
    db: SQLiteDatabase,
    documentId: string,
    index: number,
    newContent: string
  ): Promise<void> {
    await db.runAsync(
      `UPDATE document_chunks
       SET clean_content = ?, raw_content = ?, timestamp = ?
       WHERE document_id = ? AND chunk_index = ?`,
      [newContent, newContent, Date.now(), documentId, index]
    );
  },

  /**
   * Delete all chunks at or after a given index.
   * Used by ReflowManager during atomic re-indexing.
   */
  async deleteAllFollowing(
    db: SQLiteDatabase,
    documentId: string,
    fromIndex: number
  ): Promise<void> {
    await db.runAsync(
      "DELETE FROM document_chunks WHERE document_id = ? AND chunk_index >= ?",
      [documentId, fromIndex]
    );
  },

  /**
   * Delete all chunks for a document.
   */
  async deleteForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<void> {
    await db.runAsync(
      "DELETE FROM document_chunks WHERE document_id = ?",
      [documentId]
    );
  },
};

// ─── Annotations DAO ────────────────────────────────────────────────────────

export const annotationsDao = {
  async getForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<AnnotationEntry[]> {
    return db.getAllAsync<AnnotationEntry>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              offset, length, note, timestamp
       FROM annotations
       WHERE document_id = ? ORDER BY chunk_index, offset`,
      [documentId]
    );
  },

  async getForChunk(
    db: SQLiteDatabase,
    documentId: string,
    chunkIndex: number
  ): Promise<AnnotationEntry[]> {
    return db.getAllAsync<AnnotationEntry>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              offset, length, note, timestamp
       FROM annotations
       WHERE document_id = ? AND chunk_index = ?
       ORDER BY offset`,
      [documentId, chunkIndex]
    );
  },

  async insert(
    db: SQLiteDatabase,
    annotation: AnnotationEntry
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO annotations
         (id, document_id, chunk_index, offset, length, note, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        annotation.id,
        annotation.documentId,
        annotation.chunkIndex,
        annotation.offset,
        annotation.length,
        annotation.note ?? null,
        annotation.timestamp,
      ]
    );
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync("DELETE FROM annotations WHERE id = ?", [id]);
  },

  async deleteForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<void> {
    await db.runAsync(
      "DELETE FROM annotations WHERE document_id = ?",
      [documentId]
    );
  },
};

// ─── Edit History DAO ───────────────────────────────────────────────────────

export const editHistoryDao = {
  async getForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<EditHistoryEntry[]> {
    return db.getAllAsync<EditHistoryEntry>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              original_text AS originalText, updated_text AS updatedText,
              rationale, timestamp
       FROM edit_history
       WHERE document_id = ? ORDER BY timestamp DESC`,
      [documentId]
    );
  },

  async getForChunk(
    db: SQLiteDatabase,
    documentId: string,
    chunkIndex: number
  ): Promise<EditHistoryEntry[]> {
    return db.getAllAsync<EditHistoryEntry>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              original_text AS originalText, updated_text AS updatedText,
              rationale, timestamp
       FROM edit_history
       WHERE document_id = ? AND chunk_index = ?
       ORDER BY timestamp DESC`,
      [documentId, chunkIndex]
    );
  },

  async insert(
    db: SQLiteDatabase,
    entry: EditHistoryEntry
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO edit_history
         (id, document_id, chunk_index, original_text, updated_text, rationale, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.documentId,
        entry.chunkIndex,
        entry.originalText,
        entry.updatedText,
        entry.rationale ?? null,
        entry.timestamp,
      ]
    );
  },

  async deleteForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<void> {
    await db.runAsync(
      "DELETE FROM edit_history WHERE document_id = ?",
      [documentId]
    );
  },
};

// ─── Voice Notes DAO ────────────────────────────────────────────────────────

export const voiceNotesDao = {
  async getForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<VoiceNoteEntry[]> {
    return db.getAllAsync<VoiceNoteEntry>(
      `SELECT id, document_id AS documentId, chunk_index AS chunkIndex,
              transcript, ai_suggestion AS aiSuggestion,
              is_applied AS isApplied, timestamp
       FROM voice_notes
       WHERE document_id = ? ORDER BY timestamp DESC`,
      [documentId]
    );
  },

  async insert(
    db: SQLiteDatabase,
    note: VoiceNoteEntry
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO voice_notes
         (id, document_id, chunk_index, transcript, ai_suggestion, is_applied, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.documentId,
        note.chunkIndex,
        note.transcript,
        note.aiSuggestion ?? null,
        note.isApplied ? 1 : 0,
        note.timestamp,
      ]
    );
  },

  async markApplied(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(
      "UPDATE voice_notes SET is_applied = 1 WHERE id = ?",
      [id]
    );
  },

  async deleteForDocument(
    db: SQLiteDatabase,
    documentId: string
  ): Promise<void> {
    await db.runAsync(
      "DELETE FROM voice_notes WHERE document_id = ?",
      [documentId]
    );
  },
};
