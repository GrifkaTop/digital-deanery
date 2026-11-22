import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { certificateSnapshot, kindLabel, purposes, scholarshipSnapshot, studySnapshot } from "@/contracts/requests";
import { formatRequestMonth, requestForms, scholarshipKinds } from "@/contracts/request-forms";
import { HttpError, type Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";

export async function downloadCertificate(actor: Actor, id: string) {
  const { rows } = await getPool().query(`
    SELECT kind, result_snapshot FROM requests
    WHERE id = $1 AND student_id = $2 AND kind IN ('study_certificate', 'scholarship_certificate') AND status = 'ready'
  `, [id, actor.id]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND");
  const { kind, result_snapshot: stored } = rows[0];
  const scholarship = kind === "scholarship_certificate" ? scholarshipSnapshot.parse(stored) : null;
  const snapshot = scholarship ?? (stored?.templateVersion === 2 ? studySnapshot.parse(stored) : certificateSnapshot.parse(stored));
  const title = scholarship ? kindLabel.scholarship_certificate : kindLabel.study_certificate;
  const font = await readFile(path.join(process.cwd(), "assets/pdf/DejaVuSans.ttf"));
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: title + " · образец" } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.font(font).fontSize(11).fillColor("#2B5948").text("Конкурсный прототип · образец");
  doc.moveDown().fillColor("#202A25").text("Институт прикладных гуманитарных систем «Северная Орбита»");
  doc.moveDown(1.5).fontSize(23).text(title);
  doc.moveDown().fontSize(13).fillColor("#202A25");
  const identity = [
    `Выдана: ${snapshot.fullName}`,
    `Факультет: ${snapshot.faculty}`,
    `Направление: ${snapshot.program}`,
    `Курс: ${snapshot.course} · Группа: ${snapshot.group}`,
  ];
  if ("educationLevel" in snapshot && snapshot.educationLevel) identity.push(`Уровень образования: ${snapshot.educationLevel}`);
  if ("studyMode" in snapshot && snapshot.studyMode) identity.push(`Форма обучения: ${snapshot.studyMode}`);
  const documentDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" });
  doc.text(`№ ${snapshot.publicNo} от ${documentDate.format(new Date(snapshot.readyAt))}`).moveDown();
  for (const line of identity) doc.text(line).moveDown(0.5);
  if ("purpose" in snapshot) {
    doc.moveDown().text("Справка подтверждает обучение по указанной образовательной программе.");
    doc.moveDown(0.5).text(`Назначение: ${purposes[snapshot.purpose]}`);
  }
  if (scholarship) {
    const { fromMonth, toMonth, scholarshipKind, purpose } = scholarship.request;
    doc.moveDown().text(`Вид стипендии: ${scholarshipKinds[scholarshipKind]}`);
    doc.text(`Запрошенный период: ${formatRequestMonth(fromMonth)} — ${formatRequestMonth(toMonth)}`);
    doc.text(`Назначение: ${requestForms.scholarship_certificate.fields.purpose.options[purpose]}`).moveDown();
    const rubles = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });
    for (const { month, amountKopecks } of scholarship.accruals) {
      doc.text(`${formatRequestMonth(month)} — ${rubles.format(amountKopecks / 100)}`);
    }
    const total = scholarship.accruals.reduce((sum, entry) => sum + entry.amountKopecks, 0);
    doc.moveDown(0.5).text(`Всего по указанным начислениям: ${rubles.format(total / 100)}`);
  }
  doc.moveDown(1.5).fontSize(10).text("Демонстрационный документ. Данные вымышлены.");
  doc.end();
  const pdf = await output;
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${scholarship ? "scholarship-certificate" : "study-certificate"}.pdf"; filename*=UTF-8''${encodeURIComponent(snapshot.publicNo + ".pdf")}`,
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  } });
}
