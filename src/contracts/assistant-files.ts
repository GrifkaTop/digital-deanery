import { z } from "zod";

const documentKeyPattern = "[a-z0-9]+(?:-[a-z0-9]+)*";
const revisionPattern = "[a-f0-9]{64}";
export const documentKey = z.string().max(64).regex(new RegExp(`^${documentKeyPattern}$`, "u"));
export const documentRevision = z.string().regex(new RegExp(`^${revisionPattern}$`, "u"));
const payment = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  payOn: z.iso.date(),
  page: z.number().int().positive(),
});
const keywords = z.array(z.string().trim().min(1).max(100)).max(24);
const pageKeywords = z.strictObject({ page: z.number().int().positive(), keywords: keywords.min(1) });
export const documentManifest = z.strictObject({
  title: z.string().trim().min(1).max(240),
  number: z.string().trim().min(1).max(80),
  issuedOn: z.iso.date(),
  synthetic: z.literal(true),
  ocr: z.enum(["auto", "always"]).default("auto"),
  keywords: keywords.optional(),
  pageKeywords: pageKeywords.array().refine((rows) => new Set(rows.map((row) => row.page)).size === rows.length, {
    message: "Укажите ключевые слова страницы одним списком.",
  }).optional(),
  payments: z.array(payment).min(1).refine((rows) => new Set(rows.map((row) => row.month)).size === rows.length, {
    message: "Месяц начисления должен встречаться один раз.",
  }).optional(),
});
export const preparedDocument = z.strictObject({
  format: z.string().regex(/^deanery-pdf-v\d+$/u),
  manifest: documentManifest,
  fragments: z.array(z.strictObject({ page: z.number().int().positive(), text: z.string().min(1) })).min(1),
}).refine(({ manifest, fragments }) => {
  const pages = new Set(fragments.map(({ page }) => page));
  return [...manifest.payments ?? [], ...manifest.pageKeywords ?? []].every(({ page }) => pages.has(page));
}, { message: "Для выплат и ключевых слов указывайте страницы с извлечённым текстом." });

export const documentVersionId = (key: string, revision: string) => `file-${key}-${revision}`;
export const initialPaymentDocumentId = "scholarship-payments-2026-27";
export const scholarshipPolicyDocumentId = "scholarship-policy-2026-27";
export const academicCalendarDocumentId = "academic-calendar-2026-27";
export const documentPdfPath = /^\/api\/v1\/assistant\/documents\/file-[a-z0-9-]+-[a-f0-9]{64}\/pdf$/u;
const versionId = new RegExp(`^file-(${documentKeyPattern})-(${revisionPattern})$`, "u");

export function parseDocumentVersionId(id: string) {
  const match = id.match(versionId);
  return match && documentKey.safeParse(match[1]).success ? { key: match[1], revision: match[2] } : undefined;
}

const generatedPageStart = String.raw`^\s*ИНСТИТУТ ПРИКЛАДНЫХ ГУМАНИТАРНЫХ СИСТЕМ «СЕВЕРНАЯ ОРБИТА»\s+КОНКУРСНЫЙ ПРОТОТИП · СИНТЕТИЧЕСКИЙ ДОКУМЕНТ · №[^\n]+\n\s*`;
const generatedPageBody = String.raw`\n\s*\d+\.\s*[^\n]+\n([\s\S]*?)\s+Учебный материал\. При расхождении применяются нормативные правовые акты РФ и действующие\s+локальные акты организации\.\s+Страница \d+\s*$`;
const generatedPage = new RegExp(generatedPageStart + String.raw`[^\n]+` + generatedPageBody, "u");
const generatedPageWithWrappedTitle = new RegExp(generatedPageStart + String.raw`[\s\S]+?` + generatedPageBody, "u");

/** Remove the known generated packet's decoration only when both boundaries are present. */
export function cleanGeneratedPage(text: string, allowWrappedTitle = false): string {
  const pattern = allowWrappedTitle ? generatedPageWithWrappedTitle : generatedPage;
  return pattern.exec(text)?.[1].trim() ?? text;
}
