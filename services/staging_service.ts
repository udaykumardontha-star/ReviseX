/**
 * services/staging_service.ts
 *
 * Business logic for the staged question review UI.
 *
 * The staging layer is the human-in-the-loop checkpoint between
 * Gemini AI extraction and the canonical question bank.
 *
 * Responsibilities:
 *   - Review queue listing (by import job)
 *   - Individual approve / reject / edit
 *   - Bulk approve-all / reject-all
 *   - Promoting approved → question bank (delegates to question_service)
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import {
  stagedQuestionRepository,
  importJobRepository,
} from "@/repositories";
import type { ReviewQueueStats, StagedQuestionUpdate } from "@/repositories";
import { questionService } from "@/services/question_service";
import type { StagedQuestion } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewQueuePage = {
  items: Array<
    Omit<StagedQuestion, "options"> & {
      parsedOptions: { A: string; B: string; C: string; D: string };
    }
  >;
  total: number;
  stats: ReviewQueueStats;
  page: number;
  pageSize: number;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const stagingService = {
  /**
   * Returns a paginated review queue for a specific import job.
   * Options are returned with parsed JSON options for rendering.
   */
  async getReviewQueue(
    importJobId: number,
    page: number = 1,
    pageSize: number = 20,
    statusFilter?: "pending" | "approved" | "rejected"
  ): Promise<Result<ReviewQueuePage>> {
    const job = await importJobRepository.findById(importJobId);
    if (!job) {
      return err(`Import job #${importJobId} not found`, null, "NOT_FOUND");
    }

    const offset = (page - 1) * pageSize;
    const { items, total } = await stagedQuestionRepository.findAll({
      importJobId,
      limit: pageSize,
      offset,
      ...(statusFilter ? { status: statusFilter } : {}),
    });

    const parsedItems = items.map((item) =>
      stagedQuestionRepository.parseOptions(item)
    );
    const stats = await stagedQuestionRepository.getReviewStats(importJobId);

    return ok({ items: parsedItems, total, stats, page, pageSize });
  },

  /**
   * Approves a single staged question.
   */
  async approveQuestion(id: number): Promise<Result<StagedQuestion>> {
    const updated = await stagedQuestionRepository.approve(id);
    if (!updated) {
      return err(
        `Staged question #${id} not found or is not in pending state`,
        null,
        "NOT_FOUND"
      );
    }
    return ok(updated);
  },

  /**
   * Rejects a single staged question with an optional note.
   */
  async rejectQuestion(id: number, reviewNote?: string): Promise<Result<StagedQuestion>> {
    const updated = await stagedQuestionRepository.reject(id, reviewNote);
    if (!updated) {
      return err(
        `Staged question #${id} not found`,
        null,
        "NOT_FOUND"
      );
    }
    return ok(updated);
  },

  /**
   * Edits a staged question's content (before approval).
   */
  async editQuestion(
    id: number,
    data: StagedQuestionUpdate
  ): Promise<Result<StagedQuestion>> {
    const existing = await stagedQuestionRepository.findById(id);
    if (!existing) {
      return err(`Staged question #${id} not found`, null, "NOT_FOUND");
    }
    if (existing.status !== "pending") {
      return err(
        `Cannot edit a question with status "${existing.status}". Only pending questions can be edited.`,
        null,
        "VALIDATION_ERROR"
      );
    }

    const updated = await stagedQuestionRepository.update(id, data);
    if (!updated) {
      return err("Failed to update staged question", null, "DATABASE_ERROR");
    }
    return ok(updated);
  },

  /**
   * Bulk-approves all pending questions for an import job.
   * Returns the count of approved questions.
   */
  async approveAll(importJobId: number): Promise<Result<{ approved: number }>> {
    const job = await importJobRepository.findById(importJobId);
    if (!job) {
      return err(`Import job #${importJobId} not found`, null, "NOT_FOUND");
    }

    const approved = await stagedQuestionRepository.approveAllPending(importJobId);
    return ok({ approved });
  },

  /**
   * Bulk-rejects all pending questions for an import job.
   */
  async rejectAll(importJobId: number): Promise<Result<{ rejected: number }>> {
    const job = await importJobRepository.findById(importJobId);
    if (!job) {
      return err(`Import job #${importJobId} not found`, null, "NOT_FOUND");
    }

    const rejected = await stagedQuestionRepository.rejectAllPending(importJobId);
    return ok({ rejected });
  },

  /**
   * Promotes all approved staged questions for an import job into the question bank.
   * This is the final step of the review workflow.
   * Delegates to questionService.promoteApprovedQuestions().
   */
  async promoteApprovedToBank(
    importJobId: number
  ): Promise<Result<{ promoted: number; skipped: number; topicsCreated: number }>> {
    const stats = await stagedQuestionRepository.getReviewStats(importJobId);

    if (stats.approved === 0) {
      return err(
        "No approved questions to promote. Approve some questions first.",
        null,
        "VALIDATION_ERROR"
      );
    }

    return await questionService.promoteApprovedQuestions(importJobId);
  },

  /**
   * Returns review stats for an import job (counts by status).
   */
  async getStats(importJobId: number): Promise<Result<ReviewQueueStats>> {
    const job = await importJobRepository.findById(importJobId);
    if (!job) {
      return err(`Import job #${importJobId} not found`, null, "NOT_FOUND");
    }
    const stats = await stagedQuestionRepository.getReviewStats(importJobId);
    return ok(stats);
  },
} as const;
