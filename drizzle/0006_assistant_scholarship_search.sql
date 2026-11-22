CREATE TABLE "assistant_scholarship_payments" (
	"month" date PRIMARY KEY NOT NULL,
	"pay_on" date NOT NULL,
	"document_id" text NOT NULL,
	"fragment_position" integer NOT NULL,
	CONSTRAINT "assistant_scholarship_month_start" CHECK (extract(day from "assistant_scholarship_payments"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD COLUMN "keywords" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD COLUMN "has_pdf" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_scholarship_payments" ADD CONSTRAINT "assistant_scholarship_fragment_fk" FOREIGN KEY ("document_id","fragment_position") REFERENCES "public"."assistant_fragments"("document_id","position") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
WITH publication AS (
	INSERT INTO assistant_publications (id, revision, title, number, issued_on, keywords, has_pdf)
	VALUES (
		'scholarship-payments-2026-27',
		'47e29dbb6419962e7f7fb0cce73d192f998b16c2c550cbd218253cdb6ff87397',
		'Приказ о сроках выплаты академической стипендии', 'УС-02', '2026-11-10',
		'график перечисления стипендии стипуха', false
	)
	ON CONFLICT (id) DO NOTHING
	RETURNING id
), fragment AS (
	INSERT INTO assistant_fragments (document_id, position, page, text)
	SELECT id, 1, 1,
		'Академическая стипендия перечисляется по графику студентам, которым она назначена приказом. '
		'За ноябрь 2026 г. — 25 ноября 2026 г. За декабрь 2026 г. — 24 декабря 2026 г. '
		'За январь 2027 г. — 25 января 2027 г. За февраль 2027 г. — 25 февраля 2027 г.'
	FROM publication
	RETURNING document_id, position
)
INSERT INTO assistant_scholarship_payments (month, pay_on, document_id, fragment_position)
SELECT periods.month, periods.pay_on, fragment.document_id, fragment.position
FROM fragment CROSS JOIN (VALUES
	(DATE '2026-11-01', DATE '2026-11-25'),
	(DATE '2026-12-01', DATE '2026-12-24'),
	(DATE '2027-01-01', DATE '2027-01-25'),
	(DATE '2027-02-01', DATE '2027-02-25')
) AS periods(month, pay_on);
