/**
 * services/import_service.ts
 *
 * Orchestrates the complete PDF import pipeline.
 *
 * Golden Rule enforced: Database First — check hash before any processing.
 *
 * Pipeline stages:
 *   1. Hash check → reject duplicate PDFs immediately (no AI call)
 *   2. Validate + store the import job
 *   3. Extract PDF text (no AI)
 *   4. Chunk by pages (per system_settings.pdfChunkSize)
 *   5. For each chunk: call Gemini → validate → store staged_questions
 *   6. Mark job as completed / failed
 *
 * The service returns Result<T> at every stage.
 * Progress is persisted to the DB after each chunk so jobs are resumable.
 */

import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import {
  importJobRepository,
  sourceRepository,
  stagedQuestionRepository,
  settingsRepository,
} from "@/repositories";
import type { ImportJobProgress } from "@/repositories";
import { geminiClient } from "@/lib/ai/gemini_client";
import { pdfProcessor } from "@/lib/pdf/pdf_processor";
import { validationService } from "@/services/validation_service";
import type { ImportJob } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StartImportInput = {
  fileBuffer: Buffer;
  fileName: string;
  sourceName: string;
};

export type ImportStartResult = {
  jobId: number;
  sourceId: number;
  fileName: string;
  totalPages: number;
  fileHash: string;
  isDuplicate: false;
};

