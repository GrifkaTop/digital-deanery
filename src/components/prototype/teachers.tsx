import type { ReactNode } from "react";
import { teacherNames, teacherIds, subjects } from "./academic-data";
export { teacherNames, subjects, lessonsFor, type Lesson } from "./academic-data";
import { ScheduleGrid } from "./schedule-grid";
import { demoScheduleGroups, type ScheduleScope } from "./schedule-directory-data";

export { TeacherLink } from "./teacher-link";

function RelatedSchedulePage({ scope, title, description, back, timetable }: {
  scope: "teacher" | "group"; title: string; description?: string; back: ReactNode; timetable?: ScheduleScope;
}) {
  const id = `${scope}-schedule-title`;
  return <section className="p-teacher-page">
    {back}
    {timetable ? <ScheduleGrid scope={timetable} heading={{ id, title, description }}/> : <header className="p-page-heading"><div>
      <h1 id={id} tabIndex={-1}>{title}</h1>
    </div></header>}
  </section>;
}

export function TeacherSchedule({ id, back }: { id: string; back: ReactNode }) {
  const index = teacherIds.indexOf(id);
  if (index < 0) return <RelatedSchedulePage scope="teacher" title="Преподаватель не найден" back={back}/>;
  return <RelatedSchedulePage scope="teacher" title={teacherNames[index]} description={`Расписание преподавателя · ${subjects[index]}`}
    back={back} timetable={{ scope: "teacher", id }}/>;
}

export function GroupSchedule({ id, back }: { id: string; back: ReactNode }) {
  const group = demoScheduleGroups.find(item => item.id === id);
  if (!group) return <RelatedSchedulePage scope="group" title="Группа не найдена" back={back}/>;
  return <RelatedSchedulePage scope="group" title={`Группа ${group.code}`} description={group.description}
    back={back} timetable={{ scope: "group", id: group.id }}/>;
}
