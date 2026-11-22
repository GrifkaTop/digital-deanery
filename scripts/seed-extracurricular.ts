import { Pool } from "pg";

async function seed() {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await pool.query(`INSERT INTO extracurricular_events (id, title, starts_on, ends_on)
      VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`, [
      "b0000000-0000-4000-8000-000000000001", "Фестиваль студенческих клубов", "2026-11-21", "2026-11-22",
      "b0000000-0000-4000-8000-000000000002", "Встреча волонтёрского сообщества", "2026-11-25", "2026-11-25",
    ]);
  } finally {
    await pool.end();
  }
}
seed().catch(() => { console.error("Extracurricular seed failed"); process.exitCode = 1; });
