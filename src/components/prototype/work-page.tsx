import { useEffect, useRef, type ReactNode } from "react";
import type { z } from "zod";
import type { assignmentItem } from "@/contracts/assignments";
import { dateInMoscow } from "@/contracts/calendar";
import { CalendarDays, ClipboardCheck, Clock3, FileText, Info, MapPin, Send } from "lucide-react";
import { academicCategoryLabels } from "./academic-categories";
import { homeworkForSubject } from "./academic-data";
import { currentSubjects, isOverdueWork, studyStageLabels, studyWorkLabels, type WorkKind } from "./study-current-data";
import { TeacherLink } from "./teacher-link";
import { lessonOnDate, scheduledHomeworkDeadline, type WorkRoute } from "./work-route";
import "./work-page.css";

type WorkBrief = { label: string; steps: readonly string[]; resultLabel: string; result: string };
type WorkDetails = {
  id?: string;
  title?: string;
  description?: string;
  subject: string;
  kind?: WorkKind;
  kindLabel?: string;
  controlNumber?: string;
  teacher: string;
  teacherHref?: string;
  dueOn: string | null;
  dueAt?: string;
  status: string;
  overdue?: boolean;
  points?: number | null;
  maxPoints?: number;
  submittedAt?: string | null;
  gradedAt?: string | null;
  slot?: { time: string; room: string };
  brief?: WorkBrief;
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const momentFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const briefs: Record<string, WorkBrief> = {
  "data-analysis/lab-4": {
    label: "Что сделать", steps: ["Сформулируйте нулевую и альтернативную гипотезы для двух учебных выборок.", "Выберите статистический критерий и объясните, почему он подходит.", "Посчитайте результат, укажите p-значение и сформулируйте вывод."],
    resultLabel: "Что сдать", result: "Отчёт с расчётами и выводом в PDF. Подготовьтесь объяснить выбор критерия на защите.",
  },
  "economics/control-1": {
    label: "Темы", steps: ["Ценовая эластичность спроса.", "Влияние эластичности на выручку.", "Расчёт и интерпретация коэффициента по двум наблюдениям."],
    resultLabel: "Формат", result: "Письменная работа с короткими вопросами и расчётной задачей. В решении покажите формулу и ход расчёта.",
  },
  "russian-history/control-1": {
    label: "Что подготовить", steps: ["Повторите хронологию тем текущего модуля.", "Потренируйтесь определять автора и контекст исторического источника.", "Подготовьте примеры для аргументации ответа."],
    resultLabel: "Формат", result: "Письменная пересдача: вопросы по хронологии и краткий разбор источника.",
  },
  "economics/seminar-2": {
    label: "Что подготовить", steps: ["Разделите издержки фирмы на постоянные и переменные.", "Посчитайте средние и предельные издержки на учебном примере."],
    resultLabel: "На семинаре", result: "Обсудите графики издержек и объясните решение короткой задачи.",
  },
};

function resolveWork(route: WorkRoute | null): WorkDetails | null {
  if (!route) return null;
  if (route.kind === "lesson") {
    const lesson = lessonOnDate(route.day, item => item.id === route.lessonId);
    const homework = route.tag === "ДЗ" ? lesson?.homework : undefined;
    const review = route.tag === "РК1" ? lesson?.review : undefined;
    if (!lesson || (!homework && !review)) return null;
    return {
      title: homework?.title,
      subject: lesson.title,
      kind: homework ? "homework" : "control",
      controlNumber: review ? "1" : undefined,
      teacher: lesson.teacher,
      dueOn: homework ? scheduledHomeworkDeadline(route.day, homework.dueInDays) : route.day,
      status: "По расписанию",
      slot: review ? { time: `${lesson.time}–${lesson.end}`, room: lesson.room } : undefined,
      brief: homework ? { label: "Что сделать", steps: homework.instructions, resultLabel: "Что отправить", result: homework.deliverable }
        : review && { label: "Темы", steps: review.topics, resultLabel: "Формат", result: review.format },
    };
  }

  const subject = currentSubjects.find(item => item.id === route.subjectId);
  const work = subject?.works.find(item => item.id === route.workId);
  if (!subject || !work) return null;
  const homework = work.kind === "homework" ? homeworkForSubject(subject.title) : undefined;
  const controlTitle = work.kind === "control" ? /^РК\s*(\d+)?\s*·\s*(.+)$/.exec(work.title) : null;
  const controlNumber = controlTitle?.[1];
  const title = work.kind === "homework" ? work.title.replace(/^ДЗ\s*·\s*/, "") : controlTitle?.[2] ?? work.title;
  const lesson = work.kind === "control" && work.title.startsWith("РК1 ·") && work.dueOn
    ? lessonOnDate(work.dueOn, item => item.title === subject.title && Boolean(item.review))
    : undefined;
  const review = lesson?.review;
  const overdue = isOverdueWork(work);
  const brief = homework?.title === work.title
    ? { label: "Что сделать", steps: homework.instructions, resultLabel: "Что отправить", result: homework.deliverable }
    : review ? { label: "Темы", steps: review.topics, resultLabel: "Формат", result: review.format }
      : briefs[`${subject.id}/${work.id}`];
  return {
    title, subject: subject.title, kind: work.kind, controlNumber, teacher: subject.teacher,
    dueOn: work.dueOn, status: overdue ? "Просрочено" : studyStageLabels[work.stage], overdue,
    points: work.points, maxPoints: work.maxPoints, submittedAt: work.submittedAt, gradedAt: work.gradedAt,
    slot: lesson ? { time: `${lesson.time}–${lesson.end}`, room: lesson.room } : undefined,
    brief,
  };
}

const assignmentKinds = {
  dz: "homework", rk: "control", lr: "lab",
  homework: "homework", control: "control", lab: "lab",
  seminar: "seminar", coursework: "coursework", module: "module",
} as const;

export function AssignmentWorkPage({ assignment, subject, overdue = false, back }: {
  assignment: z.infer<typeof assignmentItem>;
  subject?: string;
  overdue?: boolean;
  back: ReactNode;
}) {
  const kind = Object.hasOwn(assignmentKinds, assignment.kind)
    ? assignmentKinds[assignment.kind as keyof typeof assignmentKinds] : undefined;
  const topic = (kind === "homework" ? assignment.title.replace(/^ДЗ\s*·\s*/u, "")
    : kind === "control" ? assignment.title.replace(/^РК\s*\d*\s*·\s*/u, "")
      : kind === "lab" ? assignment.title.replace(/^ЛР\s*\d*\s*·\s*/u, "") : assignment.title).trim();
  const description = assignment.description.trim();
  const steps = assignment.actions.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const result = assignment.requirements.trim();
  const stage = assignment.result?.stage;
  const late = overdue && stage !== "completed" && stage !== "defended";

  return <WorkDetailView back={back} work={{
    id: assignment.id, subject: subject ?? assignment.title,
    title: subject && topic !== subject ? topic : undefined,
    description: description && description !== topic && description !== assignment.title ? description : undefined,
    kind, kindLabel: kind ? undefined : assignment.kind,
    controlNumber: assignment.number === null ? undefined : String(assignment.number),
    teacher: assignment.teacherName, teacherHref: `#teacher/${assignment.teacherId}`,
    dueOn: assignment.dueAt ? dateInMoscow(assignment.dueAt) : null, dueAt: assignment.dueAt ?? undefined,
    overdue: late, status: late ? "Просрочено" : studyStageLabels[stage === "completed" || stage === "defended" ? stage : "assigned"],
    points: assignment.result?.score, maxPoints: assignment.maxScore ?? undefined,
    submittedAt: assignment.result?.completedAt, gradedAt: assignment.result?.defendedAt,
    brief: steps.length || result ? {
      label: "Что сделать", steps,
      resultLabel: kind === "homework" ? "Что отправить" : kind === "lab" || kind === "coursework" ? "Что сдать" : "Формат",
      result,
    } : undefined,
  }}/>;
}

export function WorkPage({ route, back }: { route: WorkRoute | null; back: ReactNode }) {
  return <WorkDetailView work={resolveWork(route)} back={back}/>;
}

function WorkDetailView({ work, back }: { work: WorkDetails | null; back: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const category = work?.kind === "homework" || work?.kind === "control" || work?.kind === "lab" ? work.kind : undefined;
  const publishedScore = typeof work?.points === "number"
    ? { points: work.points, maxPoints: work.maxPoints } : null;
  const topic = work?.kind === "homework" && work.title === "Домашняя работа" ? undefined : work?.title;
  const description = [(work?.kind || work?.kindLabel) && "pw-kind", topic && "pw-topic", publishedScore && "pw-score"].filter(Boolean).join(" ");
  const ResultIcon = work?.brief?.resultLabel === "Что отправить" ? Send : FileText;
  const dueTime = work?.slot?.time ?? (work?.dueAt ? timeFormat.format(new Date(work.dueAt)) : null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [work?.id, work?.subject]);
  return <section className="pw-work" aria-labelledby="pw-title">
    {back}
    <header className="p-page-heading pw-heading" data-academic-category={category}>
      <div className="pw-heading-copy">
        <div className="pw-heading-line">
          <h1 ref={heading} id="pw-title" tabIndex={-1} aria-describedby={work ? description : undefined}>
            {work?.subject ?? "Работа не найдена"}
          </h1>
          {(work?.kind || work?.kindLabel) && <p className="pw-kind" id="pw-kind">
            {category && <strong className="p-work-category">{academicCategoryLabels[category]}{work.controlNumber && ` ${work.controlNumber}`}</strong>}
            {work.kind ? studyWorkLabels[work.kind] : work.kindLabel}
          </p>}
        </div>
        {topic && <p className="pw-topic" id="pw-topic">{topic}</p>}
      </div>
    </header>
    {work ? <>
      <dl className="pw-facts">
        <div>
          <dt><CalendarDays size={17} aria-hidden="true"/>{work.slot ? "Когда" : "Срок сдачи"}</dt>
          <dd>
            {work.dueOn ? <time dateTime={work.dueAt ?? work.dueOn}>{dateFormat.format(new Date(`${work.dueOn}T12:00:00Z`))}</time> : "Дата не назначена"}
            {dueTime && <small><Clock3 size={15} aria-hidden="true"/>{dueTime}</small>}
          </dd>
        </div>
        <div>
          <dt><ClipboardCheck size={17} aria-hidden="true"/>Статус</dt>
          <dd className="pw-status" data-overdue={work.overdue || undefined}>{work.status}</dd>
        </div>
        {publishedScore ? <div id="pw-score">
          <dt>Баллы</dt>
          <dd><strong>{publishedScore.points}</strong>{publishedScore.maxPoints !== undefined && <> <span>из {publishedScore.maxPoints}</span></>}</dd>
        </div> : work.maxPoints !== undefined && <div>
          <dt><FileText size={17} aria-hidden="true"/>Баллы</dt>
          <dd>Не опубликованы</dd>
          <dd className="pw-muted">Максимум {work.maxPoints}</dd>
        </div>}
      </dl>
      {work.slot && <p className="pw-room"><MapPin size={17} aria-hidden="true"/>{work.slot.room}</p>}
      <div className="pw-body">
        {work.description && <div className="pw-description"><p>{work.description}</p></div>}
        {work.brief ? <>
          {work.brief.steps.length > 0 && <section className="pw-instructions">
            <h2><Info size={20} aria-hidden="true"/>{work.brief.label}</h2>
            {work.brief.label === "Темы"
              ? <ul>{work.brief.steps.map(step => <li key={step}>{step}</li>)}</ul>
              : <ol>{work.brief.steps.map(step => <li key={step}>{step}</li>)}</ol>}
          </section>}
          {work.brief.result && <section className="pw-result">
            <h2><ResultIcon size={20} aria-hidden="true"/>{work.brief.resultLabel}</h2>
            <p>{work.brief.result}</p>
          </section>}
        </> : !work.description && <p className="pw-instructions pw-muted">Условия работы пока не опубликованы.</p>}
      </div>
      <dl className="pw-record">
        <div><dt>Преподаватель</dt><dd>{work.teacherHref ? <a className="p-teacher-link" href={work.teacherHref}>{work.teacher}</a> : <TeacherLink name={work.teacher}/>}</dd></div>
        {work.submittedAt && <div><dt>Сдано</dt><dd><time dateTime={work.submittedAt}>{momentFormat.format(new Date(work.submittedAt))}</time></dd></div>}
        {work.gradedAt && <div><dt>Оценено</dt><dd><time dateTime={work.gradedAt}>{momentFormat.format(new Date(work.gradedAt))}</time></dd></div>}
      </dl>
    </> : <p className="pw-muted">Вернитесь к списку и откройте работу по её названию.</p>}
  </section>;
}
