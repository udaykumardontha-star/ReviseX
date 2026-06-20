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
import { rawSqlite } from "@/db/connection";

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
  async listTopics(
    options: TopicFilterOptions & { page?: number }
  ): Promise<Result<TopicListResult>> {
    const pageSize = options.limit ?? 24;
    const page = options.page ?? 1;
    const offset = (page - 1) * pageSize;

    const { items, total } = await topicRepository.findAll({
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
  async getTopic(slug: string): Promise<Result<TopicDetail>> {
    const topic = await topicRepository.findActiveBySlug(slug);
    if (!topic) {
      return err(`Topic "${slug}" not found`, null, "NOT_FOUND");
    }

    await topicRepository.incrementViews(topic.id);

    const aliasesRaw = await topicRepository.getAliases(topic.id);
    const aliases = aliasesRaw.map((a) => a.alias);

    const withNoteStatus = await topicRepository.findWithNoteStatus(1);
    const hasNote = withNoteStatus.some(
      (t) => t.id === topic.id && t.hasNote
    );

    return ok({ ...topic, aliases, hasNote });
  },

  /**
   * Renames a topic. Updates slug and adds old name as alias.
   */
  async renameTopic(
    id: number,
    newName: string
  ): Promise<Result<Topic>> {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    const normalized = normalizeTopic(newName);
    if (!normalized || normalized.length < 2) {
      return err("Topic name is too short or invalid", null, "VALIDATION_ERROR");
    }

    const newSlug = toSlug(normalized);

    // Check slug uniqueness (exclude current topic)
    const existing = await topicRepository.findBySlug(newSlug);
    if (existing && existing.id !== id) {
      return err(
        `A topic with the name "${normalized}" already exists`,
        null,
        "DUPLICATE"
      );
    }

    // Add old name as alias before renaming
    await topicRepository.addAlias(id, topic.name.toLowerCase().trim());

    const updated = await topicRepository.update(id, {
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
  async recategorize(
    id: number,
    category: ValidCategory
  ): Promise<Result<Topic>> {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    const updated = await topicRepository.update(id, { category });
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
  async mergeTopics(
    sourceTopicId: number,
    targetTopicId: number
  ): Promise<Result<{ movedQuestions: number }>> {
    if (sourceTopicId === targetTopicId) {
      return err("Source and target topics must be different", null, "VALIDATION_ERROR");
    }

    const source = await topicRepository.findById(sourceTopicId);
    if (!source) {
      return err(`Source topic #${sourceTopicId} not found`, null, "NOT_FOUND");
    }
    const target = await topicRepository.findById(targetTopicId);
    if (!target) {
      return err(`Target topic #${targetTopicId} not found`, null, "NOT_FOUND");
    }

    const result = await rawSqlite.execute({
        sql: `UPDATE questions SET topic_id = ?, updated_at = ?
         WHERE topic_id = ? AND is_deleted = 0`,
        args: [targetTopicId, new Date().toISOString(), sourceTopicId]
    });
    
    const movedQuestions: number = result.rowsAffected;

    // Register the source name as an alias on the target
    await topicRepository.addAlias(targetTopicId, source.name.toLowerCase().trim());

    // Copy all source aliases to target
    const sourceAliases = await topicRepository.getAliases(sourceTopicId);
    for (const alias of sourceAliases) {
      await topicRepository.addAlias(targetTopicId, alias.alias);
    }

    // Recalculate counts
    await topicRepository.recalculateNoteCounts(targetTopicId);
    await topicRepository.markNeedsRefresh(targetTopicId);

    // Soft-delete the now-empty source topic
    await topicRepository.softDelete(sourceTopicId);

    return ok({ movedQuestions });
  },

  /**
   * Soft-deletes a topic. Questions are preserved but hidden.
   */
  async deleteTopic(id: number): Promise<Result<true>> {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      return err(`Topic #${id} not found`, null, "NOT_FOUND");
    }

    await topicRepository.softDelete(id);
    return ok(true);
  },

  /**
   * Restores a soft-deleted topic.
   */
  async restoreTopic(id: number): Promise<Result<Topic>> {
    const restored = await topicRepository.restore(id);
    if (!restored) {
      return err(`Topic #${id} not found or is not deleted`, null, "NOT_FOUND");
    }
    return ok(restored);
  },

  /**
   * Returns the dashboard aggregate stats for the topics page header.
   */
  async getDashboardStats() {
    return await topicRepository.getDashboardStats();
  },

  /**
   * Returns topics that need AI note generation (status: not_generated | needs_refresh).
   * Ordered by total_questions descending — highest-priority first.
   */
  async getTopicsNeedingGeneration(limit: number = 50) {
    const needed = await topicRepository.findNeedingGeneration();
    return needed.slice(0, limit);
  },

  /**
   * Returns the topic count for display in nav.
   */
  async count(): Promise<number> {
    return await topicRepository.count();
  },
} as const;
