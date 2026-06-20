/**
 * repositories/topic_repository.ts
 *
 * Repository for the `topics` and `topic_aliases` tables.
 * Topics are the master taxonomy — every question and note belongs to a topic.
 * The ONLY layer allowed to use Drizzle ORM directly.
 *
 * Key design:
 *   - slug is the URL-safe unique identifier
 *   - topic_status drives lazy AI generation in /topics/[slug]
 *   - topic_aliases enables deduplication during import ingestion
 *   - Counters (total_questions, total_notes, total_facts) are maintained
 *     by triggers (questions) and by service layer (notes, facts)
 */

import { eq, like, desc, asc, and, inArray, sql, ne } from "drizzle-orm";
import { db, rawSqlite } from "@/db/connection";
import {
  topics,
  topicAliases,
  notes,
  noteFacts,
} from "@/db/schema";
import type {
  Topic,
  NewTopic,
  TopicAlias,
  TopicStatus,
  ValidCategory,
  TopicWithNoteStatus,
} from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateTopicInput = {
  slug: string;
  name: string;
  category: ValidCategory;
};

export type TopicUpdate = Partial<{
  name: string;
  category: ValidCategory;
  topicStatus: TopicStatus;
  lastGeneratedAt: string;
  totalNotes: number;
  totalFacts: number;
  totalViews: number;
}>;

export type TopicListItem = Pick<
  Topic,
  | "id"
  | "slug"
  | "name"
  | "category"
  | "topicStatus"
  | "totalQuestions"
  | "totalNotes"
  | "totalFacts"
  | "totalViews"
  | "lastGeneratedAt"
  | "updatedAt"
>;

