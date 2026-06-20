/**
 * repositories/note_repository.ts
 *
 * Repository for `notes`, `notes_versions`, `note_keywords`, and `note_facts` tables.
 * One note per topic (enforced by UNIQUE FK constraint).
 * The ONLY layer allowed to use Drizzle ORM directly.
 *
 * Key design:
 *   - Before overwriting a note, always create a notes_version snapshot
 *   - keywords and facts are replaced atomically in transactions
 *   - FTS5 sync is automatic via DB triggers (no manual FTS calls here)
 */

import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db, rawSqlite } from "@/db/connection";
import {
  notes,
  notesVersions,
  noteKeywords,
  noteFacts,
} from "@/db/schema";
import type {
  Note,
  NoteVersion,
  NoteKeyword,
  NoteFact,
  NoteGenerationSource,
} from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateNoteInput = {
  topicId: number;
  content: string;
  rawAiResponse: string;
  generatedFrom: NoteGenerationSource;
  aiModel: string;
  keywords: string[];
  facts: string[];
};

export type NoteUpdate = {
  content: string;
  rawAiResponse?: string;
  generatedFrom?: NoteGenerationSource;
  aiModel?: string;
  keywords: string[];
  facts: string[];
};

export type NoteWithMeta = Note & {
  topicName: string;
  topicSlug: string;
  topicCategory: string;
  keywordList: string[];
  factList: string[];
  versionCount: number;
};

export type NoteListItem = Pick<
  Note,
  | "id"
  | "topicId"
  | "generatedFrom"
  | "viewCount"
  | "revisionCount"
  | "lastStudiedAt"
  | "aiGeneratedAt"
  | "aiModel"
  | "updatedAt"
