CREATE TABLE `contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_num` text NOT NULL,
	`client_name` text NOT NULL,
	`legal_entity` text,
	`status` text,
	`manager` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_contract_num_unique` ON `contracts` (`contract_num`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`period_id` integer NOT NULL,
	`invoice_amount` real NOT NULL,
	`invoice_number` text,
	`paid_status` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_contract_period_unique` ON `invoices` (`contract_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_start` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `periods_period_start_unique` ON `periods` (`period_start`);