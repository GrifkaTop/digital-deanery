import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { cleanGeneratedPage, documentKey, documentManifest, documentRevision, preparedDocument } from "../src/contracts/assistant-files";
import { dateInMoscow } from "../src/contracts/calendar";
import { extractDocumentPages, splitPage } from "./assistant-pdf";

const root = resolve(process.env.ASSISTANT_DOCUMENT_ROOT ?? "documents");
const versionDirectory = (id: string, revision: string) => join(root, "versions", id, revision);
const importFormat = "deanery-pdf-v2";

async function fingerprint(pdf: string, manifest: unknown, format: string) {
  const hash = createHash("sha256").update(format).update("\0").update(JSON.stringify(manifest)).update("\0");
  for await (const chunk of createReadStream(pdf)) hash.update(chunk);
  return hash.digest("hex");
}

async function isPrepared(directory: string) {
  try {
    return (await stat(join(directory, "index.json"))).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function prepare(id: string) {
  const source = join(root, "inbox", id);
  const manifest = documentManifest.parse(JSON.parse(await readFile(join(source, "manifest.json"), "utf8")));
  const parent = join(root, "versions", id);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, ".stage-"));
  try {
    const pdf = join(stage, "original.pdf");
    await copyFile(join(source, "original.pdf"), pdf);
    const revision = await fingerprint(pdf, manifest, importFormat);
    const destination = versionDirectory(id, revision);
    if (!await isPrepared(destination)) {
      const pages = await extractDocumentPages(pdf, join(stage, "ocr"), manifest.ocr === "always");
      const fragments = pages.flatMap((text, offset) => splitPage(cleanGeneratedPage(text)).map((chunk) => ({ page: offset + 1, text: chunk })));
      if (!fragments.length) throw new Error("Текст не извлечён. Проверьте PDF и настройки OCR.");
      const index = preparedDocument.parse({ format: importFormat, manifest, fragments });
      const markdown = [`# ${manifest.title}`, `№ ${manifest.number} от ${manifest.issuedOn}`, ...pages.map((text, offset) =>
        `## Страница ${offset + 1}\n\n${text || "Текст не извлечён."}`)].join("\n\n");
      await writeFile(join(stage, "document.md"), markdown + "\n");
      await writeFile(join(stage, "index.json"), JSON.stringify(index, null, 2) + "\n");
      try {
        await rename(stage, destination);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code !== "EEXIST" && code !== "ENOTEMPTY") || !await isPrepared(destination)) throw error;
      }
    }
    console.log(`Подготовлено ${id} ${revision}`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function publish(pool: Pool, id: string, revision: string) {
  const directory = versionDirectory(id, revision);
  const { format, manifest, fragments } = preparedDocument.parse(JSON.parse(await readFile(join(directory, "index.json"), "utf8")));
  if (await fingerprint(join(directory, "original.pdf"), manifest, format) !== revision) {
    throw new Error("PDF или манифест изменились. Подготовьте новую версию из входной папки.");
  }
  if (manifest.issuedOn > dateInMoscow(new Date())) throw new Error("Дата утверждения ещё не наступила.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(`
      INSERT INTO assistant_publications (id, revision, title, number, issued_on, keywords, has_pdf)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision, title = EXCLUDED.title,
        number = EXCLUDED.number, issued_on = EXCLUDED.issued_on, keywords = EXCLUDED.keywords,
        has_pdf = EXCLUDED.has_pdf, published_at = now()
      WHERE assistant_publications.revision <> EXCLUDED.revision
    `, [id, revision, manifest.title, manifest.number, manifest.issuedOn, (manifest.keywords ?? []).join(" ")]);
    if (updated.rowCount) {
      await client.query("DELETE FROM assistant_scholarship_payments WHERE document_id = $1", [id]);
      await client.query("DELETE FROM assistant_fragments WHERE document_id = $1", [id]);
      const keywords = new Map((manifest.pageKeywords ?? []).map(({ page, keywords }) => [page, keywords.join(" ")]));
      await client.query(`
        INSERT INTO assistant_fragments (document_id, position, page, text, keywords)
        SELECT $1, (entry.ordinality)::integer, (entry.value->>'page')::integer, entry.value->>'text', entry.value->>'keywords'
        FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS entry(value, ordinality)
      `, [id, JSON.stringify(fragments.map((fragment) => ({ ...fragment, keywords: keywords.get(fragment.page) ?? "" })))]);
      if (manifest.payments) {
        await client.query(`
          INSERT INTO assistant_scholarship_payments (month, pay_on, document_id, fragment_position)
          SELECT (p.month || '-01')::date, p."payOn"::date, $1, min(f.position)
          FROM jsonb_to_recordset($2::jsonb) AS p(month text, "payOn" text, page integer)
          JOIN assistant_fragments f ON f.document_id = $1 AND f.page = p.page
          GROUP BY p.month, p."payOn"
          ORDER BY p.month
        `, [id, JSON.stringify(manifest.payments)]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { constraint?: string }).constraint === "assistant_scholarship_payments_pkey") {
      throw new Error("Один из месяцев уже опубликован другим приказом. Проверьте ID приказа и график.");
    }
    throw error;
  } finally {
    client.release();
  }
  console.log(`Опубликовано ${id} ${revision}`);
}

async function main() {
  const [command, rawId, rawRevision, ...extra] = process.argv.slice(2);
  if (command === "prepare" && !rawRevision) {
    if (rawId) return prepare(documentKey.parse(rawId));
    const entries = await readdir(join(root, "inbox"), { withFileTypes: true });
    const ids = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => documentKey.parse(entry.name)).sort();
    if (!ids.length) console.log("В папке inbox нет документов для подготовки.");
    for (const id of ids) await prepare(id);
    return;
  }
  if (extra.length || !rawId || !(command === "publish" || command === "withdraw")
    || (command === "publish") !== Boolean(rawRevision)) {
    throw new Error("Использование: prepare [id] | publish <id> <revision> | withdraw <id>");
  }
  const id = documentKey.parse(rawId);
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Задайте MIGRATION_DATABASE_URL.");
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    if (command === "publish") await publish(pool, id, documentRevision.parse(rawRevision));
    else {
      await pool.query("DELETE FROM assistant_publications WHERE id = $1", [id]);
      console.log(`Снято с публикации ${id}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Не удалось выполнить команду.");
  process.exitCode = 1;
});
