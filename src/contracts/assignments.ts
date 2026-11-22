import { z } from "zod";
const timestamp = z.preprocess(value => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
export const assignmentItem = z.object({
  moduleId: z.uuid().nullable(),
  id: z.uuid(), planId: z.uuid(), disciplineId: z.uuid(), teacherId: z.uuid(), teacherName: z.string(),
  kind: z.string(), number: z.number().int().positive().nullable(), title: z.string(), description: z.string(),
  actions: z.string(), requirements: z.string(), issuedAt: timestamp, publishedAt: timestamp,
  maxScore: z.number().nullable(), dueAt: timestamp.nullable(), deadlineId: z.uuid().nullable(), required: z.boolean().nullable(),
  result: z.object({ stage: z.enum(["issued", "completed", "defended"]), score: z.number().nullable(),
    completedAt: timestamp.nullable(), defendedAt: timestamp.nullable(), onTime: z.boolean().nullable() }).nullable(),
});
export const assignmentList = z.object({ items: z.array(assignmentItem) });

export function assignmentLabel(kind: string, number: number | null) {
  const labels: Record<string, string> = { dz: "ДЗ", rk: "РК", lr: "ЛР" };
  return (labels[kind] ?? kind) + (number ?? "");
}
