/**
 * lib/utils/normalizer.ts
 *
 * Text normalization utilities used across the ingestion pipeline.
 * ALL inputs must be normalized before hitting the database to ensure
 * consistent deduplication, slug generation, and FTS5 indexing.
 */

import { VALID_CATEGORIES, type ValidCategory } from "@/db/schema";

// ─── String normalization ─────────────────────────────────────────────────────

/**
 * Normalizes a raw string for database storage and comparison.
 * - Trims leading/trailing whitespace
 * - Collapses internal whitespace runs to a single space
 * - Normalizes Unicode to NFC form
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalizes a topic name for consistent storage.
 * - Title-cases the result
 * - Removes special characters except hyphens and apostrophes
 * - Trims and collapses whitespace
 *
 * Examples:
 *   "mughal empire  " → "Mughal Empire"
 *   "art & culture" → "Art & Culture"
 */
export function normalizeTopic(input: string): string {
  return normalizeText(input)
    .replace(/[^\w\s&''-]/g, "") // keep alphanum, spaces, &, ', -
    .split(" ")
    .map((word) => {
      if (word.length === 0) return "";
      // Preserve small connector words unless they are first
      const connectors = new Set(["and", "or", "of", "the", "in", "at", "to"]);
      return connectors.has(word.toLowerCase()) && word !== input.split(" ")[0]
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();
}

/**
 * Converts a topic name to a URL-safe slug.
 *
 * Examples:
 *   "Mughal Empire" → "mughal-empire"
 *   "Art & Culture" → "art-and-culture"
 *   "India's Constitution" → "indias-constitution"
 */
export function toSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalizes a category string to a valid `ValidCategory` or `null`.
 * Case-insensitive matching with fuzzy fallback.
 */
export function normalizeCategory(input: string): ValidCategory | null {
  const normalized = normalizeText(input).toLowerCase();

  // Exact match first (case-insensitive)
  const exact = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === normalized
  );
  if (exact) return exact;

  // Alias map for common AI output variations
  const CATEGORY_ALIASES: Record<string, ValidCategory> = {
    "static gk": "Static G.K.",
    "static g.k": "Static G.K.",
    "static general knowledge": "Static G.K.",
    "general knowledge": "Static G.K.",
    "gk": "Static G.K.",
    "art and culture": "Static G.K.",
    "art & culture": "Static G.K.",
    "arts and culture": "Static G.K.",
    "culture": "Static G.K.",
    "dance": "Static G.K.",
    "sports": "Static G.K.",
    "indian history": "History",
    "modern history": "History",
    "ancient history": "History",
    "medieval history": "History",
    "world history": "History",
    "indian polity": "Polity",
    "governance": "Polity",
    "constitution": "Polity",
    "indian geography": "Geography",
    "world geography": "Geography",
    "physical geography": "Geography",
    "indian economy": "Economy",
    "economics": "Economy",
    "economic": "Economy",
    "biology": "Science",
    "physics": "Science",
    "chemistry": "Science",
    "general science": "Science",
    "current affairs": "Current Affairs",
    "current events": "Current Affairs",
    "english language": "English",
    "english grammar": "English",
    "vocabulary": "English",
    "misc": "Miscellaneous",
    "other": "Miscellaneous",
    "others": "Miscellaneous",
  };

  // Check aliases
  if (CATEGORY_ALIASES[normalized]) {
    return CATEGORY_ALIASES[normalized];
  }

  // Fuzzy: check if the input is a substring of a valid category or vice-versa
  const fuzzy = VALID_CATEGORIES.find(
    (c) =>
      c.toLowerCase().includes(normalized) ||
      normalized.includes(c.toLowerCase())
  );

  return fuzzy ?? null;
}

/**
 * Normalizes difficulty to one of the valid values.
 * Defaults to "medium" if unrecognized.
 */
export function normalizeDifficulty(
  input: string
): "easy" | "medium" | "hard" {
  const lower = input.toLowerCase().trim();
  if (lower === "easy") return "easy";
  if (lower === "hard") return "hard";
  return "medium";
}

/**
 * Normalizes a correct_option answer letter to uppercase A/B/C/D.
 * Returns null if unrecognized.
 */
export function normalizeCorrectOption(
  input: string
): "A" | "B" | "C" | "D" | null {
  const upper = input.trim().toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
    return upper;
  }
  return null;
}

/**
 * Strips markdown formatting for plain text comparison/hashing.
 */
export function stripMarkdown(input: string): string {
  return input
    .replace(/#{1,6}\s/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/>\s/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Truncates text to a maximum length with an ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}
