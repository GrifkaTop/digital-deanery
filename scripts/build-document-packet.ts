import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import PDFDocument from "pdfkit";
import { assertSectionFits } from "./document-pdf-layout";
import { sourceDocument, sourceIds, sourceManifest, sourceQuestions, type SourceDocument } from "../src/contracts/document-source";
const sourceRoot = resolve("documents/sources");
const inboxRoot = resolve("documents/inbox");
const generatedRoot = resolve("documents/generated");
const fontPath = resolve(process.env.DOCUMENT_PDF_FONT ?? "assets/pdf/DejaVuSans.ttf");

async function loadSources() {
  sourceQuestions.parse(JSON.parse(await readFile(resolve("documents/questions.json"), "utf8")));
  const files = (await readdir(sourceRoot)).filter((file) => file.endsWith(".json")).sort();
  const rows: SourceDocument[] = [];
  for (const file of files) {
    const source = sourceDocument.parse(JSON.parse(await readFile(join(sourceRoot, file), "utf8")));
    if (`${source.id}.json` !== file) throw new Error(`${file}: имя файла должно совпадать с ID ${source.id}.`);
    const sections = new Set(source.sections.map(({ title }) => title));
    if (sections.size !== source.sections.length) throw new Error(`${source.id}: заголовки разделов должны быть уникальны.`);
    const months = source.payments?.map(({ month }) => month) ?? [];
    if (new Set(months).size !== months.length) throw new Error(`${source.id}: месяц выплаты указан повторно.`);
    rows.push(source);
  }
  if (rows.length !== sourceIds.length || rows.some((row) => !sourceIds.includes(row.id as typeof sourceIds[number])) || sourceIds.some((id) => !rows.some((row) => row.id === id))) {
    throw new Error("Набор исходников должен соответствовать утверждённым ID; текущие документы не заменяются.");
  }
  for (const field of ["id", "number"] as const) {
    const values = rows.map((row) => row[field]);
    if (new Set(values).size !== values.length) throw new Error(`Поле ${field} должно быть уникальным во всём комплекте.`);
  }
  return rows;
}

function pdfPage(doc: PDFKit.PDFDocument, source: SourceDocument, title: string, text: string, page: number) {
  if (page > 1) doc.addPage();
  doc.font("Institution").fontSize(9).fillColor("#5b6572").text("ИНСТИТУТ ПРИКЛАДНЫХ ГУМАНИТАРНЫХ СИСТЕМ «СЕВЕРНАЯ ОРБИТА»", 52, 42, { width: 490, align: "center" });
  doc.moveDown(2);
  doc.fontSize(11).fillColor("#687282").text(`КОНКУРСНЫЙ ПРОТОТИП · СИНТЕТИЧЕСКИЙ ДОКУМЕНТ · № ${source.number} от ${source.issuedOn}`, { align: "center" });
  doc.moveDown(1.5);
  doc.fontSize(18).fillColor("#15283a").text(source.title, { align: "center" });
  doc.moveDown(1.5);
  doc.fontSize(13).fillColor("#24384d").text(title);
  doc.moveDown(0.8);
  doc.fontSize(11).fillColor("#202833");
  assertSectionFits(doc, text, source.id, page);
  doc.text(text, { align: "left", lineGap: 5 });
  doc.fontSize(9).fillColor("#687282").text("Учебный материал. При расхождении применяются нормативные правовые акты РФ и действующие локальные акты организации.", 52, 690, { width: 490, align: "center" });
  doc.fontSize(9).text(`Страница ${page}`, 52, 718, { width: 490, align: "center" });
}

async function build(source: SourceDocument, force: boolean) {
  const target = join(inboxRoot, source.id);
  const generated = join(generatedRoot, source.id);
  const pdfPath = join(generated, "original.pdf");
  const manifestPath = join(generated, "manifest.json");
  if (!force) {
    try { await access(pdfPath); throw new Error(`${source.id}: PDF уже существует; используйте --force после проверки.`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await access(join(target, "original.pdf")); throw new Error(`${source.id}: inbox уже содержит PDF; сверьте его перед --force.`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const { manifest, paymentSection: paymentSectionIndex } = sourceManifest(source);
  const sectionText = (index: number) => source.sections[index].text + (index === paymentSectionIndex
    ? `\n\n${source.payments?.map(({ month, payOn }) => `Начисление за ${month} — перечисление ${payOn}.`).join("\n")}` : "");
  // Validate the complete layout before overwriting either generated or inbox files.
  const preview = new PDFDocument({ size: "A4", margins: { top: 66, bottom: 82, left: 58, right: 58 } });
  try {
    preview.registerFont("Institution", fontPath);
    source.sections.forEach((section, index) => pdfPage(preview, source, section.title, sectionText(index), index + 1));
  } finally {
    preview.destroy();
  }
  await mkdir(target, { recursive: true });
  await mkdir(generated, { recursive: true });
  const temp = `${pdfPath}.tmp`;
  const output = createWriteStream(temp, { flags: "w" });
  const pdf = new PDFDocument({ size: "A4", margins: { top: 66, bottom: 82, left: 58, right: 58 }, info: { Title: source.title, Author: "Синтетический прототип", Subject: `№ ${source.number}`, CreationDate: new Date(`${source.issuedOn}T12:00:00Z`) } });
  pdf.registerFont("Institution", fontPath);
  pdf.pipe(output);
  let page = 0;
  source.sections.forEach((section, index) => {
    page += 1;
    pdfPage(pdf, source, section.title, sectionText(index), page);
  });
  pdf.end();
  await finished(output);
  await rename(temp, pdfPath);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await copyFile(pdfPath, join(target, "original.pdf"));
  await copyFile(manifestPath, join(target, "manifest.json"));
  console.log(`Собран ${source.id}: ${source.sections.length} страниц${source.payments ? `, ${source.payments.length} выплат` : ""}`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const ids = args.filter((arg) => arg !== "--force");
  if (ids.length > 1) throw new Error("Использование: npm run documents:build [id] [--force]");
  const rows = await loadSources();
  if (ids.length && !sourceIds.includes(ids[0] as typeof sourceIds[number])) throw new Error(`Неизвестный ID: ${ids[0]}`);
  const selected = ids.length ? rows.filter((row) => row.id === ids[0]) : rows;
  for (const row of selected) await build(row, force);
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : "Сборка документов не выполнена.");
  process.exitCode = 1;
});
