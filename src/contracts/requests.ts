import { z } from "zod";
import {
  academicLeaveForm, materialAidForm, travelCompensationForm, legacyDormitoryForm, campusPassForm, choices, consultationForm, dormitoryForm, individualScheduleForm, legacyConsultation,
  requestForms, scholarshipForm, studyForm, yearMonth,
} from "./request-forms";

export { choices, purposes, reasons, slots } from "./request-forms";

export const requestKinds = ["study_certificate", "consultation_reschedule", "scholarship_certificate", "individual_schedule", "dormitory", "campus_pass", "material_aid", "academic_leave", "travel_compensation"] as const;
export const requestStatuses = ["submitted", "in_progress", "ready", "approved", "rejected", "needs_clarification", "registered"] as const;
export const requestActions = ["create", "clarify"] as const;
export const requestActors = ["student", "system"] as const;
export type RequestKind = (typeof requestKinds)[number];
export const kindLabel = Object.fromEntries(requestKinds.map((kind) => [kind, requestForms[kind].title])) as Record<RequestKind, string>;
export function isCertificate(kind: RequestKind) {
  return kind === "study_certificate" || kind === "scholarship_certificate";
}
export const statusLabel = {
  submitted: "Подана", in_progress: "В работе", ready: "Готова",
  approved: "Одобрена", rejected: "Отклонена", needs_clarification: "Нужно уточнение", registered: "Зарегистрирована",
};
export const nextStep = {
  submitted: "Заявка ожидает обработки.",
  in_progress: "Заявка обрабатывается.",
  ready: "Скачайте образец PDF.",
  approved: "Посмотрите решение.",
  registered: "Заявление зарегистрировано для рассмотрения.",
  rejected: "Посмотрите причину отказа.",
  needs_clarification: "Выберите время консультации.",
};

const timestamp = z.preprocess((value) => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
const legacyDetails = z.strictObject({ schemaVersion: z.literal(1).default(1), details: z.string().trim().min(1).max(1000) });
const choice = z.enum(Object.keys(choices) as (keyof typeof choices)[]);
export const consultationPayload = z.union([
  legacyConsultation.extend({ choice: choice.optional() }),
  consultationForm.extend({ discipline: z.string().min(1), choice: choice.optional() }),
]);
export const createRequest = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("study_certificate"), payload: studyForm }),
  z.strictObject({ kind: z.literal("consultation_reschedule"), payload: consultationForm }),
  z.strictObject({ kind: z.literal("scholarship_certificate"), payload: scholarshipForm }),
  z.strictObject({ kind: z.literal("dormitory"), payload: dormitoryForm }),
  z.strictObject({ kind: z.literal("campus_pass"), payload: campusPassForm }),
  z.strictObject({ kind: z.literal("material_aid"), payload: materialAidForm }),
  z.strictObject({ kind: z.literal("academic_leave"), payload: academicLeaveForm }),
  z.strictObject({ kind: z.literal("travel_compensation"), payload: travelCompensationForm }),
]);
export const clarifyRequest = z.strictObject({ expectedVersion: z.number().int().positive().max(2147483647), choice });
export const requestPayload = z.union([
  studyForm, consultationPayload, scholarshipForm, individualScheduleForm, legacyDormitoryForm, dormitoryForm, campusPassForm, materialAidForm, academicLeaveForm, travelCompensationForm, legacyDetails,
]);
export const requestResult = z.object({ id: z.uuid(), publicNo: z.string() });
export const requestSummary = requestResult.extend({
  kind: z.enum(requestKinds), status: z.enum(requestStatuses), createdAt: timestamp, updatedAt: timestamp,
});
export const requestDetail = requestSummary.extend({
  version: z.number().int().positive(), payload: requestPayload,
  history: z.array(z.object({
    version: z.number().int().positive(), fromStatus: z.enum(requestStatuses).nullable(),
    toStatus: z.enum(requestStatuses), actorKind: z.enum(requestActors), reason: z.string().nullable(), createdAt: timestamp,
  })),
});
export const requestFilter = z.enum(["all", "active", "reply", "closed", "atlas_active", "atlas_ready"]);
export const requestCursor = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export const requestList = z.object({ items: requestSummary.array(), nextCursor: z.string().nullable(), counts: z.object({ all: z.number(), active: z.number(), ready: z.number() }).optional() });
export const certificateSnapshot = z.strictObject({
  templateVersion: z.literal(1), publicNo: z.string(), fullName: z.string(), faculty: z.string(),
  program: z.string(), course: z.number().int().min(1).max(4), group: z.string(), readyAt: timestamp,
});
export type RequestSummary = z.infer<typeof requestSummary>;
const profileDocument = certificateSnapshot.omit({ templateVersion: true }).extend({
  educationLevel: z.string().nullable(),
  studyMode: z.string().nullable(),
});
export const studySnapshot = profileDocument.extend({
  templateVersion: z.literal(2), purpose: studyForm.shape.purpose,
});
export const scholarshipSnapshot = profileDocument.extend({
  templateVersion: z.literal(1), request: scholarshipForm,
  accruals: z.strictObject({ month: yearMonth, amountKopecks: z.number().int().positive() }).array().min(1),
});
