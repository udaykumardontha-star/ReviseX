/**
 * services/validation_service.ts
 *
 * Central validation service for NeomX.
 * ALL Gemini AI responses MUST pass through this service before
 * hitting any repository layer. Malformed payloads are rejected early.
 *
 * Validates:
 *   - Question extractor responses (PROMPT 1)
 *   - Topic revision generator responses (PROMPT 2)
 *   - Categories, difficulties, correct options
 *   - JSON parse safety
 *
 * Returns typed Result<T> — never throws.
 * The app/ layer never imports this directly — only services do.
 */

import { z } from "zod";
import { VALID_CATEGORIES, VALID_DIFFICULTIES } from "@/db/schema";
import type { ValidCategory, ValidDifficulty } from "@/db/schema";
import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";
import { normalizeText, normalizeTopic, normalizeCategory, normalizeDifficulty, normalizeCorrectOption } from "@/lib/utils/normalizer";

// ─────────────────────────────────────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for a single extracted MCQ from Prompt 1 (Question Extractor).
 */
const ExtractedQuestionSchema = z.object({
  question: z.string().min(10, "Question too short (min 10 chars)"),
  option_a: z.string().min(1, "option_a is empty"),
  option_b: z.string().min(1, "option_b is empty"),
  option_c: z.string().min(1, "option_c is empty"),
  option_d: z.string().min(1, "option_d is empty"),
  correct_option: z.string().min(1, "correct_option is empty"),
  short_explanation: z.string().optional().default(""),
  difficulty: z.string().optional().default("medium"),
  topic: z.string().min(2, "topic too short (min 2 chars)"),
  category: z.string().min(2, "category too short"),
  exam_name: z.string().nullable().optional(),
});

/**
 * Schema for the full Prompt 1 JSON envelope.
 */
const QuestionExtractorResponseSchema = z.object({
  questions: z
    .array(ExtractedQuestionSchema)
    .min(1, "questions array is empty"),
});

/**
 * Schema for the Prompt 2 (Topic Revision Generator) response.
 */
