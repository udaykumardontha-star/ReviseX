UPDATE `topics` SET `chapter` = 'Indian Drainage System' WHERE `name` LIKE '%River%' AND `category` = 'Geography';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Physiographic Division of India' WHERE `name` LIKE '%Border%' AND `category` = 'Geography';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Transportation' WHERE `name` LIKE '%Port%' AND `category` = 'Geography';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Vardhana Dynasty' WHERE `name` LIKE '%Pushyabhuti%' AND `category` = 'History';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Vardhana Dynasty' WHERE `name` LIKE '%Harshavardhana%' AND `category` = 'History';--> statement-breakpoint
UPDATE `topics` SET `chapter` = 'Mughal Period' WHERE `name` LIKE '%Mughal%' AND (`category` = 'Static G.K.' OR `category` = 'History');--> statement-breakpoint
UPDATE `topics` SET `category` = 'History' WHERE `name` LIKE '%Mughal%' AND `category` = 'Static G.K.';
