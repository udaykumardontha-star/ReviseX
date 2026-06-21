/**
 * lib/ai/gemini_client.ts
 *
 * Thin wrapper around @google/generative-ai.
 * All Gemini API calls in NeomX go through this file.
 *
 * Responsibilities:
 *   - Initialise the SDK with the API key from env
 *   - Expose typed methods for Prompt 1 (extract — text, image, or raw text)
 *   - Expose Prompt 2 (topic revision note)
 *   - Handle network/API errors and return Result<string>
 *   - Rate-limit gate is checked by the CALLER before calling any method here
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Part } from "@google/generative-ai";
import { ok, err } from "@/types/result";
import type { Result } from "@/types/result";

// ─── Initialisation ───────────────────────────────────────────────────────────

const apiKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ?? "";
const modelId =
  process.env["GOOGLE_GENERATIVE_AI_MODEL"] ?? "gemini-1.5-flash";

if (!apiKey) {
  console.warn("[GeminiClient] GOOGLE_GENERATIVE_AI_API_KEY is not set.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// ─── Shared generation config ─────────────────────────────────────────────────

const JSON_GENERATION_CONFIG = {
  temperature: 0.2,       // low temperature → more deterministic JSON
  topP: 0.9,
  maxOutputTokens: 8192,
} as const;

// ─── Prompts ──────────────────────────────────────────────────────────────────

import { VALID_CATEGORIES, VALID_CHAPTERS_BY_CATEGORY } from "@/db/schema";

/**
 * Prompt 1 — Question Extractor
 *
 * Used for ALL three input types: PDF text, image screenshots, raw pasted text.
 * The short_explanation field is MANDATORY in every question object.
 * Rules for explanation:
 *   - Maximum 2 sentences
 *   - Explains WHY the correct option is correct
 *   - Plain text only (no markdown, no bullets)
 *   - SSC exam style — concise factual justification
 */
const QUESTION_EXTRACTOR_SYSTEM_PROMPT = `You are an SSC Exam Data Processor. Extract multiple-choice questions from the input into a valid JSON object. Follow these rules strictly:

1. Categories MUST be exactly one of: ${VALID_CATEGORIES.join(", ")}.
2. You MUST assign a predefined 'chapter' for the selected category based on this strict mapping:
${JSON.stringify(VALID_CHAPTERS_BY_CATEGORY, null, 2)}
CRITICAL: The 'chapter' string MUST be an EXACT copy-paste from the array for your chosen category. DO NOT invent or rephrase chapters.
3. 'topic' must be highly specific and dynamically generated (e.g., "Mughal Architecture", "Cricket Terminology"). DO NOT just copy the chapter name.
4. correct_option must be exactly "A", "B", "C", or "D".
5. difficulty must be exactly "easy", "medium", or "hard".
6. short_explanation is MANDATORY for every question. Rules:
   - Maximum 1-2 sentences of plain text.
   - Explain WHY the correct option is correct using a concrete fact.
   - No markdown, no bullet points, no lengthy theory.
7. If the input is an image: read the text visible in the image and extract MCQs from it.
8. If the text contains both Hindi and English (e.g. bilingual exam paper), completely IGNORE the Hindi part. Extract the question and options ONLY in English.
9. If no MCQs are found, return {"questions": []}.
10. Return ONLY valid JSON. No markdown, no explanation, no code fences.

Output format:
{
  "questions": [
    {
      "question": "Exact question text.",
      "option_a": "Text", "option_b": "Text", "option_c": "Text", "option_d": "Text",
      "correct_option": "A",
      "short_explanation": "Concise SSC-style explanation of why this answer is correct. One or two sentences max.",
      "difficulty": "medium",
      "category": "Predefined category name",
      "chapter": "Predefined chapter name from the mapping",
      "topic": "Highly specific dynamic micro-topic name",
      "exam_name": "Extract the exam name and year if it appears anywhere near the question (e.g., 'SSC CGL 2023 Tier 1', 'RRB NTPC 2019', 'CDS 2021'). Look carefully at prefixes or suffixes like (SSC CHSL 2021). If not found, return null."
    }
  ]
}`;

/**
 * Prompt 2 — Topic Revision Note Generator
 */
const TOPIC_GENERATOR_SYSTEM_PROMPT = `You are an SSC Exam Tutor. Generate a comprehensive revision knowledge base for the given topic. Follow these rules strictly:
1. category MUST be exactly one of: ${VALID_CATEGORIES.join(", ")}.
2. chapter MUST be exactly chosen from the following mapping for the selected category:
${JSON.stringify(VALID_CHAPTERS_BY_CATEGORY, null, 2)}
CRITICAL: The 'chapter' string MUST be an EXACT copy-paste from the array for your chosen category. DO NOT invent or rephrase chapters.
3. keywords: 4–6 highly searchable lowercase keywords.
4. key_facts: 10–20 atomic facts, each as "Fact → Detail". For English Grammar, focus on rules, exceptions, and 'Incorrect vs Correct' examples. For English Vocabulary, focus on meanings, synonyms, antonyms, and usage.
5. full_revision_note: A detailed, well-structured Markdown document (use ## headings, bullet points, tables where helpful). Minimum 500 words. For English Practice topics (like Para Jumbles), focus on solving strategies.
6. quick_revision_card: 10–20 atomic bullet points for last-minute revision.
7. ssc_traps: Common trick variations and examiner traps for this topic.
8. Return ONLY valid JSON. No markdown code fences, no explanation outside JSON.

Output format:
{
  "topic": "Standardized topic title",
  "category": "Predefined category name",
  "chapter": "Predefined chapter name",
  "keywords": ["keyword1", "keyword2"],
  "key_facts": ["Fact 1 → Detail", "Fact 2 → Detail"],
  "ssc_traps": "Common traps description.",
  "similar_questions": ["Sample question 1?", "Sample question 2?"],
  "full_revision_note": "# Topic\\n\\n## Section\\n\\nContent...",
  "quick_revision_card": ["Bullet 1", "Bullet 2"]
}`;

