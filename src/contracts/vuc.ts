import { z } from "zod";

const timestamp = z.iso.datetime();
const points = z.number().int().min(0).max(100);

export const vucSlot = z.object({
  id: z.uuid(),
  startsAt: timestamp,
  endsAt: timestamp,
  place: z.string().min(1),
});

export const vucExerciseResults = z.object({
  pullUps: z.number().int().nonnegative(),
  sprintSeconds: z.number().positive(),
  distanceSeconds: z.number().int().positive(),
});

const publishedResults = z.object({
  physicalScore: points,
  academicScore: points,
  total: z.number().int().min(0).max(200),
  exercises: vucExerciseResults,
  publishedAt: timestamp,
});

const statuses = ["not_applied", "submitted", "scheduled", "awaiting_results", "results_published", "admitted", "not_admitted"] as const;
export const vucOverview = z.object({
  status: z.enum(statuses),
  submittedAt: timestamp.nullable(),
  appointment: vucSlot.nullable(),
  availableSlots: vucSlot.array(),
  results: publishedResults.nullable(),
  decidedAt: timestamp.nullable(),
});
export type VucOverview = z.infer<typeof vucOverview>;
export type VucSlot = z.infer<typeof vucSlot>;

export const vucCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("apply") }),
  z.strictObject({ action: z.literal("book"), slotId: z.uuid() }),
]);
export type VucCommand = z.infer<typeof vucCommand>;

export const vucStudy = z.object({
  schedule: z.array(z.object({ title: z.string().min(1), startsAt: timestamp, endsAt: timestamp, place: z.string().min(1) })),
  requirements: z.string().array(),
});
export type VucStudy = z.infer<typeof vucStudy>;
