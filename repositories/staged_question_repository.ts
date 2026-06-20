/**
 * repositories/staged_question_repository.ts
 *
 * Repository for the `staged_questions` table.
 * Staged questions are AI-extracted but await human review before approval.
 * The ONLY layer allowed to use Drizzle ORM directly.
 *
 * Key design:
 *   - Only 'approved' staged questions can be promoted to `questions`
 *   - 'rejected' questions are kept for audit visibility
 *   - Bulk operations use DB transactions for atomicity
 */

import { eq, and, inArray, desc, sql, ne } from "drizzle-orm";
import { db } from "@/db/connection";
import { stagedQuestions } from "@/db/schema";
import type {
  StagedQuestion,
  QuestionStatus,
  ValidCategory,
  ValidDifficulty,
} from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateStagedQuestionInput = {
  importJobId: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation?: string;
  difficulty: ValidDifficulty;
  topic: string;
  category: ValidCategory;
};

export type StagedQuestionUpdate = Partial<{
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: ValidDifficulty;
  topic: string;
  category: ValidCategory;
  status: QuestionStatus;
  reviewNote: string;
}>;

export type StagedQuestionFilterOptions = {
  importJobId?: number;
  status?: QuestionStatus;
  category?: ValidCategory;
  limit?: number;
  offset?: number;
};

export type StagedQuestionWithParsedOptions = Omit<StagedQuestion, "options"> & {
  parsedOptions: { A: string; B: string; C: string; D: string };
};

