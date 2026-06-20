/**
 * services/note_service.ts
 *
 * Lazy AI note generation — the heart of the Revision System.
 *
 * Golden Rule: Database First → Search First → Revision First → AI Last
 *
 * generateNote() flow:
 *   1. Check if a note already exists → return it (NO AI CALL)
 *   2. Check AI rate limit → reject early if exhausted
 *   3. Fetch context questions from the question bank
 *   4. Call Gemini (Prompt 2 — Topic Revision Generator)
 *   5. Validate the AI response with validationService
 *   6. Persist note + keywords + facts in a single transaction
 *   7. Update topic status to 'generated'
 *   8. Recalculate topic note counts
 *
 * refreshNote() flow:
 *   Same as above but with a version snapshot of the old note.
 *   Only runs when topic_status = 'needs_refresh' OR user explicitly requests it.
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import {
  noteRepository,
  topicRepository,
  questionRepository,
  settingsRepository,
} from "@/repositories";
import type { NoteWithMeta } from "@/repositories";
import { geminiClient } from "@/lib/ai/gemini_client";
import { validationService } from "@/services/validation_service";
import type { Note, NoteVersion } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NoteGenerationResult = {
  note: Note;
  keywords: string[];
  facts: string[];
  wasFromCache: boolean;   // true = returned existing note (no AI call)
  aiModel?: string;
};

export type NoteListResult = {
  items: Awaited<ReturnType<typeof noteRepository.findAll>>;
  total: number;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const noteService = {
  /**
   * Returns an existing note for a topic slug if it exists.
   * Does NOT call Gemini. Used for initial page load (always try this first).
   */
  async getNoteByTopicSlug(slug: string): Promise<Result<NoteWithMeta>> {
    const note = await noteRepository.findByTopicSlug(slug);
    if (!note) {
      return err(`No note found for topic "${slug}"`, null, "NOT_FOUND");
    }

    await noteRepository.incrementViewed(note.id);
    return ok(note);
  },

  /**
   * Returns an existing note by topic ID.
   */
  async getNoteByTopicId(topicId: number): Promise<Result<Note>> {
    const note = await noteRepository.findByTopicId(topicId);
    if (!note) {
      return err(`No note found for topic #${topicId}`, null, "NOT_FOUND");
    }
    return ok(note);
  },

  /**
   * LAZY GENERATION — the main entry point for /topics/[slug].
   *
   * Returns the existing note immediately if it exists (Database First).
   * Only calls Gemini if no note exists AND rate limit is not exceeded.
   */
  async generateOrGetNote(
    topicSlug: string
  ): Promise<Result<NoteGenerationResult>> {
    // 1. Resolve topic
    const topic = await topicRepository.findActiveBySlug(topicSlug);
    if (!topic) {
      return err(`Topic "${topicSlug}" not found`, null, "NOT_FOUND");
    }

    // 2. ── DATABASE FIRST: return cached note if it exists ────────────────
    const existingNote = await noteRepository.findByTopicId(topic.id);
    if (existingNote && topic.topicStatus === "generated") {
      const keywordsRaw = await noteRepository.getKeywords(existingNote.id);
      const keywords = keywordsRaw.map((k) => k.keyword);
      const factsRaw = await noteRepository.getFacts(existingNote.id);
      const facts = factsRaw.map((f) => f.fact);
      await noteRepository.incrementViewed(existingNote.id);
      return ok({
        note: existingNote,
        keywords,
        facts,
        wasFromCache: true,
      });
    }

    // 3. Check AI rate limit BEFORE calling Gemini
    if (await settingsRepository.isAiRateLimitReached()) {
      return err(
        "AI daily limit reached. Notes cannot be generated until tomorrow.",
        null,
        "AI_RATE_LIMIT"
      );
    }

    // 4. Gather context questions for the prompt (top 10 by times_revised)
    const contextQs = await questionRepository.findByTopicId(topic.id, undefined, 10);
    const contextQuestions = contextQs.map((q) => q.question);

    // 5. ── AI LAST: call Gemini ───────────────────────────────────────────
    const aiResult = await geminiClient.generateTopicRevision(
      topic.name,
      topic.category,
      contextQuestions
    );
    await settingsRepository.incrementAiCallCount();

    if (!aiResult.success) {
      return err(
        `AI generation failed for "${topic.name}": ${aiResult.error}`,
        aiResult.cause,
        aiResult.code
      );
    }

    // 6. Parse + validate the response
    const parseResult = validationService.parseJson(aiResult.data);
    if (!parseResult.success) {
      return err(
        `Failed to parse AI response: ${parseResult.error}`,
        parseResult.cause,
        "AI_PARSE_ERROR"
      );
    }

    const validateResult = validationService.validateTopicGeneratorResponse(
      parseResult.data
    );
    if (!validateResult.success) {
      return err(
        `AI response failed validation: ${validateResult.error}`,
        validateResult.cause,
        "AI_PARSE_ERROR"
      );
    }

    const validated = validateResult.data;

    // 7. ── Persist (create or update) ────────────────────────────────────
    const modelId = geminiClient.getModelId();

    let persistedNote: Note | undefined;

    if (existingNote) {
      // Update existing note (captures version snapshot internally)
      persistedNote = await noteRepository.update(existingNote.id, {
        content: validated.fullRevisionNote,
        rawAiResponse: aiResult.data,
        generatedFrom: "refresh",
        aiModel: modelId,
        keywords: validated.keywords,
        facts: validated.keyFacts,
      });
    } else {
      // Create brand-new note
      persistedNote = await noteRepository.create({
        topicId: topic.id,
        content: validated.fullRevisionNote,
        rawAiResponse: aiResult.data,
        generatedFrom: "question_bank",
        aiModel: modelId,
        keywords: validated.keywords,
        facts: validated.keyFacts,
      });
    }

    if (!persistedNote) {
      return err("Failed to persist note to database", null, "DATABASE_ERROR");
    }

    // 8. Update topic status and counts
    await topicRepository.markGenerated(topic.id);
    await topicRepository.recalculateNoteCounts(topic.id);

    return ok({
      note: persistedNote,
      keywords: validated.keywords,
      facts: validated.keyFacts,
      wasFromCache: false,
      aiModel: modelId,
    });
  },

  /**
   * Forces a note refresh, regardless of current topic status.
   * Creates a version snapshot of the old content before regenerating.
   * Rate limit is still enforced.
   */
  async refreshNote(topicId: number): Promise<Result<NoteGenerationResult>> {
    const topic = await topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }

    // Mark as needs_refresh then delegate to generateOrGetNote
    await topicRepository.markNeedsRefresh(topicId);
    return await noteService.generateOrGetNote(topic.slug);
  },

  /**
   * Returns all notes with metadata for the /revision page.
   */
  async listNotes(limit: number = 50, offset: number = 0): Promise<NoteListResult> {
    const items = await noteRepository.findAll(limit, offset);
    const stats = await noteRepository.getStats();
    return { items, total: stats.totalNotes };
  },

  /**
   * Returns N random facts for the "Daily Facts" widget.
   */
  async getRandomFacts(count: number = 10) {
    return await noteRepository.getRandomFacts(count);
  },

  /**
   * Returns version history for a note.
   */
  async getNoteVersions(noteId: number): Promise<Result<NoteVersion[]>> {
    const note = await noteRepository.findById(noteId);
    if (!note) {
      return err(`Note #${noteId} not found`, null, "NOT_FOUND");
    }
    const versions = await noteRepository.getVersions(noteId);
    return ok(versions);
  },

  /**
   * Restores a specific version of a note.
   */
  async restoreNoteVersion(
    noteId: number,
    versionId: number
  ): Promise<Result<Note>> {
    const restored = await noteRepository.restoreVersion(noteId, versionId);
    if (!restored) {
      return err(
        `Could not restore version #${versionId} for note #${noteId}`,
        null,
        "NOT_FOUND"
      );
    }
    return ok(restored);
  },

  /**
   * Soft-deletes a note.
   */
  async deleteNote(noteId: number): Promise<Result<true>> {
    const note = await noteRepository.findById(noteId);
    if (!note) return err(`Note #${noteId} not found`, null, "NOT_FOUND");
    await noteRepository.softDelete(noteId);
    // Reset topic status to not_generated
    await topicRepository.update(note.topicId, { topicStatus: "not_generated" });
    await topicRepository.recalculateNoteCounts(note.topicId);
    return ok(true);
  },

  /**
   * Returns note stats for the dashboard.
   */
  async getStats() {
    return await noteRepository.getStats();
  },
} as const;
