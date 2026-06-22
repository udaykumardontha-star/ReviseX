/**
 * services/import_service.ts
 *
 * Orchestrates the complete import pipeline for ALL input types:
 *   - PDF  → extract text → chunk → Gemini (text prompt)
 *   - Image (PNG/JPG/JPEG/WEBP) → base64 → Gemini Vision (image prompt)
 *   - Text → raw text → chunk → Gemini (text prompt)
 *
 * Golden Rule enforced: Database First — check hash before any processing.
 *
 * Pipeline stages (same for all input types):
 *   1. Hash check → reject duplicate files immediately (no AI call)
 *   2. Validate + store the import job
 *   3. Build chunks (type-specific)
 *   4. For each chunk: call Gemini → validate → store staged_questions
 *   5. Mark job as completed / failed / paused
 *
 * Architecture:
 *   app → services → repositories → db
 *   No layer may be skipped. All results return Result<T>.
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
import { pdfProcessor, detectFileType } from "@/lib/pdf/pdf_processor";
import { validationService } from "@/services/validation_service";
import { hashBuffer } from "@/lib/utils/hasher";
import type { ImportJob, ValidCategory } from "@/db/schema";
import type { ImportFileType } from "@/lib/pdf/pdf_processor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StartImportInput = {
  /** Raw file buffer — PDF or image */
  fileBuffer?: Buffer;
  /** Raw pasted text (text-type import) */
  textContent?: string;
  /** MIME type e.g. "application/pdf", "image/png", or "text/plain" */
  mimeType?: string;
  /** Original filename displayed in the UI */
  fileName: string;
  /** Source label e.g. "CGL 2023 Tier-1" */
  sourceName: string;
  forcedCategory?: string;
  forcedChapter?: string;
};

export type ImportStartResult = {
  jobId: number;
  sourceId: number;
  fileName: string;
  /** Page count for PDF; 1 for images/text */
  totalPages: number;
  fileHash: string;
  fileType: ImportFileType;
  isDuplicate: false;
};

