CREATE TYPE "public"."notification_kind" AS ENUM('announcement', 'schedule_change', 'deadline', 'request_update');--> statement-breakpoint
CREATE TYPE "public"."request_action" AS ENUM('create', 'clarify');--> statement-breakpoint
CREATE TYPE "public"."request_actor" AS ENUM('student', 'system');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('study_certificate', 'consultation_reschedule');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('submitted', 'in_progress', 'ready', 'approved', 'rejected', 'needs_clarification');--> statement-breakpoint
CREATE SEQUENCE "public"."request_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE TABLE "notification_states" (
	"student_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_states_student_id_notification_id_pk" PRIMARY KEY("student_id","notification_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"group_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"important" boolean NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"lesson_id" uuid,
	"deadline_id" uuid,
	"request_id" uuid,
	"source_key" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "notifications_audience" CHECK (num_nonnulls("notifications"."student_id", "notifications"."group_id") = 1),
	CONSTRAINT "notifications_target" CHECK (
    ("notifications"."lesson_id" IS NOT NULL) = ("notifications"."kind" = 'schedule_change')
    AND ("notifications"."deadline_id" IS NOT NULL) = ("notifications"."kind" = 'deadline')
    AND ("notifications"."request_id" IS NOT NULL) = ("notifications"."kind" = 'request_update')
    AND ("notifications"."kind" <> 'request_update' OR "notifications"."student_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "request_history" (
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"from_status" "request_status",
	"to_status" "request_status" NOT NULL,
	"actor_kind" "request_actor" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_history_request_id_version_pk" PRIMARY KEY("request_id","version"),
	CONSTRAINT "request_history_initial" CHECK ("request_history"."version" > 0 AND ("request_history"."version" = 1) = ("request_history"."from_status" IS NULL)),
	CONSTRAINT "request_history_reason" CHECK ("request_history"."to_status" NOT IN ('needs_clarification', 'rejected') OR ("request_history"."reason" IS NOT NULL AND btrim("request_history"."reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "request_operations" (
	"student_id" uuid NOT NULL,
	"action" "request_action" NOT NULL,
	"operation_key" uuid NOT NULL,
	"fingerprint" "bytea" NOT NULL,
	"result_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_operations_student_id_action_operation_key_pk" PRIMARY KEY("student_id","action","operation_key"),
	CONSTRAINT "request_operations_hash_length" CHECK (octet_length("request_operations"."fingerprint") = 32)
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"public_no" text NOT NULL,
	"kind" "request_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "request_status" NOT NULL,
	"version" integer NOT NULL,
	"result_snapshot" jsonb,
	"next_transition_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "requests_public_no_unique" UNIQUE("public_no"),
	CONSTRAINT "requests_student_id_id_unique" UNIQUE("student_id","id"),
	CONSTRAINT "requests_positive_version" CHECK ("requests"."version" > 0),
	CONSTRAINT "requests_valid_snapshot" CHECK (("requests"."result_snapshot" IS NOT NULL) = ("requests"."kind" = 'study_certificate' AND "requests"."status" = 'ready')),
	CONSTRAINT "requests_valid_timer" CHECK (("requests"."next_transition_at" IS NOT NULL) = ("requests"."status" IN ('submitted', 'in_progress')))
);
--> statement-breakpoint
ALTER TABLE "deadlines" ALTER COLUMN "discipline_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_operations" ADD CONSTRAINT "request_operations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_operations" ADD CONSTRAINT "request_operations_owned_result_fk" FOREIGN KEY ("student_id","result_request_id") REFERENCES "public"."requests"("student_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_student_published_idx" ON "notifications" USING btree ("student_id","published_at","id");--> statement-breakpoint
CREATE INDEX "notifications_group_published_idx" ON "notifications" USING btree ("group_id","published_at","id");--> statement-breakpoint
CREATE INDEX "requests_owner_created_idx" ON "requests" USING btree ("student_id","created_at","id");--> statement-breakpoint
CREATE INDEX "requests_owner_updated_idx" ON "requests" USING btree ("student_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "requests_due_idx" ON "requests" USING btree ("next_transition_at") WHERE "requests"."next_transition_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadline_target" CHECK (num_nonnulls("deadlines"."discipline_id", "deadlines"."request_id") = 1 AND ("deadlines"."request_id" IS NULL OR "deadlines"."student_id" IS NOT NULL));