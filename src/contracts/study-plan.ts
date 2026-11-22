import { z } from "zod";

export const studyPlanResponse = z.object({
  semesters: z.array(z.object({
    id: z.uuid(),
    number: z.number().int().positive(),
    isCurrent: z.boolean(),
    rows: z.array(z.object({
      id: z.string(),
      title: z.string(),
      type: z.string(),
      department: z.string().nullable(),
      hours: z.number().int().nonnegative().nullable(),
      grade: z.string().nullable(),
    })),
  })),
});
export type StudyPlan = z.infer<typeof studyPlanResponse>;
