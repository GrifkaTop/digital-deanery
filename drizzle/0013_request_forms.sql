ALTER TYPE "public"."request_status" ADD VALUE 'registered';--> statement-breakpoint
CREATE TABLE "scholarship_accruals" (
	"student_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"month" date NOT NULL,
	"amount_kopecks" integer NOT NULL,
	CONSTRAINT "scholarship_accruals_student_id_kind_month_pk" PRIMARY KEY("student_id","kind","month"),
	CONSTRAINT "scholarship_kind" CHECK ("scholarship_accruals"."kind" IN ('academic', 'social')),
	CONSTRAINT "scholarship_month" CHECK (extract(day FROM "scholarship_accruals"."month") = 1),
	CONSTRAINT "scholarship_amount" CHECK ("scholarship_accruals"."amount_kopecks" > 0)
);
--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_valid_snapshot";--> statement-breakpoint
ALTER TABLE "scholarship_accruals" ADD CONSTRAINT "scholarship_accruals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_valid_snapshot" CHECK (("requests"."result_snapshot" IS NOT NULL) = ("requests"."kind"::text IN ('study_certificate', 'scholarship_certificate') AND "requests"."status" = 'ready'));
--> statement-breakpoint
INSERT INTO "service_catalog" ("code", "title", "category", "description", "active", "contract_version") VALUES
  ('study_certificate', 'Справка об обучении', 'Справки', 'Подтверждение статуса студента', true, 1),
  ('scholarship_certificate', 'Справка о начислении стипендии', 'Справки', 'Суммы начислений по месяцам', true, 2),
  ('consultation_reschedule', 'Перенос учебной консультации', 'Учёба', 'Запрос на другое время консультации', true, 2),
  ('individual_schedule', 'Индивидуальный график обучения', 'Учёба', 'Запрос на изменение учебного графика', true, 2),
  ('dormitory', 'Предоставление места в общежитии', 'Быт', 'Заявление на размещение', true, 2),
  ('campus_pass', 'Оформление пропуска в кампус', 'Кампус', 'Первичная выдача или замена пропуска', true, 2)
ON CONFLICT ("code") DO UPDATE SET
  "title" = EXCLUDED."title", "category" = EXCLUDED."category",
  "description" = EXCLUDED."description", "contract_version" = EXCLUDED."contract_version";
