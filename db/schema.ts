/**
 * db/schema.ts
 *
 * Complete Drizzle ORM schema for ReviseX.
 * Defines all tables, indexes, and relations for the dual-system architecture:
 *   - System 1: Question Bank & Staging Pipeline
 *   - System 2: Revision Knowledge Base
 *   - System Meta: Settings, Sources, Import Jobs
 *
 * IMPORTANT: FTS5 virtual tables CANNOT be modeled with Drizzle ORM directly.
 * They are created via raw SQL in: db/migrations/fts5_tables.sql
 * Their triggers live in:          db/migrations/fts5_triggers.sql
 *
 * Naming conventions:
 *   - snake_case for all table/column names (SQL standard)
 *   - camelCase for TypeScript property names (Drizzle maps automatically)
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_CATEGORIES = [
  "Geography",
  "History",
  "Polity",
  "Economy",
  "Science",
  "Environment",
  "Art & Culture",
  "Current Affairs",
  "Miscellaneous",
] as const;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];

export const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type ValidDifficulty = (typeof VALID_DIFFICULTIES)[number];

export const TOPIC_STATUSES = [
  "not_generated",
  "generated",
  "needs_refresh",
] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const QUESTION_STATUSES = ["pending", "approved", "rejected"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const IMPORT_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "paused",
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const NOTE_GENERATION_SOURCES = [
  "question_bank",
  "manual",
  "refresh",
] as const;
export type NoteGenerationSource = (typeof NOTE_GENERATION_SOURCES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM METADATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * system_settings — Single-row configuration table.
 * Stores database version, rate limiting config, and system-wide settings.
 * Cost protection limits are stored here to be configurable without redeployment.
 */
export const systemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Database schema version for migration tracking
  databaseVersion: text("database_version").notNull().default("v1"),

  // AI cost protection: max Gemini API calls per 24-hour rolling window
  maxAiCallsPerDay: integer("max_ai_calls_per_day").notNull().default(50),

  // AI cost protection: max questions to extract per import job page chunk
  maxQuestionsPerChunk: integer("max_questions_per_chunk")
    .notNull()
    .default(30),

  // Maximum pages per PDF chunk sent to Gemini
  pdfChunkSize: integer("pdf_chunk_size").notNull().default(10),

  // Tracks the rolling 24h AI call count (reset daily via job)
  aiCallsTodayCount: integer("ai_calls_today_count").notNull().default(0),

  // Date of last AI call count reset (ISO 8601 date string)
  aiCallsResetDate: text("ai_calls_reset_date"),

  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type NewSystemSettings = typeof systemSettings.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// SOURCES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sources — Tracks the origin PDFs / exam papers.
 * Groups questions in the library view by their source.
 */
export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // Human-readable name of the source (e.g., "SSC CGL 2023 Tier I")
    name: text("name").notNull(),

    // Cached count of approved questions from this source (denormalized for speed)
    totalQuestions: integer("total_questions").notNull().default(0),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("sources_name_unique").on(table.name),
  ]
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT JOBS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * import_jobs — Tracks background PDF processing jobs.
 * Supports resume-from-last-page and per-chunk failure tracking.
 * file_hash (SHA-256) prevents duplicate uploads of the same file.
 */
export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // Original uploaded file name
    fileName: text("file_name").notNull(),

    // File size in bytes
    fileSize: integer("file_size").notNull(),

    // SHA-256 hash of the file content — used to detect and skip duplicates
    fileHash: text("file_hash").notNull(),

    // FK to sources — the paper this PDF belongs to
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),

    // Total number of pages in the PDF
    totalPages: integer("total_pages").notNull().default(0),

    // Last successfully processed page (for resume support)
    currentPage: integer("current_page").notNull().default(0),

    // Running count of questions extracted so far
    extractedQuestions: integer("extracted_questions").notNull().default(0),

    // ETA in seconds (recalculated on each chunk completion)
    estimatedRemainingSeconds: integer("estimated_remaining_seconds"),

    // JSON array of failed page numbers: e.g., [5, 12, 47]
    // Failed pages are retried on resume but do NOT stop the job
    failedPagesJson: text("failed_pages_json").notNull().default("[]"),

    // Current job status
    status: text("status", {
      enum: ["queued", "processing", "completed", "failed", "paused"],
    })
      .notNull()
      .default("queued"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("import_jobs_file_hash_unique").on(table.fileHash),
    index("import_jobs_source_id_idx").on(table.sourceId),
    index("import_jobs_status_idx").on(table.status),
  ]
);

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM 1: QUESTION BANK & STAGING PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * topics — Master topic registry.
 * Slugs are URL-safe identifiers (kebab-case).
 * Cached counters (total_questions, total_notes, etc.) are updated by triggers.
 * topic_status drives lazy AI generation in the /topics/[slug] route.
 */
