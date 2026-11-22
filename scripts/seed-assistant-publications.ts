import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { academicCalendarDocumentId, scholarshipPolicyDocumentId } from "../src/contracts/assistant-files";
import { sourceDocument, sourceManifest } from "../src/contracts/document-source";

async function seed() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("Database required");
  const ids = [scholarshipPolicyDocumentId, academicCalendarDocumentId];
  const sources = await Promise.all(ids.map(async (id) => {
    const raw = await readFile(join("documents", "sources", `${id}.json`), "utf8");
    const source = sourceDocument.parse(JSON.parse(raw));
    if (source.id !== id) throw new Error("Publication source ID mismatch");
    return source;
  }));
  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const source of sources) {
        const { manifest } = sourceManifest(source);
        const revision = createHash("sha256").update("deanery-source-v1\0").update(JSON.stringify(source)).digest("hex");
        const publication = await client.query(`
          INSERT INTO assistant_publications(id, revision, title, number, issued_on, keywords, has_pdf)
          VALUES ($1, $2, $3, $4, $5, $6, false)
          ON CONFLICT (id) DO NOTHING
        `, [source.id, revision, source.title, source.number, source.issuedOn, source.keywords.join(" ")]);
        if (!publication.rowCount) continue;
        const fragments = source.sections.map(({ text }, index) => ({
          position: index + 1, text, keywords: manifest.pageKeywords?.[index]?.keywords.join(" ") ?? "",
        }));
        await client.query(`
          INSERT INTO assistant_fragments(document_id, position, page, text, keywords)
          SELECT $1, f.position, f.position, f.text, f.keywords
          FROM jsonb_to_recordset($2::jsonb) AS f(position integer, text text, keywords text)
        `, [source.id, JSON.stringify(fragments)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

seed().catch(() => {
  console.error("Assistant publications seed failed");
  process.exitCode = 1;
});
