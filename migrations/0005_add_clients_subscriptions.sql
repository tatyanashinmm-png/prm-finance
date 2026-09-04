CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`inn` text,
	`manager` text,
	`status` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clients_name_key_idx` ON `clients` (`name_key`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`contract_num` text NOT NULL,
	`legal_entity` text,
	`status` text,
	`manager` text,
	`started_at` text,
	`ended_at` text,
	`billing_cycle` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_contract_num_unique` ON `subscriptions` (`contract_num`);--> statement-breakpoint
CREATE INDEX `subscriptions_client_id_idx` ON `subscriptions` (`client_id`);