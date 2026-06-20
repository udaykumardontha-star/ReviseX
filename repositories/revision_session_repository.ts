/**
 * repositories/revision_session_repository.ts
 *
 * Repository for the `revision_sessions` table.
 * Tracks each user revision session for streak calculation and history display.
 * The ONLY layer allowed to use Drizzle ORM directly.
 */

import { eq, desc, asc, gte, and, sql, lte } from "drizzle-orm";
import { db, rawSqlite } from "@/db/connection";
import { revisionSessions } from "@/db/schema";
import type { RevisionSession } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StartSessionInput = {
  topicId: number;
};

export type RevisionSessionWithTopic = RevisionSession & {
  topicName: string;
  topicSlug: string;
  topicCategory: string;
};

export type DailyStreak = {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  lastStudiedAt: string | null;
  studiedToday: boolean;
};

export type RecentActivity = {
  date: string; // "YYYY-MM-DD"
  sessionCount: number;
  topicsStudied: number;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const revisionSessionRepository = {
  /**
   * Starts a new revision session for a topic.
   * Multiple sessions for the same topic on the same day are allowed.
   */
  startSession(input: StartSessionInput): RevisionSession {
    const now = new Date().toISOString();

    return db
      .insert(revisionSessions)
      .values({
        topicId: input.topicId,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      })
      .returning()
      .get();
  },

  /**
   * Marks a revision session as completed.
   * Returns undefined if the session is not found.
   */
  completeSession(sessionId: number): RevisionSession | undefined {
    const now = new Date().toISOString();

    return db
      .update(revisionSessions)
      .set({
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(revisionSessions.id, sessionId))
      .returning()
      .get();
  },

  /**
   * Finds a session by ID.
   */
  findById(id: number): RevisionSession | undefined {
    return db
      .select()
      .from(revisionSessions)
      .where(eq(revisionSessions.id, id))
      .get();
  },

  /**
   * Returns all sessions for a topic, newest first.
   */
  findByTopicId(topicId: number, limit: number = 20): RevisionSession[] {
    return db
      .select()
      .from(revisionSessions)
      .where(eq(revisionSessions.topicId, topicId))
      .orderBy(desc(revisionSessions.startedAt))
      .limit(limit)
      .all();
  },

  /**
   * Returns recent sessions with topic metadata joined.
   * Used by the dashboard "Recently Studied" widget.
   */
  findRecentWithTopic(limit: number = 10): RevisionSessionWithTopic[] {
    return rawSqlite
      .prepare(
        `SELECT
          rs.*,
          t.name     AS topicName,
          t.slug     AS topicSlug,
          t.category AS topicCategory
        FROM revision_sessions rs
        JOIN topics t ON t.id = rs.topic_id
        WHERE t.is_deleted = 0
        ORDER BY rs.started_at DESC
        LIMIT ?`
      )
      .all(limit) as RevisionSessionWithTopic[];
  },

  /**
   * Returns sessions within a date range (for calendar heatmap).
   */
  findInDateRange(
    startDate: string,
    endDate: string
  ): RevisionSession[] {
    return db
      .select()
      .from(revisionSessions)
      .where(
        and(
          gte(revisionSessions.startedAt, startDate),
          lte(revisionSessions.startedAt, endDate)
        )
      )
      .orderBy(asc(revisionSessions.startedAt))
      .all();
  },

  /**
   * Returns per-day activity summary for the last N days.
   * Used to build the activity heatmap on the dashboard.
   */
  getDailyActivity(daysBack: number = 30): RecentActivity[] {
    return rawSqlite
      .prepare(
        `SELECT
          strftime('%Y-%m-%d', started_at) AS date,
          COUNT(*) AS sessionCount,
          COUNT(DISTINCT topic_id) AS topicsStudied
        FROM revision_sessions
        WHERE started_at >= date('now', '-' || ? || ' days')
        GROUP BY strftime('%Y-%m-%d', started_at)
        ORDER BY date ASC`
      )
      .all(daysBack) as RecentActivity[];
  },

  /**
   * Calculates the user's study streak and total session stats.
   */
  getStreakStats(): DailyStreak {
    const today = new Date().toISOString().slice(0, 10);

    // Get distinct dates with study activity, sorted descending
    const studyDates = rawSqlite
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m-%d', started_at) AS date
         FROM revision_sessions
         ORDER BY date DESC`
      )
      .all() as Array<{ date: string }>;

    if (studyDates.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        totalSessions: 0,
        lastStudiedAt: null,
        studiedToday: false,
      };
    }

    const dates = studyDates.map((r) => r.date);
    const lastStudied = dates[0] ?? null;
    const studiedToday = lastStudied === today;

    // Calculate current streak (consecutive days ending today or yesterday)
    let currentStreak = 0;
    const startDate = studiedToday ? today : getPreviousDay(today);
    let expectedDate = startDate;

    for (const date of dates) {
      if (date === expectedDate) {
        currentStreak++;
        expectedDate = getPreviousDay(expectedDate);
      } else if (date < expectedDate) {
        break; // Gap found — streak ends
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let runningStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const curr = dates[i];
      const prev = dates[i - 1];
      if (curr && prev && getPreviousDay(prev) === curr) {
        runningStreak++;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    // Total sessions
    const totalResult = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(revisionSessions)
      .get();

    return {
      currentStreak,
      longestStreak,
      totalSessions: totalResult?.count ?? 0,
      lastStudiedAt: lastStudied,
      studiedToday,
    };
  },

  /**
   * Returns the count of unique topics studied (with at least one session).
   */
  countStudiedTopics(): number {
    const result = rawSqlite
      .prepare(
        `SELECT COUNT(DISTINCT topic_id) as count FROM revision_sessions`
      )
      .get() as { count: number };
    return result?.count ?? 0;
  },

  /**
   * Deletes all sessions for a topic.
   * Called when a topic is hard-deleted.
   */
  deleteByTopicId(topicId: number): number {
    const result = db
      .delete(revisionSessions)
      .where(eq(revisionSessions.topicId, topicId))
      .returning()
      .all();
    return result.length;
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
