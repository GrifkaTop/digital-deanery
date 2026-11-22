import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
async function main() {
 if (!process.env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL required");
 const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
 for(let i=1;i<journal.entries.length;i++) if(journal.entries[i].when<=journal.entries[i-1].when) throw new Error("Migration timestamps must increase");
 const pool = new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 try { await migrate(drizzle(pool),{migrationsFolder:"./drizzle"}); } finally { await pool.end(); }
}
main().catch(()=>{console.error("Migration failed; check database configuration and SQL");process.exitCode=1;});
