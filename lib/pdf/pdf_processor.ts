/**
 * lib/pdf/pdf_processor.ts
 *
 * Unified file processing utility for NeomX import pipeline.
 * Handles three input types: PDF, Image (PNG/JPG/JPEG/WEBP), and raw Text.
 *
 * All three types produce chunks that flow into the same import pipeline.
 *
 * Design:
 *   - extractText()    → PDF text extraction + chunking
 *   - processImage()   → image → base64 for Gemini Vision
 *   - processText()    → raw text → single chunk
 *   - hashBuffer()     → SHA-256 for duplicate detection
 *   - validateFileSize() → 100 MB hard limit
 */

import pdfParse from "pdf-parse";
import { hashBuffer } from "@/lib/utils/hasher";
import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import type { SupportedImageMimeType } from "@/lib/ai/gemini_client";

// ─── File Types ────────────────────────────────────────────────────────────────

export type ImportFileType = "pdf" | "image" | "text";

export const SUPPORTED_IMAGE_TYPES: Record<string, SupportedImageMimeType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export function detectFileType(mimeType: string): ImportFileType | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType in SUPPORTED_IMAGE_TYPES) return "image";
  return null;
}

// ─── Result Types ──────────────────────────────────────────────────────────────

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

export type ImageChunk = {
  chunkIndex: number;
  base64Data: string;
  mimeType: SupportedImageMimeType;
  fileHash: string;
  fileSizeBytes: number;
};

export type TextChunk = {
  chunkIndex: number;
  text: string;
  charCount: number;
};

// ─── Processor ────────────────────────────────────────────────────────────────

export const pdfProcessor = {
  // ─── PDF ──────────────────────────────────────────────────────────────

  /**
   * Extracts text from a PDF buffer.
   * Returns the full text, page count, SHA-256 hash, and file size.
   */
  async extractText(buffer: Buffer): Promise<Result<PdfExtractionResult>> {
    if (!buffer || buffer.length === 0) {
      return err("Empty buffer provided to PDF processor", null, "UNSUPPORTED_FORMAT");
    }

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
      const estimatedEndPage = Math.min(pageOffset + pagesPerChunk - 1, totalPages);

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

  // ─── Image ────────────────────────────────────────────────────────────

  /**
   * Processes an image buffer for Gemini Vision extraction.
   * Converts the buffer to base64 and validates the MIME type.
   * Returns a single ImageChunk (one image = one Gemini call).
   */
  processImage(
    buffer: Buffer,
    mimeType: string
  ): Result<ImageChunk> {
    if (!buffer || buffer.length === 0) {
      return err("Empty image buffer", null, "UNSUPPORTED_FORMAT");
    }

    const resolvedMime = SUPPORTED_IMAGE_TYPES[mimeType];
    if (!resolvedMime) {
      return err(
        `Unsupported image type: ${mimeType}. Supported: PNG, JPG, JPEG, WEBP`,
        null,
        "UNSUPPORTED_FORMAT"
      );
    }

    const base64Data = buffer.toString("base64");
    const fileHash = hashBuffer(buffer);

    return ok({
      chunkIndex: 0,
      base64Data,
      mimeType: resolvedMime,
      fileHash,
      fileSizeBytes: buffer.length,
    });
  },

  // ─── Text ─────────────────────────────────────────────────────────────

  /**
   * Processes raw pasted text for Gemini extraction.
   * Splits long text into ~8000-char chunks to respect token limits.
   * Returns TextChunks with hash derived from content.
   */
  processText(
    rawText: string
  ): Result<{ chunks: TextChunk[]; contentHash: string }> {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return err("Empty text provided", null, "UNSUPPORTED_FORMAT");
    }

    const contentHash = hashBuffer(Buffer.from(trimmed, "utf-8"));
    const MAX_CHARS_PER_CHUNK = 8000;

    if (trimmed.length <= MAX_CHARS_PER_CHUNK) {
      return ok({
        chunks: [{ chunkIndex: 0, text: trimmed, charCount: trimmed.length }],
        contentHash,
      });
    }

    // Split into chunks at paragraph boundaries when possible
    const chunks: TextChunk[] = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < trimmed.length) {
      let end = Math.min(offset + MAX_CHARS_PER_CHUNK, trimmed.length);

      // Try to break at a paragraph boundary
      if (end < trimmed.length) {
        const lastPara = trimmed.lastIndexOf("\n\n", end);
        if (lastPara > offset + MAX_CHARS_PER_CHUNK / 2) {
          end = lastPara + 2;
        }
      }

      const chunkText = trimmed.slice(offset, end).trim();
      if (chunkText) {
        chunks.push({ chunkIndex, text: chunkText, charCount: chunkText.length });
        chunkIndex++;
      }
      offset = end;
    }

    return ok({ chunks, contentHash });
  },

  // ─── Shared ───────────────────────────────────────────────────────────

  /** SHA-256 hash of a file buffer for deduplication. */
  hashBuffer(buffer: Buffer): string {
    return hashBuffer(buffer);
  },

  /** Validates that an uploaded file is within the acceptable size limit. */
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

