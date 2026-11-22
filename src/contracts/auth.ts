import { z } from "zod";
export const loginSchema = z.strictObject({
  login: z.string().trim().toLowerCase().min(1).max(128),
  password: z.string().min(1).max(256),
});
export const profileSchema = z.strictObject({
  id: z.uuid(), fullName: z.string(), faculty: z.string(),
  program: z.string(), course: z.number().int().min(1).max(4), group: z.string(),
  educationLevel: z.string().nullable().optional(), studyMode: z.string().nullable().optional(),
  studentNumber: z.string().nullable().optional(), email: z.string().nullable().optional(),
  avatarKey: z.string().nullable().optional(), currentSemester: z.string().nullable().optional(),
});
export type Profile = z.infer<typeof profileSchema>;
