CREATE TABLE "library_book_subjects" (
	"book_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "library_book_subjects_book_id_subject_id_pk" PRIMARY KEY("book_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "library_bookings" (
	"book_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_bookings_book_id_student_id_pk" PRIMARY KEY("book_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text NOT NULL,
	"content" text,
	"copies" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "library_copies_nonnegative" CHECK ("library_books"."copies" >= 0)
);
--> statement-breakpoint
CREATE TABLE "library_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "library_subjects_title_unique" UNIQUE("title")
);
--> statement-breakpoint
ALTER TABLE "library_book_subjects" ADD CONSTRAINT "library_book_subjects_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_book_subjects" ADD CONSTRAINT "library_book_subjects_subject_id_library_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."library_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_bookings" ADD CONSTRAINT "library_bookings_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_bookings" ADD CONSTRAINT "library_bookings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;