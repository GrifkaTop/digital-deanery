-- Синтетические данные профиля A. Повторный запуск сохраняет изменённые результаты работ.
BEGIN;
SELECT pg_advisory_xact_lock(8112040);
CREATE FUNCTION pg_temp.demo_uuid(value text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT (substr(md5(value),1,12) || '4' || substr(md5(value),14,3) || '8' || substr(md5(value),18))::uuid
$$;
CREATE TEMP TABLE demo_a_study ON COMMIT DROP AS
SELECT p.id AS plan_id, p.student_id, d.id AS discipline_id, d.assessment, d.code,
       row_number() OVER (ORDER BY d.code) AS n,
       CASE d.code WHEN 'DATA' THEN 8 WHEN 'EN' THEN 14 WHEN 'LAW' THEN 18 WHEN 'LOGIC' THEN 32 WHEN 'MODELS' THEN 26 WHEN 'WRITE' THEN 24 END AS work_one,
       CASE d.code WHEN 'DATA' THEN 12 WHEN 'EN' THEN 20 WHEN 'LAW' THEN 27 WHEN 'LOGIC' THEN 48 WHEN 'MODELS' THEN 39 WHEN 'WRITE' THEN 33 END AS work_two
FROM study_plan_items p JOIN students s ON s.id=p.student_id
JOIN disciplines d ON d.id=p.discipline_id JOIN semesters se ON se.id=d.semester_id
WHERE s.account_id='10000000-0000-4000-8000-000000000001' AND se.is_current AND d.group_id=s.group_id
AND d.code IN ('DATA','EN','LAW','LOGIC','MODELS','WRITE');

-- Удаляем только ошибочные идентификаторы из первой версии этого наполнения.
DELETE FROM student_assignment_results r USING demo_a_study d, (VALUES (1),(2)) w(n)
 WHERE r.student_id=d.student_id AND r.assignment_id=md5('demo-a-work:'||d.discipline_id||':'||w.n)::uuid;
DELETE FROM assignments a USING demo_a_study d, (VALUES (1),(2)) w(n)
 WHERE a.id=md5('demo-a-work:'||d.discipline_id||':'||w.n)::uuid;
DELETE FROM exam_admissions a USING demo_a_study d
 WHERE a.exam_id=md5('demo-a-session:'||d.discipline_id)::uuid AND a.student_id=d.student_id;
DELETE FROM exam_events e USING demo_a_study d WHERE e.id=md5('demo-a-session:'||d.discipline_id)::uuid;

INSERT INTO teachers(id,full_name) VALUES ('20000000-0000-4000-8000-990000000001','Нина Учебная') ON CONFLICT DO NOTHING;
INSERT INTO discipline_teachers(discipline_id,teacher_id)
SELECT discipline_id,'20000000-0000-4000-8000-990000000001' FROM demo_a_study ON CONFLICT DO NOTHING;

INSERT INTO assignments(id,discipline_id,teacher_id,student_id,kind,number,title,description,actions,requirements,issued_at,published_at,max_score)
SELECT pg_temp.demo_uuid('demo-a-work:'||d.discipline_id||':'||w.n),d.discipline_id,
 '20000000-0000-4000-8000-990000000001',d.student_id,w.kind,w.n,w.title,w.title,
 'Выполните учебное задание.','Представьте решение преподавателю.',
 '2026-10-01 09:00+03','2026-10-01 09:00+03',CASE WHEN d.assessment='exam' THEN CASE WHEN w.n=1 THEN 30 ELSE 40 END ELSE CASE WHEN w.n=1 THEN 40 ELSE 60 END END
FROM demo_a_study d CROSS JOIN (VALUES (1,'dz','Домашняя работа'),(2,'rk','Рубежный контроль')) w(n,kind,title)
ON CONFLICT(id) DO UPDATE SET max_score=EXCLUDED.max_score WHERE assignments.max_score IN (20,30);
INSERT INTO student_assignment_results(student_id,assignment_id,stage,score,completed_at,defended_at,published_at)
SELECT d.student_id,pg_temp.demo_uuid('demo-a-work:'||d.discipline_id||':'||w.n),'defended',
 CASE WHEN w.n=1 THEN d.work_one ELSE d.work_two END,
 '2026-11-10 12:00+03','2026-11-12 12:00+03','2026-11-12 12:00+03'
FROM demo_a_study d CROSS JOIN (VALUES (1),(2)) w(n)
ON CONFLICT(student_id,assignment_id) DO UPDATE SET score=EXCLUDED.score
WHERE student_assignment_results.score IN (13,14,15,16,17,18,20,22,24,26,28,30);

INSERT INTO study_score_breakdowns(plan_item_id,semester_score,semester_max,exam_score,exam_max,published_at)
SELECT plan_id,work_one+work_two,CASE WHEN assessment='exam' THEN 70 ELSE 100 END,NULL,
 CASE WHEN assessment='exam' THEN 30 ELSE NULL END,'2026-11-17 09:00+03' FROM demo_a_study
ON CONFLICT(plan_item_id) DO UPDATE SET semester_score=EXCLUDED.semester_score,
 semester_max=EXCLUDED.semester_max, exam_max=EXCLUDED.exam_max, published_at=EXCLUDED.published_at
WHERE study_score_breakdowns.semester_score IS NULL OR study_score_breakdowns.semester_score IN (0,33,36,39,42,45,48);

INSERT INTO exam_events(id,discipline_id,kind,starts_at,room,building,published_at)
SELECT pg_temp.demo_uuid('demo-a-session:'||discipline_id),discipline_id,
 CASE WHEN assessment='exam' THEN 'exam'::exam_kind ELSE 'credit'::exam_kind END,
 '2027-01-11 09:00+03'::timestamptz + (n-1)*interval '3 days',
 (210+n)::text,'корпус А','2026-11-17 09:00+03'
FROM demo_a_study d WHERE NOT EXISTS (SELECT 1 FROM exam_events e WHERE e.discipline_id=d.discipline_id AND e.published_at IS NOT NULL)
ON CONFLICT DO NOTHING;
-- Обновляем только штатное событие DATA и события, созданные этим наполнением.
UPDATE exam_events e SET starts_at='2027-01-11 09:00+03'::timestamptz + (d.n-1)*interval '3 days'
 + CASE WHEN d.n % 2=0 THEN interval '2 hours' ELSE interval '0' END,
 room=CASE WHEN d.n=5 THEN 'Онлайн' ELSE (210+d.n)::text END,building=CASE WHEN d.n=5 THEN NULL WHEN d.n % 2=0 THEN 'корпус Б' ELSE 'корпус А' END,
 format=CASE WHEN d.n=5 THEN 'remote' ELSE 'in_person' END
FROM demo_a_study d WHERE e.discipline_id=d.discipline_id AND
 (e.id=pg_temp.demo_uuid('demo-a-session:'||d.discipline_id) OR e.id='20000000-0000-4000-8000-050000000100');

INSERT INTO exam_events(id,discipline_id,kind,starts_at,room,building,published_at)
SELECT pg_temp.demo_uuid('demo-a-consultation:'||discipline_id),discipline_id,'consultation',
 '2027-01-10 14:00+03'::timestamptz+(n-1)*interval '3 days',(210+n)::text,'корпус А','2026-11-17 09:00+03'
FROM demo_a_study WHERE n IN (1,3,6) ON CONFLICT DO NOTHING;
INSERT INTO exam_teachers(exam_id,teacher_id)
SELECT e.id,'20000000-0000-4000-8000-990000000001' FROM demo_a_study d JOIN exam_events e ON e.discipline_id=d.discipline_id
WHERE e.id IN (pg_temp.demo_uuid('demo-a-session:'||d.discipline_id),pg_temp.demo_uuid('demo-a-consultation:'||d.discipline_id),'20000000-0000-4000-8000-050000000100')
ON CONFLICT DO NOTHING;
INSERT INTO exam_admissions(exam_id,student_id,status,reason)
SELECT e.id,d.student_id,CASE WHEN d.n IN (1,4,6) THEN 'admitted' WHEN d.n=3 THEN 'action_required' ELSE 'pending' END,
 CASE WHEN d.n=3 THEN 'Сдать контрольную' ELSE NULL END
FROM demo_a_study d JOIN exam_events e ON e.discipline_id=d.discipline_id
WHERE e.published_at IS NOT NULL AND e.kind<>'consultation' AND
 (e.id=pg_temp.demo_uuid('demo-a-session:'||d.discipline_id) OR e.id='20000000-0000-4000-8000-050000000100')
ON CONFLICT(exam_id,student_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason
WHERE exam_admissions.status='pending' AND exam_admissions.reason IS NULL;
-- Оба профиля получают личные опубликованные работы и сроки из своих дисциплин.
CREATE TEMP TABLE demo_profiles_study ON COMMIT DROP AS
SELECT p.id AS plan_id, p.student_id, d.id AS discipline_id, d.assessment,
       s.account_id, row_number() OVER (PARTITION BY s.id ORDER BY d.code) AS n
FROM study_plan_items p JOIN students s ON s.id=p.student_id
JOIN disciplines d ON d.id=p.discipline_id JOIN semesters se ON se.id=d.semester_id
WHERE s.account_id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
  AND se.is_current AND d.group_id=s.group_id;

INSERT INTO discipline_teachers(discipline_id,teacher_id)
SELECT discipline_id,'20000000-0000-4000-8000-990000000001' FROM demo_profiles_study ON CONFLICT DO NOTHING;

-- У B своя выполненная работа; открытая работа есть у каждого профиля.
INSERT INTO assignments(id,discipline_id,teacher_id,student_id,kind,number,title,description,actions,requirements,issued_at,published_at,max_score)
SELECT pg_temp.demo_uuid('demo-profile-work:'||d.discipline_id||':'||w.n), d.discipline_id,
 '20000000-0000-4000-8000-990000000001', d.student_id, w.kind, w.n, w.title, w.title,
 'Подготовьте решение учебного задания и обоснуйте выводы.', 'Представьте решение преподавателю.',
 '2026-10-01 09:00+03','2026-10-01 09:00+03', w.maximum
FROM demo_profiles_study d CROSS JOIN (VALUES (1,'dz','Учебное задание',30),(2,'rk','Рубежный контроль',40)) w(n,kind,title,maximum)
WHERE w.n=2 OR d.account_id='10000000-0000-4000-8000-000000000002'
ON CONFLICT DO NOTHING;

INSERT INTO student_assignment_results(student_id,assignment_id,stage,score,completed_at,defended_at,published_at)
SELECT student_id,pg_temp.demo_uuid('demo-profile-work:'||discipline_id||':1'),'defended',
 20+n,'2026-11-10 12:00+03','2026-11-12 12:00+03','2026-11-12 12:00+03'
FROM demo_profiles_study WHERE account_id='10000000-0000-4000-8000-000000000002'
ON CONFLICT DO NOTHING;

INSERT INTO deadlines(id,assignment_id,student_id,title,due_at,required,published_at)
SELECT pg_temp.demo_uuid('demo-profile-deadline:'||discipline_id),
 pg_temp.demo_uuid('demo-profile-work:'||discipline_id||':2'),student_id,'Рубежный контроль',
 '2026-11-23 18:00+03'::timestamptz + (n-1)*interval '3 days',true,'2026-10-01 09:00+03'
FROM demo_profiles_study ON CONFLICT DO NOTHING;

INSERT INTO study_score_breakdowns(plan_item_id,semester_score,semester_max,exam_score,exam_max,published_at)
SELECT plan_id,20+n,CASE WHEN assessment='exam' THEN 70 ELSE 100 END,NULL,
 CASE WHEN assessment='exam' THEN 30 ELSE NULL END,'2026-11-12 12:00+03'
FROM demo_profiles_study WHERE account_id='10000000-0000-4000-8000-000000000002'
ON CONFLICT DO NOTHING;

INSERT INTO grades(id,plan_item_id,kind,label,value,scale,published_at)
SELECT pg_temp.demo_uuid('demo-profile-grade:'||discipline_id),plan_id,'current','Баллы за учебную работу',
 20+n,'hundred','2026-11-12 12:00+03' FROM demo_profiles_study
ON CONFLICT DO NOTHING;

-- Дополнительные типы занятий в доступной неделе; ID стабильны при повторном запуске.
INSERT INTO lessons(id,discipline_id,original_starts_at)
SELECT pg_temp.demo_uuid('demo-profile-lesson:'||discipline_id||':'||slot.n),discipline_id,
 CASE slot.n WHEN 1 THEN '2026-11-23 10:40+03'::timestamptz
   WHEN 2 THEN '2026-11-25 12:00+03'::timestamptz ELSE '2026-11-27 13:50+03'::timestamptz END
FROM demo_profiles_study CROSS JOIN (VALUES (1),(2),(3)) slot(n)
WHERE demo_profiles_study.n=1 ON CONFLICT(id) DO UPDATE SET original_starts_at=EXCLUDED.original_starts_at;
INSERT INTO lesson_revisions(lesson_id,version,starts_at,ends_at,room,building,teacher_name,kind,status,published_at)
SELECT pg_temp.demo_uuid('demo-profile-lesson:'||discipline_id||':'||slot.n),1,
 CASE slot.n WHEN 1 THEN '2026-11-23 10:40+03'::timestamptz
   WHEN 2 THEN '2026-11-25 12:00+03'::timestamptz ELSE '2026-11-27 13:50+03'::timestamptz END,
 CASE slot.n WHEN 1 THEN '2026-11-23 12:15+03'::timestamptz
   WHEN 2 THEN '2026-11-25 13:35+03'::timestamptz ELSE '2026-11-27 15:25+03'::timestamptz END,
 '210','корпус А','Нина Учебная',slot.kind::lesson_kind,'planned','2026-11-10 08:00+03'
FROM demo_profiles_study CROSS JOIN (VALUES (1,'lecture'),(2,'practice'),(3,'laboratory')) slot(n,kind)
WHERE demo_profiles_study.n=1 ON CONFLICT DO NOTHING;
INSERT INTO lesson_revisions(lesson_id,version,starts_at,ends_at,room,building,teacher_name,kind,status,published_at)
SELECT pg_temp.demo_uuid('demo-profile-lesson:'||discipline_id||':'||slot.n),2,
 CASE slot.n WHEN 1 THEN '2026-11-23 10:40+03'::timestamptz
   WHEN 2 THEN '2026-11-25 12:00+03'::timestamptz ELSE '2026-11-27 13:50+03'::timestamptz END,
 CASE slot.n WHEN 1 THEN '2026-11-23 12:15+03'::timestamptz
   WHEN 2 THEN '2026-11-25 13:35+03'::timestamptz ELSE '2026-11-27 15:25+03'::timestamptz END,
 '210','корпус А','Нина Учебная',slot.kind::lesson_kind,'planned','2026-11-22 09:00+03'
FROM demo_profiles_study CROSS JOIN (VALUES (1,'lecture'),(2,'practice'),(3,'laboratory')) slot(n,kind)
WHERE demo_profiles_study.n=1 ON CONFLICT DO NOTHING;

-- Отметки относятся только к опубликованным прошедшим занятиям своей группы.
INSERT INTO lesson_attendance(student_id,lesson_id,status,published_at)
SELECT d.student_id,l.id,CASE WHEN d.n % 4=0 THEN 'absent' ELSE 'present' END,'2026-11-21 20:00+03'
FROM demo_profiles_study d JOIN lessons l ON l.discipline_id=d.discipline_id
WHERE l.original_starts_at < '2026-11-21 00:00+03'
 AND EXISTS (SELECT 1 FROM lesson_revisions r WHERE r.lesson_id=l.id AND r.published_at <= '2026-11-21 20:00+03' AND r.status <> 'cancelled')
ON CONFLICT DO NOTHING;
COMMIT;