export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // URL-safe unique identifier derived from name (e.g., "mughal-empire")
    slug: text("slug").notNull(),

    // Display name (e.g., "Mughal Empire")
    name: text("name").notNull(),

    // Enforced category from VALID_CATEGORIES
    category: text("category").notNull(),

    // Drives lazy generation in /topics/[slug]
    topicStatus: text("topic_status", {
      enum: ["not_generated", "generated", "needs_refresh"],
    })
      .notNull()
      .default("not_generated"),

    // Denormalized counters — updated via DB triggers for instant dashboard metrics
    totalQuestions: integer("total_questions").notNull().default(0),
    totalNotes: integer("total_notes").notNull().default(0),
    totalFacts: integer("total_facts").notNull().default(0),
    totalViews: integer("total_views").notNull().default(0),

    // Timestamp of last AI note generation
    lastGeneratedAt: text("last_generated_at"),

    // Soft delete — questions/notes remain but topic is hidden
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("topics_slug_unique").on(table.slug),
    index("topics_category_idx").on(table.category),
    index("topics_status_idx").on(table.topicStatus),
    index("topics_is_deleted_idx").on(table.isDeleted),
  ]
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;

/**
 * topic_aliases — Alternative names that map to a canonical topic.
 * Used during question ingestion to resolve "Mughal Period" → "Mughal Empire".
 */
export const topicAliases = sqliteTable(
  "topic_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // FK to canonical topic (CASCADE DELETE when topic is hard-deleted)
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),

    // The alias string (normalized before insert)
    alias: text("alias").notNull(),
  },
  (table) => [
    index("topic_aliases_topic_id_idx").on(table.topicId),
    uniqueIndex("topic_aliases_topic_alias_unique").on(
      table.topicId,
      table.alias
    ),
  ]
);

export type TopicAlias = typeof topicAliases.$inferSelect;
export type NewTopicAlias = typeof topicAliases.$inferInsert;

/**
 * staged_questions — AI-extracted questions awaiting human review.
 * Questions live here until approved/rejected in the /review UI.
 * ONLY approved questions are moved to the `questions` table.
 */
export const stagedQuestions = sqliteTable(
  "staged_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // FK to the import job that extracted this question
    importJobId: integer("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),

    // Raw extracted question text
    question: text("question").notNull(),

    // Options stored as JSON: {"A": "...", "B": "...", "C": "...", "D": "..."}
    options: text("options").notNull(),

    // Correct answer letter: "A", "B", "C", or "D"
    answer: text("answer").notNull(),

    // Brief explanation from AI
    explanation: text("explanation"),

    // Difficulty as extracted by AI (may be overridden during review)
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),

    // Raw topic name as extracted by AI (normalized before staging)
    topic: text("topic").notNull(),

    // Category as extracted by AI (validated against VALID_CATEGORIES)
    category: text("category").notNull(),

    // Review status
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),

    // Optional reviewer notes
    reviewNote: text("review_note"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("staged_questions_import_job_id_idx").on(table.importJobId),
    index("staged_questions_status_idx").on(table.status),
    index("staged_questions_category_idx").on(table.category),
  ]
);

export type StagedQuestion = typeof stagedQuestions.$inferSelect;
export type NewStagedQuestion = typeof stagedQuestions.$inferInsert;

/**
 * questions — The canonical, approved question bank.
 * question_hash (SHA-256 of normalized question text) prevents exact duplicates.
 * Denormalized for query performance — no JOINs required for MCQ display.
 */
