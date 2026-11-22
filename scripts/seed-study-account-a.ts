import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await pool.query(await readFile("scripts/seed-study-account-a.sql", "utf8"));
    console.log("Synthetic study data for profiles A and B ready");
  } finally {
    await pool.end();
  }
}
main().catch(() => { console.error("Study seed for profiles A and B failed"); process.exitCode = 1; });