export type ReviewQueueStats = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const stagedQuestionRepository = {
  /**
   * Inserts a single staged question.
   * Options are serialized to JSON for storage.
   */
  create(input: CreateStagedQuestionInput): StagedQuestion {
    const now = new Date().toISOString();

    return db
      .insert(stagedQuestions)
      .values({
        importJobId: input.importJobId,
        question: input.question,
        options: JSON.stringify(input.options),
        answer: input.answer,
        explanation: input.explanation ?? null,
        difficulty: input.difficulty,
        topic: input.topic,
        category: input.category,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  },

  /**
   * Bulk-inserts staged questions in a single transaction.
   * Returns the count of rows inserted.
   * Skips the entire batch on error (atomic).
   */
  createMany(inputs: CreateStagedQuestionInput[]): number {
    if (inputs.length === 0) return 0;

    const now = new Date().toISOString();

    return db.transaction(() => {
      let count = 0;
      for (const input of inputs) {
        db.insert(stagedQuestions)
          .values({
            importJobId: input.importJobId,
            question: input.question,
            options: JSON.stringify(input.options),
            answer: input.answer,
            explanation: input.explanation ?? null,
            difficulty: input.difficulty,
            topic: input.topic,
            category: input.category,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          })
          .run();
        count++;
      }
      return count;
    });
  },

  /**
   * Finds a staged question by primary key.
   */
  findById(id: number): StagedQuestion | undefined {
    return db
      .select()
      .from(stagedQuestions)
      .where(eq(stagedQuestions.id, id))
      .get();
  },

  /**
   * Returns a paginated, filtered list of staged questions.
   */
  findAll(options: StagedQuestionFilterOptions = {}): {
    items: StagedQuestion[];
    total: number;
  } {
    const { importJobId, status, category, limit = 50, offset = 0 } = options;

    const conditions = [];
    if (importJobId !== undefined) {
      conditions.push(eq(stagedQuestions.importJobId, importJobId));
    }
    if (status !== undefined) {
      conditions.push(eq(stagedQuestions.status, status));
    }
    if (category !== undefined) {
      conditions.push(eq(stagedQuestions.category, category));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = [
      db
        .select()
        .from(stagedQuestions)
        .where(whereClause)
        .orderBy(desc(stagedQuestions.createdAt))
        .limit(limit)
        .offset(offset)
        .all(),

      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(stagedQuestions)
        .where(whereClause)
        .get(),
    ];

    return { items, total: countResult?.count ?? 0 };
  },

  /**
   * Returns all pending staged questions for a given import job.
   */
  findPendingByJobId(importJobId: number): StagedQuestion[] {
    return db
      .select()
      .from(stagedQuestions)
      .where(
        and(
          eq(stagedQuestions.importJobId, importJobId),
          eq(stagedQuestions.status, "pending")
        )
      )
      .orderBy(desc(stagedQuestions.createdAt))
      .all();
  },

  /**
   * Returns all approved staged questions for promotion to the question bank.
   * Optionally scoped to a single import job.
   */
  findApproved(importJobId?: number): StagedQuestion[] {
    const conditions = [eq(stagedQuestions.status, "approved")];
    if (importJobId !== undefined) {
      conditions.push(eq(stagedQuestions.importJobId, importJobId));
    }
    return db
      .select()
      .from(stagedQuestions)
      .where(and(...conditions))
      .orderBy(desc(stagedQuestions.createdAt))
      .all();
  },

  /**
   * Updates a staged question's editable fields.
   * Only mutable fields are allowed — status changes use dedicated methods.
   */
  update(id: number, data: StagedQuestionUpdate): StagedQuestion | undefined {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.question !== undefined) updatePayload["question"] = data.question;
    if (data.options !== undefined)
      updatePayload["options"] = JSON.stringify(data.options);
    if (data.answer !== undefined) updatePayload["answer"] = data.answer;
    if (data.explanation !== undefined)
      updatePayload["explanation"] = data.explanation;
    if (data.difficulty !== undefined)
      updatePayload["difficulty"] = data.difficulty;
    if (data.topic !== undefined) updatePayload["topic"] = data.topic;
    if (data.category !== undefined) updatePayload["category"] = data.category;
    if (data.status !== undefined) updatePayload["status"] = data.status;
    if (data.reviewNote !== undefined)
      updatePayload["reviewNote"] = data.reviewNote;

    return db
      .update(stagedQuestions)
      .set(updatePayload)
      .where(eq(stagedQuestions.id, id))
      .returning()
      .get();
  },

  /**
   * Approves a staged question for promotion.
   */
  approve(id: number): StagedQuestion | undefined {
    return db
      .update(stagedQuestions)
      .set({ status: "approved", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(stagedQuestions.id, id),
          eq(stagedQuestions.status, "pending")
        )
      )
      .returning()
      .get();
  },

  /**
   * Rejects a staged question with an optional review note.
   */
  reject(id: number, reviewNote?: string): StagedQuestion | undefined {
    return db
      .update(stagedQuestions)
      .set({
        status: "rejected",
        reviewNote: reviewNote ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(stagedQuestions.id, id),
          ne(stagedQuestions.status, "rejected")
        )
      )
      .returning()
      .get();
  },

  /**
   * Bulk-approves all pending questions for an import job.
   * Executes in a single transaction.
   * Returns the count of questions approved.
   */
  approveAllPending(importJobId: number): number {
    const now = new Date().toISOString();

    const result = db
      .update(stagedQuestions)
      .set({ status: "approved", updatedAt: now })
      .where(
        and(
          eq(stagedQuestions.importJobId, importJobId),
          eq(stagedQuestions.status, "pending")
        )
      )
      .returning()
      .all();

    return result.length;
  },

  /**
   * Bulk-rejects all pending questions for an import job.
   * Returns the count of questions rejected.
   */
  rejectAllPending(importJobId: number): number {
    const result = db
      .update(stagedQuestions)
      .set({
        status: "rejected",
        reviewNote: "Bulk rejected",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(stagedQuestions.importJobId, importJobId),
          eq(stagedQuestions.status, "pending")
        )
      )
      .returning()
      .all();

    return result.length;
  },

  /**
   * Bulk-updates the status of specific IDs in a single transaction.
   */
  bulkUpdateStatus(
    ids: number[],
    status: QuestionStatus
  ): number {
    if (ids.length === 0) return 0;

    const result = db
      .update(stagedQuestions)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(inArray(stagedQuestions.id, ids))
      .returning()
      .all();

    return result.length;
  },

  /**
   * Returns review queue stats for a given import job (or all jobs if omitted).
   */
  getReviewStats(importJobId?: number): ReviewQueueStats {
    const condition =
      importJobId !== undefined
        ? eq(stagedQuestions.importJobId, importJobId)
        : undefined;

    const result = db
      .select({
        pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
        approved: sql<number>`SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(stagedQuestions)
      .where(condition)
      .get();

    return {
      pending: result?.pending ?? 0,
      approved: result?.approved ?? 0,
      rejected: result?.rejected ?? 0,
      total: result?.total ?? 0,
    };
  },

  /**
   * Deletes all staged questions for an import job.
   * Used when cleaning up a failed/deleted import job.
   */
  deleteByJobId(importJobId: number): number {
    const result = db
      .delete(stagedQuestions)
      .where(eq(stagedQuestions.importJobId, importJobId))
      .returning()
      .all();
    return result.length;
  },

  /**
   * Parses the JSON `options` field into a typed object.
   * Helper used by the review UI to render MCQ options.
   */
  parseOptions(
    raw: StagedQuestion
  ): StagedQuestionWithParsedOptions {
    let parsedOptions: { A: string; B: string; C: string; D: string };
    try {
      parsedOptions = JSON.parse(raw.options) as { A: string; B: string; C: string; D: string };
    } catch {
      parsedOptions = { A: "", B: "", C: "", D: "" };
    }
    const { options: _options, ...rest } = raw;
    void _options;
    return { ...rest, parsedOptions };
  },
} as const;
