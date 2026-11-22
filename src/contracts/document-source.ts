import { z } from "zod";
import { documentKey, documentManifest } from "./assistant-files";

export const sourceDocument = z.strictObject({
  id: documentKey,
  title: z.string().trim().min(1).max(240),
  number: z.string().trim().min(1).max(80),
  issuedOn: z.iso.date(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(24),
  sections: z.array(z.strictObject({ title: z.string().trim().min(1).max(160), text: z.string().trim().min(1).max(3000) })).min(1).max(20),
  payments: z.array(z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u), payOn: z.iso.date() })).min(1).optional(),
});
export type SourceDocument = z.infer<typeof sourceDocument>;

export const sourceQuestion = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  question: z.string().trim().min(1).max(500),
  expected: z.string().trim().min(1).max(600),
  answerable: z.boolean(),
});
export const sourceQuestions = z.array(sourceQuestion).min(1).max(40).refine((items) => new Set(items.map(({ id }) => id)).size === items.length, {
  message: "ID проверочного вопроса должен быть уникальным.",
});

export const sourceIds = ["scholarship-policy-2026-27", "scholarship-payments-2026-27", "academic-calendar-2026-27", "library-service-rules", "study-certificates", "consultation-rescheduling", "assessment-rules", "academic-debt", "attendance-rules", "assessment-appeals", "learning-materials", "discipline-overview", "consultation-control-info", "academic-leave", "transfer-restoration", "student-social-support", "tuition-payment", "dormitory-rules", "student-conduct-requests", "practice-thesis", "service-directory"] as const;

export function sourceManifest(source: SourceDocument) {
  const paymentSection = source.payments
    ? source.sections.findIndex(({ title }) => /график|перечислен/u.test(title.toLocaleLowerCase("ru-RU")))
    : -1;
  if (source.payments && paymentSection < 0) throw new Error(`${source.id}: раздел графика выплат не найден.`);
  const manifest = documentManifest.parse({
    title: source.title, number: source.number, issuedOn: source.issuedOn, synthetic: true, ocr: "auto",
    keywords: source.keywords,
    pageKeywords: source.sections.map((section, index) => ({
      page: index + 1,
      keywords: [...new Set([...source.keywords, ...section.title.split(/\s+/u).filter((word) => word.length > 3)])].slice(0, 24),
    })),
    ...(source.payments ? { payments: source.payments.map((payment) => ({ ...payment, page: paymentSection + 1 })) } : {}),
  });
  return { manifest, paymentSection };
}
