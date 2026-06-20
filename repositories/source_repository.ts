/**
 * repositories/source_repository.ts
 *
 * Repository for the `sources` table.
 * Sources represent origin exam PDFs / papers that group questions in the library.
 * The ONLY layer allowed to use Drizzle ORM directly.
 */

import { eq, like, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { sources } from "@/db/schema";
import type { Source } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateSourceInput = {
  name: string;
};

export type SourceWithStats = Source & {
  importJobCount: number;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const sourceRepository = {
  /**
   * Creates a new source.
   * name must be unique — throws if duplicate (caller handles the DB error).
   */
  create(input: CreateSourceInput): Source {
    const now = new Date().toISOString();

    const result = db
      .insert(sources)
      .values({
        name: input.name.trim(),
        totalQuestions: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return result;
  },

  /**
   * Finds a source by its unique name (case-insensitive).
   */
  findByName(name: string): Source | undefined {
    return db
      .select()
      .from(sources)
      .where(eq(sql`lower(${sources.name})`, name.toLowerCase().trim()))
      .get();
  },

  /**
   * Finds a source by its primary key.
   */
  findById(id: number): Source | undefined {
    return db.select().from(sources).where(eq(sources.id, id)).get();
  },

  /**
   * Finds a source by name or creates it if it doesn't exist.
   * Returns the existing or newly created source.
   */
  findOrCreate(name: string): Source {
    const existing = sourceRepository.findByName(name);
    if (existing) return existing;
    return sourceRepository.create({ name });
  },

  /**
   * Returns all sources ordered by name ascending.
   */
  findAll(): Source[] {
    return db.select().from(sources).orderBy(asc(sources.name)).all();
  },

  /**
   * Returns sources ordered by most recently updated (most active).
   */
  findAllByActivity(): Source[] {
    return db.select().from(sources).orderBy(desc(sources.updatedAt)).all();
  },

  /**
   * Returns sources whose names contain the search term.
   */
  search(term: string): Source[] {
    return db
      .select()
      .from(sources)
      .where(like(sources.name, `%${term}%`))
      .orderBy(asc(sources.name))
      .all();
  },

  /**
   * Updates the source's name.
   * Stamps updatedAt.
   */
  updateName(id: number, name: string): Source | undefined {
    const result = db
      .update(sources)
      .set({ name: name.trim(), updatedAt: new Date().toISOString() })
      .where(eq(sources.id, id))
      .returning()
      .get();

    return result;
  },

  /**
   * Refreshes the total_questions cached count for a source
   * by counting non-deleted approved questions directly from the DB.
   * Called after bulk imports to correct any drift.
   */
  recalculateTotalQuestions(sourceId: number): void {
    db.run(
      sql`
        UPDATE sources
        SET
          total_questions = (
            SELECT COUNT(*) FROM questions
            WHERE source_id = ${sourceId} AND is_deleted = 0
          ),
          updated_at = ${new Date().toISOString()}
        WHERE id = ${sourceId}
      `
    );
  },

  /**
   * Deletes a source by ID.
   * Will fail if questions reference this source (FK restrict).
   * Returns true if a row was deleted.
   */
  delete(id: number): boolean {
    const result = db
      .delete(sources)
      .where(eq(sources.id, id))
      .returning()
      .get();

    return result !== undefined;
  },

  /**
   * Returns the total count of sources.
   */
  count(): number {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sources)
      .get();
    return result?.count ?? 0;
  },
} as const;
