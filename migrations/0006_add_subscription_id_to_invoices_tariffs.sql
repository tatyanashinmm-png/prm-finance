ALTER TABLE `invoices` ADD `subscription_id` integer REFERENCES subscriptions(id);--> statement-breakpoint
ALTER TABLE `tariffs` ADD `subscription_id` integer REFERENCES subscriptions(id);