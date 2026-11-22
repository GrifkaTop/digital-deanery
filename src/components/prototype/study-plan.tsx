"use client";

import { useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { StudyPlan } from "@/contracts/study-plan";
import "./study-plan.css";

type SemesterEntries = StudyPlan["semesters"][number];
const numberFormat = new Intl.NumberFormat("ru-RU", { useGrouping: "always" });

const shortTypes: Partial<Record<string, string>> = {
  "Экзамен": "Экз.", "Зачёт": "Зач.", "Дифференцированный зачёт": "Диф. зач.",
  "Курсовая работа": "КР", "Курсовой проект": "КП", "Защита ВКР": "ВКР",
};
const gradeMarks: Partial<Record<string, number>> = { "Отлично": 5, "Хорошо": 4, "Удовлетворительно": 3 };

function PlanGrade({ grade }: { grade: string | null }) {
  if (grade === null) return <span className="ap-no-grade"><span aria-hidden="true">—</span><span className="ap-sr-only">Оценка не опубликована</span></span>;

  return <span className="ap-grade" data-mark={gradeMarks[grade]} data-pass={grade === "Зачтено" || undefined} title={grade}>
    <span className="ap-grade-label">{grade}</span>
    {grade === "Удовлетворительно" && <span className="ap-grade-short" aria-hidden="true">Удовл.</span>}
  </span>;
}

function AssessmentType({ type }: { type: string }) {
  return <>
    <span aria-hidden="true" title={type}>{shortTypes[type] ?? type}</span>
    <span className="ap-sr-only">{type}</span>
  </>;
}

function SemesterTable({ number: semester, rows }: SemesterEntries) {
  const headingId = `ap-semester-${semester}`;
  return <section className="ap-semester" aria-labelledby={headingId}>
    <h2 className="ap-table-title" id={headingId}>Семестр {semester}</h2>
    <table className="ap-table" aria-labelledby={headingId}>
      <colgroup><col/><col className="ap-type-col"/><col className="ap-hours-col"/><col className="ap-grade-col"/></colgroup>
      <thead><tr>
        <th scope="col">Дисциплина <span className="ap-table-note">(кафедра, тип сдачи)</span></th>
        <th className="ap-type-cell" scope="col">Тип сдачи</th>
        <th scope="col">Часы</th>
        <th className="ap-grade-cell" scope="col">Оценка</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th scope="row">
          {row.title}{" "}<span className="ap-assessment">({row.department && `${row.department}, `}<AssessmentType type={row.type}/>)</span>
          {row.department && <span className="ap-department">{row.department}</span>}
        </th>
        <td className="ap-type-cell"><span className="ap-type-badge"><AssessmentType type={row.type}/></span></td>
        <td className="ap-hours-cell">{row.hours ?? "—"}</td>
        <td className="ap-grade-cell"><PlanGrade grade={row.grade}/></td>
      </tr>)}</tbody>
    </table>
  </section>;
}

function PlanStatistics({ number: semester, rows }: SemesterEntries) {
  const disciplines = new Set(rows.map(row => row.title)).size;
  const knownHours = rows.flatMap(row => row.hours === null ? [] : [row.hours]);
  const hours = knownHours.reduce((total, value) => total + value, 0);
  const published = rows.filter(row => row.grade !== null).length;

  return <section className="ap-statistics" aria-labelledby="ap-statistics-title">
    <h2 id="ap-statistics-title">Итоги {semester}-го семестра</h2>
    <dl className="ap-statistics-grid">
      <div><dt>Дисциплины</dt><dd>{numberFormat.format(disciplines)}</dd></div>
      <div>
        <dt>{knownHours.length === rows.length ? "Часы по плану" : "Известные часы"}</dt>
        <dd>{knownHours.length ? numberFormat.format(hours) : "—"}</dd>
      </div>
      <div><dt>Оценки и зачёты</dt><dd>{published} <span>из {rows.length}</span></dd></div>
    </dl>
  </section>;
}

export function AcademicPlan({ back, data, initialSemesterId }: { back: ReactNode; data: StudyPlan; initialSemesterId?: string }) {
  const semesters = useMemo(() => [...data.semesters].sort((left, right) => left.number - right.number), [data.semesters]);
  const current = semesters.find(term => term.isCurrent);
  const initial = semesters.find(term => term.id === initialSemesterId) ?? current ?? semesters[0];
  const [selectedId, setSelectedId] = useState(initial?.id);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const selected = semesters.find(term => term.id === selectedId) ?? initial;
  const termIndex = semesters.findIndex(term => term.id === selected?.id);

  function changeSemester(step: number) {
    const next = semesters[termIndex + step];
    if (next) setSelectedId(next.id);
  }

  function startSwipe(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) return;
    const { clientX: x, clientY: y } = event.touches[0];
    touch.current = { x, y };
  }

  function endSwipe(event: TouchEvent<HTMLDivElement>) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const { clientX, clientY } = event.changedTouches[0];
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) >= 65 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      changeSemester(dx < 0 ? 1 : -1);
    }
  }

  if (!selected) return <section className="ap-root">
    {back}<header className="ap-heading"><h1>Учебный план</h1></header><p role="status">Учебный план пока недоступен.</p>
  </section>;

  return <section className="ap-root">
    {back}
    <header className="ap-heading">
      <h1>Учебный план</h1>
      <div className="ap-semester-controls" role="group" aria-label="Переключение семестров">
        <button type="button" aria-label="Предыдущий семестр" disabled={termIndex <= 0} onClick={() => changeSemester(-1)}>
          <ArrowLeft size={20} aria-hidden="true"/>
        </button>
        <span className="ap-semester-label" aria-live="polite">Семестр {selected.number}{selected.isCurrent && <span> · текущий</span>}</span>
        <button type="button" aria-label="Следующий семестр" disabled={termIndex >= semesters.length - 1} onClick={() => changeSemester(1)}>
          <ArrowRight size={20} aria-hidden="true"/>
        </button>
      </div>
    </header>
    <div className="ap-plan-body">
      <div className="ap-semester-sheet" onTouchStart={startSwipe} onTouchEnd={endSwipe} onTouchCancel={() => { touch.current = null; }}>
        <SemesterTable {...selected}/>
      </div>
      <PlanStatistics {...selected}/>
    </div>
  </section>;
}
