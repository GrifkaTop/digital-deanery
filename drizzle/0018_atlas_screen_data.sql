ALTER TYPE "public"."notification_kind" ADD VALUE 'assignment_result';--> statement-breakpoint
CREATE TABLE "sports_norm_results" (
	"semester_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"result" numeric,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sports_norm_results_semester_id_student_id_code_pk" PRIMARY KEY("semester_id","student_id","code"),
	CONSTRAINT "sports_norm_direction" CHECK ("sports_norm_results"."direction" IN ('higher','lower')),
	CONSTRAINT "sports_norm_result" CHECK (("sports_norm_results"."status"='unattempted' AND "sports_norm_results"."result" IS NULL) OR ("sports_norm_results"."status" IN ('passed','failed') AND "sports_norm_results"."result" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "study_plan_details" (
	"plan_item_id" uuid PRIMARY KEY NOT NULL,
	"semester_number" integer NOT NULL,
	"department" text,
	"hours" integer,
	"assessment_label" text,
	"coursework_hours" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "study_plan_details_number" CHECK ("study_plan_details"."semester_number" >= 1),
	CONSTRAINT "study_plan_details_hours" CHECK ("study_plan_details"."hours" >= 0 AND "study_plan_details"."coursework_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target";--> statement-breakpoint
ALTER TABLE "sports_semester_results" DROP CONSTRAINT "sports_target";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD COLUMN "minimum_points" integer;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD COLUMN "prior_semester_id" uuid;--> statement-breakpoint
ALTER TABLE "sports_norm_results" ADD CONSTRAINT "sports_norm_owner_fk" FOREIGN KEY ("semester_id","student_id") REFERENCES "public"."sports_semester_results"("semester_id","student_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_details" ADD CONSTRAINT "study_plan_details_plan_item_id_study_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."study_plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assignment_result_fk" FOREIGN KEY ("student_id","assignment_id") REFERENCES "public"."student_assignment_results"("student_id","assignment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD CONSTRAINT "sports_semester_results_prior_semester_id_semesters_id_fk" FOREIGN KEY ("prior_semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target" CHECK (
    ("notifications"."lesson_id" IS NOT NULL) = ("notifications"."kind" = 'schedule_change')
    AND ("notifications"."deadline_id" IS NOT NULL) = ("notifications"."kind" = 'deadline')
    AND ("notifications"."request_id" IS NOT NULL) = ("notifications"."kind" = 'request_update')
    AND ("notifications"."assignment_id" IS NOT NULL) = ("notifications"."kind"::text = 'assignment_result')
    AND ("notifications"."kind"::text NOT IN ('request_update', 'assignment_result') OR "notifications"."student_id" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "sports_semester_results" ADD CONSTRAINT "sports_target" CHECK ("sports_semester_results"."target_attendance" >= 0 AND "sports_semester_results"."minimum_points" >= 0);