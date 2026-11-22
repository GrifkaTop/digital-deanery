import { Pool } from "pg";
import { clinicAfkSample } from "../src/contracts/clinic";

const doctors = [
  ["Маяк-21", "Анна Соколова", "Корпус «Клён» · кабинет 101",
    [["2026-11-18", "10:00", "10:20"], ["2026-11-23", "09:30", "09:50"], ["2026-11-24", "12:00", "12:20"]]],
  ["Орбита-11", "Илья Ветров", "Корпус «Клён» · кабинет 108",
    [["2026-11-24", "10:00", "10:20"], ["2026-11-25", "14:00", "14:20"]]],
  ["ИС-31", "Мария Клёнова", "Корпус «Клён» · кабинет 114",
    [["2026-11-23", "11:00", "11:20"], ["2026-11-23", "14:00", "14:20"], ["2026-11-24", "10:30", "10:50"], ["2026-11-25", "15:50", "16:10"]]],
] as const;

const id = (index: number) => "72000000-0000-4000-8000-" + String(index).padStart(12, "0");
const time = (date: string, hm: string) => date + "T" + hm + ":00+03:00";

async function seed() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112033)");
    for (const [index, [group, name, place, slots]] of doctors.entries()) {
      const doctorId = id(index + 1);
      const row = await client.query(`INSERT INTO clinic_doctors(id,faculty,name,place)
        SELECT $1,faculty,$2,$3 FROM groups WHERE code=$4 ON CONFLICT DO NOTHING`, [doctorId, name, place, group]);
      if (row.rowCount === 0 && !(await client.query("SELECT FROM clinic_doctors WHERE id=$1", [doctorId])).rowCount) continue;
      for (const [number, [date, start, end]] of slots.entries()) {
        await client.query(`INSERT INTO clinic_slots(id,doctor_id,starts_at,ends_at)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id(100 * (index + 1) + number), doctorId, time(date, start), time(date, end)]);
      }
    }

    const ownerFilter = "s.account_id=$1::uuid AND s.student_number=$2";
    const first = ["10000000-0000-4000-8000-000000000001", "DEMO-1"] as const;
    const second = ["10000000-0000-4000-8000-000000000002", "DEMO-2"] as const;
    await client.query(`INSERT INTO clinic_appointments(student_id,slot_id,booked_at,completed_at,passport_updated_at)
      SELECT s.id,$3,'2026-11-16 10:00+03','2026-11-18 10:20+03','2026-11-18 10:25+03'
      FROM students s JOIN health_passports p ON p.student_id=s.id WHERE ${ownerFilter} ON CONFLICT DO NOTHING`, [...first, id(100)]);
    await client.query(`INSERT INTO clinic_afk_requests(student_id,submitted_at,document_key,status,starts_on,ends_on,published_at)
      SELECT s.id,'2026-11-18 10:00+03',$3,'approved','2026-11-23','2026-12-11','2026-11-20 10:00+03'
      FROM students s WHERE ${ownerFilter} ON CONFLICT DO NOTHING`, [...first, clinicAfkSample.key]);
    await client.query(`INSERT INTO clinic_afk_requests(student_id,submitted_at,document_key,status,published_at)
      SELECT s.id,'2026-11-18 11:00+03',$3,'declined','2026-11-20 11:00+03'
      FROM students s WHERE ${ownerFilter} ON CONFLICT DO NOTHING`, [...second, clinicAfkSample.key]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); await pool.end(); }
}

seed().catch(() => { console.error("Clinic demo seed failed"); process.exitCode = 1; });
