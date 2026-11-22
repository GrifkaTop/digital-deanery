"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ProgressRing } from "./progress-ring";
import { sportsMinimumPoints, sportsPassCriteria, sportsSemesters } from "./sports-demo";
import { TeacherLink } from "./teacher-link";
import { useProgressEntrance } from "./use-progress-entrance";
import {
  currentSubjects,
  currentWeek,
  studyDemoDate,
  studyStageLabels,
  workHref,
  type Attendance,
  type CurrentSubject,
  type CurrentWork,
  type StudyModule,
} from "./study-current-data";
import "./deadlines.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const displayDate = (value: string) =>
  dateFormat.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
export type StudyWorkDisplay = Omit<CurrentWork, "maxPoints" | "week"> & {
  maxPoints: number | null;
  overdue?: boolean;
};
export type StudySubjectDisplay = Omit<CurrentSubject, "works" | "semesterMaxPoints" | "lectureAttendance"> & {
  works: StudyWorkDisplay[];
  semesterMaxPoints: number | null;
  semesterPoints?: number | null;
  teacherId?: string | null;
  lectureAttendance?: Attendance[];
};
export type StudySportsDisplay = {
  attendance: number;
  targetAttendance: number | null;
  score: number | null;
  minimumPoints: number | null;
  status: string;
  passed: boolean;
};
type StudyDisplayData = {
  subjects: StudySubjectDisplay[];
  today: string;
  semesterLabel: string | null;
  week: number | null;
  sports: StudySportsDisplay | null;
};
const isSubmitted = (work: StudyWorkDisplay) => work.stage === "defended" || work.stage === "completed";
const isOverdue = (work: StudyWorkDisplay) => work.overdue
  ?? (work.stage === "assigned" && work.dueOn !== null && work.dueOn < studyDemoDate);
const workStatus = (work: StudyWorkDisplay) =>
  isOverdue(work) ? "Просрочено" : studyStageLabels[work.stage];

function moduleScore(works: StudyWorkDisplay[], module: StudyModule) {
  const entries = works.filter((work) => module.workIds.includes(work.id));
  const assessed = entries.filter((work) => work.points !== null);
  return {
    earned: assessed.length ? assessed.reduce((sum, work) => sum + (work.points ?? 0), 0) : null,
    max: entries.some((work) => work.maxPoints === null)
      ? null : entries.reduce((sum, work) => sum + (work.maxPoints ?? 0), 0),
  };
}
type WorkLink = (subjectId: string, workId: string) => string;
const attendanceLabels = {
  attended: "Посещение",
  distinction: "Посещение с отличием",
  absent: "Пропуск",
} satisfies Record<Exclude<Attendance["status"], "planned">, string>;
const assessmentCodes: Record<string, string> = {
  "Экзамен": "ЭКЗ",
  "РЭКЗ": "РЭКЗ",
  "Зачёт": "ЗАЧЁТ",
  "Дифференцированный зачёт": "ДИФ. ЗАЧЁТ",
  "Курсовая работа": "КУРСОВАЯ",
};

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const mobileSnapshot = () => false;

function orderedSubjects(subjects: StudySubjectDisplay[], today: string) {
  return subjects
  .map(subject => {
    const graded = subject.works.filter(work => work.points !== null);
    const semester = subject.semesterPoints !== undefined ? subject.semesterPoints
      : graded.length ? graded.reduce((sum, work) => sum + (work.points ?? 0), 0) : null;
    return {
      subject,
      today,
      semester,
      total: semester === null && subject.examPoints === null ? null : (semester ?? 0) + (subject.examPoints ?? 0),
      maximum: subject.semesterMaxPoints === null ? null : subject.semesterMaxPoints + subject.examMaxPoints,
      overdueCount: subject.works.filter(isOverdue).length,
      next: subject.works
        .filter(work => work.dueOn && !isSubmitted(work) && work.dueOn >= today && !isOverdue(work))
        .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))[0],
    };
  })
  .sort((a, b) =>
    Number(b.overdueCount > 0) - Number(a.overdueCount > 0)
    || (a.next?.dueOn ?? "9999").localeCompare(b.next?.dueOn ?? "9999")
    || a.subject.title.localeCompare(b.subject.title, "ru"),
  );
}
type SubjectEntry = ReturnType<typeof orderedSubjects>[number];

