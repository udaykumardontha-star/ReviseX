/**
 * services/revision_service.ts
 *
 * Business logic for the revision system (streak tracking, session management,
 * dashboard data aggregation, and activity calendar).
 *
 * This service is the only entry point for the /revision page data.
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import {
  revisionSessionRepository,
  topicRepository,
  noteRepository,
} from "@/repositories";
import type {
  DailyStreak,
  RecentActivity,
  RevisionSessionWithTopic,
} from "@/repositories";
import type { RevisionSession } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardData = {
  streak: DailyStreak;
  recentSessions: RevisionSessionWithTopic[];
  dailyActivity: RecentActivity[];
  totalStudiedTopics: number;
  noteStats: {
    totalNotes: number;
    totalFacts: number;
    totalKeywords: number;
  };
  topicsNeedingAttention: Array<{
    id: number;
    slug: string;
    name: string;
    category: string;
    totalQuestions: number;
    topicStatus: string;
  }>;
  randomFacts: Array<{
    fact: string;
    topicName: string;
    topicSlug: string;
  }>;
};

export type RevisionSessionResult = {
  session: RevisionSession;
  topicName: string;
  topicSlug: string;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const revisionService = {
  /**
   * Starts a new revision session for a topic.
   * Validates the topic exists before creating the session.
   */
  async startSession(topicId: number): Promise<Result<RevisionSessionResult>> {
    const topic = await topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }
    if (topic.isDeleted) {
      return err(`Topic "${topic.name}" has been deleted`, null, "NOT_FOUND");
    }

    const session = await revisionSessionRepository.startSession({ topicId });

    // Increment note's revision count if a note exists
    const note = await noteRepository.findByTopicId(topicId);
    if (note) {
      await noteRepository.incrementRevised(note.id);
    }

    return ok({
      session,
      topicName: topic.name,
      topicSlug: topic.slug,
    });
  },

  /**
   * Starts a revision session by topic slug (used by the UI directly).
   */
  async startSessionBySlug(topicSlug: string): Promise<Result<RevisionSessionResult>> {
    const topic = await topicRepository.findActiveBySlug(topicSlug);
    if (!topic) {
      return err(`Topic "${topicSlug}" not found`, null, "NOT_FOUND");
    }
    return await revisionService.startSession(topic.id);
  },

  /**
   * Marks a revision session as complete.
   */
  async completeSession(sessionId: number): Promise<Result<RevisionSession>> {
    const session = await revisionSessionRepository.findById(sessionId);
    if (!session) {
      return err(`Session #${sessionId} not found`, null, "NOT_FOUND");
    }
    if (session.completedAt) {
      return err(`Session #${sessionId} is already completed`, null, "VALIDATION_ERROR");
    }

    const completed = await revisionSessionRepository.completeSession(sessionId);
    if (!completed) {
      return err("Failed to complete session", null, "DATABASE_ERROR");
    }
    return ok(completed);
  },

  /**
   * Returns the full dashboard data bundle.
   * Aggregates streak, recent sessions, activity heatmap, random facts,
   * and topics needing attention — all in one call for the dashboard page.
   */
  async getDashboardData(): Promise<Result<DashboardData>> {
    try {
      const streak = await revisionSessionRepository.getStreakStats();
      const recentSessions = await revisionSessionRepository.findRecentWithTopic(8);
      const dailyActivity = await revisionSessionRepository.getDailyActivity(90);
      const totalStudiedTopics = await revisionSessionRepository.countStudiedTopics();

      const noteStats = await noteRepository.getStats();
      const randomFactsRaw = await noteRepository.getRandomFacts(5);
      const randomFacts = randomFactsRaw.map((f) => ({
        fact: f.fact,
        topicName: f.topicName,
        topicSlug: f.topicSlug,
      }));

      // Topics with most questions that have no note yet (highest priority)
      const topicsNeedingGeneration = await topicRepository.findNeedingGeneration();
      const topicsNeedingAttention = topicsNeedingGeneration
        .slice(0, 6)
        .map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          category: t.category,
          totalQuestions: t.totalQuestions,
          topicStatus: t.topicStatus,
        }));

      return ok({
        streak,
        recentSessions,
        dailyActivity,
        totalStudiedTopics,
        noteStats: {
          totalNotes: noteStats.totalNotes,
          totalFacts: noteStats.totalFacts,
          totalKeywords: noteStats.totalKeywords,
        },
        topicsNeedingAttention,
        randomFacts,
      });
    } catch (e) {
      return err(
        `Failed to load dashboard data: ${e instanceof Error ? e.message : String(e)}`,
        e,
        "DATABASE_ERROR"
      );
    }
  },

  /**
   * Returns up to 40 random facts for the Daily Facts page.
   */
  async getDailyFacts(): Promise<Result<Array<{ fact: string; topicName: string; topicSlug: string }>>> {
    try {
      const randomFactsRaw = await noteRepository.getRandomFacts(40);
      const randomFacts = randomFactsRaw.map((f) => ({
        fact: f.fact,
        topicName: f.topicName,
        topicSlug: f.topicSlug,
      }));
      return ok(randomFacts);
    } catch (e) {
      return err(`Failed to load facts: ${e instanceof Error ? e.message : String(e)}`, e, "DATABASE_ERROR");
    }
  },

  /**
   * Returns streak stats only (lightweight — for the nav streak badge).
   */
  async getStreak(): Promise<DailyStreak> {
    return await revisionSessionRepository.getStreakStats();
  },

  /**
   * Returns recent revision sessions with topic metadata.
   * Used by the "Recently Studied" section.
   */
  async getRecentSessions(limit: number = 10): Promise<RevisionSessionWithTopic[]> {
    return await revisionSessionRepository.findRecentWithTopic(limit);
  },

  /**
   * Returns daily activity data for the heatmap calendar.
   * @param daysBack - How many days of history to return (default 90)
   */
  async getActivityHeatmap(daysBack: number = 90): Promise<RecentActivity[]> {
    return await revisionSessionRepository.getDailyActivity(daysBack);
  },

  /**
   * Returns revision sessions for a specific topic (for topic detail page).
   */
  async getSessionsForTopic(
    topicId: number,
    limit: number = 20
  ): Promise<Result<RevisionSession[]>> {
    const topic = await topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }

    const sessions = await revisionSessionRepository.findByTopicId(topicId, limit);
    return ok(sessions);
  },
} as const;
