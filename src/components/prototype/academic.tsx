import { type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { StudyProgressPage } from "./deadlines";
import { ScheduleGrid } from "./schedule-grid";
import { SessionCalendar } from "./session-calendar";
import "./academic.css";

type Section = "schedule" | "study" | "session";

export function AcademicPrototype({ section, scheduleFooter, initialSubjectId, studyVisible, back }: { section: Section; scheduleFooter?: ReactNode; initialSubjectId?: string; studyVisible: boolean; back: ReactNode }) {
  if (section === "study") {
    return <StudyProgressPage key={initialSubjectId} initialSubjectId={initialSubjectId} visible={studyVisible}>
      {back}
    </StudyProgressPage>;
  }

  return <div className="ac-root">
    {section === "schedule" ? <ScheduleGrid footer={scheduleFooter}/> : <>
      {back}
      <header className="ac-heading">
        <h1>Сессия</h1>
        <span className="ac-semester"><CalendarDays size={16} aria-hidden="true"/>Осенний семестр · 2026</span>
      </header>
      <SessionCalendar/>
    </>}
  </div>;
}
