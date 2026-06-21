ALTER TABLE `staged_questions` ADD `chapter` text DEFAULT 'Miscellaneous' NOT NULL;--> statement-breakpoint
ALTER TABLE `staged_questions` ADD `exam_name` text;--> statement-breakpoint
ALTER TABLE `topics` ADD `chapter` text DEFAULT 'Miscellaneous' NOT NULL;