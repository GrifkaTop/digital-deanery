CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid,
	"group_id" uuid,
	"kind" text NOT NULL,
	"number" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"actions" text NOT NULL,
	"requirements" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"max_score" numeric,
	CONSTRAINT "assignments_audience" CHECK (num_nonnulls("assignments"."student_id", "assignments"."group_id") = 1),
	CONSTRAINT "assignments_number" CHECK ("assignments"."number" IS NULL OR "assignments"."number" > 0),
	CONSTRAINT "assignments_score" CHECK ("assignments"."max_score" IS NULL OR "assignments"."max_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discipline_teachers" (
	"discipline_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	CONSTRAINT "discipline_teachers_discipline_id_teacher_id_pk" PRIMARY KEY("discipline_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "exam_admissions" (
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	CONSTRAINT "exam_admissions_exam_id_student_id_pk" PRIMARY KEY("exam_id","student_id"),
	CONSTRAINT "exam_admission_status" CHECK ("exam_admissions"."status" IN ('admitted','pending','action_required'))
);
--> statement-breakpoint
CREATE TABLE "exam_teachers" (
	"exam_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	CONSTRAINT "exam_teachers_exam_id_teacher_id_pk" PRIMARY KEY("exam_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "health_passports" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"valid_until" date NOT NULL,
	"admitted" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_assignments" (
	"lesson_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	CONSTRAINT "lesson_assignments_lesson_id_assignment_id_pk" PRIMARY KEY("lesson_id","assignment_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_teachers" (
	"lesson_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"teacher_id" uuid NOT NULL,
	CONSTRAINT "lesson_teachers_lesson_id_version_teacher_id_pk" PRIMARY KEY("lesson_id","version","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL,
	"recurrence" text NOT NULL,
	CONSTRAINT "schedule_rule_weekday" CHECK ("schedule_rules"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "schedule_rule_dates" CHECK ("schedule_rules"."starts_on" <= "schedule_rules"."ends_on"),
	CONSTRAINT "schedule_rule_times" CHECK ("schedule_rules"."start_minutes" >= 0 AND "schedule_rules"."end_minutes" <= 1440 AND "schedule_rules"."start_minutes" < "schedule_rules"."end_minutes"),
	CONSTRAINT "schedule_rule_recurrence" CHECK ("schedule_rules"."recurrence" IN ('weekly','numerator','denominator'))
);
--> statement-breakpoint
CREATE TABLE "service_catalog" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"active" boolean NOT NULL,
	"contract_version" integer NOT NULL,
	CONSTRAINT "service_contract_version" CHECK ("service_catalog"."contract_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "sports_attendance" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attended" boolean NOT NULL,
	CONSTRAINT "sports_attendance_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "sports_bookings" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sports_bookings_session_id_student_id_pk" PRIMARY KEY("session_id","student_id"),
	CONSTRAINT "sports_booking_status" CHECK ("sports_bookings"."status" IN ('active','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "sports_semester_results" (
	"semester_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" numeric,
	"result" text,
	CONSTRAINT "sports_semester_results_semester_id_student_id_pk" PRIMARY KEY("semester_id","student_id"),
	CONSTRAINT "sports_result_score" CHECK ("sports_semester_results"."score" IS NULL OR "sports_semester_results"."score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sports_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	"capacity" integer NOT NULL,
	"booking_open" boolean NOT NULL,
	CONSTRAINT "sports_kind" CHECK ("sports_sessions"."kind" IN ('class','makeup','pool')),
	CONSTRAINT "sports_times" CHECK ("sports_sessions"."starts_at" < "sports_sessions"."ends_at"),
	CONSTRAINT "sports_capacity" CHECK ("sports_sessions"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "student_assignment_results" (
	"student_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"score" numeric,
	"completed_at" timestamp with time zone,
	"defended_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "student_assignment_results_student_id_assignment_id_pk" PRIMARY KEY("student_id","assignment_id"),
	CONSTRAINT "assignment_result_stage" CHECK ("student_assignment_results"."stage" IN ('issued','completed','defended')),
	CONSTRAINT "assignment_result_times" CHECK (("student_assignment_results"."stage" = 'issued' AND "student_assignment_results"."completed_at" IS NULL AND "student_assignment_results"."defended_at" IS NULL) OR ("student_assignment_results"."stage" = 'completed' AND "student_assignment_results"."completed_at" IS NOT NULL AND "student_assignment_results"."defended_at" IS NULL) OR ("student_assignment_results"."stage" = 'defended' AND "student_assignment_results"."completed_at" IS NOT NULL AND "student_assignment_results"."defended_at" IS NOT NULL AND "student_assignment_results"."defended_at" >= "student_assignment_results"."completed_at")),
	CONSTRAINT "assignment_result_score" CHECK ("student_assignment_results"."score" IS NULL OR "student_assignment_results"."score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"avatar_key" text
);
--> statement-breakpoint
ALTER TABLE "deadlines" DROP CONSTRAINT "deadline_target";--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_events" ADD COLUMN "building" text;--> statement-breakpoint
ALTER TABLE "exam_events" ADD COLUMN "format" text DEFAULT 'in_person' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_revisions" ADD COLUMN "building" text;--> statement-breakpoint
ALTER TABLE "lesson_revisions" ADD COLUMN "format" text DEFAULT 'in_person' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_admissions" ADD CONSTRAINT "exam_admissions_exam_id_exam_events_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_admissions" ADD CONSTRAINT "exam_admissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_teachers" ADD CONSTRAINT "exam_teachers_exam_id_exam_events_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_teachers" ADD CONSTRAINT "exam_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_passports" ADD CONSTRAINT "health_passports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_teachers" ADD CONSTRAINT "lesson_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_teachers" ADD CONSTRAINT "lesson_teachers_lesson_id_version_lesson_revisions_lesson_id_version_fk" FOREIGN KEY ("lesson_id","version") REFERENCES "public"."lesson_revisions"("lesson_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_attendance" ADD CONSTRAINT "sports_attendance_session_id_sports_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sports_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_attendance" ADD CONSTRAINT "sports_attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_bookings" ADD CONSTRAINT "sports_bookings_session_id_sports_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sports_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_bookings" ADD CONSTRAINT "sports_bookings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD CONSTRAINT "sports_semester_results_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD CONSTRAINT "sports_semester_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_assignment_results" ADD CONSTRAINT "student_assignment_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_assignment_results" ADD CONSTRAINT "student_assignment_results_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_assignment_unique" ON "deadlines" USING btree ("assignment_id");--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadline_target" CHECK (num_nonnulls("deadlines"."discipline_id", "deadlines"."assignment_id", "deadlines"."request_id") = 1 AND ("deadlines"."request_id" IS NULL OR "deadlines"."student_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_format" CHECK ("exam_events"."format" IN ('in_person', 'remote'));--> statement-breakpoint
ALTER TABLE "lesson_revisions" ADD CONSTRAINT "lesson_revision_format" CHECK ("lesson_revisions"."format" IN ('in_person', 'remote'));