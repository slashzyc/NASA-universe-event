CREATE TABLE `lm_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`parameters_json` text NOT NULL,
	`record_key` text,
	`record_sha256` text,
	`error_json` text,
	FOREIGN KEY (`owner_hash`) REFERENCES `lm_visitors`(`token_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lm_analyses_owner` ON `lm_analyses` (`owner_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `lm_datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`metadata_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lm_request_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lm_regions` (
	`id` text PRIMARY KEY NOT NULL,
	`metadata_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lm_releases` (
	`build_id` text PRIMARY KEY NOT NULL,
	`algorithm_sha256` text NOT NULL,
	`manifest_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lm_shares` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `lm_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`analysis_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_hash`) REFERENCES `lm_visitors`(`token_hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`analysis_id`) REFERENCES `lm_analyses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lm_tasks_owner` ON `lm_tasks` (`owner_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `lm_visitors` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
