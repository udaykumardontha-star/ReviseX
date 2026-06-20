/**
 * lib/utils/hasher.ts
 *
 * SHA-256 hashing utilities for content deduplication.
 * Used for:
 *   - question_hash: deduplicates questions by text
 *   - file_hash: deduplicates PDF uploads
 *
 * Uses Node.js built-in `crypto` module — no external dependency.
 */

import { createHash } from "crypto";
import { normalizeText } from "./normalizer";

/**
 * Generates a SHA-256 hash of the given string.
 * Returns a lowercase hex string (64 characters).
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Generates a stable hash for a question's text.
 * Normalizes the text before hashing to ensure consistent deduplication
 * even when spacing/casing differs between sources.
 *
 * Example:
 *   "who wrote the Arthashastra?"  →  "8f2a1b3c..."
 *   "Who wrote the Arthashastra?"  →  "8f2a1b3c..." (same hash)
 */
export function hashQuestion(questionText: string): string {
  return sha256(normalizeText(questionText).toLowerCase());
}

/**
 * Generates a SHA-256 hash of a Buffer (for file content deduplication).
 * Used to detect duplicate PDF uploads.
 */
export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generates a short 8-character fingerprint for display purposes only.
 * NOT suitable for deduplication — use sha256() for that.
 */
export function shortFingerprint(input: string): string {
  return sha256(input).slice(0, 8);
}
