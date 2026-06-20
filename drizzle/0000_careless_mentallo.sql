CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_hash` text NOT NULL,
	`source_id` integer NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`current_page` integer DEFAULT 0 NOT NULL,
	`extracted_questions` integer DEFAULT 0 NOT NULL,
	`estimated_remaining_seconds` integer,
	`failed_pages_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_jobs_file_hash_unique` ON `import_jobs` (`file_hash`);--> statement-breakpoint
CREATE INDEX `import_jobs_source_id_idx` ON `import_jobs` (`source_id`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `note_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` integer NOT NULL,
	`fact` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_facts_note_id_idx` ON `note_facts` (`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_facts_note_fact_unique` ON `note_facts` (`note_id`,`fact`);--> statement-breakpoint
CREATE TABLE `note_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` integer NOT NULL,
	`keyword` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_keywords_note_id_idx` ON `note_keywords` (`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_keywords_note_keyword_unique` ON `note_keywords` (`note_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`content` text NOT NULL,
	`raw_ai_response` text,
	`generated_from` text DEFAULT 'question_bank' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`revision_count` integer DEFAULT 0 NOT NULL,
	`last_studied_at` text,
	`ai_generated_at` text,
	`ai_model` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_topic_id_unique` ON `notes` (`topic_id`);--> statement-breakpoint
CREATE INDEX `notes_generated_from_idx` ON `notes` (`generated_from`);--> statement-breakpoint
CREATE INDEX `notes_is_deleted_idx` ON `notes` (`is_deleted`);--> statement-breakpoint
CREATE TABLE `notes_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` integer NOT NULL,
	`content` text NOT NULL,
	`version_label` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_versions_note_id_idx` ON `notes_versions` (`note_id`);--> statement-breakpoint
CREATE TABLE `question_bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_bookmarks_question_id_unique` ON `question_bookmarks` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_bookmarks_created_at_idx` ON `question_bookmarks` (`created_at`);--> statement-breakpoint
CREATE TABLE `question_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_flags_question_id_idx` ON `question_flags` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_flags_resolved_idx` ON `question_flags` (`resolved`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_hash` text NOT NULL,
	`topic_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`category` text NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`question` text NOT NULL,
	`option_a` text NOT NULL,
	`option_b` text NOT NULL,
	`option_c` text NOT NULL,
	`option_d` text NOT NULL,
	`correct_option` text NOT NULL,
	`short_explanation` text,
	`source_type` text,
	`page_number` integer,
	`times_viewed` integer DEFAULT 0 NOT NULL,
	`times_revised` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_hash_unique` ON `questions` (`question_hash`);--> statement-breakpoint
CREATE INDEX `questions_topic_id_idx` ON `questions` (`topic_id`);--> statement-breakpoint
CREATE INDEX `questions_source_id_idx` ON `questions` (`source_id`);--> statement-breakpoint
CREATE INDEX `questions_category_idx` ON `questions` (`category`);--> statement-breakpoint
CREATE INDEX `questions_difficulty_idx` ON `questions` (`difficulty`);--> statement-breakpoint
CREATE INDEX `questions_is_deleted_idx` ON `questions` (`is_deleted`);--> statement-breakpoint
CREATE TABLE `revision_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `revision_sessions_topic_id_idx` ON `revision_sessions` (`topic_id`);--> statement-breakpoint
CREATE INDEX `revision_sessions_started_at_idx` ON `revision_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_name_unique` ON `sources` (`name`);--> statement-breakpoint
CREATE TABLE `staged_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_job_id` integer NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`answer` text NOT NULL,
	`explanation` text,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`topic` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `staged_questions_import_job_id_idx` ON `staged_questions` (`import_job_id`);--> statement-breakpoint
CREATE INDEX `staged_questions_status_idx` ON `staged_questions` (`status`);--> statement-breakpoint
CREATE INDEX `staged_questions_category_idx` ON `staged_questions` (`category`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`database_version` text DEFAULT 'v1' NOT NULL,
	`max_ai_calls_per_day` integer DEFAULT 50 NOT NULL,
	`max_questions_per_chunk` integer DEFAULT 30 NOT NULL,
	`pdf_chunk_size` integer DEFAULT 10 NOT NULL,
	`ai_calls_today_count` integer DEFAULT 0 NOT NULL,
	`ai_calls_reset_date` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `topic_aliases_topic_id_idx` ON `topic_aliases` (`topic_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `topic_aliases_topic_alias_unique` ON `topic_aliases` (`topic_id`,`alias`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`topic_status` text DEFAULT 'not_generated' NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`total_notes` integer DEFAULT 0 NOT NULL,
	`total_facts` integer DEFAULT 0 NOT NULL,
	`total_views` integer DEFAULT 0 NOT NULL,
	`last_generated_at` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_slug_unique` ON `topics` (`slug`);--> statement-breakpoint
CREATE INDEX `topics_category_idx` ON `topics` (`category`);--> statement-breakpoint
CREATE INDEX `topics_status_idx` ON `topics` (`topic_status`);--> statement-breakpoint
CREATE INDEX `topics_is_deleted_idx` ON `topics` (`is_deleted`);