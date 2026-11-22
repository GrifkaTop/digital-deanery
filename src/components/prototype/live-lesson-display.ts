import type { Lesson } from "@/contracts/academics";

const cleanName = (name: string) => name.trim().replace(/\s+/gu, " ");

export function timetableTeacher(lesson: Pick<Lesson, "teacher" | "teachers">) {
  const publishedName = cleanName(lesson.teacher);
  const linked = lesson.teachers?.find(teacher => cleanName(teacher.fullName) === publishedName)
    ?? (lesson.teachers?.length === 1 ? lesson.teachers[0] : undefined);
  return { name: linked ? cleanName(linked.fullName) : publishedName, id: linked?.id };
}

export function timetableRoom(place: { room: string; building?: string | null }) {
  return [place.room, place.building].filter(Boolean).join(" · ");
}
