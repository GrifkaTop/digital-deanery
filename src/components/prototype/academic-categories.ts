import type { WorkTag } from "./academic-data";

export const academicCategoryLabels = {
  homework: "ДЗ",
  control: "РК",
  lab: "ЛР",
  schedule: "Расписание",
  request: "Заявки",
} as const;

export type AcademicCategory = keyof typeof academicCategoryLabels;

export const scheduleTagCategory = {
  "ДЗ": "homework",
  "РК1": "control",
  "ЛР": "lab",
} as const satisfies Record<WorkTag, AcademicCategory>;
