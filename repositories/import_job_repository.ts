/**
 * repositories/import_job_repository.ts
 *
 * Repository for the `import_jobs` table.
 * Manages background PDF processing job lifecycle with resume support.
 * The ONLY layer allowed to use Drizzle ORM directly.
 *
 * Key design:
 *   - file_hash (SHA-256) prevents duplicate uploads
 *   - failed_pages_json stores retryable page numbers
 *   - current_page enables resume from last successful page
 */

import { eq, desc, inArray, and, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { importJobs } from "@/db/schema";
import type { ImportJob, ImportJobStatus } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateImportJobInput = {
  fileName: string;
  fileSize: number;
  fileHash: string;
  sourceId: number;
  totalPages: number;
  forcedCategory?: string;
  forcedChapter?: string;
};

export type ImportJobUpdate = {
  currentPage?: number;
  extractedQuestions?: number;
  estimatedRemainingSeconds?: number;
  failedPages?: number[];
  status?: ImportJobStatus;
};

export type ImportJobProgress = {
  id: number;
  fileName: string;
  totalPages: number;
  currentPage: number;
  extractedQuestions: number;
  estimatedRemainingSeconds: number | null;
  failedPages: number[];
  status: ImportJobStatus;
  percentComplete: number;
  updatedAt: string;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const importJobRepository = {
  /**
   * Creates a new import job in 'queued' status.
   * Returns undefined if a job with the same file_hash already exists.
   */
  async create(input: CreateImportJobInput): Promise<ImportJob | undefined> {
    // Check for duplicate by file hash first
    const existing = await importJobRepository.findByHash(input.fileHash);
    if (existing) return undefined;

    const now = new Date().toISOString();

    return await db
      .insert(importJobs)
      .values({
        fileName: input.fileName,
        fileSize: input.fileSize,
        fileHash: input.fileHash,
        sourceId: input.sourceId,
        totalPages: input.totalPages,
        forcedCategory: input.forcedCategory || null,
        forcedChapter: input.forcedChapter || null,
        currentPage: 0,
        extractedQuestions: 0,
        failedPagesJson: "[]",
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  },

  /**
   * Finds an import job by its SHA-256 file hash.
   * Used to detect and reject duplicate uploads.
   */
  async findByHash(fileHash: string): Promise<ImportJob | undefined> {
    return await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.fileHash, fileHash))
      .get();
  },

  /**
   * Finds an import job by primary key.
   */
  async findById(id: number): Promise<ImportJob | undefined> {
    return await db.select().from(importJobs).where(eq(importJobs.id, id)).get();
  },

  /**
   * Returns all jobs for a given source, newest first.
   */
  async findBySourceId(sourceId: number): Promise<ImportJob[]> {
    return await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.sourceId, sourceId))
      .orderBy(desc(importJobs.createdAt))
      .all();
  },

  /**
   * Returns all import jobs ordered by creation date descending.
   * Used by the /imports UI for the queue overview.
   */
  async findAll(): Promise<ImportJob[]> {
    return await db
      .select()
      .from(importJobs)
      .orderBy(desc(importJobs.createdAt))
      .all();
  },

  /**
   * Returns all jobs with a specific status.
   */
  async findByStatus(status: ImportJobStatus): Promise<ImportJob[]> {
    return await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.status, status))
      .orderBy(desc(importJobs.createdAt))
      .all();
  },

  /**
   * Returns jobs that can be resumed: status is 'processing' or 'paused'.
   * Used by the background queue on server startup.
   */
  async findResumable(): Promise<ImportJob[]> {
    return await db
      .select()
      .from(importJobs)
      .where(
        inArray(importJobs.status, ["processing", "paused"])
      )
      .orderBy(desc(importJobs.updatedAt))
      .all();
  },

  /**
   * Updates job progress after each page chunk is processed.
   * Merges new failed pages into the existing failed_pages_json list.
   * Atomically updates current_page, extracted count, and ETA.
   */
  async updateProgress(id: number, update: ImportJobUpdate): Promise<ImportJob | undefined> {
    const existing = await importJobRepository.findById(id);
    if (!existing) return undefined;

    const existingFailed: number[] = JSON.parse(
      existing.failedPagesJson
    ) as number[];

    const mergedFailed =
      update.failedPages !== undefined
        ? Array.from(new Set([...existingFailed, ...update.failedPages])).sort(
            (a, b) => a - b
          )
        : existingFailed;

    return await db
      .update(importJobs)
      .set({
        ...(update.currentPage !== undefined && {
          currentPage: update.currentPage,
        }),
        ...(update.extractedQuestions !== undefined && {
          extractedQuestions: update.extractedQuestions,
        }),
        ...(update.estimatedRemainingSeconds !== undefined && {
          estimatedRemainingSeconds: update.estimatedRemainingSeconds,
        }),
        ...(update.status !== undefined && { status: update.status }),
        failedPagesJson: JSON.stringify(mergedFailed),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(importJobs.id, id))
      .returning()
      .get();
  },

  /**
   * Marks a job as completed with final stats.
   */
  async markCompleted(
    id: number,
    finalExtractedCount: number
  ): Promise<ImportJob | undefined> {
    return await db
      .update(importJobs)
      .set({
        status: "completed",
        extractedQuestions: finalExtractedCount,
        estimatedRemainingSeconds: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(importJobs.id, id))
      .returning()
      .get();
  },

  /**
   * Marks a job as failed. Does NOT delete it — failed jobs are visible in UI.
   */
  async markFailed(id: number): Promise<ImportJob | undefined> {
    return await db
      .update(importJobs)
      .set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(importJobs.id, id))
      .returning()
      .get();
  },

  /**
   * Marks a job as paused (user-initiated or server shutdown).
   */
  async markPaused(id: number): Promise<ImportJob | undefined> {
    return await db
      .update(importJobs)
      .set({
        status: "paused",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(importJobs.id, id))
      .returning()
      .get();
  },

  /**
   * Marks a paused/queued job back to processing.
   */
  async markProcessing(id: number): Promise<ImportJob | undefined> {
    return await db
      .update(importJobs)
      .set({
        status: "processing",
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(importJobs.id, id),
        inArray(importJobs.status, ["queued", "paused"])
      ))
      .returning()
      .get();
  },

  /**
   * Returns a progress-enriched view of a job with computed fields.
   */
  async getProgress(id: number): Promise<ImportJobProgress | undefined> {
    const job = await importJobRepository.findById(id);
    if (!job) return undefined;

    const failedPages: number[] = JSON.parse(job.failedPagesJson) as number[];
    const percentComplete =
      job.totalPages > 0
        ? Math.round((job.currentPage / job.totalPages) * 100)
        : 0;

    return {
      id: job.id,
      fileName: job.fileName,
      totalPages: job.totalPages,
      currentPage: job.currentPage,
      extractedQuestions: job.extractedQuestions,
      estimatedRemainingSeconds: job.estimatedRemainingSeconds ?? null,
      failedPages,
      status: job.status as ImportJobStatus,
      percentComplete,
      updatedAt: job.updatedAt,
    };
  },

  /**
   * Returns summary stats for all jobs.
   * Used by dashboard metrics.
   */
  async getSummaryStats(): Promise<{
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    paused: number;
    totalExtracted: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)`,
        queued: sql<number>`SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END)`,
        processing: sql<number>`SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
        paused: sql<number>`SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END)`,
        totalExtracted: sql<number>`SUM(extracted_questions)`,
      })
      .from(importJobs)
      .get();

    return {
      total: Number(result?.total ?? 0),
      queued: Number(result?.queued ?? 0),
      processing: Number(result?.processing ?? 0),
      completed: Number(result?.completed ?? 0),
      failed: Number(result?.failed ?? 0),
      paused: Number(result?.paused ?? 0),
      totalExtracted: Number(result?.totalExtracted ?? 0),
    };
  },

  /**
   * Deletes an import job by ID.
   * Cascades to staged_questions via FK.
   * Returns true if a row was deleted.
   */
  async delete(id: number): Promise<boolean> {
    const result = await db
      .delete(importJobs)
      .where(eq(importJobs.id, id))
      .returning()
      .get();
    return result !== undefined;
  },
} as const;