const TopicGeneratorResponseSchema = z.object({
  topic: z.string().min(2, "topic name too short"),
  category: z.string().min(2, "category too short"),
  keywords: z
    .array(z.string())
    .min(1, "keywords array is empty")
    .max(20, "too many keywords (max 20)"),
  key_facts: z
    .array(z.string())
    .min(1, "key_facts array is empty")
    .max(50, "too many facts (max 50)"),
  ssc_traps: z.string().optional().default(""),
  similar_questions: z.array(z.string()).optional().default([]),
  full_revision_note: z
    .string()
    .min(100, "full_revision_note too short (min 100 chars)"),
  quick_revision_card: z
    .array(z.string())
    .min(5, "quick_revision_card needs at least 5 bullets")
    .max(25, "too many bullets (max 25)"),
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ValidatedExtractedQuestion = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  shortExplanation: string;
  difficulty: ValidDifficulty;
  topic: string;           // normalized display name
  category: ValidCategory; // enforced from VALID_CATEGORIES
  examName?: string | null;
};

export type ValidatedTopicGeneratorResponse = {
  topic: string;
  category: ValidCategory;
  keywords: string[];
  keyFacts: string[];
  sscTraps: string;
  similarQuestions: string[];
  fullRevisionNote: string;
  quickRevisionCard: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const validationService = {
  /**
   * Safely parses a JSON string from Gemini.
   * Strips markdown code fences (```json ... ```) that Gemini sometimes wraps.
   * Returns Result<unknown>.
   */
  parseJson(rawText: string): Result<unknown> {
    let cleaned = rawText.trim();

    // Strip ```json ... ``` code fences
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    }

    // Find the outermost JSON object/array
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    let start = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
    } else if (firstBracket !== -1) {
      start = firstBracket;
    }

    if (start > 0) {
      cleaned = cleaned.slice(start);
    }

    try {
      return ok(JSON.parse(cleaned));
    } catch (e) {
      return err(
        `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
        "AI_PARSE_ERROR"
      );
    }
  },

  /**
   * Validates and normalizes a Gemini Question Extractor response (Prompt 1).
   * Returns an array of clean, validated, normalized questions.
   *
   * Per-question normalization:
   *   - question text: normalizeText
   *   - topic: normalizeTopic
   *   - category: enforced from VALID_CATEGORIES, fallback "Miscellaneous"
   *   - difficulty: enforced to easy/medium/hard, fallback "medium"
   *   - correct_option: uppercase A/B/C/D only, discards invalid
   */
  validateQuestionExtractorResponse(
    rawJson: unknown
  ): Result<ValidatedExtractedQuestion[]> {
    const parseResult = QuestionExtractorResponseSchema.safeParse(rawJson);

    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `[${i.path.join(".")}] ${i.message}`)
        .join("; ");
      return err(
        `Question extractor schema validation failed: ${issues}`,
        parseResult.error,
        "VALIDATION_ERROR"
      );
    }

    const validated: ValidatedExtractedQuestion[] = [];
    const skipped: string[] = [];

    for (const raw of parseResult.data.questions) {
      // Normalize and enforce correct_option
      const correctOption = normalizeCorrectOption(raw.correct_option);
      if (!correctOption) {
        skipped.push(
          `Skipped question (invalid correct_option "${raw.correct_option}"): ${raw.question.slice(0, 50)}`
        );
        continue;
      }

      // Normalize category — fallback to "Miscellaneous" if unrecognized
      const category: ValidCategory =
        normalizeCategory(raw.category) ?? "Miscellaneous";

      // Normalize difficulty — fallback to "medium"
      const difficulty: ValidDifficulty = normalizeDifficulty(raw.difficulty ?? "medium");

      // Normalize topic name
      const topic = normalizeTopic(raw.topic);
      if (!topic || topic.length < 2) {
        skipped.push(`Skipped question (empty topic): ${raw.question.slice(0, 50)}`);
        continue;
      }

      validated.push({
        question: normalizeText(raw.question),
        optionA: normalizeText(raw.option_a),
        optionB: normalizeText(raw.option_b),
        optionC: normalizeText(raw.option_c),
        optionD: normalizeText(raw.option_d),
        correctOption,
        shortExplanation: normalizeText(raw.short_explanation ?? ""),
        difficulty,
        topic,
        category,
        examName: raw.exam_name || null,
      });
    }

    if (validated.length === 0) {
      return err(
        `All ${parseResult.data.questions.length} questions were invalid. Skipped: ${skipped.join(" | ")}`,
        skipped,
        "VALIDATION_ERROR"
      );
    }

    return ok(validated);
  },

  /**
   * Validates and normalizes a Gemini Topic Generator response (Prompt 2).
   */
  validateTopicGeneratorResponse(
    rawJson: unknown
  ): Result<ValidatedTopicGeneratorResponse> {
    const parseResult = TopicGeneratorResponseSchema.safeParse(rawJson);

    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `[${i.path.join(".")}] ${i.message}`)
        .join("; ");
      return err(
        `Topic generator schema validation failed: ${issues}`,
        parseResult.error,
        "VALIDATION_ERROR"
      );
    }

    const raw = parseResult.data;

    // Enforce category
    const category: ValidCategory =
      normalizeCategory(raw.category) ?? "Miscellaneous";

    // Normalize topic name
    const topic = normalizeTopic(raw.topic);
    if (!topic || topic.length < 2) {
      return err(
        `Topic name is invalid after normalization: "${raw.topic}"`,
        null,
        "VALIDATION_ERROR"
      );
    }

    // Normalize keywords — deduplicate, lowercase, trim
    const keywords = [
      ...new Set(
        raw.keywords
          .map((k) => k.toLowerCase().trim())
          .filter((k) => k.length >= 2)
      ),
    ].slice(0, 20);

    // Normalize facts — deduplicate, trim
    const keyFacts = [
      ...new Set(
        raw.key_facts.map((f) => normalizeText(f)).filter((f) => f.length >= 5)
      ),
    ].slice(0, 50);

    if (keyFacts.length === 0) {
      return err(
        "No valid key_facts after normalization",
        null,
        "VALIDATION_ERROR"
      );
    }

    if (raw.full_revision_note.length < 100) {
      return err(
        `full_revision_note is too short: ${raw.full_revision_note.length} chars (min 100)`,
        null,
        "VALIDATION_ERROR"
      );
    }

    return ok({
      topic,
      category,
      keywords,
      keyFacts,
      sscTraps: normalizeText(raw.ssc_traps ?? ""),
      similarQuestions: raw.similar_questions?.map((q) => normalizeText(q)) ?? [],
      fullRevisionNote: raw.full_revision_note.trim(),
      quickRevisionCard: raw.quick_revision_card
        .map((b) => normalizeText(b))
        .filter((b) => b.length > 0),
    });
  },

  /**
   * Validates a single category string against VALID_CATEGORIES.
   */
  isValidCategory(category: string): category is ValidCategory {
    return VALID_CATEGORIES.includes(category as ValidCategory);
  },

  /**
   * Validates a difficulty string.
   */
  isValidDifficulty(difficulty: string): difficulty is ValidDifficulty {
    return VALID_DIFFICULTIES.includes(difficulty as ValidDifficulty);
  },

  /**
   * Validates a correct_option value (A, B, C, D only).
   */
  isValidCorrectOption(option: string): option is "A" | "B" | "C" | "D" {
    return ["A", "B", "C", "D"].includes(option.toUpperCase());
  },
} as const;

