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
  startSession(topicId: number): Result<RevisionSessionResult> {
    const topic = topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }
    if (topic.isDeleted) {
      return err(`Topic "${topic.name}" has been deleted`, null, "NOT_FOUND");
    }

    const session = revisionSessionRepository.startSession({ topicId });

    // Increment note's revision count if a note exists
    const note = noteRepository.findByTopicId(topicId);
    if (note) {
      noteRepository.incrementRevised(note.id);
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
  startSessionBySlug(topicSlug: string): Result<RevisionSessionResult> {
    const topic = topicRepository.findActiveBySlug(topicSlug);
    if (!topic) {
      return err(`Topic "${topicSlug}" not found`, null, "NOT_FOUND");
    }
    return revisionService.startSession(topic.id);
  },

  /**
   * Marks a revision session as complete.
   */
  completeSession(sessionId: number): Result<RevisionSession> {
    const session = revisionSessionRepository.findById(sessionId);
    if (!session) {
      return err(`Session #${sessionId} not found`, null, "NOT_FOUND");
    }
    if (session.completedAt) {
      return err(`Session #${sessionId} is already completed`, null, "VALIDATION_ERROR");
    }

    const completed = revisionSessionRepository.completeSession(sessionId);
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
  getDashboardData(): Result<DashboardData> {
    try {
      const streak = revisionSessionRepository.getStreakStats();
      const recentSessions = revisionSessionRepository.findRecentWithTopic(8);
      const dailyActivity = revisionSessionRepository.getDailyActivity(90);
      const totalStudiedTopics = revisionSessionRepository.countStudiedTopics();

      const noteStats = noteRepository.getStats();
      const randomFacts = noteRepository.getRandomFacts(5).map((f) => ({
        fact: f.fact,
        topicName: f.topicName,
        topicSlug: f.topicSlug,
      }));

      // Topics with most questions that have no note yet (highest priority)
      const topicsNeedingGeneration = topicRepository.findNeedingGeneration();
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
   * Returns streak stats only (lightweight — for the nav streak badge).
   */
  getStreak(): DailyStreak {
    return revisionSessionRepository.getStreakStats();
  },

  /**
   * Returns recent revision sessions with topic metadata.
   * Used by the "Recently Studied" section.
   */
  getRecentSessions(limit: number = 10): RevisionSessionWithTopic[] {
    return revisionSessionRepository.findRecentWithTopic(limit);
  },

  /**
   * Returns daily activity data for the heatmap calendar.
   * @param daysBack - How many days of history to return (default 90)
   */
  getActivityHeatmap(daysBack: number = 90): RecentActivity[] {
    return revisionSessionRepository.getDailyActivity(daysBack);
  },

  /**
   * Returns revision sessions for a specific topic (for topic detail page).
   */
  getSessionsForTopic(
    topicId: number,
    limit: number = 20
  ): Result<RevisionSession[]> {
    const topic = topicRepository.findById(topicId);
    if (!topic) {
      return err(`Topic #${topicId} not found`, null, "NOT_FOUND");
    }

    const sessions = revisionSessionRepository.findByTopicId(topicId, limit);
    return ok(sessions);
  },
} as const;
