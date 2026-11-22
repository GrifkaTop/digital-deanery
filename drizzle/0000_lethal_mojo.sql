CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_login_unique" UNIQUE("login"),
	CONSTRAINT "login_normalized" CHECK ("accounts"."login" = lower(btrim("accounts"."login")) AND length("accounts"."login") > 0)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"faculty" text NOT NULL,
	"program" text NOT NULL,
	"course" smallint NOT NULL,
	CONSTRAINT "groups_code_unique" UNIQUE("code"),
	CONSTRAINT "course_range" CHECK ("groups"."course" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	CONSTRAINT "students_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;