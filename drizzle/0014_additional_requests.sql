ALTER TYPE "public"."request_kind" ADD VALUE 'material_aid';--> statement-breakpoint
ALTER TYPE "public"."request_kind" ADD VALUE 'academic_leave';--> statement-breakpoint
ALTER TYPE "public"."request_kind" ADD VALUE 'travel_compensation';--> statement-breakpoint
UPDATE service_catalog SET active = false WHERE code = 'individual_schedule';
--> statement-breakpoint
UPDATE service_catalog SET contract_version = 3 WHERE code = 'dormitory';
--> statement-breakpoint
INSERT INTO service_catalog(code,title,category,description,active,contract_version) VALUES
('material_aid','Материальная помощь','Быт','Заявление на материальную помощь',true,2),
('academic_leave','Академический отпуск','Учёба','Заявление на академический отпуск',true,2),
('travel_compensation','Компенсация проезда до места жительства и отдыха','Быт','Заявление на компенсацию проезда',true,2)
ON CONFLICT (code) DO UPDATE SET title=excluded.title, category=excluded.category, description=excluded.description, active=true, contract_version=excluded.contract_version;
