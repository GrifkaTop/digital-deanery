import { createHash } from "node:crypto";
import { Pool } from "pg";

const weeks = [
  { monday: "2026-11-23", parity: "numerator" },
  { monday: "2026-11-30", parity: "denominator" },
] as const;
const slots = [
  ["08:30", "10:05"], ["10:15", "11:50"], ["12:00", "13:35"],
  ["13:50", "15:25"], ["15:40", "17:15"], ["17:25", "19:00"],
] as const;
const teachers = ["Лира Маячная", "Нина Учебная", "Мирон Орбитный", "Арина Макетова", "Ян Тихонов", "Ева Светлова"];
const common = [
  [1, 0, 0, "lecture"], [1, 2, 2, "seminar"], [2, 1, 1, "practice"],
  [3, 0, 3, "lecture"], [3, 3, 4, "laboratory"], [4, 1, 2, "practice"],
  [5, 2, 5, "seminar"], [6, 0, 1, "laboratory"],
] as const;
const numerator = [[1, 1, 3, "laboratory"], [2, 3, 4, "seminar"], [4, 2, 0, "lecture"], [5, 1, 5, "practice"]] as const;
const denominator = [[1, 3, 5, "practice"], [2, 2, 3, "lecture"], [4, 3, 1, "laboratory"], [5, 1, 2, "seminar"]] as const;
const stableId = (input: string) => {
  const h = createHash("md5").update("atlas-parity:" + input).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};
function dateOffset(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(8112044)");
    for (const account of [1, 2]) {
      const { rows: [student] } = await c.query<{ id: string; group_id: string }>(
        "SELECT id, group_id FROM students WHERE account_id=$1", [`10000000-0000-4000-8000-00000000000${account}`]);
      if (!student) continue;
      const { rows: subjects } = await c.query<{ id: string; title: string }>(
        `SELECT d.id,d.title FROM disciplines d JOIN semesters s ON s.id=d.semester_id
         WHERE d.group_id=$1 AND s.is_current ORDER BY d.code,d.id`, [student.group_id]);
      if (subjects.length < 5) throw new Error(`Expected published synthetic disciplines for profile ${account}`);
      const old = await c.query<{ id: string; version: number; starts_at: Date; ends_at: Date; room: string; building: string | null; teacher_name: string; kind: string }>(
        `SELECT l.id,r.version,r.starts_at,r.ends_at,r.room,r.building,r.teacher_name,r.kind
         FROM lessons l JOIN disciplines d ON d.id=l.discipline_id
         JOIN lesson_revisions r ON r.lesson_id=l.id AND r.version=(SELECT max(x.version) FROM lesson_revisions x WHERE x.lesson_id=l.id)
         WHERE d.group_id=$1 AND l.original_starts_at >= '2026-11-23 00:00+03' AND l.original_starts_at < '2026-12-07 00:00+03'
           AND r.status='planned'`, [student.group_id]);
      for (const item of old.rows) {
        await c.query(`INSERT INTO lesson_revisions(lesson_id,version,starts_at,ends_at,room,building,teacher_name,kind,status,reason,published_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'cancelled','Обновлено синтетическое расписание: пара перенесена в другой день или слот.','2026-11-22 12:00+03')
          ON CONFLICT DO NOTHING`, [item.id,item.version+1,item.starts_at,item.ends_at,item.room,item.building,item.teacher_name,item.kind]);
      }
      for (const week of weeks) {
        const rows = [...common, ...(week.parity === "numerator" ? numerator : denominator)];
        for (const [weekday, slot, subjectIndex, kind] of rows) {
          const day = dateOffset(week.monday, weekday - 1);
          const [start, end] = slots[slot];
          const lessonId = stableId(`${account}:${day}:${slot}`);
          const subject = subjects[subjectIndex % subjects.length];
          await c.query("INSERT INTO lessons(id,discipline_id,original_starts_at) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
            [lessonId, subject.id, `${day} ${start}+03`]);
          await c.query(`INSERT INTO lesson_revisions(lesson_id,version,starts_at,ends_at,room,building,teacher_name,kind,status,published_at)
            VALUES($1,1,$2,$3,$4,'учебный корпус',$5,$6,'planned','2026-11-22 12:00+03') ON CONFLICT DO NOTHING`,
            [lessonId, `${day} ${start}+03`, `${day} ${end}+03`, String(210 + slot * 3 + weekday), teachers[(subjectIndex + account) % teachers.length], kind]);
        }
      }
    }
    await c.query("COMMIT");
  } catch (error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); await pool.end(); }
}
main().catch(() => { console.error("Parity schedule seed failed"); process.exitCode = 1; });
