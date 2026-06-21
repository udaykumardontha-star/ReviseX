UPDATE `topics` SET `category` = 'Geography' WHERE `category` = 'Environment';--> statement-breakpoint
UPDATE `topics` SET `category` = 'Static G.K.' WHERE `category` = 'Art & Culture';--> statement-breakpoint
UPDATE `staged_questions` SET `category` = 'Geography' WHERE `category` = 'Environment';--> statement-breakpoint
UPDATE `staged_questions` SET `category` = 'Static G.K.' WHERE `category` = 'Art & Culture';--> statement-breakpoint
UPDATE `questions` SET `category` = 'Geography' WHERE `category` = 'Environment';--> statement-breakpoint
UPDATE `questions` SET `category` = 'Static G.K.' WHERE `category` = 'Art & Culture';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Dance' WHERE lower(`name`) LIKE '%dance%' AND `category` = 'Static G.K.';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Arts Personality' WHERE lower(`name`) LIKE '%person%' AND `category` = 'Static G.K.';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Festivals' WHERE lower(`name`) LIKE '%festival%' AND `category` = 'Static G.K.';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Sports' WHERE lower(`name`) LIKE '%sport%' AND `category` = 'Static G.K.';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Books and Authors' WHERE lower(`name`) LIKE '%book%' AND `category` = 'Static G.K.';
