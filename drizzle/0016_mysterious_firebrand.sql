CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "discipline_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "discipline_modules_discipline_id_position_unique" UNIQUE("discipline_id","position"),
	CONSTRAINT "discipline_modules_id_discipline_id_unique" UNIQUE("id","discipline_id"),
	CONSTRAINT "module_position" CHECK ("discipline_modules"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_audiences" (
	"event_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "event_audiences_event_id_group_id_pk" PRIMARY KEY("event_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_attendance" (
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_attendance_student_id_lesson_id_pk" PRIMARY KEY("student_id","lesson_id"),
	CONSTRAINT "attendance_status" CHECK ("lesson_attendance"."status" IN ('present','distinction','absent'))
);
--> statement-breakpoint
CREATE TABLE "news_audiences" (
	"news_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "news_audiences_news_id_group_id_pk" PRIMARY KEY("news_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "news_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"author" text NOT NULL,
	"event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "study_score_breakdowns" (
	"plan_item_id" uuid PRIMARY KEY NOT NULL,
	"semester_score" numeric,
	"semester_max" numeric NOT NULL,
	"exam_score" numeric,
	"exam_max" numeric,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "breakdown_scores" CHECK ("study_score_breakdowns"."semester_max" >= 0 AND ("study_score_breakdowns"."semester_score" IS NULL OR "study_score_breakdowns"."semester_score" BETWEEN 0 AND "study_score_breakdowns"."semester_max") AND ("study_score_breakdowns"."exam_max" IS NULL OR "study_score_breakdowns"."exam_max" >= 0) AND ("study_score_breakdowns"."exam_score" IS NULL OR ("study_score_breakdowns"."exam_max" IS NOT NULL AND "study_score_breakdowns"."exam_score" BETWEEN 0 AND "study_score_breakdowns"."exam_max")))
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "kind" text DEFAULT 'Событие' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "place" text DEFAULT 'Уточняется' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "body" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "participation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "cover" jsonb;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "status" "publication_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "health_passports" ADD COLUMN "medical_group" text;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD COLUMN "target_attendance" integer;--> statement-breakpoint
ALTER TABLE "sports_sessions" ADD COLUMN "teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "discipline_modules" ADD CONSTRAINT "discipline_modules_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audiences" ADD CONSTRAINT "event_audiences_event_id_extracurricular_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."extracurricular_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audiences" ADD CONSTRAINT "event_audiences_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_audiences" ADD CONSTRAINT "news_audiences_news_id_news_posts_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_audiences" ADD CONSTRAINT "news_audiences_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_event_id_extracurricular_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."extracurricular_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_score_breakdowns" ADD CONSTRAINT "study_score_breakdowns_plan_item_id_study_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."study_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_module_id_discipline_id_discipline_modules_id_discipline_id_fk" FOREIGN KEY ("module_id","discipline_id") REFERENCES "public"."discipline_modules"("id","discipline_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_sessions" ADD CONSTRAINT "sports_sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_events" ADD CONSTRAINT "event_times" CHECK (("extracurricular_events"."starts_at" IS NULL AND "extracurricular_events"."ends_at" IS NULL) OR ("extracurricular_events"."starts_at" IS NOT NULL AND "extracurricular_events"."ends_at" IS NOT NULL AND "extracurricular_events"."starts_at" < "extracurricular_events"."ends_at"));--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD CONSTRAINT "sports_target" CHECK ("sports_semester_results"."target_attendance" >= 0);