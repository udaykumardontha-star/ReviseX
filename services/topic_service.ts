/**
 * services/topic_service.ts
 *
 * Business logic for the topic taxonomy.
 *
 * Topics are the master entity — every question and note belongs to a topic.
 * This service handles filtering, soft-delete, alias management,
 * and the bridge to the staging review UI.
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import { topicRepository } from "@/repositories";
import type { TopicFilterOptions, TopicListItem } from "@/repositories";
import { toSlug } from "@/lib/utils/normalizer";
import { normalizeTopic } from "@/lib/utils/normalizer";
import type { Topic, ValidCategory } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TopicListResult = {
  items: TopicListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type TopicDetail = Topic & {
  aliases: string[];
  hasNote: boolean;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const topicService = {
  /**
   * Returns a paginated, filtered list of topics for the /topics page.
   */
  listTopics(
    options: TopicFilterOptions & { page?: number }
  ): Result<TopicListResult> {
    const pageSize = options.limit ?? 24;
    const page = options.page ?? 1;
    const offset = (page - 1) * pageSize;

    const { items, total } = topicRepository.findAll({
      ...options,
      limit: pageSize,
      offset,
    });

    return ok({ items, total, page, pageSize });
  },

  /**
   * Returns a single topic by slug with alias list and note status.
   * Also increments the topic view counter.
   */
  getTopic(slug: string): Result<TopicDetail> {
    const topic = topicRepository.findActiveBySlug(slug);
    if (!topic) {
      return err(`Topic "${slug}" not found`, null, "NOT_FOUND");
    }

    topicRepository.incrementViews(topic.id);

    const aliases = topicRepository
      .getAliases(topic.id)
      .map((a) => a.alias);

    const withNoteStatus = topicRepository.findWithNoteStatus(1);
    const hasNote = withNoteStatus.some(
      (t) => t.id === topic.id && t.hasNote
    );

    return ok({ ...topic, aliases, hasNote });
  },

  /**
   * Renames a topic. Updates slug and adds old name as alias.
   */
  renameTopic(
    id: number,
    newName: string
  ): Result<Topic> {
    const topic = topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    const normalized = normalizeTopic(newName);
    if (!normalized || normalized.length < 2) {
      return err("Topic name is too short or invalid", null, "VALIDATION_ERROR");
    }

    const newSlug = toSlug(normalized);

    // Check slug uniqueness (exclude current topic)
    const existing = topicRepository.findBySlug(newSlug);
    if (existing && existing.id !== id) {
      return err(
        `A topic with the name "${normalized}" already exists`,
        null,
        "DUPLICATE"
      );
    }

    // Add old name as alias before renaming
    topicRepository.addAlias(id, topic.name.toLowerCase().trim());

    const updated = topicRepository.update(id, {
      name: normalized,
    });

    if (!updated) {
      return err("Failed to rename topic", null, "DATABASE_ERROR");
    }

    return ok(updated);
  },

  /**
   * Changes a topic's category.
   */
  recategorize(
    id: number,
    category: ValidCategory
  ): Result<Topic> {
    const topic = topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    const updated = topicRepository.update(id, { category });
    if (!updated) {
      return err("Failed to update topic category", null, "DATABASE_ERROR");
    }

    return ok(updated);
  },

  /**
   * Merges one topic into another.
   * Moves all questions from `sourceTopicId` to `targetTopicId`,
   * then soft-deletes the source topic.
   *
   * This is an ADMIN-only operation. It runs via raw SQL for efficiency.
   */
  mergeTopics(
    sourceTopicId: number,
    targetTopicId: number
  ): Result<{ movedQuestions: number }> {
    if (sourceTopicId === targetTopicId) {
      return err("Source and target topics must be different", null, "VALIDATION_ERROR");
    }

    const source = topicRepository.findById(sourceTopicId);
    if (!source) {
      return err(`Source topic #${sourceTopicId} not found`, null, "NOT_FOUND");
    }
    const target = topicRepository.findById(targetTopicId);
    if (!target) {
      return err(`Target topic #${targetTopicId} not found`, null, "NOT_FOUND");
    }

    // We use a raw update — no individual repo method for bulk topic reassignment
    const { rawSqlite } = require("@/db/connection") as {
      rawSqlite: import("better-sqlite3").Database;
    };
    const result = rawSqlite
      .prepare(
        `UPDATE questions SET topic_id = ?, updated_at = ?
         WHERE topic_id = ? AND is_deleted = 0`
      )
      .run(targetTopicId, new Date().toISOString(), sourceTopicId);
    const movedQuestions: number = result.changes;

    // Register the source name as an alias on the target
    topicRepository.addAlias(targetTopicId, source.name.toLowerCase().trim());

    // Copy all source aliases to target
    const sourceAliases = topicRepository.getAliases(sourceTopicId);
    for (const alias of sourceAliases) {
      topicRepository.addAlias(targetTopicId, alias.alias);
    }

    // Recalculate counts
    topicRepository.recalculateNoteCounts(targetTopicId);
    topicRepository.markNeedsRefresh(targetTopicId);

    // Soft-delete the now-empty source topic
    topicRepository.softDelete(sourceTopicId);

    return ok({ movedQuestions });
  },

  /**
   * Soft-deletes a topic. Questions are preserved but hidden.
   */
  deleteTopic(id: number): Result<true> {
    const topic = topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    topicRepository.softDelete(id);
    return ok(true);
  },

  /**
   * Restores a soft-deleted topic.
   */
  restoreTopic(id: number): Result<Topic> {
    const restored = topicRepository.restore(id);
    if (!restored) {
      return err(`Topic #${id} not found or is not deleted`, null, "NOT_FOUND");
    }
    return ok(restored);
  },

  /**
   * Returns the dashboard aggregate stats for the topics page header.
   */
  getDashboardStats() {
    return topicRepository.getDashboardStats();
  },

  /**
   * Returns topics that need AI note generation (status: not_generated | needs_refresh).
   * Ordered by total_questions descending — highest-priority first.
   */
  getTopicsNeedingGeneration(limit: number = 50) {
    return topicRepository.findNeedingGeneration().slice(0, limit);
  },

  /**
   * Returns the topic count for display in nav.
   */
  count(): number {
    return topicRepository.count();
  },
} as const;
