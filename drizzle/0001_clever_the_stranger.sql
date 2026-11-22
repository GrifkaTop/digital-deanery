CREATE TYPE "public"."rate_scope" AS ENUM('ip', 'ip_login');--> statement-breakpoint
CREATE TABLE "login_rate_limits" (
	"scope" "rate_scope" NOT NULL,
	"bucket_hash" "bytea" NOT NULL,
	"window_start_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "login_rate_limits_scope_bucket_hash_window_start_at_pk" PRIMARY KEY("scope","bucket_hash","window_start_at"),
	CONSTRAINT "rate_count" CHECK ("login_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_expiry" CHECK ("sessions"."expires_at" > "sessions"."created_at"),
	CONSTRAINT "session_hash_length" CHECK (octet_length("sessions"."token_hash") = 32)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");