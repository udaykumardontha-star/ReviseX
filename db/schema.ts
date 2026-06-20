/**
 * db/schema.ts
 *
 * Complete Drizzle ORM schema for ReviseX.
 * Uses drizzle-orm 0.36.x object-style extraConfig syntax.
 *
 * FTS5 virtual tables are NOT modeled here — they live in:
 *   db/migrations/fts5_tables.sql  (virtual table definitions)
 *   db/migrations/fts5_triggers.sql (sync triggers)
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";

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
export type ValidDifficulty = "easy" | "medium" | "hard";

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

export const systemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  databaseVersion: text("database_version").notNull().default("v1"),
  maxAiCallsPerDay: integer("max_ai_calls_per_day").notNull().default(50),
  maxQuestionsPerChunk: integer("max_questions_per_chunk").notNull().default(30),
  pdfChunkSize: integer("pdf_chunk_size").notNull().default(10),
  aiCallsTodayCount: integer("ai_calls_today_count").notNull().default(0),
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

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    totalQuestions: integer("total_questions").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    nameUnique: uniqueIndex("sources_name_unique").on(table.name),
  })
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT JOBS
// ─────────────────────────────────────────────────────────────────────────────

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: text("file_hash").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    totalPages: integer("total_pages").notNull().default(0),
    currentPage: integer("current_page").notNull().default(0),
    extractedQuestions: integer("extracted_questions").notNull().default(0),
    estimatedRemainingSeconds: integer("estimated_remaining_seconds"),
    failedPagesJson: text("failed_pages_json").notNull().default("[]"),
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
  (table) => ({
    fileHashUnique: uniqueIndex("import_jobs_file_hash_unique").on(table.fileHash),
    sourceIdIdx: index("import_jobs_source_id_idx").on(table.sourceId),
    statusIdx: index("import_jobs_status_idx").on(table.status),
  })
);

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// TOPICS
// ─────────────────────────────────────────────────────────────────────────────

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    topicStatus: text("topic_status", {
      enum: ["not_generated", "generated", "needs_refresh"],
    })
      .notNull()
      .default("not_generated"),
    totalQuestions: integer("total_questions").notNull().default(0),
    totalNotes: integer("total_notes").notNull().default(0),
    totalFacts: integer("total_facts").notNull().default(0),
    totalViews: integer("total_views").notNull().default(0),
    lastGeneratedAt: text("last_generated_at"),
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
  (table) => ({
    slugUnique: uniqueIndex("topics_slug_unique").on(table.slug),
    categoryIdx: index("topics_category_idx").on(table.category),
    statusIdx: index("topics_status_idx").on(table.topicStatus),
    isDeletedIdx: index("topics_is_deleted_idx").on(table.isDeleted),
  })
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC ALIASES
// ─────────────────────────────────────────────────────────────────────────────

export const topicAliases = sqliteTable(
  "topic_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (table) => ({
    topicIdIdx: index("topic_aliases_topic_id_idx").on(table.topicId),
    topicAliasUnique: uniqueIndex("topic_aliases_topic_alias_unique").on(
      table.topicId,
      table.alias
    ),
  })
);

export type TopicAlias = typeof topicAliases.$inferSelect;
export type NewTopicAlias = typeof topicAliases.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// STAGED QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const stagedQuestions = sqliteTable(
  "staged_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    importJobId: integer("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: text("options").notNull(),
    answer: text("answer").notNull(),
    explanation: text("explanation"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),
    topic: text("topic").notNull(),
    category: text("category").notNull(),
    examName: text("exam_name"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    reviewNote: text("review_note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    importJobIdIdx: index("staged_questions_import_job_id_idx").on(table.importJobId),
    statusIdx: index("staged_questions_status_idx").on(table.status),
    categoryIdx: index("staged_questions_category_idx").on(table.category),
  })
);

export type StagedQuestion = typeof stagedQuestions.$inferSelect;
export type NewStagedQuestion = typeof stagedQuestions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questionHash: text("question_hash").notNull(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    category: text("category").$type<ValidCategory>().notNull().default("Miscellaneous"),
    examName: text("exam_name"),
    difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull().default("medium"),
    question: text("question").notNull(),
    optionA: text("option_a").notNull(),
    optionB: text("option_b").notNull(),
    optionC: text("option_c").notNull(),
    optionD: text("option_d").notNull(),
    correctOption: text("correct_option", { enum: ["A", "B", "C", "D"] }).notNull(),
    shortExplanation: text("short_explanation"),
    sourceType: text("source_type"),
    pageNumber: integer("page_number"),
    timesViewed: integer("times_viewed").notNull().default(0),
    timesRevised: integer("times_revised").notNull().default(0),
    lastViewedAt: text("last_viewed_at"),
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
  (table) => ({
    hashUnique: uniqueIndex("questions_hash_unique").on(table.questionHash),
    topicIdIdx: index("questions_topic_id_idx").on(table.topicId),
    sourceIdIdx: index("questions_source_id_idx").on(table.sourceId),
    categoryIdx: index("questions_category_idx").on(table.category),
    difficultyIdx: index("questions_difficulty_idx").on(table.difficulty),
    isDeletedIdx: index("questions_is_deleted_idx").on(table.isDeleted),
  })
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION BOOKMARKS
// ─────────────────────────────────────────────────────────────────────────────

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
  (table) => ({
    questionIdUnique: uniqueIndex("question_bookmarks_question_id_unique").on(table.questionId),
    createdAtIdx: index("question_bookmarks_created_at_idx").on(table.createdAt),
  })
);

export type QuestionBookmark = typeof questionBookmarks.$inferSelect;
export type NewQuestionBookmark = typeof questionBookmarks.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION FLAGS
// ─────────────────────────────────────────────────────────────────────────────

export const questionFlags = sqliteTable(
  "question_flags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    questionIdIdx: index("question_flags_question_id_idx").on(table.questionId),
    resolvedIdx: index("question_flags_resolved_idx").on(table.resolved),
  })
);

export type QuestionFlag = typeof questionFlags.$inferSelect;
export type NewQuestionFlag = typeof questionFlags.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// NOTES
// ─────────────────────────────────────────────────────────────────────────────

export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    rawAiResponse: text("raw_ai_response"),
    generatedFrom: text("generated_from", {
      enum: ["question_bank", "manual", "refresh"],
    })
      .notNull()
      .default("question_bank"),
    viewCount: integer("view_count").notNull().default(0),
    revisionCount: integer("revision_count").notNull().default(0),
    lastStudiedAt: text("last_studied_at"),
    aiGeneratedAt: text("ai_generated_at"),
    aiModel: text("ai_model"),
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
  (table) => ({
    topicIdUnique: uniqueIndex("notes_topic_id_unique").on(table.topicId),
    generatedFromIdx: index("notes_generated_from_idx").on(table.generatedFrom),
    isDeletedIdx: index("notes_is_deleted_idx").on(table.isDeleted),
  })
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// NOTES VERSIONS
// ─────────────────────────────────────────────────────────────────────────────

export const notesVersions = sqliteTable(
  "notes_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    versionLabel: text("version_label").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    noteIdIdx: index("notes_versions_note_id_idx").on(table.noteId),
  })
);

export type NoteVersion = typeof notesVersions.$inferSelect;
export type NewNoteVersion = typeof notesVersions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// NOTE KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

export const noteKeywords = sqliteTable(
  "note_keywords",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
  },
  (table) => ({
    noteIdIdx: index("note_keywords_note_id_idx").on(table.noteId),
    noteKeywordUnique: uniqueIndex("note_keywords_note_keyword_unique").on(
      table.noteId,
      table.keyword
    ),
  })
);

export type NoteKeyword = typeof noteKeywords.$inferSelect;
export type NewNoteKeyword = typeof noteKeywords.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// NOTE FACTS
// ─────────────────────────────────────────────────────────────────────────────

export const noteFacts = sqliteTable(
  "note_facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    fact: text("fact").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    noteIdIdx: index("note_facts_note_id_idx").on(table.noteId),
    noteFactUnique: uniqueIndex("note_facts_note_fact_unique").on(
      table.noteId,
      table.fact
    ),
  })
);

export type NoteFact = typeof noteFacts.$inferSelect;
export type NewNoteFact = typeof noteFacts.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// REVISION SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

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
  (table) => ({
    topicIdIdx: index("revision_sessions_topic_id_idx").on(table.topicId),
    startedAtIdx: index("revision_sessions_started_at_idx").on(table.startedAt),
  })
);

export type RevisionSession = typeof revisionSessions.$inferSelect;
export type NewRevisionSession = typeof revisionSessions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

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

export const stagedQuestionsRelations = relations(stagedQuestions, ({ one }) => ({
  importJob: one(importJobs, {
    fields: [stagedQuestions.importJobId],
    references: [importJobs.id],
  }),
}));

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

export const questionBookmarksRelations = relations(questionBookmarks, ({ one }) => ({
  question: one(questions, {
    fields: [questionBookmarks.questionId],
    references: [questions.id],
  }),
}));

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

export const revisionSessionsRelations = relations(revisionSessions, ({ one }) => ({
  topic: one(topics, {
    fields: [revisionSessions.topicId],
    references: [topics.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// TYPE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export type TopicSlug = string & { readonly __brand: "TopicSlug" };

export type QuestionWithTopic = Question & {
  topicName: string;
  topicSlug: string;
  sourceName: string;
  isBookmarked: boolean;
};

export type TopicWithNoteStatus = Topic & {
  hasNote: boolean;
  noteId: number | null;
};
