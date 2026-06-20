-- =============================================================================
-- db/migrations/fts5_tables.sql
--
-- FTS5 Virtual Table Definitions for ReviseX
-- Run this AFTER the core Drizzle schema migration.
--
-- FTS5 cannot be modeled by Drizzle ORM directly — these are applied via the
-- custom migration script at: scripts/migrate.ts
--
-- Search indexes created:
--   1. questions_fts  — Full-text search over question text and options
--   2. topics_fts     — Full-text search over topic names and categories
--   3. notes_fts      — Full-text search over revision note content
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. questions_fts
--    Maps to the `questions` table (approved MCQs).
--    Indexed columns: question text, all four options, explanation.
--    `content` mode: keeps FTS in sync with the real table via triggers.
--    `tokenize`: porter algorithm gives stemming (studying → study → studied).
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
    question,
    option_a,
    option_b,
    option_c,
    option_d,
    short_explanation,
    category         UNINDEXED,
    topic_name       UNINDEXED,
    content          = 'questions',
    content_rowid    = 'id',
    tokenize         = "porter unicode61 remove_diacritics 2"
);

-- -----------------------------------------------------------------------------
-- 2. topics_fts
--    Maps to the `topics` table.
--    Indexed columns: slug, name, category.
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS topics_fts USING fts5(
    slug,
    name,
    category,
    content       = 'topics',
    content_rowid = 'id',
    tokenize      = "porter unicode61 remove_diacritics 2"
);

-- -----------------------------------------------------------------------------
-- 3. notes_fts
--    Maps to the `notes` table.
--    Indexed columns: full markdown content.
--    note_id stored as UNINDEXED for JOIN-less result resolution.
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    content,
    content       = 'notes',
    content_rowid = 'id',
    tokenize      = "porter unicode61 remove_diacritics 2"
);

-- -----------------------------------------------------------------------------
-- 4. note_keywords_fts
--    Enables fast keyword lookup for topic autocomplete in search UI.
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS note_keywords_fts USING fts5(
    keyword,
    content       = 'note_keywords',
    content_rowid = 'id',
    tokenize      = "porter unicode61 remove_diacritics 2"
);