> & {
  topicName: string;
  topicSlug: string;
  topicCategory: string;
  factCount: number;
  keywordCount: number;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const noteRepository = {
  // ─── Create ──────────────────────────────────────────────────────────────

  /**
   * Creates a new note for a topic with associated keywords and facts.
   * Executes entirely in a single transaction.
   * Returns undefined if a note for the topic already exists.
   */
  async create(input: CreateNoteInput): Promise<Note | undefined> {
    const existing = await noteRepository.findByTopicId(input.topicId);
    if (existing) return undefined;

    const now = new Date().toISOString();

    return await db.transaction(async (tx) => {
      // 1. Insert the note
      const note = await tx
        .insert(notes)
        .values({
          topicId: input.topicId,
          content: input.content,
          rawAiResponse: input.rawAiResponse,
          generatedFrom: input.generatedFrom,
          viewCount: 0,
          revisionCount: 0,
          aiGeneratedAt: now,
          aiModel: input.aiModel,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // 2. Insert keywords (deduplicated)
      const uniqueKeywords = [...new Set(
        input.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)
      )];
      for (const keyword of uniqueKeywords) {
        await tx.insert(noteKeywords)
          .values({ noteId: note.id, keyword })
          .onConflictDoNothing()
          .run();
      }

      // 3. Insert facts
      const uniqueFacts = [...new Set(input.facts.map((f) => f.trim()).filter(Boolean))];
      for (let i = 0; i < uniqueFacts.length; i++) {
        const fact = uniqueFacts[i];
        if (fact) {
          await tx.insert(noteFacts)
            .values({ noteId: note.id, fact, sortOrder: i })
            .onConflictDoNothing()
            .run();
        }
      }

      return note;
    });
  },

  /**
   * Replaces an existing note's content while preserving history.
   * Steps:
   *   1. Snapshot current content to notes_versions
   *   2. Replace keywords (delete all, re-insert)
   *   3. Replace facts (delete all, re-insert)
   *   4. Update notes row with new content
   * All steps run in a single transaction — if any step fails, rolls back.
   */
  async update(noteId: number, input: NoteUpdate): Promise<Note | undefined> {
    const existing = await noteRepository.findById(noteId);
    if (!existing) return undefined;

    const now = new Date().toISOString();

    return await db.transaction(async (tx) => {
      // 1. Snapshot existing content to version history
      const versionCount = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(notesVersions)
        .where(eq(notesVersions.noteId, noteId))
        .get();
      const nextVersion = `v${Number(versionCount?.count ?? 0) + 1}`;

      await tx.insert(notesVersions)
        .values({
          noteId,
          content: existing.content,
          versionLabel: nextVersion,
          createdAt: now,
        })
        .run();

      // 2. Replace keywords
      await tx.delete(noteKeywords).where(eq(noteKeywords.noteId, noteId)).run();
      const uniqueKeywords = [...new Set(
        input.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)
      )];
      for (const keyword of uniqueKeywords) {
        await tx.insert(noteKeywords)
          .values({ noteId, keyword })
          .onConflictDoNothing()
          .run();
      }

      // 3. Replace facts
      await tx.delete(noteFacts).where(eq(noteFacts.noteId, noteId)).run();
      const uniqueFacts = [...new Set(input.facts.map((f) => f.trim()).filter(Boolean))];
      for (let i = 0; i < uniqueFacts.length; i++) {
        const fact = uniqueFacts[i];
        if (fact) {
          await tx.insert(noteFacts)
            .values({ noteId, fact, sortOrder: i })
            .onConflictDoNothing()
            .run();
        }
      }

      // 4. Update the note itself
      return await tx
        .update(notes)
        .set({
          content: input.content,
          rawAiResponse: input.rawAiResponse ?? existing.rawAiResponse,
          generatedFrom: input.generatedFrom ?? existing.generatedFrom,
          aiModel: input.aiModel ?? existing.aiModel,
          aiGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(notes.id, noteId))
        .returning()
        .get();
    });
  },

  // ─── Lookup ──────────────────────────────────────────────────────────────

  /**
   * Finds a note by primary key.
   */
  async findById(id: number): Promise<Note | undefined> {
    return await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.isDeleted, false)))
      .get();
  },

  /**
   * Finds a note by its topic ID.
   * Returns undefined if no note exists or is soft-deleted.
   */
  async findByTopicId(topicId: number): Promise<Note | undefined> {
    return await db
      .select()
      .from(notes)
      .where(and(eq(notes.topicId, topicId), eq(notes.isDeleted, false)))
      .get();
  },

  /**
   * Finds a note by topic slug (requires JOIN).
   */
  async findByTopicSlug(slug: string): Promise<NoteWithMeta | undefined> {
    const resultObj = await rawSqlite.execute({
        sql: `SELECT
          n.*,
          t.name     AS topicName,
          t.slug     AS topicSlug,
          t.category AS topicCategory,
          (SELECT COUNT(*) FROM notes_versions nv WHERE nv.note_id = n.id) AS versionCount
        FROM notes n
        JOIN topics t ON t.id = n.topic_id
        WHERE t.slug = ?
          AND n.is_deleted = 0
          AND t.is_deleted = 0
        LIMIT 1`,
        args: [slug]
    });
    
    const result = resultObj.rows[0] as unknown as
      | (Note & {
          topicName: string;
          topicSlug: string;
          topicCategory: string;
          versionCount: number;
        })
      | undefined;

    if (!result) return undefined;

    const keywords = await noteRepository.getKeywords(result.id);
    const facts = await noteRepository.getFacts(result.id);

    return {
      ...result,
      versionCount: Number(result.versionCount ?? 0),
      keywordList: keywords.map((k) => k.keyword),
      factList: facts.map((f) => f.fact),
    };
  },

  /**
   * Returns all notes with metadata, ordered by most recently studied.
   * Used by the /revision and dashboard pages.
   */
  async findAll(limit: number = 50, offset: number = 0): Promise<NoteListItem[]> {
    const resultsObj = await rawSqlite.execute({
        sql: `SELECT
          n.id,
          n.topic_id      AS topicId,
          n.generated_from AS generatedFrom,
          n.view_count    AS viewCount,
          n.revision_count AS revisionCount,
          n.last_studied_at AS lastStudiedAt,
          n.ai_generated_at AS aiGeneratedAt,
          n.ai_model      AS aiModel,
          n.updated_at    AS updatedAt,
          t.name          AS topicName,
          t.slug          AS topicSlug,
          t.category      AS topicCategory,
          (SELECT COUNT(*) FROM note_facts nf WHERE nf.note_id = n.id) AS factCount,
          (SELECT COUNT(*) FROM note_keywords nk WHERE nk.note_id = n.id) AS keywordCount
        FROM notes n
        JOIN topics t ON t.id = n.topic_id
        WHERE n.is_deleted = 0
          AND t.is_deleted = 0
        ORDER BY n.last_studied_at DESC NULLS LAST, n.updated_at DESC
        LIMIT ? OFFSET ?`,
        args: [limit, offset]
    });
    
    return resultsObj.rows as unknown as NoteListItem[];
  },

  // ─── Keywords & Facts ─────────────────────────────────────────────────────

  /**
   * Returns all keywords for a note.
   */
  async getKeywords(noteId: number): Promise<NoteKeyword[]> {
    return await db
      .select()
      .from(noteKeywords)
      .where(eq(noteKeywords.noteId, noteId))
      .orderBy(asc(noteKeywords.keyword))
      .all();
  },

  /**
   * Returns all facts for a note, sorted by sort_order.
   */
  async getFacts(noteId: number): Promise<NoteFact[]> {
    return await db
      .select()
      .from(noteFacts)
      .where(eq(noteFacts.noteId, noteId))
      .orderBy(asc(noteFacts.sortOrder))
      .all();
  },

  /**
   * Returns a random selection of facts across all notes.
   * Used by the /revision daily facts feature.
   */
  async getRandomFacts(count: number = 10): Promise<Array<NoteFact & { topicName: string; topicSlug: string }>> {
    const resultObj = await rawSqlite.execute({
        sql: `SELECT
          nf.*,
          t.name AS topicName,
          t.slug AS topicSlug
        FROM note_facts nf
        JOIN notes n ON n.id = nf.note_id
        JOIN topics t ON t.id = n.topic_id
        WHERE n.is_deleted = 0 AND t.is_deleted = 0
        ORDER BY RANDOM()
        LIMIT ?`,
        args: [count]
    });
    return resultObj.rows as unknown as Array<NoteFact & { topicName: string; topicSlug: string }>;
  },

  // ─── Version History ──────────────────────────────────────────────────────

  /**
   * Returns all version snapshots for a note, newest first.
   */
  async getVersions(noteId: number): Promise<NoteVersion[]> {
    return await db
      .select()
      .from(notesVersions)
      .where(eq(notesVersions.noteId, noteId))
      .orderBy(desc(notesVersions.createdAt))
      .all();
  },

  /**
   * Returns a specific version snapshot.
   */
  async getVersion(versionId: number): Promise<NoteVersion | undefined> {
    return await db
      .select()
      .from(notesVersions)
      .where(eq(notesVersions.id, versionId))
      .get();
  },

  /**
   * Restores a specific version as the current note content.
   * Creates a snapshot of the current content first (as part of the same transaction).
   */
  async restoreVersion(noteId: number, versionId: number): Promise<Note | undefined> {
    const targetVersion = await noteRepository.getVersion(versionId);
    if (!targetVersion || targetVersion.noteId !== noteId) return undefined;

    const existing = await noteRepository.findById(noteId);
    if (!existing) return undefined;

    const now = new Date().toISOString();

    return await db.transaction(async (tx) => {
      // Snapshot the current content before restoring
      const versionCount = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(notesVersions)
        .where(eq(notesVersions.noteId, noteId))
        .get();
      const nextLabel = `v${Number(versionCount?.count ?? 0) + 1}`;

      await tx.insert(notesVersions)
        .values({
          noteId,
          content: existing.content,
          versionLabel: nextLabel,
          createdAt: now,
        })
        .run();

      // Restore the target version
      return await tx
        .update(notes)
        .set({
          content: targetVersion.content,
          updatedAt: now,
        })
        .where(eq(notes.id, noteId))
        .returning()
        .get();
    });
  },

  // ─── Engagement Metrics ───────────────────────────────────────────────────

  /**
   * Increments view_count and updates last_studied_at.
   */
  async incrementViewed(id: number): Promise<void> {
    await db.update(notes)
      .set({
        viewCount: sql`${notes.viewCount} + 1`,
        lastStudiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notes.id, id))
      .run();
  },

  /**
   * Increments revision_count.
   */
  async incrementRevised(id: number): Promise<void> {
    await db.update(notes)
      .set({
        revisionCount: sql`${notes.revisionCount} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notes.id, id))
      .run();
  },

  // ─── Soft Delete ─────────────────────────────────────────────────────────

  /**
   * Soft-deletes a note.
   */
  async softDelete(id: number): Promise<Note | undefined> {
    return await db
      .update(notes)
      .set({ isDeleted: true, updatedAt: new Date().toISOString() })
      .where(eq(notes.id, id))
      .returning()
      .get();
  },

  /**
   * Restores a soft-deleted note.
   */
  async restore(id: number): Promise<Note | undefined> {
    return await db
      .update(notes)
      .set({ isDeleted: false, updatedAt: new Date().toISOString() })
      .where(eq(notes.id, id))
      .returning()
      .get();
  },

  /**
   * Returns soft-deleted notes for the trash view.
   */
  async findDeleted(): Promise<NoteListItem[]> {
    const resultObj = await rawSqlite.execute(`
        SELECT
          n.id, n.topic_id AS topicId, n.generated_from AS generatedFrom,
          n.view_count AS viewCount, n.revision_count AS revisionCount,
          n.last_studied_at AS lastStudiedAt, n.ai_generated_at AS aiGeneratedAt,
          n.ai_model AS aiModel, n.updated_at AS updatedAt,
          t.name AS topicName, t.slug AS topicSlug, t.category AS topicCategory,
          (SELECT COUNT(*) FROM note_facts nf WHERE nf.note_id = n.id) AS factCount,
          (SELECT COUNT(*) FROM note_keywords nk WHERE nk.note_id = n.id) AS keywordCount
        FROM notes n
        JOIN topics t ON t.id = n.topic_id
        WHERE n.is_deleted = 1
        ORDER BY n.updated_at DESC
    `);
    
    return resultObj.rows as unknown as NoteListItem[];
  },

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * Returns counts for dashboard display.
   */
  async getStats(): Promise<{
    totalNotes: number;
    totalFacts: number;
    totalKeywords: number;
    totalVersions: number;
  }> {
    const noteCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notes)
      .where(eq(notes.isDeleted, false))
      .get();

    const factCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(noteFacts)
      .get();

    const keywordCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(noteKeywords)
      .get();

    const versionCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notesVersions)
      .get();

    return {
      totalNotes: Number(noteCount?.count ?? 0),
      totalFacts: Number(factCount?.count ?? 0),
      totalKeywords: Number(keywordCount?.count ?? 0),
      totalVersions: Number(versionCount?.count ?? 0),
    };
  },
} as const;
