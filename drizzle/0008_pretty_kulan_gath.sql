CREATE TABLE "extracurricular_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "extracurricular_title" CHECK (length(btrim("extracurricular_events"."title")) > 0),
	CONSTRAINT "extracurricular_dates" CHECK ("extracurricular_events"."starts_on" <= "extracurricular_events"."ends_on")
);
--> statement-breakpoint
CREATE INDEX "extracurricular_dates_idx" ON "extracurricular_events" USING btree ("starts_on","ends_on");