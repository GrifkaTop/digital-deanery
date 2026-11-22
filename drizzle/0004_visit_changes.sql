ALTER TABLE "accounts" ADD COLUMN "changes_initialized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_states" ADD COLUMN "change_seen_at" timestamp with time zone;