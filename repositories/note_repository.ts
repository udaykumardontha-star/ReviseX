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
  create(input: CreateNoteInput): Note | undefined {
    const existing = noteRepository.findByTopicId(input.topicId);
    if (existing) return undefined;

    const now = new Date().toISOString();

    return db.transaction(() => {
      // 1. Insert the note
      const note = db
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
        db.insert(noteKeywords)
          .values({ noteId: note.id, keyword })
          .onConflictDoNothing()
          .run();
      }

      // 3. Insert facts
      const uniqueFacts = [...new Set(input.facts.map((f) => f.trim()).filter(Boolean))];
      for (let i = 0; i < uniqueFacts.length; i++) {
        const fact = uniqueFacts[i];
        if (fact) {
          db.insert(noteFacts)
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
  update(noteId: number, input: NoteUpdate): Note | undefined {
    const existing = noteRepository.findById(noteId);
    if (!existing) return undefined;

    const now = new Date().toISOString();

    return db.transaction(() => {
      // 1. Snapshot existing content to version history
      const versionCount = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notesVersions)
        .where(eq(notesVersions.noteId, noteId))
        .get();
      const nextVersion = `v${(versionCount?.count ?? 0) + 1}`;

      db.insert(notesVersions)
        .values({
          noteId,
          content: existing.content,
          versionLabel: nextVersion,
          createdAt: now,
        })
        .run();

      // 2. Replace keywords
      db.delete(noteKeywords).where(eq(noteKeywords.noteId, noteId)).run();
      const uniqueKeywords = [...new Set(
        input.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)
      )];
      for (const keyword of uniqueKeywords) {
        db.insert(noteKeywords)
          .values({ noteId, keyword })
          .onConflictDoNothing()
          .run();
      }

      // 3. Replace facts
      db.delete(noteFacts).where(eq(noteFacts.noteId, noteId)).run();
      const uniqueFacts = [...new Set(input.facts.map((f) => f.trim()).filter(Boolean))];
      for (let i = 0; i < uniqueFacts.length; i++) {
        const fact = uniqueFacts[i];
        if (fact) {
          db.insert(noteFacts)
            .values({ noteId, fact, sortOrder: i })
            .onConflictDoNothing()
            .run();
        }
      }

      // 4. Update the note itself
      return db
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
  findById(id: number): Note | undefined {
    return db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.isDeleted, false)))
      .get();
  },

  /**
   * Finds a note by its topic ID.
   * Returns undefined if no note exists or is soft-deleted.
   */
  findByTopicId(topicId: number): Note | undefined {
    return db
      .select()
      .from(notes)
      .where(and(eq(notes.topicId, topicId), eq(notes.isDeleted, false)))
      .get();
  },

  /**
   * Finds a note by topic slug (requires JOIN).
   */
  findByTopicSlug(slug: string): NoteWithMeta | undefined {
    const result = rawSqlite
      .prepare(
        `SELECT
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
        LIMIT 1`
      )
      .get(slug) as
      | (Note & {
          topicName: string;
          topicSlug: string;
          topicCategory: string;
          versionCount: number;
        })
      | undefined;

    if (!result) return undefined;

    const keywords = noteRepository.getKeywords(result.id);
    const facts = noteRepository.getFacts(result.id);

    return {
      ...result,
      keywordList: keywords.map((k) => k.keyword),
      factList: facts.map((f) => f.fact),
    };
  },

  /**
   * Returns all notes with metadata, ordered by most recently studied.
   * Used by the /revision and dashboard pages.
   */
  findAll(limit: number = 50, offset: number = 0): NoteListItem[] {
    return rawSqlite
      .prepare(
        `SELECT
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
        LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as NoteListItem[];
  },

  // ─── Keywords & Facts ─────────────────────────────────────────────────────

  /**
   * Returns all keywords for a note.
   */
  getKeywords(noteId: number): NoteKeyword[] {
    return db
      .select()
      .from(noteKeywords)
      .where(eq(noteKeywords.noteId, noteId))
      .orderBy(asc(noteKeywords.keyword))
      .all();
  },

  /**
   * Returns all facts for a note, sorted by sort_order.
   */
  getFacts(noteId: number): NoteFact[] {
    return db
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
  getRandomFacts(count: number = 10): Array<NoteFact & { topicName: string; topicSlug: string }> {
    return rawSqlite
      .prepare(
        `SELECT
          nf.*,
          t.name AS topicName,
          t.slug AS topicSlug
        FROM note_facts nf
        JOIN notes n ON n.id = nf.note_id
        JOIN topics t ON t.id = n.topic_id
        WHERE n.is_deleted = 0 AND t.is_deleted = 0
        ORDER BY RANDOM()
        LIMIT ?`
      )
      .all(count) as Array<NoteFact & { topicName: string; topicSlug: string }>;
  },

  // ─── Version History ──────────────────────────────────────────────────────

  /**
   * Returns all version snapshots for a note, newest first.
   */
  getVersions(noteId: number): NoteVersion[] {
    return db
      .select()
      .from(notesVersions)
      .where(eq(notesVersions.noteId, noteId))
      .orderBy(desc(notesVersions.createdAt))
      .all();
  },

  /**
   * Returns a specific version snapshot.
   */
  getVersion(versionId: number): NoteVersion | undefined {
    return db
      .select()
      .from(notesVersions)
      .where(eq(notesVersions.id, versionId))
      .get();
  },

  /**
   * Restores a specific version as the current note content.
   * Creates a snapshot of the current content first (as part of the same transaction).
   */
  restoreVersion(noteId: number, versionId: number): Note | undefined {
    const targetVersion = noteRepository.getVersion(versionId);
    if (!targetVersion || targetVersion.noteId !== noteId) return undefined;

    const existing = noteRepository.findById(noteId);
    if (!existing) return undefined;

    const now = new Date().toISOString();

    return db.transaction(() => {
      // Snapshot the current content before restoring
      const versionCount = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notesVersions)
        .where(eq(notesVersions.noteId, noteId))
        .get();
      const nextLabel = `v${(versionCount?.count ?? 0) + 1}`;

      db.insert(notesVersions)
        .values({
          noteId,
          content: existing.content,
          versionLabel: nextLabel,
          createdAt: now,
        })
        .run();

      // Restore the target version
      return db
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
  incrementViewed(id: number): void {
    db.update(notes)
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
  incrementRevised(id: number): void {
    db.update(notes)
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
  softDelete(id: number): Note | undefined {
    return db
      .update(notes)
      .set({ isDeleted: true, updatedAt: new Date().toISOString() })
      .where(eq(notes.id, id))
      .returning()
      .get();
  },

  /**
   * Restores a soft-deleted note.
   */
  restore(id: number): Note | undefined {
    return db
      .update(notes)
      .set({ isDeleted: false, updatedAt: new Date().toISOString() })
      .where(eq(notes.id, id))
      .returning()
      .get();
  },

  /**
   * Returns soft-deleted notes for the trash view.
   */
  findDeleted(): NoteListItem[] {
    return rawSqlite
      .prepare(
        `SELECT
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
        ORDER BY n.updated_at DESC`
      )
      .all() as NoteListItem[];
  },

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * Returns counts for dashboard display.
   */
  getStats(): {
    totalNotes: number;
    totalFacts: number;
    totalKeywords: number;
    totalVersions: number;
  } {
    const noteCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notes)
      .where(eq(notes.isDeleted, false))
      .get();

    const factCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(noteFacts)
      .get();

    const keywordCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(noteKeywords)
      .get();

    const versionCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notesVersions)
      .get();

    return {
      totalNotes: noteCount?.count ?? 0,
      totalFacts: factCount?.count ?? 0,
      totalKeywords: keywordCount?.count ?? 0,
      totalVersions: versionCount?.count ?? 0,
    };
  },
} as const;
