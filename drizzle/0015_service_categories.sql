UPDATE service_catalog SET category = 'Финансы' WHERE code IN ('material_aid', 'travel_compensation');
--> statement-breakpoint
UPDATE service_catalog SET category = 'Общежитие' WHERE code = 'dormitory';
