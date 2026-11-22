import { Pool, type PoolClient } from "pg";
import { createHash } from "node:crypto";
import { campusEvents, homeNews } from "../src/components/prototype/home-content";
const id = (key: string) => { const h=createHash('sha256').update('atlas:'+key).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };

async function seedSportsHistory(client: PoolClient) {
  const semesterId = id("sports-semester-2025");
  const archived = id("sports-archive-2025");
  const attended = id("sports-attended-2026");
  const absent = id("sports-absent-2026");
  const studentA = "10000000-0000-4000-8000-000000000001";
  const studentB = "10000000-0000-4000-8000-000000000002";
  await client.query(`INSERT INTO semesters(id,label,starts_on,ends_on,is_current)
    VALUES($1,'Осенний семестр 2025/26','2025-09-01','2025-12-28',false) ON CONFLICT DO NOTHING`, [semesterId]);
  await client.query(`INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,place,capacity,booking_open) VALUES
    ($1,'class','Архивная тренировка','2025-11-13 15:00+03','2025-11-13 16:00+03','Учебный зал',20,false),
    ($2,'class','Тренировка по общей подготовке','2026-11-10 15:00+03','2026-11-10 16:00+03','Учебный зал',20,false),
    ($3,'makeup','Отработка по физкультуре','2026-11-12 15:00+03','2026-11-12 16:00+03','Учебный зал',20,false)
    ON CONFLICT DO NOTHING`, [archived, attended, absent]);
  await client.query(`INSERT INTO sports_semester_results(semester_id,student_id,score,target_attendance)
    SELECT se.id, st.id, 8, 20 FROM students st CROSS JOIN semesters se
    WHERE st.account_id=$2 AND se.id=$1 ON CONFLICT DO NOTHING`, [semesterId, studentA]);
  await client.query(`INSERT INTO sports_attendance(session_id,student_id,attended)
    SELECT marks.session_id, st.id, marks.attended
    FROM (VALUES ($1::uuid,$4::uuid,true),($2::uuid,$4::uuid,true),($3::uuid,$4::uuid,false),($2::uuid,$5::uuid,false))
      AS marks(session_id,account_id,attended)
    JOIN students st ON st.account_id=marks.account_id
    ON CONFLICT DO NOTHING`, [archived, attended, absent, studentA, studentB]);
}

async function main() {
 if(!process.env.MIGRATION_DATABASE_URL) throw new Error('Database required');
 const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}); const c=await pool.connect();
 try {
 await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(8112028)');
 for(const e of campusEvents) {
 const time=/^(\d{2}:\d{2})/.exec(e.time)?.[1] ?? '16:00';
 const start=new Date(`${e.date}T${time}:00+03:00`); const end=new Date(`${e.endDate ?? e.date}T${time}:00+03:00`);end.setTime(end.getTime()+90*60000);
 await c.query(`INSERT INTO extracurricular_events(id,title,starts_on,ends_on,kind,place,starts_at,ends_at,summary,body,participation,cover,status,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'published','2026-11-01 09:00+03') ON CONFLICT DO NOTHING`,[id(e.id),e.title,e.date,e.endDate??e.date,e.kind,e.place,start,end,e.summary,e.sections.map(s=>s.heading+'\n'+s.paragraphs.join('\n\n')).join('\n\n'),e.sections.find(s=>/попасть|участ|вход/i.test(s.heading))?.paragraphs.join('\n') ?? 'Участие свободное. Все мероприятия синтетические.',e.cover?JSON.stringify(e.cover):null]);
 }
 for(const n of homeNews) await c.query(`INSERT INTO news_posts(id,title,summary,body,category,pinned,status,published_at,author,event_id) VALUES($1,$2,$3,$4,'Кампус',$5,'published',$6,'Редакция учебного кампуса',$7) ON CONFLICT DO NOTHING`,[id('news:'+n.id),n.title,n.summary,n.sections.map(s=>s.heading+'\n'+s.paragraphs.join('\n\n')).join('\n\n'),n.pinned??false,`${n.date}T09:00:00+03:00`,n.action?.href.startsWith('#events/')?id(n.action.href.slice(8)):null]);
 await c.query(`UPDATE extracurricular_events SET status='published',published_at='2026-11-01 09:00+03', summary='Синтетическое событие учебного кампуса',body='Встреча участников студенческого сообщества.',participation='Вход свободный.' WHERE id IN ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002') AND published_at IS NULL`);
 await c.query(`UPDATE sports_sessions SET teacher_id='d0000000-0000-4000-8000-000000000001' WHERE id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002') AND teacher_id IS NULL`);
 await c.query(`UPDATE health_passports SET medical_group='Основная' WHERE medical_group IS NULL AND student_id IN (SELECT id FROM students WHERE full_name LIKE 'Студент %')`);
 await c.query(`UPDATE sports_semester_results SET target_attendance=20 WHERE target_attendance IS NULL AND student_id IN (SELECT id FROM students WHERE full_name LIKE 'Студент %')`);
 await seedSportsHistory(c);
 const ds=await c.query(`SELECT DISTINCT d.id FROM disciplines d JOIN assignments a ON a.discipline_id=d.id WHERE a.id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002')`);
 for(const d of ds.rows) {
 for(let i=1;i<=2;i++) await c.query(`INSERT INTO discipline_modules(id,discipline_id,title,position) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id(d.id+':'+i),d.id,i===1?'Основы дисциплины':'Практическое применение',i]);
 await c.query(`UPDATE assignments SET module_id=$1 WHERE discipline_id=$2 AND module_id IS NULL AND id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002')`,[id(d.id+':1'),d.id]);
 }
 await c.query(`INSERT INTO study_score_breakdowns(plan_item_id,semester_score,semester_max,exam_score,exam_max,published_at) SELECT p.id,CASE WHEN g.code='Маяк-21' THEN 0 ELSE NULL END,70,NULL,30,'2026-11-17 09:00+03' FROM study_plan_items p JOIN students st ON st.id=p.student_id JOIN groups g ON g.id=st.group_id JOIN disciplines d ON d.id=p.discipline_id WHERE d.assessment='exam' AND st.full_name LIKE 'Студент %' ON CONFLICT DO NOTHING`);
 await c.query(`INSERT INTO lesson_attendance(student_id,lesson_id,status,published_at) SELECT p.student_id,l.id,'present','2026-11-20 12:00+03' FROM study_plan_items p JOIN lessons l ON l.discipline_id=p.discipline_id JOIN students st ON st.id=p.student_id WHERE st.full_name LIKE 'Студент %' AND l.original_starts_at<'2026-11-20' ON CONFLICT DO NOTHING`);
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
}
main().catch(()=>{console.error('Atlas seed failed');process.exitCode=1;});
