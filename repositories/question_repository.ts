/**
 * repositories/question_repository.ts
 *
 * Repository for the `questions`, `question_bookmarks`, and `question_flags` tables.
 * This is the canonical approved question bank.
 * The ONLY layer allowed to use Drizzle ORM directly.
 *
 * Key design:
 *   - question_hash (SHA-256) enforces deduplication — unique constraint
 *   - All multi-row operations run inside transactions
 *   - FTS5 search queries use rawSqlite with porter stemming
 *   - Soft deletes preserve data integrity
 */

import { eq, and, ne, desc, sql } from "drizzle-orm";
import { db, rawSqlite } from "@/db/connection";
import {
  questions,
  questionBookmarks,
  questionFlags,
} from "@/db/schema";
import type {
  Question,
  QuestionBookmark,
  QuestionFlag,
  ValidCategory,
  ValidDifficulty,
  QuestionWithTopic,
} from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateQuestionInput = {
  questionHash: string;
  topicId: number;
  sourceId: number;
  category: ValidCategory;
  difficulty: ValidDifficulty;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  shortExplanation?: string;
  sourceType?: string;
  pageNumber?: number;
};

export type QuestionFilterOptions = {
  topicId?: number;
  sourceId?: number;
  category?: ValidCategory;
  difficulty?: ValidDifficulty;
  isBookmarked?: boolean;
  limit?: number;
  offset?: number;
};

export type FtsSearchResult = {
  id: number;
  question: string;
  category: string;
  topicName: string;
  rank: number;
};

