import { Pool } from "pg";

async function seed() {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112027)");
    await client.query(`INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,place,capacity,booking_open) VALUES
      ('c0000000-0000-4000-8000-000000000001','class','Общая физическая подготовка','2026-11-26 15:00+03','2026-11-26 16:00+03','Спортивный зал',20,true),
      ('c0000000-0000-4000-8000-000000000002','pool','Плавание','2026-11-27 15:00+03','2026-11-27 16:00+03','Бассейн',12,true)
      ON CONFLICT (id) DO NOTHING`);
    await client.query(`INSERT INTO teachers(id,full_name) VALUES
      ('d0000000-0000-4000-8000-000000000001','Лира Маячная'),
      ('d0000000-0000-4000-8000-000000000002','Мирон Орбитный'),
      ('d0000000-0000-4000-8000-000000000003','Арина Макетова') ON CONFLICT (id) DO NOTHING`);
    await client.query(`INSERT INTO lesson_teachers(lesson_id,version,teacher_id)
      SELECT r.lesson_id,r.version,t.id FROM lesson_revisions r JOIN teachers t ON t.full_name=r.teacher_name
      WHERE t.id IN ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000003') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO discipline_teachers(discipline_id,teacher_id)
      SELECT DISTINCT l.discipline_id,lt.teacher_id FROM lessons l JOIN lesson_teachers lt ON lt.lesson_id=l.id ON CONFLICT DO NOTHING`);
    for (const [group, assignmentId, deadlineId, teacherId] of [
      ["Маяк-21", "e0000000-0000-4000-8000-000000000001", "f0000000-0000-4000-8000-000000000001", "d0000000-0000-4000-8000-000000000001"],
      ["Орбита-11", "e0000000-0000-4000-8000-000000000002", "f0000000-0000-4000-8000-000000000002", "d0000000-0000-4000-8000-000000000002"],
    ]) {
      const { rows: [discipline] } = await client.query(`SELECT d.id,d.group_id FROM disciplines d JOIN groups g ON g.id=d.group_id
        WHERE g.code=$1 AND EXISTS (SELECT FROM lessons l WHERE l.discipline_id=d.id) ORDER BY d.id LIMIT 1`, [group]);
      if (!discipline) continue;
      await client.query(`INSERT INTO assignments(id,discipline_id,teacher_id,group_id,kind,number,title,description,actions,requirements,issued_at,published_at,max_score)
        VALUES($1,$2,$3,$4,'dz',1,'Практическое задание','Учебное задание по дисциплине.','Подготовить краткое решение.','Представить решение преподавателю.',
          '2026-11-17 09:00+03','2026-11-17 09:00+03',10) ON CONFLICT (id) DO NOTHING`, [assignmentId, discipline.id, teacherId, discipline.group_id]);
      await client.query(`INSERT INTO deadlines(id,group_id,assignment_id,title,due_at,required,published_at)
        VALUES($1,$2,$3,'Сдать практическое задание','2026-11-27 18:00+03',true,'2026-11-17 09:00+03') ON CONFLICT DO NOTHING`, [deadlineId, discipline.group_id, assignmentId]);
      await client.query(`INSERT INTO lesson_assignments(lesson_id,assignment_id) SELECT id,$2 FROM lessons WHERE discipline_id=$1 ORDER BY original_starts_at,id LIMIT 1 ON CONFLICT DO NOTHING`, [discipline.id, assignmentId]);
      await client.query(`INSERT INTO student_assignment_results(student_id,assignment_id,stage,score,completed_at,published_at)
        SELECT st.id,$2,CASE WHEN $3='Маяк-21' THEN 'completed' ELSE 'issued' END,
          CASE WHEN $3='Маяк-21' THEN 8 ELSE NULL END,
          CASE WHEN $3='Маяк-21' THEN '2026-11-20 10:00+03'::timestamptz ELSE NULL END,'2026-11-20 11:00+03'
        FROM students st WHERE st.group_id=$1 ON CONFLICT DO NOTHING`, [discipline.group_id, assignmentId, group]);
      await client.query(`INSERT INTO schedule_rules(id,discipline_id,weekday,starts_on,ends_on,start_minutes,end_minutes,recurrence)
        VALUES ($1,$2,2,'2026-09-01','2026-12-31',600,690,'weekly') ON CONFLICT (id) DO NOTHING`,
        [group === "Маяк-21" ? "a1000000-0000-4000-8000-000000000001" : "a1000000-0000-4000-8000-000000000002", discipline.id]);
    }
    await client.query(`INSERT INTO health_passports(student_id,valid_until,admitted)
      SELECT id,'2027-06-30',true FROM students WHERE full_name LIKE 'Студент %' ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO exam_admissions(exam_id,student_id,status,reason)
      SELECT e.id,p.student_id,CASE WHEN g.code='Маяк-21' THEN 'admitted' ELSE 'pending' END,NULL
      FROM exam_events e JOIN study_plan_items p ON p.discipline_id=e.discipline_id JOIN students st ON st.id=p.student_id
      JOIN groups g ON g.id=st.group_id ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO sports_semester_results(semester_id,student_id,score,result)
      SELECT se.id,st.id,8,'Зачёт ожидается' FROM students st CROSS JOIN semesters se WHERE se.is_current
      AND st.full_name LIKE 'Студент %' ON CONFLICT DO NOTHING`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); await pool.end(); }
}
seed().catch(() => { console.error("Interface seed failed"); process.exitCode = 1; });
