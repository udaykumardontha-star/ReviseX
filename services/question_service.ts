/**
 * services/question_service.ts
 *
 * Business logic for the Question Bank (approved questions).
 *
 * Responsibilities:
 *   - Promoting staged questions → question bank (with topic resolution)
 *   - Searching questions (FTS5 + filtered listing)
 *   - Bookmarks and flags
 *   - Dashboard stats
 *
 * IMPORTANT: Topic resolution happens here, not in the repository.
 * The service creates topics on-the-fly if they don't exist during promotion.
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import {
  questionRepository,
  topicRepository,
  sourceRepository,
  stagedQuestionRepository,
  importJobRepository,
} from "@/repositories";
import type { QuestionFilterOptions, FtsSearchResult } from "@/repositories";
import { hashQuestion } from "@/lib/utils/hasher";
import { toSlug } from "@/lib/utils/slugifier";
import { normalizeTopic } from "@/lib/utils/normalizer";
import type {
  Question,
  QuestionWithTopic,
  QuestionFlag,
  ValidCategory,
  ValidDifficulty,
} from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PromoteQuestionsResult = {
  promoted: number;
  skipped: number;
  topicsCreated: number;
};

export type QuestionSearchResult = {
  items: QuestionWithTopic[];
  total: number;
  page: number;
  pageSize: number;
};

export type FtsQuestionSearchResult = {
  items: FtsSearchResult[];
  total: number;
  query: string;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const questionService = {
  /**
   * Promotes all approved staged questions for an import job into the question bank.
   *
   * For each staged question:
   *   1. Resolve / create the topic (using alias lookup first — Database First)
   *   2. Hash the question text
   *   3. Insert (skipping duplicates via onConflictDoNothing)
   *   4. Mark topic as needs_refresh (new question arrived)
   *
   * Returns { promoted, skipped, topicsCreated }.
   */
  promoteApprovedQuestions(
    importJobId: number
  ): Result<PromoteQuestionsResult> {
    const job = importJobRepository.findById(importJobId);
    if (!job) {
      return err(`Import job #${importJobId} not found`, null, "NOT_FOUND");
    }

    const source = sourceRepository.findById(job.sourceId);
    if (!source) {
      return err(`Source #${job.sourceId} not found`, null, "NOT_FOUND");
    }

    const approvedStaged = stagedQuestionRepository.findApproved(importJobId);
    if (approvedStaged.length === 0) {
      return ok({ promoted: 0, skipped: 0, topicsCreated: 0 });
    }

    let promoted = 0;
    let skipped = 0;
    let topicsCreated = 0;

    for (const staged of approvedStaged) {
      // ── Database First: resolve topic by alias, then name, then create ──
      const rawTopicName = staged.topic;
      const normalizedName = normalizeTopic(rawTopicName);
      const slug = toSlug(normalizedName);
      const category = staged.category as ValidCategory;

      let topic = topicRepository.resolveByNameOrAlias(normalizedName);

      if (!topic) {
        // Create new topic
        const created = topicRepository.findOrCreate({
          slug,
          name: normalizedName,
          category,
        });
        topic = created;
        topicsCreated++;
        // Register the raw AI string as an alias for future dedup
        topicRepository.addAlias(topic.id, rawTopicName.toLowerCase().trim());
      } else {
        // Register the alias even if topic already exists
        topicRepository.addAlias(topic.id, rawTopicName.toLowerCase().trim());
      }

      // Hash the question for deduplication
      const questionHash = hashQuestion(staged.question);

      // Attempt insert (skip if hash collision)
      const inserted = questionRepository.create({
        questionHash,
        topicId: topic.id,
        sourceId: source.id,
        category: staged.category as ValidCategory,
        difficulty: staged.difficulty as ValidDifficulty,
        question: staged.question,
        optionA: JSON.parse(staged.options).A as string,
        optionB: JSON.parse(staged.options).B as string,
        optionC: JSON.parse(staged.options).C as string,
        optionD: JSON.parse(staged.options).D as string,
        correctOption: staged.answer as "A" | "B" | "C" | "D",
        ...(staged.explanation ? { shortExplanation: staged.explanation } : {}),
        sourceType: job.fileName,
      });

      if (inserted) {
        promoted++;
        // Mark topic as needing note refresh since it gained new questions
        topicRepository.markNeedsRefresh(topic.id);
      } else {
        skipped++;
      }
    }

    // Recalculate source counter after bulk promotion
    sourceRepository.recalculateTotalQuestions(source.id);

    return ok({ promoted, skipped, topicsCreated });
  },

  /**
   * Returns a paginated + filtered list of questions from the question bank.
   * Enriched with topic name and bookmark status.
   */
  listQuestions(
    options: QuestionFilterOptions & { page?: number }
  ): Result<QuestionSearchResult> {
    const pageSize = options.limit ?? 20;
    const page = options.page ?? 1;
    const offset = (page - 1) * pageSize;

    const { items, total } = questionRepository.findAll({
      ...options,
      limit: pageSize,
      offset,
    });

    return ok({ items, total, page, pageSize });
  },

  /**
   * Full-text search over the questions FTS5 index.
   * Returns ranked results with snippet highlights.
   */
  searchQuestions(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Result<FtsQuestionSearchResult> {
    if (!query.trim() || query.trim().length < 2) {
      return err("Search query must be at least 2 characters", null, "VALIDATION_ERROR");
    }

    const items = questionRepository.ftsSearch(query, limit, offset);
    const total = questionRepository.ftsSearchCount(query);

    return ok({ items, total, query: query.trim() });
  },

  /**
   * Returns a single question with topic + bookmark info.
   * Also increments the view counter.
   */
  getQuestion(id: number): Result<QuestionWithTopic> {
    const question = questionRepository.findByIdWithTopic(id);
    if (!question) {
      return err(`Question #${id} not found`, null, "NOT_FOUND");
    }

    questionRepository.incrementViewed(id);
    return ok(question);
  },

  /**
   * Returns questions for a specific topic (for the "Practice" tab).
   */
  getQuestionsForTopic(
    topicId: number,
    limit: number = 20,
    offset: number = 0
  ): Result<{ items: Question[]; total: number }> {
    const topic = topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }

    const { items, total } = questionRepository.findAll({
      topicId,
      limit,
      offset,
    });

    return ok({ items: items as Question[], total });
  },

  // ─── Bookmarks ─────────────────────────────────────────────────────────────

  /**
   * Toggles bookmark on a question.
   * Returns { bookmarked: true|false } indicating the new state.
   */
  toggleBookmark(
    questionId: number
  ): Result<{ bookmarked: boolean }> {
    const question = questionRepository.findById(questionId);
    if (!question) {
      return err(`Question #${questionId} not found`, null, "NOT_FOUND");
    }

    const isBookmarked = questionRepository.isBookmarked(questionId);
    if (isBookmarked) {
      questionRepository.unbookmark(questionId);
      return ok({ bookmarked: false });
    } else {
      questionRepository.bookmark(questionId);
      return ok({ bookmarked: true });
    }
  },

  /**
   * Returns all bookmarked questions with full metadata.
   */
  getBookmarkedQuestions(): Result<QuestionSearchResult> {
    const { items, total } = questionRepository.findAll({
      isBookmarked: true,
      limit: 200,
    });
    return ok({ items, total, page: 1, pageSize: 200 });
  },

  // ─── Flags ─────────────────────────────────────────────────────────────────

  /**
   * Flags a question with a reason.
   */
  flagQuestion(
    questionId: number,
    reason: string,
    details?: string
  ): Result<QuestionFlag> {
    const question = questionRepository.findById(questionId);
    if (!question) {
      return err(`Question #${questionId} not found`, null, "NOT_FOUND");
    }
    if (!reason.trim()) {
      return err("Flag reason cannot be empty", null, "VALIDATION_ERROR");
    }

    const flag = questionRepository.flag({
      questionId,
      reason: reason.trim(),
      ...(details ? { details } : {}),
    });
    return ok(flag);
  },

  /**
   * Resolves a flag (marks it as reviewed/closed).
   */
  resolveFlag(flagId: number): Result<QuestionFlag> {
    const flag = questionRepository.resolveFlag(flagId);
    if (!flag) {
      return err(`Flag #${flagId} not found`, null, "NOT_FOUND");
    }
    return ok(flag);
  },

  /**
   * Returns all unresolved flags across the question bank.
   */
  getAllFlags(): QuestionFlag[] {
    return questionRepository.getAllUnresolvedFlags();
  },

  // ─── Soft Delete / Restore ─────────────────────────────────────────────────

  /**
   * Soft-deletes a question (hides from all UI).
   */
  deleteQuestion(id: number): Result<true> {
    const question = questionRepository.findById(id);
    if (!question) {
      return err(`Question #${id} not found`, null, "NOT_FOUND");
    }
    questionRepository.softDelete(id);
    return ok(true);
  },

  /**
   * Restores a soft-deleted question.
   */
  restoreQuestion(id: number): Result<Question> {
    const restored = questionRepository.restore(id);
    if (!restored) {
      return err(`Question #${id} not found or is not deleted`, null, "NOT_FOUND");
    }
    return ok(restored);
  },

  // ─── Stats ──────────────────────────────────────────────────────────────────

  /**
   * Returns aggregate question bank stats for the dashboard.
   */
  getStats() {
    return questionRepository.getStats();
  },
} as const;
