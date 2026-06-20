/**
 * lib/pdf/pdf_processor.ts
 *
 * PDF text extraction utility for ReviseX import pipeline.
 * Wraps pdf-parse to extract raw text, page count, and chunked page ranges.
 *
 * Design:
 *   - extractText() returns full text + page count
 *   - chunkByPages() splits extracted text into chunks of N pages
 *   - hashFile() generates SHA-256 for duplicate detection (delegates to hasher)
 */

import pdfParse from "pdf-parse";
import { hashBuffer } from "@/lib/utils/hasher";
import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PdfExtractionResult = {
  text: string;
  pageCount: number;
  fileHash: string;
  fileSizeBytes: number;
};

export type PdfChunk = {
  chunkIndex: number;
  startPage: number;
  endPage: number;
  text: string;
};

// ─── PDF Processor ────────────────────────────────────────────────────────────

export const pdfProcessor = {
  /**
   * Extracts text from a PDF buffer.
   * Returns the full text, page count, SHA-256 hash, and file size.
   * Fails fast if the buffer is not a valid PDF.
   */
  async extractText(buffer: Buffer): Promise<Result<PdfExtractionResult>> {
    if (!buffer || buffer.length === 0) {
      return err("Empty buffer provided to PDF processor", null, "UNSUPPORTED_FORMAT");
    }

    // Validate PDF magic bytes (%PDF-)
    const header = buffer.slice(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      return err(
        "File does not appear to be a valid PDF (missing %PDF header)",
        null,
        "UNSUPPORTED_FORMAT"
      );
    }

    try {
      const parsed = await pdfParse(buffer, {
        // Custom page render to preserve structure
        pagerender: (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
          return pageData.getTextContent().then(
            (textContent: { items: Array<{ str: string }> }) => {
              return textContent.items.map((item: { str: string }) => item.str).join(" ");
            }
          );
        },
      });

      const fileHash = hashBuffer(buffer);

      return ok({
        text: parsed.text ?? "",
        pageCount: parsed.numpages ?? 0,
        fileHash,
        fileSizeBytes: buffer.length,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`PDF parsing failed: ${message}`, e, "UNSUPPORTED_FORMAT");
    }
  },

  /**
   * Splits PDF text into chunks of approximately `pagesPerChunk` pages.
   * Since pdf-parse provides full text (not per-page), we split by estimated
   * character count per page. Each chunk is marked with start/end page estimates.
   *
   * @param fullText   - Complete extracted text from pdf-parse
   * @param totalPages - Total page count from pdf-parse
   * @param pagesPerChunk - How many pages per chunk (from system_settings.pdfChunkSize)
   */
  chunkByPages(
    fullText: string,
    totalPages: number,
    pagesPerChunk: number
  ): PdfChunk[] {
    if (!fullText.trim() || totalPages === 0) return [];

    const charsPerPage = Math.ceil(fullText.length / Math.max(totalPages, 1));
    const charsPerChunk = charsPerPage * pagesPerChunk;
    const chunks: PdfChunk[] = [];

    let chunkIndex = 0;
    let charOffset = 0;
    let pageOffset = 1;

    while (charOffset < fullText.length) {
      const chunkText = fullText.slice(charOffset, charOffset + charsPerChunk);
      const estimatedEndPage = Math.min(
        pageOffset + pagesPerChunk - 1,
        totalPages
      );

      chunks.push({
        chunkIndex,
        startPage: pageOffset,
        endPage: estimatedEndPage,
        text: chunkText.trim(),
      });

      charOffset += charsPerChunk;
      pageOffset = estimatedEndPage + 1;
      chunkIndex++;
    }

    return chunks;
  },

  /**
   * Returns the SHA-256 hash of a file buffer for deduplication.
   * Exposed here so the import service doesn't need to import hasher directly.
   */
  hashBuffer(buffer: Buffer): string {
    return hashBuffer(buffer);
  },

  /**
   * Validates that an uploaded file is an acceptable size.
   * Enforces a 100 MB hard limit.
   */
  validateFileSize(
    fileSizeBytes: number,
    maxMb: number = 100
  ): Result<true> {
    const maxBytes = maxMb * 1024 * 1024;
    if (fileSizeBytes > maxBytes) {
      return err(
        `File too large: ${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB (max ${maxMb} MB)`,
        null,
        "FILE_TOO_LARGE"
      );
    }
    return ok(true);
  },
} as const;
