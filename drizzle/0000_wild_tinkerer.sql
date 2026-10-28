CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL,
	`source_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_source_key` ON `records` (`source_key`);