import { z } from "zod";

const timestamp = z.preprocess(value => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
export const clinicAfkSample = {
  key: "afk-demo-v1", name: "atlas-afk-demo.txt", href: "/api/v1/clinic/afk/sample",
  // The route serves exactly this immutable sample. Only the key is submitted.
  size: 479, sha256: "61bcbe1dfd4481bbd062def00b20818a4be6a0e6d312c4c230bb4e4af8766651",
} as const;

const clinicSlot = z.object({
  id: z.uuid(), startsAt: timestamp, endsAt: timestamp,
});
const clinicDoctor = z.object({
  id: z.uuid(), faculty: z.string().min(1), name: z.string().min(1), place: z.string().min(1),
});
const passport = z.object({
  validUntil: z.iso.date(), admitted: z.boolean(), medicalGroup: z.string().nullable(),
});
const requestBase = z.object({
  submittedAt: timestamp, documentKey: z.literal(clinicAfkSample.key),
});
const reviewedRequest = requestBase.extend({ publishedAt: timestamp });
const afkRequest = z.discriminatedUnion("status", [
  requestBase.extend({ status: z.literal("submitted") }),
  reviewedRequest.extend({ status: z.literal("approved"), startsOn: z.iso.date(), endsOn: z.iso.date() }),
  reviewedRequest.extend({ status: z.literal("declined") }),
]);

export const clinicOverview = z.object({
  now: timestamp,
  doctor: clinicDoctor.nullable(),
  slots: clinicSlot.array(),
  appointment: clinicSlot.extend({ doctor: clinicDoctor }).nullable(),
  completion: z.object({ completedAt: timestamp, passportUpdatedAt: timestamp.nullable() }).nullable(),
  passport: passport.nullable(),
  afk: afkRequest.nullable(),
});
export type ClinicOverview = z.infer<typeof clinicOverview>;
export type ClinicSlot = z.infer<typeof clinicSlot>;

export const clinicCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("book"), slotId: z.uuid() }),
  z.strictObject({ action: z.literal("cancel"), slotId: z.uuid() }),
  z.strictObject({ action: z.literal("request_afk"), documentKey: z.literal(clinicAfkSample.key) }),
]);
export type ClinicCommand = z.infer<typeof clinicCommand>;