export type ImportChunkResult = {
  chunkIndex: number;
  pagesProcessed: number;
  questionsExtracted: number;
  questionsSkipped: number;
  failedPages: number[];
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const importService = {
  /**
   * STAGE 1 — Start Import
   *
   * Validates the file, checks for duplicates by hash, creates the import job.
   * Does NOT call Gemini. Does NOT extract text.
   * Returns the job ID for the caller to start async processing.
   */
  async startImport(
    input: StartImportInput
  ): Promise<Result<ImportStartResult>> {
    // Validate file size (max 100 MB)
    const sizeCheck = pdfProcessor.validateFileSize(input.fileBuffer.length);
    if (!sizeCheck.success) return sizeCheck;

    // Extract text + hash (cheap, no AI)
    const extractResult = await pdfProcessor.extractText(input.fileBuffer);
    if (!extractResult.success) return extractResult;

    const { fileHash, pageCount, fileSizeBytes } = extractResult.data;

    // ── Golden Rule: Database First ──────────────────────────────────────
    // Check for duplicate BEFORE creating any job record
    const existing = importJobRepository.findByHash(fileHash);
    if (existing) {
      return err(
        `Duplicate PDF detected. This file was already imported (job #${existing.id}, status: ${existing.status}).`,
        { existingJobId: existing.id },
        "DUPLICATE"
      );
    }

    if (pageCount === 0) {
      return err(
        "PDF has 0 pages or contains no extractable text. Please check the file.",
        null,
        "UNSUPPORTED_FORMAT"
      );
    }

    // Find or create the source
    const source = sourceRepository.findOrCreate(input.sourceName);

    // Create the import job
    const job = importJobRepository.create({
      fileName: input.fileName,
      fileSize: fileSizeBytes,
      fileHash,
      sourceId: source.id,
      totalPages: pageCount,
    });

    if (!job) {
      // Race condition — another request created a job with same hash
      return err("Import job creation failed (possible concurrent duplicate)", null, "DATABASE_ERROR");
    }

    return ok({
      jobId: job.id,
      sourceId: source.id,
      fileName: input.fileName,
      totalPages: pageCount,
      fileHash,
      isDuplicate: false,
    });
  },

  /**
   * STAGE 2 — Process Import
   *
   * Runs the full PDF → AI → staging pipeline for a job.
   * This is designed to run in a Next.js Route Handler (server-side).
   * Reports progress to DB after each chunk.
   *
   * @param jobId    - ID of the import_job to process
   * @param buffer   - Original PDF buffer (re-passed from the upload handler)
   * @param onProgress - Optional callback for real-time progress updates
   */
  async processImport(
    jobId: number,
    buffer: Buffer,
    onProgress?: (progress: ImportJobProgress) => void
  ): Promise<Result<{ totalExtracted: number; totalSkipped: number }>> {
    const job = importJobRepository.findById(jobId);
    if (!job) {
      return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    }

    if (job.status === "completed") {
      return err(`Import job #${jobId} is already completed`, null, "VALIDATION_ERROR");
    }

    // Mark as processing
    importJobRepository.markProcessing(jobId);

    // Get settings for chunk size and AI limits
    const settings = settingsRepository.get();
    const pagesPerChunk = settings.pdfChunkSize;
    const maxQuestionsPerChunk = settings.maxQuestionsPerChunk;

    // Re-extract text (buffer is in-memory; no disk I/O)
    const extractResult = await pdfProcessor.extractText(buffer);
    if (!extractResult.success) {
      importJobRepository.markFailed(jobId);
      return extractResult;
    }

    const { text: fullText, pageCount } = extractResult.data;
    const chunks = pdfProcessor.chunkByPages(fullText, pageCount, pagesPerChunk);

    if (chunks.length === 0) {
      importJobRepository.markFailed(jobId);
      return err("No text chunks could be created from this PDF", null, "UNSUPPORTED_FORMAT");
    }

    // Determine resume point (for paused jobs)
    const resumeFromChunk = Math.floor(job.currentPage / pagesPerChunk);

    let totalExtracted = job.extractedQuestions;
    let totalSkipped = 0;
    const allFailedPages: number[] = JSON.parse(job.failedPagesJson) as number[];

    for (const chunk of chunks) {
      // Skip already-processed chunks when resuming
      if (chunk.chunkIndex < resumeFromChunk) continue;

      // Check AI rate limit before every chunk
      if (settingsRepository.isAiRateLimitReached()) {
        importJobRepository.markPaused(jobId);
        return err(
          `AI daily rate limit reached after ${totalExtracted} questions. Job paused — resume tomorrow.`,
          { totalExtracted, totalSkipped, jobId },
          "AI_RATE_LIMIT"
        );
      }

      if (!chunk.text.trim()) {
        // Empty chunk (image-only page, etc.) — skip silently
        allFailedPages.push(chunk.startPage);
        continue;
      }

      // ── Call Gemini (Prompt 1) ─────────────────────────────────────────
      const aiResult = await geminiClient.extractQuestions(chunk.text);
      settingsRepository.incrementAiCallCount();

      if (!aiResult.success) {
        // Non-fatal: mark these pages as failed, continue
        for (let p = chunk.startPage; p <= chunk.endPage; p++) {
          allFailedPages.push(p);
        }
        importJobRepository.updateProgress(jobId, {
          currentPage: chunk.endPage,
          failedPages: allFailedPages,
          status: "processing",
        });
        continue;
      }

      // ── Parse + Validate AI Response ───────────────────────────────────
      const parseResult = validationService.parseJson(aiResult.data);
      if (!parseResult.success) {
        for (let p = chunk.startPage; p <= chunk.endPage; p++) {
          allFailedPages.push(p);
        }
        importJobRepository.updateProgress(jobId, {
          currentPage: chunk.endPage,
          failedPages: allFailedPages,
        });
        continue;
      }

      const validateResult = validationService.validateQuestionExtractorResponse(
        parseResult.data
      );
      if (!validateResult.success) {
        for (let p = chunk.startPage; p <= chunk.endPage; p++) {
          allFailedPages.push(p);
        }
        importJobRepository.updateProgress(jobId, {
          currentPage: chunk.endPage,
          failedPages: allFailedPages,
        });
        continue;
      }

      // Limit to maxQuestionsPerChunk
      const validQuestions = validateResult.data.slice(0, maxQuestionsPerChunk);
      const skippedInChunk = validateResult.data.length - validQuestions.length;
      totalSkipped += skippedInChunk;

      // ── Stage Questions ────────────────────────────────────────────────
      const stageInputs = validQuestions.map((q) => ({
        importJobId: jobId,
        question: q.question,
        options: {
          A: q.optionA,
          B: q.optionB,
          C: q.optionC,
          D: q.optionD,
        },
        answer: q.correctOption,
        explanation: q.shortExplanation,
        difficulty: q.difficulty,
        topic: q.topic,
        category: q.category,
      }));

      const inserted = stagedQuestionRepository.createMany(stageInputs);
      totalExtracted += inserted;

      // ── Persist progress to DB ─────────────────────────────────────────
      const eta = estimateRemainingSeconds(
        chunks.length,
        chunk.chunkIndex,
        chunks.length
      );
      const updatedJob = importJobRepository.updateProgress(jobId, {
        currentPage: chunk.endPage,
        extractedQuestions: totalExtracted,
        estimatedRemainingSeconds: eta,
        failedPages: allFailedPages,
        status: "processing",
      });

      // Emit progress callback if provided
      if (onProgress && updatedJob) {
        const progress = importJobRepository.getProgress(jobId);
        if (progress) onProgress(progress);
      }
    }

    // Mark job as completed
    importJobRepository.markCompleted(jobId, totalExtracted);

    return ok({ totalExtracted, totalSkipped });
  },

  /**
   * Returns a live progress snapshot for a running import job.
   */
  getProgress(jobId: number): Result<ImportJobProgress> {
    const progress = importJobRepository.getProgress(jobId);
    if (!progress) {
      return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    }
    return ok(progress);
  },

  /**
   * Pauses a running import job.
   */
  pauseJob(jobId: number): Result<ImportJob> {
    const job = importJobRepository.findById(jobId);
    if (!job) return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    if (job.status !== "processing") {
      return err(
        `Cannot pause job with status "${job.status}". Only processing jobs can be paused.`,
        null,
        "VALIDATION_ERROR"
      );
    }
    const updated = importJobRepository.markPaused(jobId);
    if (!updated) return err("Failed to pause job", null, "DATABASE_ERROR");
    return ok(updated);
  },

  /**
   * Returns the full list of import jobs for the jobs dashboard.
   */
  listJobs() {
    return importJobRepository.findAll();
  },

  /**
   * Returns summary stats for the import jobs dashboard widget.
   */
  getJobStats() {
    return importJobRepository.getSummaryStats();
  },

  /**
   * Deletes an import job and all its staged questions.
   * Only safe for completed / failed / paused jobs.
   */
  deleteJob(jobId: number): Result<true> {
    const job = importJobRepository.findById(jobId);
    if (!job) return err(`Import job #${jobId} not found`, null, "NOT_FOUND");

    if (job.status === "processing") {
      return err(
        "Cannot delete a running import job. Pause it first.",
        null,
        "VALIDATION_ERROR"
      );
    }

    stagedQuestionRepository.deleteByJobId(jobId);
    importJobRepository.delete(jobId);
    return ok(true);
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateRemainingSeconds(
  totalChunks: number,
  completedChunks: number,
  _total: number
): number {
  // Assume ~8 seconds per chunk (Gemini API latency estimate)
  const avgSecondsPerChunk = 8;
  const remaining = totalChunks - completedChunks - 1;
  return Math.max(0, remaining * avgSecondsPerChunk);
}
