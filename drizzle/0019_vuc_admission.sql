CREATE TABLE "vuc_applications" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"slot_id" uuid,
	"booked_at" timestamp with time zone,
	"physical_score" integer,
	"academic_score" integer,
	"exercises" jsonb,
	"results_published_at" timestamp with time zone,
	"decision" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "vuc_application_booking" CHECK (("vuc_applications"."slot_id" IS NULL) = ("vuc_applications"."booked_at" IS NULL) AND "vuc_applications"."booked_at" >= "vuc_applications"."submitted_at"),
	CONSTRAINT "vuc_application_result" CHECK (
    ("vuc_applications"."results_published_at" IS NULL AND "vuc_applications"."physical_score" IS NULL AND "vuc_applications"."academic_score" IS NULL AND "vuc_applications"."exercises" IS NULL)
    OR ("vuc_applications"."results_published_at" IS NOT NULL AND "vuc_applications"."booked_at" IS NOT NULL AND "vuc_applications"."results_published_at" >= "vuc_applications"."booked_at"
    AND "vuc_applications"."physical_score" IS NOT NULL AND "vuc_applications"."physical_score" BETWEEN 0 AND 100
    AND "vuc_applications"."academic_score" IS NOT NULL AND "vuc_applications"."academic_score" BETWEEN 0 AND 100 AND jsonb_typeof("vuc_applications"."exercises") IS NOT DISTINCT FROM 'object')),
	CONSTRAINT "vuc_application_decision" CHECK (("vuc_applications"."decision" IS NULL AND "vuc_applications"."decided_at" IS NULL)
    OR ("vuc_applications"."decision" IS NOT NULL AND "vuc_applications"."decision" IN ('admitted','not_admitted') AND "vuc_applications"."decided_at" IS NOT NULL
    AND "vuc_applications"."results_published_at" IS NOT NULL AND "vuc_applications"."decided_at" >= "vuc_applications"."results_published_at"))
);
--> statement-breakpoint
CREATE TABLE "vuc_test_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	CONSTRAINT "vuc_slot_time" CHECK ("vuc_test_slots"."starts_at" < "vuc_test_slots"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "vuc_applications" ADD CONSTRAINT "vuc_applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vuc_applications" ADD CONSTRAINT "vuc_applications_slot_id_vuc_test_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."vuc_test_slots"("id") ON DELETE no action ON UPDATE no action;