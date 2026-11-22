import { describe, expect, it } from "vitest";
import { createRequest, requestPayload } from "@/contracts/requests";
import { extracurricularQuery } from "@/contracts/extracurricular-events";
import { assignmentItem, assignmentLabel } from "@/contracts/assignments";

describe("extended interface contracts", () => {
  it("validates current document forms and rejects unstructured submissions", () => {
    const dates = { startDate: "2026-11-22", endDate: "2027-02-01" };
    const planId = "3e726343-27a1-4784-ba4a-c732fc8bc22e";
    const forms = [
      { kind: "study_certificate", payload: { schemaVersion: 1, purpose: "on_request" } },
      { kind: "consultation_reschedule", payload: { schemaVersion: 2, planId, reason: "preparation", slot: "option_a" } },
      { kind: "scholarship_certificate", payload: {
        schemaVersion: 2, scholarshipKind: "academic", fromMonth: "2026-09", toMonth: "2026-10", purpose: "on_request",
      } },
      { kind: "material_aid", payload: { schemaVersion: 2, grounds: "financial", details: "Нужна поддержка" } },
      { kind: "dormitory", payload: { schemaVersion: 3, startDate: dates.startDate, grounds: "nonresident" } },
      { kind: "campus_pass", payload: { schemaVersion: 2, action: "lost" } },
    ];
    for (const { kind, payload } of forms) {
      expect(createRequest.safeParse({ kind, payload }).success, kind).toBe(true);
      expect(createRequest.safeParse({ kind, payload, studentId: planId }).success, kind).toBe(false);
      expect(createRequest.safeParse({ kind, payload: { ...payload, fullName: "Чужое имя" } }).success, kind).toBe(false);
      expect(createRequest.safeParse({ kind, payload: { details: "Свободное описание" } }).success, kind).toBe(false);
    }
    expect(createRequest.safeParse({ kind: "campus_pass", payload: { schemaVersion: 2, action: "unknown" } }).success).toBe(false);
    expect(requestPayload.parse({ schemaVersion: 1, details: "Старое обращение" })).toEqual({
      schemaVersion: 1, details: "Старое обращение",
    });
  });
  it("checks document periods and requires a description for other dormitory grounds", () => {
    const payload = { schemaVersion: 3, grounds: "other", startDate: "2026-11-22" };
    expect(createRequest.safeParse({ kind: "dormitory", payload }).success).toBe(false);
    expect(createRequest.safeParse({ kind: "dormitory", payload: { ...payload, comment: "Причина", startDate: "2027-02-30" } }).success).toBe(false);
    expect(createRequest.safeParse({ kind: "academic_leave", payload: { schemaVersion: 2, grounds: "family", startDate: "2027-03-02", endDate: "2027-03-01", details: "Причина" } }).success).toBe(false);
    const scholarship = { schemaVersion: 2, scholarshipKind: "social", fromMonth: "2027-02", purpose: "social_support" };
    for (const toMonth of ["2027-01", "2027-13", "2027-2"]) {
      expect(createRequest.safeParse({ kind: "scholarship_certificate", payload: { ...scholarship, toMonth } }).success).toBe(false);
    }
  });
  it("checks inclusive event ranges and actual dates", () => {
    expect(extracurricularQuery.safeParse({ from: "2026-11-22", to: "2026-11-22" }).success).toBe(true);
    expect(extracurricularQuery.safeParse({ from: "2026-11-23", to: "2026-11-22" }).success).toBe(false);
    expect(extracurricularQuery.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
  });
  it("preserves a zero assignment result", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const parsed = assignmentItem.parse({ moduleId: null, id, planId: id, disciplineId: id, teacherId: id, teacherName: "Синтетический преподаватель",
      kind: "rk", number: 1, title: "Работа", description: "Условие", actions: "Сделать", requirements: "Сдать",
      issuedAt: "2026-11-19T00:00:00Z", publishedAt: "2026-11-19T00:00:00Z", maxScore: 10,
      dueAt: null, deadlineId: null, required: null, result: { stage: "completed", score: 0,
        completedAt: "2026-11-20T00:00:00Z", defendedAt: null, onTime: null } });
    expect(parsed.result?.score).toBe(0);
    expect(assignmentLabel("rk", 1)).toBe("РК1");
  });
});
