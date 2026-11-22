import { Pool } from "pg";

const slots = [
  ["71000000-0000-4000-8000-000000000001", "2026-11-10", "10:00", "11:30"],
  ["71000000-0000-4000-8000-000000000002", "2026-11-12", "10:00", "11:30"],
  ["71000000-0000-4000-8000-000000000003", "2027-03-22", "10:00", "11:30"],
  ["71000000-0000-4000-8000-000000000004", "2027-03-23", "14:30", "16:00"],
] as const;
const examples = [
  { marker: "DEMO-1", account: "10000000-0000-4000-8000-000000000001", slot: slots[0][0], decision: "admitted",
    physical: 76, academic: 89, exercises: { pullUps: 13, sprintSeconds: 13.6, distanceSeconds: 248 } },
  { marker: "DEMO-2", account: "10000000-0000-4000-8000-000000000002", slot: slots[1][0], decision: "not_admitted",
    physical: 51, academic: 71, exercises: { pullUps: 8, sprintSeconds: 15.1, distanceSeconds: 291 } },
] as const;

async function seed() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112032)");
    for (const [id, date, start, end] of slots) {
      await client.query(`INSERT INTO vuc_test_slots(id,starts_at,ends_at,place)
        VALUES($1,$2,$3,'Корпус «Маяк» · спортивный зал') ON CONFLICT DO NOTHING`,
        [id, date + "T" + start + ":00+03:00", date + "T" + end + ":00+03:00"]);
    }
    for (const example of examples) {
      await client.query(`
        INSERT INTO vuc_applications(student_id,submitted_at,slot_id,booked_at,physical_score,academic_score,
          exercises,results_published_at,decision,decided_at)
        SELECT id,'2026-11-01 10:30+03',$3,'2026-11-02 10:30+03',$4,$5,$6,'2026-11-13 09:30+03',$7,'2026-11-14 09:30+03'
        FROM students WHERE account_id=$1 AND student_number=$2 ON CONFLICT DO NOTHING
      `, [example.account, example.marker, example.slot, example.physical, example.academic, example.exercises, example.decision]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => { console.error("VUC demo seed failed"); process.exitCode = 1; });