// ─── Supported image MIME types ───────────────────────────────────────────────

export type SupportedImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

// ─── Client ───────────────────────────────────────────────────────────────────

export const geminiClient = {
  /**
   * Prompt 1a — Extract MCQs from PDF text chunk.
   * Input: raw text string extracted from a PDF page chunk.
   */
  async extractQuestions(pdfTextChunk: string): Promise<Result<string>> {
    if (!apiKey) {
      return err("GOOGLE_GENERATIVE_AI_API_KEY is not configured", null, "AI_API_ERROR");
    }

    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: QUESTION_EXTRACTOR_SYSTEM_PROMPT,
        generationConfig: JSON_GENERATION_CONFIG,
      });

      const prompt = `Extract all MCQ questions from the following exam text. Every question MUST have a short_explanation:\n\n${pdfTextChunk}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text || text.trim().length === 0) {
        return err("Gemini returned empty response for question extraction", null, "AI_PARSE_ERROR");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("429") || message.toLowerCase().includes("quota")) {
        return err(`Gemini rate limit hit: ${message}`, e, "AI_RATE_LIMIT");
      }
      return err(`Gemini API error during question extraction: ${message}`, e, "AI_API_ERROR");
    }
  },

  /**
   * Prompt 1b — Extract MCQs from an image (screenshot/photo).
   * Uses Gemini Vision via inlineData.
   * Input: base64-encoded image + its MIME type.
   * Same output format as extractQuestions (JSON string).
   */
  async extractQuestionsFromImage(
    base64Data: string,
    mimeType: SupportedImageMimeType
  ): Promise<Result<string>> {
    if (!apiKey) {
      return err("GOOGLE_GENERATIVE_AI_API_KEY is not configured", null, "AI_API_ERROR");
    }

    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: QUESTION_EXTRACTOR_SYSTEM_PROMPT,
        generationConfig: JSON_GENERATION_CONFIG,
      });

      const imagePart: Part = {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };

      const textPart: Part = {
        text: "Read all text visible in this image. Extract all MCQ questions found. Every question MUST have a short_explanation. Return only the JSON object.",
      };

      const result = await model.generateContent([textPart, imagePart]);
      const text = result.response.text();

      if (!text || text.trim().length === 0) {
        return err("Gemini returned empty response for image extraction", null, "AI_PARSE_ERROR");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("429") || message.toLowerCase().includes("quota")) {
        return err(`Gemini rate limit hit: ${message}`, e, "AI_RATE_LIMIT");
      }
      return err(`Gemini API error during image extraction: ${message}`, e, "AI_API_ERROR");
    }
  },

  /**
   * Prompt 1c — Extract MCQs from raw pasted text.
   * Used when user pastes text directly into the Import page.
   * Same Gemini call as extractQuestions but with clearer framing for
   * potentially incomplete / multi-question pasted content.
   */
  async extractQuestionsFromText(rawText: string): Promise<Result<string>> {
    if (!apiKey) {
      return err("GOOGLE_GENERATIVE_AI_API_KEY is not configured", null, "AI_API_ERROR");
    }

    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: QUESTION_EXTRACTOR_SYSTEM_PROMPT,
        generationConfig: JSON_GENERATION_CONFIG,
      });

      const prompt = `Extract all MCQ questions from the following pasted content. The content may include one or more questions, study notes, or raw exam material. Extract every MCQ question found. Every question MUST have a short_explanation. Return only the JSON object:\n\n${rawText}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text || text.trim().length === 0) {
        return err("Gemini returned empty response for text extraction", null, "AI_PARSE_ERROR");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("429") || message.toLowerCase().includes("quota")) {
        return err(`Gemini rate limit hit: ${message}`, e, "AI_RATE_LIMIT");
      }
      return err(`Gemini API error during text extraction: ${message}`, e, "AI_API_ERROR");
    }
  },

  /**
   * Prompt 2 — Generate a full revision knowledge base for a topic.
   * Used by the lazy note generation pipeline.
   */
  async generateTopicRevision(
    topicName: string,
    category: string,
    contextQuestions: string[]
  ): Promise<Result<string>> {
    if (!apiKey) {
      return err("GOOGLE_GENERATIVE_AI_API_KEY is not configured", null, "AI_API_ERROR");
    }

    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: TOPIC_GENERATOR_SYSTEM_PROMPT,
        generationConfig: JSON_GENERATION_CONFIG,
      });

      const questionContext =
        contextQuestions.length > 0
          ? `\n\nSample exam questions from this topic for context:\n${contextQuestions
              .slice(0, 10)
              .map((q, i) => `${i + 1}. ${q}`)
              .join("\n")}`
          : "";

      const prompt = `Generate a complete SSC revision knowledge base for the topic: "${topicName}" (Category: ${category})${questionContext}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text || text.trim().length === 0) {
        return err("Gemini returned empty response for topic generation", null, "AI_PARSE_ERROR");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("429") || message.toLowerCase().includes("quota")) {
        return err(`Gemini rate limit hit: ${message}`, e, "AI_RATE_LIMIT");
      }
      return err(`Gemini API error during topic generation: ${message}`, e, "AI_API_ERROR");
    }
  },

  /** Returns the model ID currently in use (for display in UI). */
  getModelId(): string {
    return modelId;
  },
} as const;

