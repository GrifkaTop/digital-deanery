-- Apply only to a disposable database immediately after the synthetic seed.
BEGIN;
UPDATE students SET group_id = (SELECT group_id FROM students WHERE account_id = '10000000-0000-4000-8000-000000000001')
WHERE account_id = '10000000-0000-4000-8000-000000000002';
UPDATE health_passports SET valid_until = '2027-05-31', admitted = false
WHERE student_id = (SELECT id FROM students WHERE account_id = '10000000-0000-4000-8000-000000000002');
UPDATE sports_semester_results SET score = 3
WHERE student_id = (SELECT id FROM students WHERE account_id = '10000000-0000-4000-8000-000000000002');
INSERT INTO sports_attendance (session_id, student_id, attended)
SELECT 'c0000000-0000-4000-8000-000000000001', id,
       account_id = '10000000-0000-4000-8000-000000000001'
FROM students WHERE account_id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
INSERT INTO sports_bookings (session_id, student_id, status, updated_at)
SELECT 'c0000000-0000-4000-8000-000000000001', id, 'active', now()
FROM students WHERE account_id = '10000000-0000-4000-8000-000000000001';
INSERT INTO study_plan_items (id, student_id, discipline_id)
SELECT gen_random_uuid(), b.id, p.discipline_id FROM study_plan_items p
JOIN students a ON a.id = p.student_id AND a.account_id = '10000000-0000-4000-8000-000000000001'
JOIN students b ON b.account_id = '10000000-0000-4000-8000-000000000002'
ON CONFLICT (student_id, discipline_id) DO NOTHING;
INSERT INTO grades (id, plan_item_id, kind, label, value, scale, published_at)
SELECT gen_random_uuid(), p.id, 'current', 'Оценка студента B', 2, 'five', '2026-11-01 00:00+00'
FROM study_plan_items p JOIN students b ON b.id = p.student_id AND b.account_id = '10000000-0000-4000-8000-000000000002'
JOIN assignments a ON a.discipline_id = p.discipline_id AND a.id = 'e0000000-0000-4000-8000-000000000001';
INSERT INTO student_assignment_results (student_id, assignment_id, stage, score, published_at)
SELECT id, 'e0000000-0000-4000-8000-000000000001', 'issued', NULL, '2026-11-01 00:00+00'
FROM students WHERE account_id = '10000000-0000-4000-8000-000000000002'
ON CONFLICT (student_id, assignment_id) DO UPDATE SET stage = 'issued', score = NULL, completed_at = NULL, published_at = EXCLUDED.published_at;
INSERT INTO exam_admissions (student_id, exam_id, status, reason)
SELECT b.id, e.id, 'pending', 'Синтетическое уточнение'
FROM students b JOIN study_plan_items p ON p.student_id = b.id JOIN exam_events e ON e.discipline_id = p.discipline_id
WHERE b.account_id = '10000000-0000-4000-8000-000000000002' AND e.published_at IS NOT NULL
ON CONFLICT (exam_id, student_id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason;
INSERT INTO deadlines (id, student_id, discipline_id, title, due_at, required, published_at)
SELECT CASE WHEN s.account_id = '10000000-0000-4000-8000-000000000001'::uuid
       THEN 'fa000000-0000-4000-8000-000000000001'::uuid ELSE 'fa000000-0000-4000-8000-000000000002'::uuid END,
       s.id, a.discipline_id, CASE WHEN s.account_id = '10000000-0000-4000-8000-000000000001'::uuid
       THEN 'Личный срок A' ELSE 'Личный срок B' END, '2026-11-19 12:00+03', true, '2026-11-01 00:00+00'
FROM students s CROSS JOIN assignments a WHERE a.id = 'e0000000-0000-4000-8000-000000000001'
AND s.account_id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
INSERT INTO deadline_completions (student_id, deadline_id, completed_at)
SELECT id, 'f0000000-0000-4000-8000-000000000001', '2026-11-16 00:00+00'
FROM students WHERE account_id = '10000000-0000-4000-8000-000000000001';
DELETE FROM notification_states WHERE notification_id IN (
  SELECT id FROM notifications WHERE group_id = (SELECT group_id FROM students WHERE account_id = '10000000-0000-4000-8000-000000000001')
);
COMMIT;
