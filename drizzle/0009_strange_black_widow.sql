ALTER TABLE "groups" ADD COLUMN "education_level" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "study_mode" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "student_number" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_student_number_unique" UNIQUE("student_number");