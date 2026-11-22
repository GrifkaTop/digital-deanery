CREATE TYPE "public"."assessment" AS ENUM('exam', 'credit', 'graded_credit');--> statement-breakpoint
CREATE TYPE "public"."exam_kind" AS ENUM('exam', 'credit', 'retake');--> statement-breakpoint
CREATE TYPE "public"."grade_kind" AS ENUM('current', 'final', 'credit');--> statement-breakpoint
CREATE TYPE "public"."grade_outcome" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."grade_scale" AS ENUM('five', 'hundred');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('lecture', 'seminar', 'practice');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('planned', 'moved', 'replaced', 'cancelled');--> statement-breakpoint
CREATE TABLE "deadline_completions" (
	"student_id" uuid NOT NULL,
	"deadline_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deadline_completions_student_id_deadline_id_pk" PRIMARY KEY("student_id","deadline_id")
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"group_id" uuid,
	"discipline_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"required" boolean NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deadline_audience" CHECK (num_nonnulls("deadlines"."student_id", "deadlines"."group_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"assessment" "assessment" NOT NULL,
	CONSTRAINT "disciplines_group_id_semester_id_code_unique" UNIQUE("group_id","semester_id","code")
);
--> statement-breakpoint
CREATE TABLE "exam_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"kind" "exam_kind" NOT NULL,
	"starts_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"room" text,
	CONSTRAINT "exam_publication_time" CHECK ("exam_events"."published_at" IS NULL OR "exam_events"."starts_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"kind" "grade_kind" NOT NULL,
	"label" text NOT NULL,
	"value" numeric,
	"scale" "grade_scale",
	"outcome" "grade_outcome",
	"published_at" timestamp with time zone,
	CONSTRAINT "grade_value_scale" CHECK (("grades"."value" IS NULL AND "grades"."scale" IS NULL) OR
    ("grades"."value" IS NOT NULL AND "grades"."scale" IS NOT NULL AND
      (("grades"."scale" = 'five' AND "grades"."value" BETWEEN 1 AND 5) OR
       ("grades"."scale" = 'hundred' AND "grades"."value" BETWEEN 0 AND 100)))),
	CONSTRAINT "grade_outcome_required" CHECK ("grades"."kind" = 'current' OR "grades"."published_at" IS NULL OR "grades"."outcome" IS NOT NULL),
	CONSTRAINT "credit_without_value" CHECK ("grades"."kind" <> 'credit' OR "grades"."value" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "lesson_revisions" (
	"lesson_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"room" text NOT NULL,
	"teacher_name" text NOT NULL,
	"kind" "lesson_kind" NOT NULL,
	"status" "lesson_status" NOT NULL,
	"reason" text,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_revisions_lesson_id_version_pk" PRIMARY KEY("lesson_id","version"),
	CONSTRAINT "lesson_revision_version" CHECK ("lesson_revisions"."version" > 0),
	CONSTRAINT "lesson_revision_times" CHECK ("lesson_revisions"."starts_at" < "lesson_revisions"."ends_at"),
	CONSTRAINT "lesson_revision_reason" CHECK ("lesson_revisions"."status" = 'planned' OR ("lesson_revisions"."reason" IS NOT NULL AND btrim("lesson_revisions"."reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"original_starts_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lessons_discipline_id_original_starts_at_unique" UNIQUE("discipline_id","original_starts_at")
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean NOT NULL,
	CONSTRAINT "semesters_label_unique" UNIQUE("label"),
	CONSTRAINT "semester_dates" CHECK ("semesters"."starts_on" < "semesters"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "study_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	CONSTRAINT "study_plan_items_student_id_discipline_id_unique" UNIQUE("student_id","discipline_id")
);
--> statement-breakpoint
ALTER TABLE "deadline_completions" ADD CONSTRAINT "deadline_completions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_completions" ADD CONSTRAINT "deadline_completions_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_plan_item_id_study_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."study_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_revisions" ADD CONSTRAINT "lesson_revisions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deadlines_student_due_idx" ON "deadlines" USING btree ("student_id","due_at");--> statement-breakpoint
CREATE INDEX "deadlines_group_due_idx" ON "deadlines" USING btree ("group_id","due_at");--> statement-breakpoint
CREATE INDEX "exams_discipline_idx" ON "exam_events" USING btree ("discipline_id","starts_at");--> statement-breakpoint
CREATE INDEX "grades_plan_publication_idx" ON "grades" USING btree ("plan_item_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_final_idx" ON "grades" USING btree ("plan_item_id") WHERE "grades"."kind" in ('final', 'credit');--> statement-breakpoint
CREATE INDEX "lesson_revisions_date_idx" ON "lesson_revisions" USING btree ("starts_at","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "semester_current_idx" ON "semesters" USING btree ("is_current") WHERE "semesters"."is_current";