export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // SHA-256 hash of normalized question text (prevents exact duplicates)
    questionHash: text("question_hash").notNull(),

    // FK to canonical topic
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),

    // FK to source PDF/paper
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),

    // Denormalized category for fast filtering without JOIN
    category: text("category").notNull(),

    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),

    // The question text (normalized)
    question: text("question").notNull(),

    // Individual option columns for clarity and direct rendering
    optionA: text("option_a").notNull(),
    optionB: text("option_b").notNull(),
    optionC: text("option_c").notNull(),
    optionD: text("option_d").notNull(),

    // Correct answer: "A", "B", "C", or "D"
    correctOption: text("correct_option", { enum: ["A", "B", "C", "D"] })
      .notNull(),

    // AI-generated explanation (1–2 sentences)
    shortExplanation: text("short_explanation"),

    // Source type tag (e.g., "previous_year", "mock_test", "practice_set")
    sourceType: text("source_type"),

    // Page number in the source PDF
    pageNumber: integer("page_number"),

    // Engagement metrics (updated by services, never by triggers)
    timesViewed: integer("times_viewed").notNull().default(0),
    timesRevised: integer("times_revised").notNull().default(0),
    lastViewedAt: text("last_viewed_at"),

    // Soft delete
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("questions_hash_unique").on(table.questionHash),
    index("questions_topic_id_idx").on(table.topicId),
    index("questions_source_id_idx").on(table.sourceId),
    index("questions_category_idx").on(table.category),
    index("questions_difficulty_idx").on(table.difficulty),
    index("questions_is_deleted_idx").on(table.isDeleted),
  ]
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

/**
 * question_bookmarks — User-saved questions for later review.
 */
export const questionBookmarks = sqliteTable(
  "question_bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("question_bookmarks_question_id_unique").on(table.questionId),
    index("question_bookmarks_created_at_idx").on(table.createdAt),
  ]
);

export type QuestionBookmark = typeof questionBookmarks.$inferSelect;
export type NewQuestionBookmark = typeof questionBookmarks.$inferInsert;

/**
 * question_flags — User-reported issues with specific questions.
 */
export const questionFlags = sqliteTable(
  "question_flags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),

    // Reason for flagging (e.g., "Wrong answer", "Outdated", "Duplicate")
    reason: text("reason").notNull(),

    // Optional detailed note from the user
    details: text("details"),

    // Resolution status
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("question_flags_question_id_idx").on(table.questionId),
    index("question_flags_resolved_idx").on(table.resolved),
  ]
);

export type QuestionFlag = typeof questionFlags.$inferSelect;
export type NewQuestionFlag = typeof questionFlags.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM 2: REVISION KNOWLEDGE BASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * notes — AI-generated revision notes per topic.
 * One note per topic (UNIQUE on topic_id).
 * Full markdown content stored in `content`.
 * Raw AI JSON response preserved in `raw_ai_response` for debugging/refresh.
 */
export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // One-to-one with topics (UNIQUE FK)
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),

    // The rendered markdown revision content
    content: text("content").notNull(),

    // Preserved raw AI JSON (for refresh/debugging)
    rawAiResponse: text("raw_ai_response"),

    // What triggered generation
    generatedFrom: text("generated_from", {
      enum: ["question_bank", "manual", "refresh"],
    })
      .notNull()
      .default("question_bank"),

    // Engagement metrics
    viewCount: integer("view_count").notNull().default(0),
    revisionCount: integer("revision_count").notNull().default(0),
    lastStudiedAt: text("last_studied_at"),

    // AI generation metadata
    aiGeneratedAt: text("ai_generated_at"),
    aiModel: text("ai_model"),

    // Soft delete
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("notes_topic_id_unique").on(table.topicId),
    index("notes_generated_from_idx").on(table.generatedFrom),
    index("notes_is_deleted_idx").on(table.isDeleted),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

/**
 * notes_versions — Immutable history of note content before each overwrite.
 * Created automatically when a note is refreshed.
 */
export const notesVersions = sqliteTable(
  "notes_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),

    // Snapshot of the note content at time of version creation
    content: text("content").notNull(),

    // Version label for display (e.g., "v2", "v3")
    versionLabel: text("version_label").notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("notes_versions_note_id_idx").on(table.noteId),
  ]
);

export type NoteVersion = typeof notesVersions.$inferSelect;
export type NewNoteVersion = typeof notesVersions.$inferInsert;

/**
 * note_keywords — Searchable keywords extracted from AI-generated notes.
 * Used to power the FTS5 search index suggestions.
 */
export const noteKeywords = sqliteTable(
  "note_keywords",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),

    keyword: text("keyword").notNull(),
  },
  (table) => [
    index("note_keywords_note_id_idx").on(table.noteId),
    uniqueIndex("note_keywords_note_keyword_unique").on(
      table.noteId,
      table.keyword
    ),
  ]
);

export type NoteKeyword = typeof noteKeywords.$inferSelect;
export type NewNoteKeyword = typeof noteKeywords.$inferInsert;

/**
 * note_facts — Atomic bullet-point facts extracted from AI notes.
 * Used for the daily revision / offline facts feature.
 */