const passAssessment = "Зачёт";
const assessmentGroupLabels = new Map([
  ["Экзамен", "Экзамены"],
  ["РЭКЗ", "РЭКЗ"],
  ["Дифференцированный зачёт", "Дифференцированные зачёты"],
  ["Курсовая работа", "Курсовые работы"],
  [passAssessment, "Зачёты"],
]);
function WorkGroup({ subject, works, title, link }: {
  subject: StudySubjectDisplay;
  works: StudyWorkDisplay[];
  title: string;
  link: WorkLink;
}) {
  if (!works.length) return null;

  return (
    <div className="dl-work-group">
      <div className="dl-group-label">
        <h4>{title}</h4>
        <span>Сдано <strong>{works.filter(isSubmitted).length} из {works.length}</strong></span>
      </div>
      <div className="dl-work-chips">
        {works.map((work, index) => {
          const result = work.points === null
            ? `Баллы ещё не опубликованы, максимум ${work.maxPoints}`
            : `Баллы: ${work.points} / ${work.maxPoints}`;
          const deadline = work.dueOn ? ` Срок: ${displayDate(work.dueOn)}.` : "";
          const info = `${work.title}. ${workStatus(work)}. ${result}.${deadline}`;

          return (
            <a
              key={work.id}
              className="dl-work-chip"
              href={link(subject.id, work.id)}
              data-work-state={isOverdue(work) ? "overdue" : work.stage}
              aria-label={info}
              title={info}
            >
              <span className="dl-dot" aria-hidden="true"/>
              <span aria-hidden="true">№{index + 1}</span>
              <span className="dl-work-points" aria-hidden="true">· {work.points ?? "—"}/{work.maxPoints}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function SubjectScore({ total, maximum, visible = false, semantic = true, label, compact }: {
  total: number | null;
  maximum: number | null;
  visible?: boolean;
  semantic?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const progress = useProgressEntrance(visible, total);
  const precision = String(total).split(".")[1]?.length ?? 0;
  const visiblePoints = total === null ? "—" : Number((total * progress).toFixed(precision));
  const percentage = total === null || !maximum ? 0 : Math.min(100, (total / maximum) * 100);
  let tone = "";
  if (semantic && total !== null && maximum !== null) {
    tone = percentage < 40 ? " dl-score-low" : percentage < 60 ? " dl-score-mid" : " dl-score-high";
  }

  if (!maximum) return <span className="dl-unknown-score" aria-label={label ?? "Баллы"}>{total ?? "—"}</span>;

  return (
    <ProgressRing className={`dl-score${tone}${compact ? " dl-score-small" : ""}`}
      fill={percentage * progress} value={visiblePoints} maximum={maximum}
      label={label ?? (total === null ? "Баллы ещё не опубликованы" : `Набрано ${total} из ${maximum} баллов`)}/>
  );
}

function SportsSubjectCard({ visible, sports }: { visible: boolean; sports: StudySportsDisplay }) {
  const { attendance, targetAttendance, score, minimumPoints, status, passed } = sports;
  const visits = targetAttendance === null ? String(attendance) : `${attendance} из ${targetAttendance}`;

  return (
    <div className="dl-subject" data-subject-id="sports">
      <a className="dl-subject-summary dl-sports-link" href="#sports" data-passed={passed || undefined}>
        <span className="dl-subject-copy">
          <strong>Физкультура</strong>
          <span className="dl-subject-meta">Посещения: {visits}</span>
          <span className="dl-subject-meta">Баллы для зачёта: {score ?? "—"}{minimumPoints !== null && ` из ${minimumPoints}`}</span>
          <span className="dl-sports-status">{status}</span>
        </span>
        <SubjectScore total={attendance} maximum={targetAttendance} visible={visible} semantic={false}
          label={`Посещения: ${visits}`}/>
        <ChevronRight className="dl-chevron" size={18} aria-hidden="true"/>
      </a>
    </div>
  );
}

function SubjectSummary({ entry, visible, desktop }: { entry: SubjectEntry; visible: boolean; desktop?: boolean }) {
  const { subject, today, total, maximum, overdueCount, next } = entry;
  const assessment = subject.assessment === "Дифференцированный зачёт" ? "Диф. зачёт" : subject.assessment;

  return (
    <>
      <span className="dl-subject-copy">
        <strong>{subject.title}</strong>
        <span className="dl-subject-meta">{assessment} · {subject.modules.length} модуля</span>
        {(overdueCount > 0 || next?.dueOn) && <span className="dl-subject-alerts">
          {overdueCount > 0 && <span data-tone="danger">Просрочено: {overdueCount}</span>}
          {next?.dueOn && <span>{next.dueOn === today ? "Сдать сегодня" : `Срок: ${displayDate(next.dueOn)}`}</span>}
        </span>}
      </span>
      <SubjectScore total={total} maximum={maximum} visible={visible}/>
      {desktop ? <ChevronRight className="dl-chevron" size={18} aria-hidden="true"/>
        : <ChevronDown className="dl-chevron" size={18} aria-hidden="true"/>}
    </>
  );
}

type MarkTone = "present" | "success" | "review" | "negative" | "planned" | "neutral";
type StudyMark = {
  id: string;
  label: string;
  title: ReactNode;
  detail: string;
  tone: MarkTone;
  href?: string;
};

function StudyMarkStrip({ title, label, count, className, items, scrollLabels, centerMarkId }: {
  title: string;
  label?: string;
  count: ReactNode;
  className: string;
  items: StudyMark[];
  scrollLabels?: { previous: string; next: string };
  centerMarkId?: string;
}) {
  const trackId = useId();
  const strip = useRef<HTMLElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const previewPanel = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  const [scrollbar, setScrollbar] = useState({ offset: 0, max: 0 });
  const didPositionTrack = useRef<string | undefined>(undefined);
  const preview = items.find(item => item.id === (hovered ?? focused ?? selected));
  const Preview = preview?.href ? "a" : "p";
  const previewVisible = Boolean(preview);
  const closePreview = useCallback(() => {
    setHovered(null);
    setFocused(null);
    setSelected(null);
  }, []);
  useEffect(() => {
    if (!previewVisible) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !strip.current?.contains(event.target)) closePreview();
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [closePreview, previewVisible]);
  const updatePreviewPosition = useCallback(() => {
    const panel = previewPanel.current;
    const activeDot = track.current?.querySelector("[data-preview]");
    if (!panel || !activeDot || !caption.current) return;

    const captionBounds = caption.current.getBoundingClientRect();
    const dotBounds = activeDot.getBoundingClientRect();
    const center = dotBounds.left + dotBounds.width / 2 - captionBounds.left;
    const width = panel.getBoundingClientRect().width;
    const left = Math.max(0, Math.min(center - width / 2, captionBounds.width - width));
    const anchor = center - left;

    panel.style.setProperty("--dl-preview-left", `${left}px`);
    panel.style.setProperty("--dl-preview-anchor", `${anchor}px`);
    panel.toggleAttribute("data-anchor-visible", anchor >= 6 && anchor <= width - 6);
  }, []);
  const handleTrackChange = useCallback(() => {
    const node = track.current;
    if (!node) return;
    if (scrollLabels) {
      const previous = node.scrollLeft > 1;
      const next = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next });
    }
    if (centerMarkId) {
      const max = Math.max(0, node.scrollWidth - node.clientWidth);
      if (max > 0 && node.clientWidth > 0 && didPositionTrack.current !== centerMarkId) {
        const target = document.getElementById(`${trackId}-${centerMarkId}`);
        if (target) {
          const marker = target.getBoundingClientRect();
          const bounds = node.getBoundingClientRect();
          node.scrollTo({ left: node.scrollLeft + marker.left + marker.width / 2 - bounds.left - bounds.width / 2, behavior: "instant" });
          didPositionTrack.current = centerMarkId;
        }
      }
      const offset = Math.min(max, Math.max(0, Math.round(node.scrollLeft)));
      setScrollbar(current => current.offset === offset && current.max === max ? current : { offset, max });
    }
    updatePreviewPosition();
  }, [centerMarkId, scrollLabels, trackId, updatePreviewPosition]);
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const observer = new ResizeObserver(handleTrackChange);
    observer.observe(node);
    handleTrackChange();
    return () => observer.disconnect();
  }, [handleTrackChange, items.length]);
  useLayoutEffect(() => {
    const panel = previewPanel.current;
    if (!preview || !panel) return;
    updatePreviewPosition();
    if (preview.id === selected) panel.scrollIntoView({ block: "nearest" });
    const observer = new ResizeObserver(updatePreviewPosition);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [preview, selected, updatePreviewPosition]);
  function scrollByPage(direction: number) {
    const node = track.current;
    if (node) node.scrollBy({ left: node.clientWidth * direction });
  }

  function selectMark(event: MouseEvent, item: StudyMark) {
    if (item.href) {
      if (!event.detail || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    }
    setFocused(null);
    setSelected(selected === item.id ? null : item.id);
  }

  return (
    <section ref={strip} className={`dl-content-card dl-common-group dl-mark-strip ${className}`} aria-label={label ?? title}
      onPointerLeave={() => setHovered(null)}>
      <div className="dl-group-label">
        <h3>{title}</h3>
        <span className="dl-mark-count">{count}</span>
        {scrollLabels && (edges.previous || edges.next) && <div className="dl-mark-nav">
          <button type="button" aria-label={scrollLabels.previous} aria-controls={trackId} disabled={!edges.previous}
            onClick={() => scrollByPage(-1)}><ChevronLeft size={17} aria-hidden="true"/></button>
          <button type="button" aria-label={scrollLabels.next} aria-controls={trackId} disabled={!edges.next}
            onClick={() => scrollByPage(1)}><ChevronRight size={17} aria-hidden="true"/></button>
        </div>}
      </div>
      <div className="dl-mark-caption" ref={caption}>
        {preview && <Preview className="dl-mark-detail" href={preview.href}
          tabIndex={preview.href ? -1 : undefined}
          data-return-focus={preview.href ? `${trackId}-${preview.id}` : undefined}
          onBlur={() => setFocused(null)} ref={(node: HTMLElement | null) => { previewPanel.current = node; }}>
          <span className="dl-mark-title">{preview.title}</span>
          <span className="dl-mark-status" data-mark-tone={preview.tone}>{preview.detail}</span>
        </Preview>}
      </div>
      <div className="dl-mark-track" id={trackId} ref={track} onScroll={handleTrackChange}>
        {items.map((item, index) => {
          const Marker = item.href ? "a" : "button";
          return <Marker
            id={`${trackId}-${item.id}`}
            key={item.id}
            href={item.href}
            type={item.href ? undefined : "button"}
            className="dl-mark-button"
            data-mark-tone={item.tone}
            data-preview={preview?.id === item.id || undefined}
            aria-label={item.label}
            aria-pressed={item.href ? undefined : selected === item.id}
            onPointerEnter={event => {
              if (event.pointerType === "touch") return;
              setHovered(item.id);
            }}
            onFocus={() => {
              setHovered(null);
              setFocused(item.id);
            }}
            onBlur={event => {
              if (event.relatedTarget !== previewPanel.current) setFocused(null);
            }}
            onClick={event => selectMark(event, item)}
          >
            <span className="dl-mark-dot" aria-hidden="true"/>
            <small aria-hidden="true">{index + 1}</small>
          </Marker>;
        })}
      </div>
      {scrollbar.max > 0 && <input type="range" className="dl-mark-scrollbar"
        aria-label="Прокрутка посещений лекций" aria-controls={trackId}
        min={0} max={scrollbar.max} value={scrollbar.offset}
        onChange={event => {
          track.current?.scrollTo({ left: event.currentTarget.valueAsNumber, behavior: "instant" });
          handleTrackChange();
        }}/>}
    </section>
  );
}

const attendanceMarkTone: Record<Attendance["status"], MarkTone> = {
  attended: "present",
  distinction: "success",
  absent: "negative",
  planned: "planned",
};
const workMarkTone: Record<CurrentWork["stage"], MarkTone> = {
  defended: "success",
  completed: "review",
  planned: "neutral",
  assigned: "neutral",
};

function AttendanceLine({ title, items, today, lecture = false }: { title: string; items: Attendance[]; today: string; lecture?: boolean }) {
  const attended = items.filter(item => item.status === "attended" || item.status === "distinction").length;
  const marks = items.map(item => {
    const date = displayDate(item.date);
    const detail = item.status === "planned"
      ? item.date < today ? "Нет отметки" : "Запланировано"
      : attendanceLabels[item.status];
    return { id: item.id, title: <time dateTime={item.date}>{date}</time>, label: `${date}: ${detail}`, detail,
      tone: attendanceMarkTone[item.status] };
  });
  const latestLecture = lecture ? items.findLast(item => item.status !== "planned") ?? items[0] : undefined;
  return <StudyMarkStrip title={title} className={lecture ? "dl-attendance dl-lecture-attendance" : "dl-attendance"}
    count={`${attended} из ${items.length} занятий`} items={marks} centerMarkId={latestLecture?.id}/>;
}

const labScrollLabels = { previous: "Предыдущие лабораторные", next: "Следующие лабораторные" };

function LabWorkStrip({ subject, works, link }: { subject: StudySubjectDisplay; works: StudyWorkDisplay[]; link: WorkLink }) {
  return <StudyMarkStrip title="Лабораторные работы" label="Общие лабораторные работы" className="dl-lab-group"
    count={<>Сдано <strong>{works.filter(isSubmitted).length} из {works.length}</strong></>}
    scrollLabels={labScrollLabels}
    items={works.map(work => {
      const score = work.points === null ? `баллы ещё не опубликованы, максимум ${work.maxPoints}` : `баллы ${work.points} из ${work.maxPoints}`;
      return { id: work.id, title: work.title, label: `${work.title}: ${workStatus(work)}. ${score}`,
        detail: `${work.points ?? "—"} / ${work.maxPoints}`,
        tone: isOverdue(work) ? "negative" : workMarkTone[work.stage], href: link(subject.id, work.id) };
    })}/>;
}

const gradeThresholds = [
  { grade: 3, points: 60 },
  { grade: 4, points: 70 },
  { grade: 5, points: 85 },
] as const;
const passThreshold = [{ grade: null, points: 60 }] as const;

function SubjectDetails({ entry, panelId, link }: { entry: SubjectEntry; panelId?: string; link: WorkLink }) {
  const { subject, today, semester, total, maximum } = entry;
  const semesterMax = subject.semesterMaxPoints;
  const titleId = useId();
  const hasExam = subject.examMaxPoints > 0;
  const isPass = subject.assessment === passAssessment;
  const thresholds = isPass ? passThreshold : gradeThresholds;
  const thresholdsLabel = isPass ? "Порог зачёта"
    : hasExam ? "Пороги за семестр при максимуме на экзамене" : "Пороги оценок";
  const initials = subject.teacher.split(/\s+/).slice(0, 2).map(name => name[0]).join("");
  const labs = subject.works.filter(work => work.kind === "lab");
  const otherWorks = subject.works.filter(work => work.kind === "seminar" || work.kind === "coursework" || !work.moduleId && (work.kind === "homework" || work.kind === "control" || work.kind === "module"));

  return (
    <div id={panelId} className="dl-subject-body" role={panelId ? "region" : undefined} aria-labelledby={panelId ? titleId : undefined}>
      <div className="dl-content-card dl-subject-overview">
        <div className="dl-subject-header">
          {panelId && <h2 className="dl-panel-title" id={titleId}>{subject.title}</h2>}
          <div className="dl-subject-teacher">
            <div className="dl-teacher-person">
              <span className="dl-teacher-avatar" aria-hidden="true">{initials}</span>
              {subject.teacherId === undefined ? <TeacherLink name={subject.teacher}/>
                : subject.teacherId ? <a className="p-teacher-link" href={`#teacher/${subject.teacherId}`} aria-label={`Расписание преподавателя: ${subject.teacher}`}>{subject.teacher}</a>
                  : <span>{subject.teacher}</span>}
            </div>
            <strong className="dl-assessment-code" title={subject.assessment}>{assessmentCodes[subject.assessment] ?? subject.assessment}</strong>
          </div>
        </div>
        <div className="dl-subject-results">
          <dl className="dl-score-breakdown">
            <div><dt>Семестр</dt><dd>{semester ?? "—"}{semesterMax !== null && ` / ${semesterMax}`}</dd></div>
            {hasExam && (
              <>
                <div><dt>Экзамен</dt><dd>{subject.examPoints ?? "—"} / {subject.examMaxPoints}</dd></div>
                <div><dt>Всего</dt><dd>{total ?? "—"}{maximum !== null && ` / ${maximum}`}</dd></div>
              </>
            )}
          </dl>
          {semesterMax !== null && semesterMax > 0 && maximum !== null && <div className="dl-score-scale">
            <div className="dl-semester-bar" aria-hidden="true">
              <span style={{ flexGrow: semesterMax }}>
                <i style={{ width: `${(semester ?? 0) / semesterMax * 100}%` }}/>
              </span>
              {hasExam && <span style={{ flexGrow: subject.examMaxPoints }}>
                <i style={{ width: `${(subject.examPoints ?? 0) / subject.examMaxPoints * 100}%` }}/>
              </span>}
            </div>
            {maximum === 100 && subject.examMaxPoints <= 60 && <ol className="dl-grade-thresholds" role="list" aria-label={thresholdsLabel}>
              {thresholds.map(({ grade, points }) => {
                const threshold = points - subject.examMaxPoints;
                return <li key={points} data-grade={grade ?? "pass"} style={{ insetInlineStart: `${threshold / maximum * 100}%` }}>
                  <span className="dl-grade-tick" aria-hidden="true"/>
                  <span aria-hidden="true">{grade === null ? `>${threshold}` : threshold}</span>
                  <span className="sr-only">{grade === null ? `Больше ${threshold} баллов` : `Оценка ${grade} — от ${threshold} баллов`}</span>
                </li>;
              })}
            </ol>}
          </div>}
          {subject.grade && <p className="dl-subject-final">Итог: {subject.grade}</p>}
        </div>
      </div>

      <div className="dl-modules">
        {subject.modules.map((module, index) => {
          const score = moduleScore(subject.works, module);
          const works = subject.works.filter(work => module.workIds.includes(work.id));

          return (
            <details className="dl-content-card dl-module p-native-fold" key={module.id} data-module-id={module.id}>
              <summary className="dl-module-heading">
                <span className="dl-module-title">Модуль {index + 1}</span>
                <SubjectScore total={score.earned} maximum={score.max} compact/>
                <ChevronDown className="dl-chevron" size={16} aria-hidden="true"/>
              </summary>
              <div className="p-native-fold-body">
                <div className="dl-module-body">
                  <WorkGroup subject={subject} link={link} works={works.filter(work => work.kind === "homework")} title="Домашние задания"/>
                  <WorkGroup subject={subject} link={link} works={works.filter(work => work.kind === "control")} title="Рубежный контроль"/>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {labs.length > 0 && <LabWorkStrip subject={subject} link={link} works={labs}/>}
      {otherWorks.length > 0 && (
        <section className="dl-content-card dl-common-group dl-other-work" aria-label="Другие работы">
          <WorkGroup subject={subject} link={link} works={otherWorks.filter(work => work.kind === "homework")} title="Домашние задания"/>
          <WorkGroup subject={subject} link={link} works={otherWorks.filter(work => work.kind === "control" || work.kind === "module")} title="Рубежный контроль"/>
          <WorkGroup subject={subject} link={link} works={otherWorks.filter(work => work.kind === "seminar")} title="Семинары"/>
          <WorkGroup subject={subject} link={link} works={otherWorks.filter(work => work.kind === "coursework")} title="Курсовая работа"/>
        </section>
      )}

      <AttendanceLine title="Посещения практических занятий" items={subject.attendance} today={today}/>
      {Boolean(subject.lectureAttendance?.length) && <AttendanceLine title="Посещения лекций" items={subject.lectureAttendance ?? []} today={today} lecture/>}

    </div>
  );
}

function SubjectCard({ entry, targeted, visible, link }: { entry: SubjectEntry; targeted: boolean; visible: boolean; link: WorkLink }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  useEffect(() => {
    if (targeted && details.current) {
      details.current.open = true;
      summary.current?.focus();
      summary.current?.scrollIntoView({ block: "nearest" });
    }
  }, [targeted]);

  return (
    <article className="dl-subject" data-subject-id={entry.subject.id}>
      <details ref={details} className="p-native-fold" open={targeted || undefined}>
        <summary ref={summary} className="dl-subject-summary"><SubjectSummary entry={entry} visible={visible}/></summary>
        <div className="p-native-fold-body"><SubjectDetails entry={entry} link={link}/></div>
      </details>
    </article>
  );
}

const [demoSports] = sportsSemesters;
const demoSportsPassed = sportsPassCriteria(demoSports).passed;
const demoStudy: StudyDisplayData = {
  subjects: currentSubjects, today: studyDemoDate, semesterLabel: "5 семестр", week: currentWeek,
  sports: {
    attendance: demoSports.attended, targetAttendance: demoSports.goal, score: demoSports.points,
    minimumPoints: sportsMinimumPoints, passed: demoSportsPassed,
    status: demoSportsPassed ? "Условия зачёта выполнены" : "Условия зачёта не выполнены",
  },
};

export function StudyProgressPage({ initialSubjectId, visible, children, data = demoStudy, link = workHref }: {
  initialSubjectId?: string;
  visible: boolean;
  children?: ReactNode;
  data?: StudyDisplayData;
  link?: WorkLink;
}) {
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, mobileSnapshot);
  const panelId = useId();
  const subjects = orderedSubjects(data.subjects, data.today);
  const assessments = new Set([...assessmentGroupLabels.keys(), ...subjects.map(({ subject }) => subject.assessment)]);
  const subjectGroups = Array.from(assessments, assessment => ({
    assessment, label: assessmentGroupLabels.get(assessment) ?? assessment,
    entries: subjects.filter(({ subject }) => subject.assessment === assessment),
  })).filter(group => group.entries.length > 0 || group.assessment === passAssessment && data.sports);
  const firstSubject = subjectGroups.find(group => group.entries.length > 0)?.entries[0];
  const initialEntry = subjects.find(entry => entry.subject.id === initialSubjectId);
  const [selectedId, setSelectedId] = useState(initialEntry?.subject.id);
  const selected = subjects.find(entry => entry.subject.id === selectedId) ?? initialEntry ?? firstSubject;
  const term = [data.semesterLabel, data.week === null ? null : `${data.week}-я учебная неделя`].filter(Boolean).join(" · ");
  const unknown = Boolean(initialSubjectId && !initialEntry);
  const subjectList = (
    <div className="dl-subject-grid" role="group" aria-label="Дисциплины текущего семестра">
      {subjectGroups.map(group => (
        <section className="dl-subject-group" key={group.assessment} aria-label={group.label}>
          <h2 className="dl-subject-group-title">{group.label}</h2>
          {group.entries.map(entry => desktop ? (
            <div key={entry.subject.id} className="dl-subject" data-subject-id={entry.subject.id}>
              <button type="button" className="dl-subject-summary" aria-pressed={entry === selected}
                aria-controls={panelId} onClick={() => setSelectedId(entry.subject.id)}>
                <SubjectSummary entry={entry} visible={visible} desktop/>
              </button>
            </div>
          ) : (
            <SubjectCard key={entry.subject.id} entry={entry} targeted={entry === initialEntry} visible={visible} link={link}/>
          ))}
          {group.assessment === passAssessment && data.sports && <SportsSubjectCard visible={visible} sports={data.sports}/>}
        </section>
      ))}
    </div>
  );

  return (
    <section className="dl-root dl-dashboard" aria-labelledby="dl-study-title">
      {children}
      <div className="p-page-heading dl-heading">
        <div><h1 id="dl-study-title">Успеваемость</h1>{term && <p>{term}</p>}</div>
      </div>
      {unknown ? (
        <div className="dl-not-found">
          <h2>Дисциплина не найдена</h2>
          <a href="#study">Вернуться к успеваемости</a>
        </div>
      ) : desktop && selected ? (
        <div className="dl-desktop">
          {subjectList}
          <SubjectDetails key={selected.subject.id} entry={selected} panelId={panelId} link={link}/>
        </div>
      ) : subjectList}
    </section>
  );
}