export type QuestionFlagInput = {
  questionId: number;
  reason: string;
  details?: string;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const questionRepository = {
  // ─── Create ──────────────────────────────────────────────────────────────

  /**
   * Inserts a single approved question into the question bank.
   * Returns undefined if a question with the same hash already exists.
   */
  create(input: CreateQuestionInput): Question | undefined {
    const existing = questionRepository.findByHash(input.questionHash);
    if (existing) return undefined;

    const now = new Date().toISOString();

    return db
      .insert(questions)
      .values({
        questionHash: input.questionHash,
        topicId: input.topicId,
        sourceId: input.sourceId,
        category: input.category,
        difficulty: input.difficulty,
        question: input.question,
        optionA: input.optionA,
        optionB: input.optionB,
        optionC: input.optionC,
        optionD: input.optionD,
        correctOption: input.correctOption,
        shortExplanation: input.shortExplanation ?? null,
        sourceType: input.sourceType ?? null,
        pageNumber: input.pageNumber ?? null,
        timesViewed: 0,
        timesRevised: 0,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  },

  /**
   * Bulk-inserts multiple approved questions in a single transaction.
   * Skips any question whose hash already exists.
   * Returns { inserted, skipped } counts.
   */
  createMany(
    inputs: CreateQuestionInput[]
  ): { inserted: number; skipped: number } {
    if (inputs.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    return db.transaction(() => {
      for (const input of inputs) {
        try {
          const result = db
            .insert(questions)
            .values({
              questionHash: input.questionHash,
              topicId: input.topicId,
              sourceId: input.sourceId,
              category: input.category,
              difficulty: input.difficulty,
              question: input.question,
              optionA: input.optionA,
              optionB: input.optionB,
              optionC: input.optionC,
              optionD: input.optionD,
              correctOption: input.correctOption,
              shortExplanation: input.shortExplanation ?? null,
              sourceType: input.sourceType ?? null,
              pageNumber: input.pageNumber ?? null,
              timesViewed: 0,
              timesRevised: 0,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning()
            .get();

          if (result) {
            inserted++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }
      return { inserted, skipped };
    });
  },

  // ─── Lookup ──────────────────────────────────────────────────────────────

  /**
   * Finds a question by its SHA-256 content hash.
   * Primary deduplication check before any insert.
   */
  findByHash(hash: string): Question | undefined {
    return db
      .select()
      .from(questions)
      .where(eq(questions.questionHash, hash))
      .get();
  },

  /**
   * Finds a question by primary key.
   */
  findById(id: number): Question | undefined {
    return db
      .select()
      .from(questions)
      .where(and(eq(questions.id, id), eq(questions.isDeleted, false)))
      .get();
  },

  /**
   * Returns a question with its topic name and source name joined.
   * Used for single question display (MCQ card).
   */
  findByIdWithTopic(id: number): QuestionWithTopic | undefined {
    const result = rawSqlite
      .prepare(
        `SELECT
          q.*,
          t.name  AS topicName,
          t.slug  AS topicSlug,
          s.name  AS sourceName,
          CASE WHEN qb.id IS NOT NULL THEN 1 ELSE 0 END AS isBookmarked
        FROM questions q
        JOIN topics  t ON t.id = q.topic_id
        JOIN sources s ON s.id = q.source_id
        LEFT JOIN question_bookmarks qb ON qb.question_id = q.id
        WHERE q.id = ? AND q.is_deleted = 0
        LIMIT 1`
      )
      .get(id) as
      | (Question & {
          topicName: string;
          topicSlug: string;
          sourceName: string;
          isBookmarked: number;
        })
      | undefined;

    if (!result) return undefined;

    return {
      ...result,
      optionA: (result as any).option_a ?? result.optionA,
      optionB: (result as any).option_b ?? result.optionB,
      optionC: (result as any).option_c ?? result.optionC,
      optionD: (result as any).option_d ?? result.optionD,
      correctOption: (result as any).correct_option ?? result.correctOption,
      shortExplanation: (result as any).short_explanation ?? result.shortExplanation,
      timesViewed: (result as any).times_viewed ?? result.timesViewed,
      timesRevised: (result as any).times_revised ?? result.timesRevised,
      isBookmarked: Boolean(result.isBookmarked),
    };
  },

  // ─── Filtered Lists ───────────────────────────────────────────────────────

  /**
   * Returns a paginated list of questions with optional filters.
   * Includes topic name and bookmark status via raw SQL join.
   */
  findAll(options: QuestionFilterOptions = {}): {
    items: QuestionWithTopic[];
    total: number;
  } {
    const {
      topicId,
      sourceId,
      category,
      difficulty,
      isBookmarked,
      limit = 20,
      offset = 0,
    } = options;

    const conditions: string[] = ["q.is_deleted = 0"];
    const params: (number | string)[] = [];

    if (topicId !== undefined) {
      conditions.push("q.topic_id = ?");
      params.push(topicId);
    }
    if (sourceId !== undefined) {
      conditions.push("q.source_id = ?");
      params.push(sourceId);
    }
    if (category !== undefined) {
      conditions.push("q.category = ?");
      params.push(category);
    }
    if (difficulty !== undefined) {
      conditions.push("q.difficulty = ?");
      params.push(difficulty);
    }
    if (isBookmarked === true) {
      conditions.push("qb.id IS NOT NULL");
    }

    const whereSQL = conditions.join(" AND ");

    const baseQuery = `
      FROM questions q
      JOIN topics  t ON t.id = q.topic_id
      JOIN sources s ON s.id = q.source_id
      LEFT JOIN question_bookmarks qb ON qb.question_id = q.id
      WHERE ${whereSQL}
    `;

    const items = rawSqlite
      .prepare(
        `SELECT
          q.*,
          t.name AS topicName,
          t.slug AS topicSlug,
          s.name AS sourceName,
          CASE WHEN qb.id IS NOT NULL THEN 1 ELSE 0 END AS isBookmarked
        ${baseQuery}
        ORDER BY q.created_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<
      Question & {
        topicName: string;
        topicSlug: string;
        sourceName: string;
        isBookmarked: number;
      }
    >;

    const countResult = rawSqlite
      .prepare(`SELECT COUNT(*) as count ${baseQuery}`)
      .get(...params) as { count: number };

    return {
      items: items.map((r) => ({
        ...r,
        optionA: (r as any).option_a ?? r.optionA,
        optionB: (r as any).option_b ?? r.optionB,
        optionC: (r as any).option_c ?? r.optionC,
        optionD: (r as any).option_d ?? r.optionD,
        correctOption: (r as any).correct_option ?? r.correctOption,
        shortExplanation: (r as any).short_explanation ?? r.shortExplanation,
        timesViewed: (r as any).times_viewed ?? r.timesViewed,
        timesRevised: (r as any).times_revised ?? r.timesRevised,
        isBookmarked: Boolean(r.isBookmarked),
      })),
      total: countResult?.count ?? 0,
    };
  },

  /**
   * Returns questions for a topic (used in the "More from this topic" section).
   * Excludes a specific question ID to avoid showing the current one.
   */
  findByTopicId(
    topicId: number,
    excludeId?: number,
    limit: number = 5
  ): Question[] {
    const conditions = [
      eq(questions.topicId, topicId),
      eq(questions.isDeleted, false),
    ];
    if (excludeId !== undefined) {
      conditions.push(ne(questions.id, excludeId));
    }

    return db
      .select()
      .from(questions)
      .where(and(...conditions))
      .orderBy(desc(questions.timesRevised))
      .limit(limit)
      .all();
  },

  // ─── FTS5 Search ──────────────────────────────────────────────────────────

  /**
   * Searches questions using the FTS5 index with BM25 ranking.
   * Returns results sorted by relevance (rank).
   * Falls back to empty array on FTS error.
   */
  ftsSearch(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): FtsSearchResult[] {
    if (!query.trim()) return [];

    // FTS5 query: escape special characters and add wildcard suffix
    const ftsQuery = query
      .trim()
      .replace(/['"*]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `"${word}"*`)
      .join(" ");

    try {
      const results = rawSqlite
        .prepare(
          `SELECT
            q.id,
            q.question,
            q.category,
            qf.topic_name,
            rank
          FROM questions_fts qf
          JOIN questions q ON q.id = qf.rowid
          WHERE questions_fts MATCH ?
            AND q.is_deleted = 0
          ORDER BY rank
          LIMIT ? OFFSET ?`
        )
        .all(ftsQuery, limit, offset) as FtsSearchResult[];

      return results;
    } catch {
      return [];
    }
  },

  /**
   * Returns total count of matching FTS results (for pagination).
   */
  ftsSearchCount(query: string): number {
    if (!query.trim()) return 0;

    const ftsQuery = query
      .trim()
      .replace(/['"*]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `"${word}"*`)
      .join(" ");

    try {
      const result = rawSqlite
        .prepare(
          `SELECT COUNT(*) as count
           FROM questions_fts qf
           JOIN questions q ON q.id = qf.rowid
           WHERE questions_fts MATCH ?
             AND q.is_deleted = 0`
        )
        .get(ftsQuery) as { count: number };

      return result?.count ?? 0;
    } catch {
      return 0;
    }
  },

  // ─── Bookmarks ────────────────────────────────────────────────────────────

  /**
   * Adds a bookmark for a question. Ignores if already bookmarked.
   */
  bookmark(questionId: number): QuestionBookmark | undefined {
    const existing = db
      .select()
      .from(questionBookmarks)
      .where(eq(questionBookmarks.questionId, questionId))
      .get();

    if (existing) return existing;

    return db
      .insert(questionBookmarks)
      .values({
        questionId,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
  },

  /**
   * Removes a bookmark. Returns true if a bookmark was deleted.
   */
  unbookmark(questionId: number): boolean {
    const result = db
      .delete(questionBookmarks)
      .where(eq(questionBookmarks.questionId, questionId))
      .returning()
      .get();
    return result !== undefined;
  },

  /**
   * Checks if a question is bookmarked.
   */
  isBookmarked(questionId: number): boolean {
    const result = db
      .select({ id: questionBookmarks.id })
      .from(questionBookmarks)
      .where(eq(questionBookmarks.questionId, questionId))
      .get();
    return result !== undefined;
  },

  /**
   * Returns all bookmarked question IDs.
   */
  getBookmarkedIds(): number[] {
    return db
      .select({ questionId: questionBookmarks.questionId })
      .from(questionBookmarks)
      .orderBy(desc(questionBookmarks.createdAt))
      .all()
      .map((r) => r.questionId);
  },

  // ─── Flags ────────────────────────────────────────────────────────────────

  /**
   * Flags a question with a reason.
   */
  flag(input: QuestionFlagInput): QuestionFlag {
    const now = new Date().toISOString();

    return db
      .insert(questionFlags)
      .values({
        questionId: input.questionId,
        reason: input.reason,
        details: input.details ?? null,
        resolved: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  },

  /**
   * Returns all unresolved flags for a question.
   */
  getFlags(questionId: number): QuestionFlag[] {
    return db
      .select()
      .from(questionFlags)
      .where(
        and(
          eq(questionFlags.questionId, questionId),
          eq(questionFlags.resolved, false)
        )
      )
      .orderBy(desc(questionFlags.createdAt))
      .all();
  },

  /**
   * Marks a flag as resolved.
   */
  resolveFlag(flagId: number): QuestionFlag | undefined {
    return db
      .update(questionFlags)
      .set({ resolved: true, updatedAt: new Date().toISOString() })
      .where(eq(questionFlags.id, flagId))
      .returning()
      .get();
  },

  /**
   * Returns all unresolved flags across all questions.
   * Used in the /settings admin view.
   */
  getAllUnresolvedFlags(): QuestionFlag[] {
    return db
      .select()
      .from(questionFlags)
      .where(eq(questionFlags.resolved, false))
      .orderBy(desc(questionFlags.createdAt))
      .all();
  },

  // ─── Metrics ─────────────────────────────────────────────────────────────

  /**
   * Increments times_viewed and updates last_viewed_at.
   * Fire-and-forget — no returning() for performance.
   */
  incrementViewed(id: number): void {
    db.update(questions)
      .set({
        timesViewed: sql`${questions.timesViewed} + 1`,
        lastViewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(questions.id, id))
      .run();
  },

  /**
   * Increments times_revised.
   */
  incrementRevised(id: number): void {
    db.update(questions)
      .set({
        timesRevised: sql`${questions.timesRevised} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(questions.id, id))
      .run();
  },

  // ─── Soft Delete ─────────────────────────────────────────────────────────

  /**
   * Soft-deletes a question (sets is_deleted = true).
   * Triggers on the DB automatically update topic and source counters.
   */
  softDelete(id: number): Question | undefined {
    return db
      .update(questions)
      .set({ isDeleted: true, updatedAt: new Date().toISOString() })
      .where(eq(questions.id, id))
      .returning()
      .get();
  },

  /**
   * Restores a soft-deleted question.
   */
  restore(id: number): Question | undefined {
    return db
      .update(questions)
      .set({ isDeleted: false, updatedAt: new Date().toISOString() })
      .where(eq(questions.id, id))
      .returning()
      .get();
  },

  /**
   * Hard-deletes a question by ID (admin only, irreversible).
   */
  hardDelete(id: number): boolean {
    const result = db
      .delete(questions)
      .where(eq(questions.id, id))
      .returning()
      .get();
    return result !== undefined;
  },

  /**
   * Returns soft-deleted questions for the trash view.
   */
  findDeleted(limit: number = 100): Question[] {
    return db
      .select()
      .from(questions)
      .where(eq(questions.isDeleted, true))
      .orderBy(desc(questions.updatedAt))
      .limit(limit)
      .all();
  },

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * Returns aggregate question bank stats for the dashboard.
   */
  getStats(): {
    total: number;
    byCategory: Array<{ category: string; count: number }>;
    byDifficulty: Array<{ difficulty: string; count: number }>;
    bookmarked: number;
    flagged: number;
  } {
    const total = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(questions)
      .where(eq(questions.isDeleted, false))
      .get();

    const byCategory = db
      .select({
        category: questions.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(questions)
      .where(eq(questions.isDeleted, false))
      .groupBy(questions.category)
      .orderBy(desc(sql`COUNT(*)`))
      .all();

    const byDifficulty = db
      .select({
        difficulty: questions.difficulty,
        count: sql<number>`COUNT(*)`,
      })
      .from(questions)
      .where(eq(questions.isDeleted, false))
      .groupBy(questions.difficulty)
      .all();

    const bookmarked = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(questionBookmarks)
      .get();

    const flagged = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(questionFlags)
      .where(eq(questionFlags.resolved, false))
      .get();

    return {
      total: total?.count ?? 0,
      byCategory: byCategory.map((r) => ({
        category: r.category,
        count: r.count,
      })),
      byDifficulty: byDifficulty.map((r) => ({
        difficulty: r.difficulty,
        count: r.count,
      })),
      bookmarked: bookmarked?.count ?? 0,
      flagged: flagged?.count ?? 0,
    };
  },

  /**
   * Returns the total count of non-deleted questions.
   */
  count(): number {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(questions)
      .where(eq(questions.isDeleted, false))
      .get();
    return result?.count ?? 0;
  },
} as const;
