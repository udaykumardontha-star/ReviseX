-- =============================================================================
-- db/migrations/fts5_triggers.sql
--
-- FTS5 Synchronization Triggers for ReviseX
-- Run this AFTER fts5_tables.sql
--
-- Pattern: content-table FTS requires 3 triggers per table:
--   AFTER INSERT  → insert into FTS index
--   AFTER DELETE  → remove from FTS index (via special delete sentinel)
--   AFTER UPDATE  → remove old entry, insert new entry
--
-- The special FTS delete syntax uses a negative rowid sentinel:
--   INSERT INTO fts_table(fts_table, rowid, ...) VALUES('delete', old.id, ...)
-- =============================================================================

-- =============================================================================
-- SECTION 1: questions_fts triggers
-- =============================================================================

-- Joins questions with topics to denormalize topic_name into FTS index.
-- This avoids JOIN overhead at search time.

CREATE TRIGGER IF NOT EXISTS questions_fts_after_insert
AFTER INSERT ON questions
BEGIN
    INSERT INTO questions_fts (
        rowid,
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        short_explanation,
        category,
        topic_name
    )
    SELECT
        NEW.id,
        NEW.question,
        NEW.option_a,
        NEW.option_b,
        NEW.option_c,
        NEW.option_d,
        COALESCE(NEW.short_explanation, ''),
        NEW.category,
        COALESCE((SELECT name FROM topics WHERE id = NEW.topic_id), '')
    WHERE NEW.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS questions_fts_after_delete
AFTER DELETE ON questions
BEGIN
    DELETE FROM questions_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS questions_fts_after_update
AFTER UPDATE ON questions
BEGIN
    DELETE FROM questions_fts WHERE rowid = OLD.id;

    INSERT INTO questions_fts (
        rowid,
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        short_explanation,
        category,
        topic_name
    )
    SELECT
        NEW.id,
        NEW.question,
        NEW.option_a,
        NEW.option_b,
        NEW.option_c,
        NEW.option_d,
        COALESCE(NEW.short_explanation, ''),
        NEW.category,
        COALESCE((SELECT name FROM topics WHERE id = NEW.topic_id), '')
    WHERE NEW.is_deleted = 0;
END;

-- =============================================================================
-- SECTION 2: topics_fts triggers
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS topics_fts_after_insert
AFTER INSERT ON topics
BEGIN
    INSERT INTO topics_fts (rowid, slug, name, category)
    SELECT NEW.id, NEW.slug, NEW.name, NEW.category
    WHERE NEW.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS topics_fts_after_delete
AFTER DELETE ON topics
BEGIN
    DELETE FROM topics_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS topics_fts_after_update
AFTER UPDATE ON topics
BEGIN
    DELETE FROM topics_fts WHERE rowid = OLD.id;

    INSERT INTO topics_fts (rowid, slug, name, category)
    SELECT NEW.id, NEW.slug, NEW.name, NEW.category
    WHERE NEW.is_deleted = 0;
END;

-- =============================================================================
-- SECTION 3: notes_fts triggers
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert
AFTER INSERT ON notes
BEGIN
    INSERT INTO notes_fts (rowid, content)
    SELECT NEW.id, NEW.content
    WHERE NEW.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete
AFTER DELETE ON notes
BEGIN
    DELETE FROM notes_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_update
AFTER UPDATE ON notes
BEGIN
    DELETE FROM notes_fts WHERE rowid = OLD.id;

    INSERT INTO notes_fts (rowid, content)
    SELECT NEW.id, NEW.content
    WHERE NEW.is_deleted = 0;
END;

-- =============================================================================
-- SECTION 4: note_keywords_fts triggers
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS note_keywords_fts_after_insert
AFTER INSERT ON note_keywords
BEGIN
    INSERT INTO note_keywords_fts (rowid, keyword)
    VALUES (NEW.id, NEW.keyword);
END;

CREATE TRIGGER IF NOT EXISTS note_keywords_fts_after_delete
AFTER DELETE ON note_keywords
BEGIN
    INSERT INTO note_keywords_fts (note_keywords_fts, rowid, keyword)
    VALUES ('delete', OLD.id, OLD.keyword);
END;

CREATE TRIGGER IF NOT EXISTS note_keywords_fts_after_update
AFTER UPDATE ON note_keywords
BEGIN
    INSERT INTO note_keywords_fts (note_keywords_fts, rowid, keyword)
    VALUES ('delete', OLD.id, OLD.keyword);

    INSERT INTO note_keywords_fts (rowid, keyword)
    VALUES (NEW.id, NEW.keyword);
END;

-- =============================================================================
-- SECTION 5: Denormalized counter triggers on topics
-- =============================================================================
-- These triggers keep `topics.total_questions` in sync automatically.
-- The service layer updates total_notes and total_facts explicitly.

-- Increment total_questions when a non-deleted question is inserted
CREATE TRIGGER IF NOT EXISTS topics_increment_total_questions
AFTER INSERT ON questions
WHEN NEW.is_deleted = 0
BEGIN
    UPDATE topics
    SET
        total_questions = total_questions + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.topic_id;
END;

-- Decrement total_questions when a question is hard-deleted
CREATE TRIGGER IF NOT EXISTS topics_decrement_total_questions_on_delete
AFTER DELETE ON questions
WHEN OLD.is_deleted = 0
BEGIN
    UPDATE topics
    SET
        total_questions = MAX(0, total_questions - 1),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.topic_id;
END;

-- Handle soft-delete toggle on questions
CREATE TRIGGER IF NOT EXISTS topics_adjust_total_questions_on_soft_delete
AFTER UPDATE OF is_deleted ON questions
WHEN OLD.is_deleted != NEW.is_deleted
BEGIN
    UPDATE topics
    SET
        total_questions = MAX(0, total_questions + CASE
            WHEN NEW.is_deleted = 1 THEN -1  -- Soft-deleting: decrement
            ELSE 1                            -- Restoring: increment
        END),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.topic_id;
END;

-- =============================================================================
-- SECTION 6: sources.total_questions counter triggers
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS sources_increment_total_questions
AFTER INSERT ON questions
WHEN NEW.is_deleted = 0
BEGIN
    UPDATE sources
    SET
        total_questions = total_questions + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.source_id;
END;

CREATE TRIGGER IF NOT EXISTS sources_decrement_total_questions_on_delete
AFTER DELETE ON questions
WHEN OLD.is_deleted = 0
BEGIN
    UPDATE sources
    SET
        total_questions = MAX(0, total_questions - 1),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.source_id;
END;

CREATE TRIGGER IF NOT EXISTS sources_adjust_total_questions_on_soft_delete
AFTER UPDATE OF is_deleted ON questions
WHEN OLD.is_deleted != NEW.is_deleted
BEGIN
    UPDATE sources
    SET
        total_questions = MAX(0, total_questions + CASE
            WHEN NEW.is_deleted = 1 THEN -1
            ELSE 1
        END),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.source_id;
END;
