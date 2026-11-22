import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const profile3 = "10000000-0000-4000-8000-000000000003";
const kinds = { sprint: ["Бег на 100 м", "с", "lower"], jump: ["Прыжок в длину с места", "см", "higher"],
  pushups: ["Отжимания", "повт.", "higher"], bend: ["Наклон вперёд", "см", "higher"] } as const;
const terms = [
  { starts: "2025-09-01", sample: "2025-11", points: 68, visits: 16,
    norms: [["sprint", 15.4, "passed"], ["jump", 178, "failed"], ["pushups", 16, "passed"]] },
  { starts: "2026-02-01", sample: "2026-05", points: 74, visits: 18,
    norms: [["sprint", 14.9, "passed"], ["jump", 192, "passed"], ["pushups", 17, "passed"]] },
  { starts: "2026-09-01", sample: "2026-10", points: 24, visits: 12,
    norms: [["sprint", 14.8, "passed"], ["jump", 185, "failed"], ["pushups", null, "unattempted"], ["bend", 8, "passed"]] },
] as const;
const sessions = [
  ["yoga", "class", "Йога", "2026-11-23", "18:00", "19:00", "Марина Белова", "Зал движения", 16],
  ["volley", "class", "Волейбол", "2026-11-25", "17:00", "18:30", "Илья Соколов", "Игровой зал", 20],
  ["training", "makeup", "Общая физическая подготовка", "2026-11-27", "16:00", "17:00", "Анна Орлова", "Спортивный зал", 15],
  ["swim", "pool", "Свободное плавание", "2026-11-28", "10:00", "11:00", "Дмитрий Лебедев", "Бассейн · дорожки 1–3", 0],
  ["swim2", "pool", "Свободное плавание", "2026-11-28", "11:00", "12:00", "Дмитрий Лебедев", "Бассейн · дорожки 1–3", 12],
] as const;

function id(value: string) {
  const hex = createHash("sha256").update("atlas:sports:" + value).digest("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), "4" + hex.slice(13, 16), "8" + hex.slice(17, 20), hex.slice(20, 32)].join("-");
}

async function seedActor(client: PoolClient, studentId: string) {
  await client.query(`INSERT INTO health_passports(student_id,valid_until,admitted,medical_group)
    VALUES($1,'2026-11-25',true,'Основная') ON CONFLICT DO NOTHING`, [studentId]);
  let priorAutumn: string | null = null;
  for (const term of terms) {
    const { rows: [semester] } = await client.query<{ id: string }>(`
      SELECT id FROM semesters WHERE starts_on=$1 ORDER BY is_current DESC,
        (label LIKE 'Учебный план%') ASC, id LIMIT 1`, [term.starts]);
    if (!semester) continue;
    await client.query(`INSERT INTO sports_semester_results(semester_id,student_id,score,target_attendance,minimum_points,prior_semester_id)
      VALUES($1,$2,$3,16,60,$4)
      ON CONFLICT(semester_id,student_id) DO UPDATE SET score=EXCLUDED.score,target_attendance=EXCLUDED.target_attendance,
        minimum_points=EXCLUDED.minimum_points,prior_semester_id=EXCLUDED.prior_semester_id`,
      [semester.id, studentId, term.points, term.starts === "2026-09-01" ? priorAutumn : null]);
    if (term.starts === "2025-09-01") priorAutumn = semester.id;
    for (const [position, [code, result, status]] of term.norms.entries()) {
      const [title, unit, direction] = kinds[code];
      await client.query(`INSERT INTO sports_norm_results (semester_id,student_id,code,title,unit,direction,result,status,position)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [semester.id, studentId, code, title, unit, direction, result, status, position]);
    }
    for (let day = 1; day <= term.visits; day++) {
      const session = id("history:" + term.sample + ":" + day);
      const date = term.sample + "-" + String(day).padStart(2, "0");
      await client.query(`INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,place,capacity,booking_open)
        VALUES($1,'class','Учебное занятие по физкультуре',$2,$3,'Спортивный зал',16,false) ON CONFLICT DO NOTHING`,
        [session, date + " 15:00+03", date + " 16:00+03"]);
      await client.query(`INSERT INTO sports_attendance(session_id,student_id,attended)
        VALUES($1,$2,true) ON CONFLICT DO NOTHING`, [session, studentId]);
    }
  }
  for (const [key, kind, title, date, starts, ends, teacher, place, capacity] of sessions) {
    const teacherId = id("teacher:" + teacher);
    await client.query("INSERT INTO teachers(id,full_name) VALUES($1,$2) ON CONFLICT DO NOTHING", [teacherId, teacher]);
    await client.query(`INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,teacher_id,place,capacity,booking_open)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING`,
      [id(key), kind, title, date + " " + starts + "+03", date + " " + ends + "+03", teacherId, place, capacity]);
  }
  await client.query(`INSERT INTO sports_bookings(session_id,student_id,status,updated_at)
    VALUES($1,$2,'active','2026-11-17 10:00+03') ON CONFLICT DO NOTHING`, [id("yoga"), studentId]);
}

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112031)");
    const { rows: [student] } = await client.query<{ id: string }>("SELECT id FROM students WHERE account_id=$1", [profile3]);
    if (student) await seedActor(client, student.id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => { console.error("Atlas sports seed failed"); process.exitCode = 1; });
