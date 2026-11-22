CREATE TABLE "clinic_afk_requests" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"document_key" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"published_at" timestamp with time zone,
	CONSTRAINT "clinic_afk_document" CHECK ("clinic_afk_requests"."document_key" = 'afk-demo-v1'),
	CONSTRAINT "clinic_afk_review" CHECK (
    ("clinic_afk_requests"."status" = 'submitted' AND "clinic_afk_requests"."published_at" IS NULL AND "clinic_afk_requests"."starts_on" IS NULL AND "clinic_afk_requests"."ends_on" IS NULL)
    OR ("clinic_afk_requests"."published_at" IS NOT NULL AND "clinic_afk_requests"."published_at" >= "clinic_afk_requests"."submitted_at" AND (
      ("clinic_afk_requests"."status" = 'approved' AND "clinic_afk_requests"."starts_on" IS NOT NULL AND "clinic_afk_requests"."ends_on" IS NOT NULL AND "clinic_afk_requests"."starts_on" <= "clinic_afk_requests"."ends_on")
      OR ("clinic_afk_requests"."status" = 'declined' AND "clinic_afk_requests"."starts_on" IS NULL AND "clinic_afk_requests"."ends_on" IS NULL)
    )))
);
--> statement-breakpoint
CREATE TABLE "clinic_appointments" (
	"student_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"passport_updated_at" timestamp with time zone,
	CONSTRAINT "clinic_appointments_student_id_slot_id_pk" PRIMARY KEY("student_id","slot_id"),
	CONSTRAINT "clinic_appointment_times" CHECK (
    ("clinic_appointments"."cancelled_at" IS NULL OR "clinic_appointments"."cancelled_at" >= "clinic_appointments"."booked_at")
    AND ("clinic_appointments"."completed_at" IS NULL OR ("clinic_appointments"."completed_at" >= "clinic_appointments"."booked_at" AND "clinic_appointments"."cancelled_at" IS NULL))
    AND ("clinic_appointments"."passport_updated_at" IS NULL OR ("clinic_appointments"."completed_at" IS NOT NULL AND "clinic_appointments"."passport_updated_at" >= "clinic_appointments"."completed_at")))
);
--> statement-breakpoint
CREATE TABLE "clinic_doctors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"faculty" text NOT NULL,
	"name" text NOT NULL,
	"place" text NOT NULL,
	CONSTRAINT "clinic_doctors_faculty_unique" UNIQUE("faculty")
);
--> statement-breakpoint
CREATE TABLE "clinic_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doctor_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clinic_slot_start" UNIQUE("doctor_id","starts_at"),
	CONSTRAINT "clinic_slot_time" CHECK ("clinic_slots"."starts_at" < "clinic_slots"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "clinic_afk_requests" ADD CONSTRAINT "clinic_afk_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_slot_id_clinic_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."clinic_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_slots" ADD CONSTRAINT "clinic_slots_doctor_id_clinic_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_active_appointment_student" ON "clinic_appointments" USING btree ("student_id") WHERE "clinic_appointments"."cancelled_at" IS NULL AND "clinic_appointments"."completed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_occupied_slot" ON "clinic_appointments" USING btree ("slot_id") WHERE "clinic_appointments"."cancelled_at" IS NULL;