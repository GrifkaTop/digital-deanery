import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { clinicAfkSample, clinicCommand, clinicOverview } from "@/contracts/clinic";
import { ClinicWorkflow } from "@/components/prototype/clinic";
import { clinicAfkSampleBody } from "@/server/clinic/sample";

vi.mock("server-only", () => ({}));

const id = "72000000-0000-4000-8000-000000000003";
const doctor = { id, faculty: "Факультет проверки", name: "Мария Клёнова", place: "Корпус «Клён» · 114" };
const base = clinicOverview.parse({
  now: "2026-11-22T07:00:00Z", doctor,
  slots: [{ id, startsAt: "2026-11-23T08:00:00Z", endsAt: "2026-11-23T08:20:00Z" }],
  appointment: null, completion: null, passport: null, afk: null,
});
const render = (data: typeof base) => renderToStaticMarkup(createElement(ClinicWorkflow, { initial: data, onUnauthorized: () => {} }));

it("permits only the exact synthetic sample reference and its downloadable bytes", () => {
  expect(Buffer.byteLength(clinicAfkSampleBody)).toBe(clinicAfkSample.size);
  expect(createHash("sha256").update(clinicAfkSampleBody).digest("hex")).toBe(clinicAfkSample.sha256);
  expect(clinicAfkSampleBody).toContain("ДЕМОНСТРАЦИОННЫЙ ОБРАЗЕЦ");
  expect(clinicCommand.safeParse({ action: "request_afk", documentKey: clinicAfkSample.key }).success).toBe(true);
  expect(clinicCommand.safeParse({ action: "request_afk", documentKey: "arbitrary" }).success).toBe(false);
  for (const field of ["studentId", "file", "filename", "status", "startsOn", "endsOn", "publishedAt"]) {
    expect(clinicCommand.safeParse({ action: "request_afk", documentKey: clinicAfkSample.key, [field]: "synthetic" }).success).toBe(false);
  }
  expect(clinicCommand.safeParse({ action: "publish_passport", slotId: id }).success).toBe(false);
});

it("shows assigned doctor, local slot time and fictional preparation guidance", () => {
  const html = render(base);
  expect(html).toContain(doctor.name);
  expect(html).toContain(doctor.faculty);
  expect(html).toContain(">11:00</button>");
  expect(html).toContain("Паспорт пока не опубликован");
  expect(html).toContain("Подготовка к приёму");
  expect(html).not.toMatch(/МГТУ|МГИМО|bmstu|mgimo|распечатан/iu);
  expect(html).toContain(clinicAfkSample.href);
  expect(html).toContain('type="file"');
});

it("shows existing expiry independently from a booked visit and withholds an AFK period until approval", () => {
  const passport = { validUntil: "2026-11-25", admitted: true, medicalGroup: "Основная" };
  const booked = render({ ...base, appointment: { ...base.slots[0], doctor }, passport, afk: {
    status: "submitted", documentKey: clinicAfkSample.key, submittedAt: "2026-11-21T06:00:00Z",
  } });
  expect(booked).toContain("Оформлен ранее");
  expect(booked).toContain("Запись подтверждена");
  expect(booked).toContain("На рассмотрении");
  expect(booked).not.toContain("Период АФК · с ");
  expect(booked).not.toContain("Обновлён после приёма");
  const reviewed = render({ ...base, completion: { completedAt: "2026-11-18T07:20:00Z", passportUpdatedAt: "2026-11-18T07:25:00Z" },
    passport, afk: { status: "approved", documentKey: clinicAfkSample.key, submittedAt: "2026-11-18T07:00:00Z",
      startsOn: "2026-11-23", endsOn: "2026-12-11", publishedAt: "2026-11-20T07:00:00Z" },
  });
  expect(reviewed).toContain("Обновлён после приёма");
  expect(reviewed).toContain('dateTime="2026-11-25"');
  expect(reviewed).toContain('dateTime="2026-11-23"');
  expect(reviewed).toContain('dateTime="2026-12-11"');
  expect(reviewed).toContain("Согласовано");
});
