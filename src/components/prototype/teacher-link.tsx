import { teacherNames, teacherIds } from "./academic-data";

export function TeacherLink({ name }: { name: string }) {
  const index = teacherNames.indexOf(name);
  return index < 0 ? <span>{name}</span> : <a className="p-teacher-link" href={`#teacher/${teacherIds[index]}`} aria-label={`Расписание преподавателя: ${name}`}>{name}</a>;
}

