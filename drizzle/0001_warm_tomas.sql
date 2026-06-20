PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_hash` text NOT NULL,
	`topic_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`category` text DEFAULT 'Miscellaneous' NOT NULL,
	`exam_name` text,
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
INSERT INTO `__new_questions`("id", "question_hash", "topic_id", "source_id", "category", "exam_name", "difficulty", "question", "option_a", "option_b", "option_c", "option_d", "correct_option", "short_explanation", "source_type", "page_number", "times_viewed", "times_revised", "last_viewed_at", "is_deleted", "created_at", "updated_at") SELECT "id", "question_hash", "topic_id", "source_id", "category", "exam_name", "difficulty", "question", "option_a", "option_b", "option_c", "option_d", "correct_option", "short_explanation", "source_type", "page_number", "times_viewed", "times_revised", "last_viewed_at", "is_deleted", "created_at", "updated_at" FROM `questions`;--> statement-breakpoint
DROP TABLE `questions`;--> statement-breakpoint
ALTER TABLE `__new_questions` RENAME TO `questions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `questions_hash_unique` ON `questions` (`question_hash`);--> statement-breakpoint
CREATE INDEX `questions_topic_id_idx` ON `questions` (`topic_id`);--> statement-breakpoint
CREATE INDEX `questions_source_id_idx` ON `questions` (`source_id`);--> statement-breakpoint
CREATE INDEX `questions_category_idx` ON `questions` (`category`);--> statement-breakpoint
CREATE INDEX `questions_difficulty_idx` ON `questions` (`difficulty`);--> statement-breakpoint
CREATE INDEX `questions_is_deleted_idx` ON `questions` (`is_deleted`);