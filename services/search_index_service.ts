/**
 * services/search_index_service.ts
 *
 * ALL FTS5 index operations live here.
 * This service is the ONLY place that directly interacts with the
 * FTS5 virtual tables (questions_fts, topics_fts, notes_fts, note_keywords_fts).
 *
 * Responsibilities:
 *   - On-demand FTS5 rebuilds (when index drifts from live data)
 *   - Unified search across questions + topics + notes
 *   - FTS5 OPTIMIZE command for index compaction
 *   - Integrity check
 *
 * NOTE: FTS5 sync during INSERT/UPDATE/DELETE is handled automatically by
 * the 18 DB triggers created in db/migrations/fts5_triggers.sql.
 * This service handles EXCEPTIONAL cases only (rebuild, optimize, global search).
 */

import { rawSqlite } from "@/db/connection";
import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchResultItem = {
  id: number;
  type: "question" | "topic" | "note";
  title: string;             // question text / topic name / topic name (for notes)
  snippet: string;           // highlighted FTS5 snippet
  category: string;
  slug?: string;             // for topics / notes
  rank: number;              // BM25 rank (lower = more relevant)
};

export type GlobalSearchResult = {
  questions: SearchResultItem[];
  topics: SearchResultItem[];
  notes: SearchResultItem[];
  totalHits: number;
  queryTime: number;         // milliseconds
};

export type FtsRebuildResult = {
  table: string;
  rowsIndexed: number;
  durationMs: number;
};

// ─── FTS5 query builder ───────────────────────────────────────────────────────

/**
 * Builds a safe FTS5 MATCH query from a user search string.
 * Strips characters that would break FTS5 syntax.
 * Adds prefix wildcard (*) to each token for prefix search.
 */
