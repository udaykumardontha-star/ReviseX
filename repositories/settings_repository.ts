/**
 * repositories/settings_repository.ts
 *
 * Repository for system_settings table.
 * Single-row configuration table — always works with id=1.
 * The ONLY layer allowed to use Drizzle ORM directly.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { systemSettings } from "@/db/schema";
import type { SystemSettings, NewSystemSettings } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SettingsUpdate = Partial<
  Omit<NewSystemSettings, "id" | "updatedAt">
>;

// ─── Repository ───────────────────────────────────────────────────────────────

export const settingsRepository = {
  /**
   * Returns the singleton system_settings row (id=1).
   * Creates it with defaults if it doesn't exist.
   */
  get(): SystemSettings {
    const row = db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, 1))
      .get();

    if (row) return row;

    // Auto-create the singleton row with defaults if absent
    db.insert(systemSettings)
      .values({
        id: 1,
        databaseVersion: "v1",
        maxAiCallsPerDay: 99999,
        maxQuestionsPerChunk: 100,
        pdfChunkSize: 10,
        aiCallsTodayCount: 0,
      })
      .run();

    return db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, 1))
      .get()!;
  },

  /**
   * Updates specific fields on the singleton settings row.
   * Always stamps updatedAt with the current UTC timestamp.
   */
  update(data: SettingsUpdate): SystemSettings {
    db.update(systemSettings)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(systemSettings.id, 1))
      .run();

    return settingsRepository.get();
  },

  /**
   * Increments the aiCallsTodayCount by 1.
   * Checks and resets the counter if the reset date is a past day.
   * Returns the new count after incrementing.
   */
  incrementAiCallCount(): number {
    const settings = settingsRepository.get();
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    let currentCount = settings.aiCallsTodayCount;

    // Reset counter if last reset was a different calendar day
    if (settings.aiCallsResetDate !== today) {
      currentCount = 0;
    }

    const newCount = currentCount + 1;

    db.update(systemSettings)
      .set({
        aiCallsTodayCount: newCount,
        aiCallsResetDate: today,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(systemSettings.id, 1))
      .run();

    return newCount;
  },

  /**
   * Rate limiting is DISABLED — always returns false.
   * ReviseX uses the API key freely with no daily cap.
   */
  isAiRateLimitReached(): boolean {
    return false; // No rate limit enforced
  },

  /**
   * Returns today's AI call usage as { used, limit, remaining }.
   */
  getAiCallUsage(): { used: number; limit: number; remaining: number } {
    const settings = settingsRepository.get();
    const today = new Date().toISOString().slice(0, 10);
    const used =
      settings.aiCallsResetDate === today ? settings.aiCallsTodayCount : 0;
    return {
      used,
      limit: settings.maxAiCallsPerDay,
      remaining: Math.max(0, settings.maxAiCallsPerDay - used),
    };
  },
} as const;
