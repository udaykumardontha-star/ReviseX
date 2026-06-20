/**
 * lib/utils/slugifier.ts
 *
 * Slug generation and validation utilities.
 * Ensures all topic slugs are URL-safe, unique-friendly, and consistent.
 */

import { toSlug } from "./normalizer";

/**
 * Generates a topic slug from a display name.
 * Wrapper around toSlug() with additional guarantees:
 *   - Maximum 100 characters
 *   - Falls back to "unknown-topic" if result is empty
 *
 * Examples:
 *   "Mughal Empire"              → "mughal-empire"
 *   "Art & Culture"              → "art-and-culture"
 *   "GDP & National Income"      → "gdp-and-national-income"
 *   "Environmental Pollution (Types)" → "environmental-pollution-types"
 */
export function generateTopicSlug(topicName: string): string {
  const slug = toSlug(topicName).slice(0, 100);
  return slug.length > 0 ? slug : "unknown-topic";
}

/**
 * Generates a unique slug by appending an incrementing suffix.
 * Called when a generated slug already exists in the database.
 *
 * Example:
 *   generateUniqueSlug("mughal-empire", ["mughal-empire", "mughal-empire-2"])
 *   → "mughal-empire-3"
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>
): string {
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}

/**
 * Validates that a string is a properly formatted slug.
 * Returns true if the string matches the expected slug pattern.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100;
}

/**
 * Converts a slug back to a display-friendly title (best-effort).
 * Used for breadcrumbs and fallback display before topic data loads.
 *
 * Example:
 *   "mughal-empire" → "Mughal Empire"
 */
export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