export const noteFacts = sqliteTable(
  "note_facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),

    // Single atomic fact (shown in daily revision cards)
    fact: text("fact").notNull(),

    // Display order within the note
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("note_facts_note_id_idx").on(table.noteId),
    uniqueIndex("note_facts_note_fact_unique").on(table.noteId, table.fact),
  ]
);

export type NoteFact = typeof noteFacts.$inferSelect;
export type NewNoteFact = typeof noteFacts.$inferInsert;

/**
 * revision_sessions — Tracks each time a user starts a topic revision.
 * Powers the streak/history display on the dashboard.
 */
export const revisionSessions = sqliteTable(
  "revision_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),

    startedAt: text("started_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    completedAt: text("completed_at"),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("revision_sessions_topic_id_idx").on(table.topicId),
    index("revision_sessions_started_at_idx").on(table.startedAt),
  ]
);

export type RevisionSession = typeof revisionSessions.$inferSelect;
export type NewRevisionSession = typeof revisionSessions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// DRIZZLE RELATIONS (for relational query API)
// ─────────────────────────────────────────────────────────────────────────────

import { relations } from "drizzle-orm";

export const sourcesRelations = relations(sources, ({ many }) => ({
  importJobs: many(importJobs),
  questions: many(questions),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  source: one(sources, {
    fields: [importJobs.sourceId],
    references: [sources.id],
  }),
  stagedQuestions: many(stagedQuestions),
}));

export const topicsRelations = relations(topics, ({ many, one }) => ({
  aliases: many(topicAliases),
  questions: many(questions),
  note: one(notes, {
    fields: [topics.id],
    references: [notes.topicId],
  }),
  revisionSessions: many(revisionSessions),
}));

export const topicAliasesRelations = relations(topicAliases, ({ one }) => ({
  topic: one(topics, {
    fields: [topicAliases.topicId],
    references: [topics.id],
  }),
}));

export const stagedQuestionsRelations = relations(
  stagedQuestions,
  ({ one }) => ({
    importJob: one(importJobs, {
      fields: [stagedQuestions.importJobId],
      references: [importJobs.id],
    }),
  })
);

export const questionsRelations = relations(questions, ({ one, many }) => ({
  topic: one(topics, {
    fields: [questions.topicId],
    references: [topics.id],
  }),
  source: one(sources, {
    fields: [questions.sourceId],
    references: [sources.id],
  }),
  bookmark: one(questionBookmarks, {
    fields: [questions.id],
    references: [questionBookmarks.questionId],
  }),
  flags: many(questionFlags),
}));

export const questionBookmarksRelations = relations(
  questionBookmarks,
  ({ one }) => ({
    question: one(questions, {
      fields: [questionBookmarks.questionId],
      references: [questions.id],
    }),
  })
);

export const questionFlagsRelations = relations(questionFlags, ({ one }) => ({
  question: one(questions, {
    fields: [questionFlags.questionId],
    references: [questions.id],
  }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  topic: one(topics, {
    fields: [notes.topicId],
    references: [topics.id],
  }),
  versions: many(notesVersions),
  keywords: many(noteKeywords),
  facts: many(noteFacts),
}));

export const notesVersionsRelations = relations(notesVersions, ({ one }) => ({
  note: one(notes, {
    fields: [notesVersions.noteId],
    references: [notes.id],
  }),
}));

export const noteKeywordsRelations = relations(noteKeywords, ({ one }) => ({
  note: one(notes, {
    fields: [noteKeywords.noteId],
    references: [notes.id],
  }),
}));

export const noteFactsRelations = relations(noteFacts, ({ one }) => ({
  note: one(notes, {
    fields: [noteFacts.noteId],
    references: [notes.id],
  }),
}));

export const revisionSessionsRelations = relations(
  revisionSessions,
  ({ one }) => ({
    topic: one(topics, {
      fields: [revisionSessions.topicId],
      references: [topics.id],
    }),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// TYPE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Branded type for a normalized topic slug.
 * Prevents raw strings from being accidentally used as slugs.
 */
export type TopicSlug = string & { readonly __brand: "TopicSlug" };

/**
 * Full question with topic name joined (for display).
 */
export type QuestionWithTopic = Question & {
  topicName: string;
  topicSlug: string;
  sourceName: string;
  isBookmarked: boolean;
};

/**
 * Topic with note status for the dashboard.
 */
export type TopicWithNoteStatus = Topic & {
  hasNote: boolean;
  noteId: number | null;
};