function buildFtsQuery(userInput: string): string {
  return userInput
    .trim()
    .replace(/["'*^()[\]{}<>]/g, " ")  // strip FTS5 special chars
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t}"*`)
    .join(" ");
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const searchIndexService = {
  /**
   * Runs a global full-text search across questions, topics, and notes.
   * Executes three concurrent FTS5 MATCH queries and merges results.
   * Returns up to `limit` results per type.
   *
   * This is the ONLY search entry point for the global search bar.
   * All three FTS indexes are queried — results are never filtered by
   * visiting individual repositories.
   */
  search(
    rawQuery: string,
    limit: number = 10
  ): Result<GlobalSearchResult> {
    if (!rawQuery.trim() || rawQuery.trim().length < 2) {
      return err("Search query must be at least 2 characters", null, "VALIDATION_ERROR");
    }

    const ftsQuery = buildFtsQuery(rawQuery);
    if (!ftsQuery) {
      return err("Query produced no valid FTS tokens", null, "VALIDATION_ERROR");
    }

    const t0 = Date.now();

    try {
      // 1. Question search
      const questionResults = rawSqlite
        .prepare(
          `SELECT
            q.id,
            q.question AS title,
            snippet(questions_fts, 0, '<mark>', '</mark>', '...', 20) AS snippet,
            q.category,
            qf.rank
          FROM questions_fts qf
          JOIN questions q ON q.id = qf.rowid
          WHERE questions_fts MATCH ?
            AND q.is_deleted = 0
          ORDER BY rank
          LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
          id: number;
          title: string;
          snippet: string;
          category: string;
          rank: number;
        }>;

      // 2. Topic search
      const topicResults = rawSqlite
        .prepare(
          `SELECT
            t.id,
            t.name AS title,
            snippet(topics_fts, 0, '<mark>', '</mark>', '...', 20) AS snippet,
            t.category,
            t.slug,
            tf.rank
          FROM topics_fts tf
          JOIN topics t ON t.id = tf.rowid
          WHERE topics_fts MATCH ?
            AND t.is_deleted = 0
          ORDER BY rank
          LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
          id: number;
          title: string;
          snippet: string;
          category: string;
          slug: string;
          rank: number;
        }>;

      // 3. Notes search (via keywords FTS)
      const noteResults = rawSqlite
        .prepare(
          `SELECT
            t.id,
            t.name AS title,
            snippet(notes_fts, 0, '<mark>', '</mark>', '...', 20) AS snippet,
            t.category,
            t.slug,
            nf.rank
          FROM notes_fts nf
          JOIN notes n ON n.id = nf.rowid
          JOIN topics t ON t.id = n.topic_id
          WHERE notes_fts MATCH ?
            AND n.is_deleted = 0
            AND t.is_deleted = 0
          ORDER BY rank
          LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
          id: number;
          title: string;
          snippet: string;
          category: string;
          slug: string;
          rank: number;
        }>;

      const questions: SearchResultItem[] = questionResults.map((r) => ({
        id: r.id,
        type: "question",
        title: r.title,
        snippet: r.snippet,
        category: r.category,
        rank: r.rank,
      }));

      const topics: SearchResultItem[] = topicResults.map((r) => ({
        id: r.id,
        type: "topic",
        title: r.title,
        snippet: r.snippet,
        category: r.category,
        slug: r.slug,
        rank: r.rank,
      }));

      const notes: SearchResultItem[] = noteResults.map((r) => ({
        id: r.id,
        type: "note",
        title: r.title,
        snippet: r.snippet,
        category: r.category,
        slug: r.slug,
        rank: r.rank,
      }));

      return ok({
        questions,
        topics,
        notes,
        totalHits: questions.length + topics.length + notes.length,
        queryTime: Date.now() - t0,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`FTS5 search failed: ${message}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Rebuilds the questions_fts index from scratch.
   * Use when FTS content drifts from the live questions table.
   * Executes in a single SQLite transaction.
   */
  rebuildQuestionsIndex(): Result<FtsRebuildResult> {
    const t0 = Date.now();
    try {
      rawSqlite.exec(`
        BEGIN;
        DELETE FROM questions_fts;
        INSERT INTO questions_fts(rowid, question_text, topic_name, category, difficulty)
          SELECT q.id, q.question, t.name, q.category, q.difficulty
          FROM questions q
          JOIN topics t ON t.id = q.topic_id
          WHERE q.is_deleted = 0;
        COMMIT;
      `);

      const count = (
        rawSqlite.prepare("SELECT COUNT(*) as c FROM questions_fts").get() as {
          c: number;
        }
      ).c;

      return ok({ table: "questions_fts", rowsIndexed: count, durationMs: Date.now() - t0 });
    } catch (e) {
      try { rawSqlite.exec("ROLLBACK;"); } catch {}
      return err(`questions_fts rebuild failed: ${String(e)}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Rebuilds the topics_fts index from scratch.
   */
  rebuildTopicsIndex(): Result<FtsRebuildResult> {
    const t0 = Date.now();
    try {
      rawSqlite.exec(`
        BEGIN;
        DELETE FROM topics_fts;
        INSERT INTO topics_fts(rowid, name, category)
          SELECT id, name, category FROM topics WHERE is_deleted = 0;
        COMMIT;
      `);

      const count = (
        rawSqlite.prepare("SELECT COUNT(*) as c FROM topics_fts").get() as {
          c: number;
        }
      ).c;

      return ok({ table: "topics_fts", rowsIndexed: count, durationMs: Date.now() - t0 });
    } catch (e) {
      try { rawSqlite.exec("ROLLBACK;"); } catch {}
      return err(`topics_fts rebuild failed: ${String(e)}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Rebuilds the notes_fts index from scratch.
   */
  rebuildNotesIndex(): Result<FtsRebuildResult> {
    const t0 = Date.now();
    try {
      rawSqlite.exec(`
        BEGIN;
        DELETE FROM notes_fts;
        INSERT INTO notes_fts(rowid, content, topic_name)
          SELECT n.id, n.content, t.name
          FROM notes n
          JOIN topics t ON t.id = n.topic_id
          WHERE n.is_deleted = 0 AND t.is_deleted = 0;
        COMMIT;
      `);

      const count = (
        rawSqlite.prepare("SELECT COUNT(*) as c FROM notes_fts").get() as {
          c: number;
        }
      ).c;

      return ok({ table: "notes_fts", rowsIndexed: count, durationMs: Date.now() - t0 });
    } catch (e) {
      try { rawSqlite.exec("ROLLBACK;"); } catch {}
      return err(`notes_fts rebuild failed: ${String(e)}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Rebuilds ALL FTS5 indexes in sequence.
   * Called from /api/admin/rebuild-index endpoint.
   */
  rebuildAll(): Result<FtsRebuildResult[]> {
    const results: FtsRebuildResult[] = [];

    const q = searchIndexService.rebuildQuestionsIndex();
    if (!q.success) return err(q.error, q.cause, q.code);
    results.push(q.data);

    const t = searchIndexService.rebuildTopicsIndex();
    if (!t.success) return err(t.error, t.cause, t.code);
    results.push(t.data);

    const n = searchIndexService.rebuildNotesIndex();
    if (!n.success) return err(n.error, n.cause, n.code);
    results.push(n.data);

    return ok(results);
  },

  /**
   * Runs FTS5 OPTIMIZE on all virtual tables.
   * Compacts the index segments for better query performance.
   * Should be run periodically (e.g., nightly via /api/admin/optimize).
   */
  optimizeAll(): Result<true> {
    try {
      rawSqlite.exec(`
        INSERT INTO questions_fts(questions_fts) VALUES('optimize');
        INSERT INTO topics_fts(topics_fts) VALUES('optimize');
        INSERT INTO notes_fts(notes_fts) VALUES('optimize');
        INSERT INTO note_keywords_fts(note_keywords_fts) VALUES('optimize');
      `);
      return ok(true);
    } catch (e) {
      return err(`FTS5 optimize failed: ${String(e)}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Runs FTS5 integrity-check on all virtual tables.
   * Returns a list of error strings (empty array = healthy).
   */
  integrityCheck(): Result<string[]> {
    const errors: string[] = [];
    const tables = ["questions_fts", "topics_fts", "notes_fts", "note_keywords_fts"];

    try {
      for (const table of tables) {
        const rows = rawSqlite
          .prepare(`INSERT INTO ${table}(${table}) VALUES('integrity-check')`)
          .run();
        void rows;
      }
      return ok(errors);
    } catch (e) {
      errors.push(`FTS5 integrity check error: ${String(e)}`);
      return ok(errors); // return errors, not a failure — caller decides severity
    }
  },
} as const;