export type TopicFilterOptions = {
  category?: ValidCategory;
  status?: TopicStatus;
  search?: string;
  limit?: number;
  offset?: number;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const topicRepository = {
  // ─── Create ──────────────────────────────────────────────────────────────

  /**
   * Creates a new topic and optionally registers the name as an alias.
   * Returns undefined if the slug already exists.
   */
  create(input: CreateTopicInput): Topic | undefined {
    // Check slug uniqueness first
    const existing = topicRepository.findBySlug(input.slug);
    if (existing) return undefined;

    const now = new Date().toISOString();

    const topic = db
      .insert(topics)
      .values({
        slug: input.slug,
        name: input.name,
        category: input.category,
        topicStatus: "not_generated",
        totalQuestions: 0,
        totalNotes: 0,
        totalFacts: 0,
        totalViews: 0,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Register the canonical name as an alias for deduplication
    topicRepository.addAlias(topic.id, input.name.toLowerCase().trim());

    return topic;
  },

  /**
   * Finds or creates a topic by slug.
   * Used during question ingestion to resolve topic names idempotently.
   */
  findOrCreate(input: CreateTopicInput): Topic {
    const existing = topicRepository.findBySlug(input.slug);
    if (existing) {
      // If it was soft-deleted, restore it
      if (existing.isDeleted) {
        return topicRepository.restore(existing.id) ?? existing;
      }
      return existing;
    }
    return topicRepository.create(input)!;
  },

  // ─── Lookup ──────────────────────────────────────────────────────────────

  /**
   * Finds a topic by its URL slug. Includes soft-deleted topics.
   */
  findBySlug(slug: string): Topic | undefined {
    return db.select().from(topics).where(eq(topics.slug, slug)).get();
  },

  /**
   * Finds a topic by its URL slug, excluding soft-deleted.
   */
  findActiveBySlug(slug: string): Topic | undefined {
    return db
      .select()
      .from(topics)
      .where(and(eq(topics.slug, slug), eq(topics.isDeleted, false)))
      .get();
  },

  /**
   * Finds a topic by its primary key.
   */
  findById(id: number): Topic | undefined {
    return db.select().from(topics).where(eq(topics.id, id)).get();
  },

  /**
   * Finds a topic by its exact name (case-insensitive).
   * Returns the first non-deleted match.
   */
  findByName(name: string): Topic | undefined {
    return db
      .select()
      .from(topics)
      .where(
        and(
          eq(sql`lower(${topics.name})`, name.toLowerCase().trim()),
          eq(topics.isDeleted, false)
        )
      )
      .get();
  },

  /**
   * Resolves a raw topic name to a canonical topic by:
   *   1. Exact name match (case-insensitive)
   *   2. Alias match (case-insensitive)
   * Returns undefined if no match found.
   */
  resolveByNameOrAlias(rawName: string): Topic | undefined {
    const normalized = rawName.toLowerCase().trim();

    // 1. Try exact name match first
    const byName = topicRepository.findByName(rawName);
    if (byName) return byName;

    // 2. Try alias lookup via raw SQL (JOIN is more efficient here)
    const result = rawSqlite
      .prepare(
        `SELECT t.* FROM topics t
         JOIN topic_aliases ta ON ta.topic_id = t.id
         WHERE lower(ta.alias) = ?
           AND t.is_deleted = 0
         LIMIT 1`
      )
      .get(normalized) as Topic | undefined;

    return result;
  },

  // ─── Lists ───────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of non-deleted topics with optional filters.
   */
  findAll(options: TopicFilterOptions = {}): {
    items: TopicListItem[];
    total: number;
  } {
    const { category, status, limit = 50, offset = 0 } = options;

    const conditions = [eq(topics.isDeleted, false)];

    if (category) {
      conditions.push(eq(topics.category, category));
    }
    if (status) {
      conditions.push(eq(topics.topicStatus, status));
    }

    const whereClause = and(...conditions);

    const [items, countResult] = [
      db
        .select({
          id: topics.id,
          slug: topics.slug,
          name: topics.name,
          category: topics.category,
          topicStatus: topics.topicStatus,
          totalQuestions: topics.totalQuestions,
          totalNotes: topics.totalNotes,
          totalFacts: topics.totalFacts,
          totalViews: topics.totalViews,
          lastGeneratedAt: topics.lastGeneratedAt,
          updatedAt: topics.updatedAt,
        })
        .from(topics)
        .where(whereClause)
        .orderBy(desc(topics.totalQuestions), asc(topics.name))
        .limit(limit)
        .offset(offset)
        .all(),

      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(topics)
        .where(whereClause)
        .get(),
    ];

    return { items, total: countResult?.count ?? 0 };
  },

  /**
   * Returns all topics that have `topic_status = 'not_generated'` or
   * `topic_status = 'needs_refresh'` — i.e., they need AI note generation.
   */
  findNeedingGeneration(): Topic[] {
    return db
      .select()
      .from(topics)
      .where(
        and(
          inArray(topics.topicStatus, ["not_generated", "needs_refresh"]),
          eq(topics.isDeleted, false),
          // Only topics with questions are worth generating notes for
          sql`${topics.totalQuestions} > 0`
        )
      )
      .orderBy(desc(topics.totalQuestions))
      .all();
  },

  /**
   * Returns topics with their note status joined.
   * Used for the dashboard metrics display.
   */
  findWithNoteStatus(limit: number = 20): TopicWithNoteStatus[] {
    const result = rawSqlite
      .prepare(
        `SELECT
          t.*,
          CASE WHEN n.id IS NOT NULL THEN 1 ELSE 0 END as has_note,
          n.id as note_id
        FROM topics t
        LEFT JOIN notes n ON n.topic_id = t.id AND n.is_deleted = 0
        WHERE t.is_deleted = 0
        ORDER BY t.total_questions DESC
        LIMIT ?`
      )
      .all(limit) as Array<Topic & { has_note: number; note_id: number | null }>;

    return result.map((row) => ({
      ...row,
      // Drizzle uses camelCase but rawSqlite returns snake_case
      topicStatus: row.topicStatus ?? (row as unknown as Record<string, string>)["topic_status"],
      isDeleted: Boolean(row.isDeleted ?? (row as unknown as Record<string, number>)["is_deleted"]),
      hasNote: Boolean(row.has_note),
      noteId: row.note_id,
    }));
  },

  /**
   * Returns soft-deleted topics for the trash view.
   */
  findDeleted(): Topic[] {
    return db
      .select()
      .from(topics)
      .where(eq(topics.isDeleted, true))
      .orderBy(desc(topics.updatedAt))
      .all();
  },

  /**
   * Searches topic names using LIKE for quick prefix matching.
   * FTS5 search is handled by search_index_service.
   */
  searchByName(term: string, limit: number = 10): Topic[] {
    return db
      .select()
      .from(topics)
      .where(
        and(
          like(topics.name, `%${term}%`),
          eq(topics.isDeleted, false)
        )
      )
      .orderBy(desc(topics.totalQuestions))
      .limit(limit)
      .all();
  },

  // ─── Updates ─────────────────────────────────────────────────────────────

  /**
   * Updates mutable fields on a topic.
   * Always stamps updatedAt.
   */
  update(id: number, data: TopicUpdate): Topic | undefined {
    return db
      .update(topics)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(topics.id, id))
      .returning()
      .get();
  },

  /**
   * Sets topic_status to 'generated' and stamps last_generated_at.
   * Called after successful AI note generation.
   */
  markGenerated(id: number): Topic | undefined {
    return db
      .update(topics)
      .set({
        topicStatus: "generated",
        lastGeneratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, id))
      .returning()
      .get();
  },

  /**
   * Sets topic_status to 'needs_refresh'.
   * Called when notes are stale or user clicks "Refresh Topic".
   */
  markNeedsRefresh(id: number): Topic | undefined {
    return db
      .update(topics)
      .set({
        topicStatus: "needs_refresh",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, id))
      .returning()
      .get();
  },

  /**
   * Increments total_views by 1.
   * Lightweight — no returning() for performance.
   */
  incrementViews(id: number): void {
    db.update(topics)
      .set({
        totalViews: sql`${topics.totalViews} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, id))
      .run();
  },

  /**
   * Recalculates and updates total_notes and total_facts for a topic.
   * Called after note generation or fact updates.
   */
  recalculateNoteCounts(topicId: number): void {
    const noteCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notes)
      .where(and(eq(notes.topicId, topicId), eq(notes.isDeleted, false)))
      .get();

    const factCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(noteFacts)
      .where(
        sql`${noteFacts.noteId} IN (
          SELECT id FROM notes WHERE topic_id = ${topicId} AND is_deleted = 0
        )`
      )
      .get();

    db.update(topics)
      .set({
        totalNotes: noteCount?.count ?? 0,
        totalFacts: factCount?.count ?? 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, topicId))
      .run();
  },

  // ─── Soft Delete / Restore ────────────────────────────────────────────────

  /**
   * Soft-deletes a topic (hides from all UI).
   * Data is preserved — questions and notes remain.
   */
  softDelete(id: number): Topic | undefined {
    return db
      .update(topics)
      .set({ isDeleted: true, updatedAt: new Date().toISOString() })
      .where(eq(topics.id, id))
      .returning()
      .get();
  },

  /**
   * Restores a soft-deleted topic.
   */
  restore(id: number): Topic | undefined {
    return db
      .update(topics)
      .set({ isDeleted: false, updatedAt: new Date().toISOString() })
      .where(eq(topics.id, id))
      .returning()
      .get();
  },

  // ─── Aliases ─────────────────────────────────────────────────────────────

  /**
   * Adds an alias for a topic. Silently ignores duplicates.
   */
  addAlias(topicId: number, alias: string): void {
    const normalized = alias.toLowerCase().trim();
    if (!normalized) return;

    try {
      db.insert(topicAliases)
        .values({ topicId, alias: normalized })
        .onConflictDoNothing()
        .run();
    } catch {
      // Ignore unique constraint violations — alias already exists
    }
  },

  /**
   * Returns all aliases for a given topic.
   */
  getAliases(topicId: number): TopicAlias[] {
    return db
      .select()
      .from(topicAliases)
      .where(eq(topicAliases.topicId, topicId))
      .all();
  },

  /**
   * Removes all aliases for a topic then re-inserts the provided list.
   * Used when a topic is renamed.
   */
  replaceAliases(topicId: number, aliases: string[]): void {
    db.delete(topicAliases)
      .where(eq(topicAliases.topicId, topicId))
      .run();

    for (const alias of aliases) {
      topicRepository.addAlias(topicId, alias);
    }
  },

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * Returns dashboard-level aggregate stats across all non-deleted topics.
   */
  getDashboardStats(): {
    totalTopics: number;
    totalGenerated: number;
    totalNeedsRefresh: number;
    totalNotGenerated: number;
    byCategory: Array<{ category: string; count: number }>;
  } {
    const counts = db
      .select({
        total: sql<number>`COUNT(*)`,
        generated: sql<number>`SUM(CASE WHEN topic_status = 'generated' THEN 1 ELSE 0 END)`,
        needsRefresh: sql<number>`SUM(CASE WHEN topic_status = 'needs_refresh' THEN 1 ELSE 0 END)`,
        notGenerated: sql<number>`SUM(CASE WHEN topic_status = 'not_generated' THEN 1 ELSE 0 END)`,
      })
      .from(topics)
      .where(eq(topics.isDeleted, false))
      .get();

    const byCategory = db
      .select({
        category: topics.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(topics)
      .where(eq(topics.isDeleted, false))
      .groupBy(topics.category)
      .orderBy(desc(sql`COUNT(*)`))
      .all();

    return {
      totalTopics: counts?.total ?? 0,
      totalGenerated: counts?.generated ?? 0,
      totalNeedsRefresh: counts?.needsRefresh ?? 0,
      totalNotGenerated: counts?.notGenerated ?? 0,
      byCategory: byCategory.map((r) => ({
        category: r.category,
        count: r.count,
      })),
    };
  },

  /**
   * Returns the count of active (non-deleted) topics.
   */
  count(): number {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(topics)
      .where(eq(topics.isDeleted, false))
      .get();
    return result?.count ?? 0;
  },
} as const;
