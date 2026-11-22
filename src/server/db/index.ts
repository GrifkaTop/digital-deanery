import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
const globalDb = globalThis as unknown as { pool?: Pool };
export function getPool() {
 if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
 if (!globalDb.pool) {
  globalDb.pool = new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:3000,statement_timeout:3000});
  globalDb.pool.on("error", () => { console.error("Idle database connection failed"); });
 }
 return globalDb.pool;
}
export function getDb() { return drizzle(getPool()); }
