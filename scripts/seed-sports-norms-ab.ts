import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString });
  try {
    await pool.query(await readFile("scripts/seed-sports-norms-ab.sql", "utf8"));
  } finally {
    await pool.end();
  }
}

main().catch(() => { console.error("Sports norms seed failed"); process.exitCode = 1; });