export type ImportChunkResult = {
  chunkIndex: number;
  questionsExtracted: number;
  questionsSkipped: number;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const importService = {
  /**
   * STAGE 1 — Start Import
   *
   * Validates the input, checks for duplicates by hash, creates the import job.
   * Does NOT call Gemini. Does NOT extract text.
   * Returns the job ID for the caller to start processing.
   *
   * Works for PDF, Image, and Text inputs.
   */
  async startImport(input: StartImportInput): Promise<Result<ImportStartResult>> {
    // ── Determine file type ───────────────────────────────────────────────
    let fileType: ImportFileType;
    let fileHash: string;
    let pageCount = 1;
    let fileSizeBytes = 0;

    if (input.textContent !== undefined && input.textContent.trim().length > 0) {
      // TEXT import
      fileType = "text";
      const trimmed = input.textContent.trim();
      fileHash = hashBuffer(Buffer.from(trimmed, "utf-8"));
      fileSizeBytes = Buffer.byteLength(trimmed, "utf-8");
      pageCount = 1;
    } else if (input.fileBuffer && input.mimeType) {
      // Validate file size first
      const sizeCheck = pdfProcessor.validateFileSize(input.fileBuffer.length);
      if (!sizeCheck.success) return sizeCheck;

      fileSizeBytes = input.fileBuffer.length;

      const detectedType = detectFileType(input.mimeType);
      if (!detectedType) {
        return err(
          `Unsupported file type: ${input.mimeType}. Supported: PDF, PNG, JPG, JPEG, WEBP`,
          null,
          "UNSUPPORTED_FORMAT"
        );
      }
      fileType = detectedType;

      if (fileType === "pdf") {
        // PDF — extract text to get page count + hash
        const extractResult = await pdfProcessor.extractText(input.fileBuffer);
        if (!extractResult.success) return extractResult;
        fileHash = extractResult.data.fileHash;
        pageCount = extractResult.data.pageCount;
        input.textContent = extractResult.data.text; // Store text for background processing
        if (pageCount === 0) {
          return err("PDF has 0 pages or contains no extractable text.", null, "UNSUPPORTED_FORMAT");
        }
      } else {
        // Image — hash the raw buffer
        fileHash = pdfProcessor.hashBuffer(input.fileBuffer);
        pageCount = 1;
      }
    } else {
      return err("No file, image, or text content provided.", null, "VALIDATION_ERROR");
    }

    // ── Golden Rule: Database First ───────────────────────────────────────
    const existing = await importJobRepository.findByHash(fileHash);
    if (existing) {
      return err(
        `Duplicate detected. Already imported (job #${existing.id}, status: ${existing.status}).`,
        { existingJobId: existing.id },
        "DUPLICATE"
      );
    }

    // ── Create source + job ───────────────────────────────────────────────
    const source = await sourceRepository.findOrCreate(input.sourceName);
    const job = await importJobRepository.create({
      fileName: input.fileName,
      fileSize: fileSizeBytes,
      fileHash,
      sourceId: source.id,
      totalPages: pageCount,
      ...(input.forcedCategory && { forcedCategory: input.forcedCategory }),
      textContent: input.textContent,
    });

    if (!job) {
      return err("Import job creation failed (possible concurrent duplicate)", null, "DATABASE_ERROR");
    }

    return ok({
      jobId: job.id,
      sourceId: source.id,
      fileName: input.fileName,
      totalPages: pageCount,
      fileHash,
      fileType,
      isDuplicate: false,
    });
  },

  /**
   * STAGE 2 — Process Import
   *
   * Runs the full extraction → staging pipeline for a job.
   * Handles PDF, Image, and Text — all go through the same staging queue.
   *
   * @param jobId       - ID of the import_job to process
   * @param fileBuffer  - Original file buffer (PDF or image); null for text imports
   * @param mimeType    - MIME type of the file (e.g. "application/pdf")
   * @param textContent - Raw text for text-type imports
   * @param onProgress  - Optional callback for real-time progress updates
   */
  async processImport(
    jobId: number,
    fileBuffer: Buffer | null,
    mimeType: string,
    textContent?: string,
    onProgress?: (progress: ImportJobProgress) => void
  ): Promise<Result<{ totalExtracted: number; totalSkipped: number; isCompleted: boolean }>> {
    const job = await importJobRepository.findById(jobId);
    if (!job) {
      return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    }

    if (job.status === "completed") {
      return err(`Import job #${jobId} is already completed`, null, "VALIDATION_ERROR");
    }

    await importJobRepository.markProcessing(jobId);

    const settings = await settingsRepository.get();
    const maxQuestionsPerChunk = settings.maxQuestionsPerChunk;

    let totalExtracted = job.extractedQuestions;
    let totalSkipped = 0;
    const allFailedPages: number[] = JSON.parse(job.failedPagesJson) as number[];

    // ── Determine file type and build chunks ──────────────────────────────
    const detectedType = mimeType === "application/pdf"
      ? "pdf"
      : fileBuffer
        ? detectFileType(mimeType)
        : "text";

    if (!detectedType) {
      await importJobRepository.markFailed(jobId);
      return err(`Unsupported MIME type: ${mimeType}`, null, "UNSUPPORTED_FORMAT");
    }

    // ── TEXT import ───────────────────────────────────────────────────────
    if (detectedType === "text") {
      const rawText = textContent ?? job.textContent ?? "";
      if (!rawText.trim()) {
        await importJobRepository.markFailed(jobId);
        return err("No text content provided for text import", null, "UNSUPPORTED_FORMAT");
      }

      const textResult = pdfProcessor.processText(rawText);
      if (!textResult.success) {
        await importJobRepository.markFailed(jobId);
        return textResult;
      }

      const { chunks } = textResult.data;
      const resumeFromChunk = job.currentPage;

      for (const chunk of chunks) {
        if (chunk.chunkIndex < resumeFromChunk) continue;
        if (await settingsRepository.isAiRateLimitReached()) {
          await importJobRepository.markPaused(jobId);
          return err(
            `AI daily rate limit reached after ${totalExtracted} questions. Job paused.`,
            { totalExtracted, totalSkipped, jobId },
            "AI_RATE_LIMIT"
          );
        }

        const aiResult = await geminiClient.extractQuestionsFromText(chunk.text);
        await settingsRepository.incrementAiCallCount();

        if (!aiResult.success) {
          allFailedPages.push(chunk.chunkIndex);
          await importJobRepository.updateProgress(jobId, {
            currentPage: chunk.chunkIndex + 1,
            failedPages: allFailedPages,
            status: "processing",
          });
          continue;
        }

        const stageResult = await stageQuestionsFromAiResponse(
          aiResult.data,
          job,
          maxQuestionsPerChunk
        );
        if (!stageResult.validResponse) {
          allFailedPages.push(chunk.chunkIndex);
          await importJobRepository.updateProgress(jobId, {
            currentPage: chunk.chunkIndex + 1,
            failedPages: allFailedPages,
            status: "processing",
          });
          continue;
        }
        totalExtracted += stageResult.inserted;
        totalSkipped += stageResult.skipped;

        await importJobRepository.updateProgress(jobId, {
          currentPage: chunk.chunkIndex + 1,
          extractedQuestions: totalExtracted,
          failedPages: allFailedPages,
          status: "processing",
        });

        if (onProgress) {
          const progress = await importJobRepository.getProgress(jobId);
          if (progress) onProgress(progress);
        }

        const isLastChunk = chunk.chunkIndex === chunks.length - 1;
        if (isLastChunk) {
          await importJobRepository.markCompleted(jobId, totalExtracted);
        }
        return ok({ totalExtracted, totalSkipped, isCompleted: isLastChunk });
      }

      // Fallback if loop ends (shouldn't happen with proper chunking, but safe)
      await importJobRepository.markCompleted(jobId, totalExtracted);
      return ok({ totalExtracted, totalSkipped, isCompleted: true });
    }

    // ── IMAGE import ──────────────────────────────────────────────────────
    if (detectedType === "image") {
      if (!fileBuffer) {
        await importJobRepository.markFailed(jobId);
        return err("Image buffer is required for image import", null, "UNSUPPORTED_FORMAT");
      }

      const imageResult = pdfProcessor.processImage(fileBuffer, mimeType);
      if (!imageResult.success) {
        await importJobRepository.markFailed(jobId);
        return imageResult;
      }

      const chunk = imageResult.data;

      if (await settingsRepository.isAiRateLimitReached()) {
        await importJobRepository.markPaused(jobId);
        return err(
          "AI daily rate limit reached. Job paused — resume tomorrow.",
          { jobId },
          "AI_RATE_LIMIT"
        );
      }

      const aiResult = await geminiClient.extractQuestionsFromImage(
        chunk.base64Data,
        chunk.mimeType
      );
      await settingsRepository.incrementAiCallCount();

      if (!aiResult.success) {
        await importJobRepository.markFailed(jobId);
        return aiResult;
      }

      const stageResult = await stageQuestionsFromAiResponse(
        aiResult.data,
        job,
        maxQuestionsPerChunk
      );
      if (!stageResult.validResponse) {
        await importJobRepository.markFailed(jobId);
        return err("AI returned an invalid question response", null, "AI_PARSE_ERROR");
      }
      totalExtracted += stageResult.inserted;
      totalSkipped += stageResult.skipped;

      await importJobRepository.updateProgress(jobId, {
        currentPage: 1,
        extractedQuestions: totalExtracted,
        failedPages: allFailedPages,
        status: "processing",
      });

      if (onProgress) {
        const progress = await importJobRepository.getProgress(jobId);
        if (progress) onProgress(progress);
      }

      await importJobRepository.markCompleted(jobId, totalExtracted);
      return ok({ totalExtracted, totalSkipped, isCompleted: true });
    }

    // ── PDF import ────────────────────────────────────────────────────────
    let fullText = job.textContent;
    let pageCount = job.totalPages;

    if (!fullText) {
      if (!fileBuffer) {
        await importJobRepository.markFailed(jobId);
        return err("PDF buffer is required for PDF import when text is not cached", null, "UNSUPPORTED_FORMAT");
      }
      const extractResult = await pdfProcessor.extractText(fileBuffer);
      if (!extractResult.success) {
        await importJobRepository.markFailed(jobId);
        return extractResult;
      }
      fullText = extractResult.data.text;
      pageCount = extractResult.data.pageCount;
    }
    const pagesPerChunk = settings.pdfChunkSize;
    const chunks = pdfProcessor.chunkByPages(fullText, pageCount, pagesPerChunk);

    if (chunks.length === 0) {
      await importJobRepository.markFailed(jobId);
      return err("No text chunks could be created from this PDF", null, "UNSUPPORTED_FORMAT");
    }

    const resumeFromChunk = job.currentPage;

    for (const chunk of chunks) {
      if (chunk.chunkIndex < resumeFromChunk) continue;

      if (await settingsRepository.isAiRateLimitReached()) {
        await importJobRepository.markPaused(jobId);
        return err(
          `AI daily rate limit reached after ${totalExtracted} questions. Job paused — resume tomorrow.`,
          { totalExtracted, totalSkipped, jobId },
          "AI_RATE_LIMIT"
        );
      }

      if (!chunk.text.trim()) {
        allFailedPages.push(chunk.startPage);
        await importJobRepository.updateProgress(jobId, {
          currentPage: chunk.chunkIndex + 1,
          failedPages: allFailedPages,
          status: "processing",
        });
        continue;
      }

      const aiResult = await geminiClient.extractQuestions(chunk.text);
      await settingsRepository.incrementAiCallCount();

      if (!aiResult.success) {
        for (let p = chunk.startPage; p <= chunk.endPage; p++) allFailedPages.push(p);
        await importJobRepository.updateProgress(jobId, {
          currentPage: chunk.chunkIndex + 1,
          failedPages: allFailedPages,
          status: "processing",
        });
        continue;
      }

      const stageResult = await stageQuestionsFromAiResponse(
        aiResult.data,
        job,
        maxQuestionsPerChunk
      );
      if (!stageResult.validResponse) {
        for (let p = chunk.startPage; p <= chunk.endPage; p++) allFailedPages.push(p);
        await importJobRepository.updateProgress(jobId, {
          currentPage: chunk.chunkIndex + 1,
          failedPages: allFailedPages,
          status: "processing",
        });
        continue;
      }
      totalExtracted += stageResult.inserted;
      totalSkipped += stageResult.skipped;

      const eta = estimateRemainingSeconds(chunks.length, chunk.chunkIndex);
      const updatedJob = await importJobRepository.updateProgress(jobId, {
        currentPage: chunk.chunkIndex + 1,
        extractedQuestions: totalExtracted,
        estimatedRemainingSeconds: eta,
        failedPages: allFailedPages,
        status: "processing",
      });

      if (onProgress && updatedJob) {
        const progress = await importJobRepository.getProgress(jobId);
        if (progress) onProgress(progress);
      }

      const isLastChunk = chunk.chunkIndex === chunks.length - 1;
      if (isLastChunk) {
        await importJobRepository.markCompleted(jobId, totalExtracted);
      }
      return ok({ totalExtracted, totalSkipped, isCompleted: isLastChunk });
    }

    // Fallback if loop ends
    await importJobRepository.markCompleted(jobId, totalExtracted);
    return ok({ totalExtracted, totalSkipped, isCompleted: true });
  },

  /** Returns a live progress snapshot for a running import job. */
  async getProgress(jobId: number): Promise<Result<ImportJobProgress>> {
    const progress = await importJobRepository.getProgress(jobId);
    if (!progress) {
      return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    }
    return ok(progress);
  },

  /** Pauses a running import job. */
  async pauseJob(jobId: number): Promise<Result<ImportJob>> {
    const job = await importJobRepository.findById(jobId);
    if (!job) return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    if (job.status !== "processing") {
      return err(
        `Cannot pause job with status "${job.status}".`,
        null,
        "VALIDATION_ERROR"
      );
    }
    const updated = await importJobRepository.markPaused(jobId);
    if (!updated) return err("Failed to pause job", null, "DATABASE_ERROR");
    return ok(updated);
  },

  /** Returns all import jobs for the dashboard. */
  async listJobs() {
    return await importJobRepository.findAll();
  },

  /** Returns summary stats for the import dashboard widget. */
  async getJobStats() {
    return await importJobRepository.getSummaryStats();
  },

  /** Deletes a job and all its staged questions. */
  async deleteJob(jobId: number): Promise<Result<true>> {
    const job = await importJobRepository.findById(jobId);
    if (!job) return err(`Import job #${jobId} not found`, null, "NOT_FOUND");
    if (job.status === "processing") {
      return err("Cannot delete a running job. Pause it first.", null, "VALIDATION_ERROR");
    }
    await stagedQuestionRepository.deleteByJobId(jobId);
    await importJobRepository.delete(jobId);
    return ok(true);
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses + validates Gemini JSON, then inserts valid questions into staged_questions.
 * Used by all three import paths (PDF, image, text) — single staging function.
 */
async function stageQuestionsFromAiResponse(
  rawJson: string,
  job: ImportJob,
  maxQuestionsPerChunk: number
): Promise<{ inserted: number; skipped: number; validResponse: boolean }> {
  const parseResult = validationService.parseJson(rawJson);
  if (!parseResult.success) return { inserted: 0, skipped: 0, validResponse: false };

  const validateResult = validationService.validateQuestionExtractorResponse(parseResult.data);
  if (!validateResult.success) return { inserted: 0, skipped: 0, validResponse: false };

  const validQuestions = validateResult.data.slice(0, maxQuestionsPerChunk);
  const skipped = validateResult.data.length - validQuestions.length;

  const stageInputs = validQuestions.map((q) => ({
    importJobId: job.id,
    question: q.question,
    options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
    answer: q.correctOption,
    explanation: q.shortExplanation,
    difficulty: q.difficulty,
    topic: q.topic,
    category: (job.forcedCategory || q.category) as ValidCategory,
    examName: q.examName ?? null,
  }));

  const inserted = await stagedQuestionRepository.createMany(stageInputs);
  return { inserted, skipped, validResponse: true };
}

function estimateRemainingSeconds(totalChunks: number, completedChunks: number): number {
  const avgSecondsPerChunk = 8;
  const remaining = totalChunks - completedChunks - 1;
  return Math.max(0, remaining * avgSecondsPerChunk);
}
