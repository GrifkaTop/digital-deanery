import "server-only";
import { studyPlanResponse, type StudyPlan } from "@/contracts/study-plan";
import type { Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";

type PlanRow = {
  id: string; semesterId: string; isCurrent: boolean; semesterNumber: number | null;
  title: string; assessment: "exam" | "credit" | "graded_credit"; assessmentLabel: string | null;
  department: string | null; hours: number | null; courseworkHours: number | null;
  gradeValue: number | null; gradeScale: "five" | "hundred" | null; gradeOutcome: "pass" | "fail" | null;
};

const assessments = { exam: "Экзамен", credit: "Зачёт", graded_credit: "Дифференцированный зачёт" };
const fivePointGrades: Record<number, string> = {
  1: "Неудовлетворительно", 2: "Неудовлетворительно", 3: "Удовлетворительно", 4: "Хорошо", 5: "Отлично",
};

function gradeLabel(row: PlanRow) {
  if (row.gradeValue !== null) {
    return row.gradeScale === "five" ? fivePointGrades[row.gradeValue] ?? String(row.gradeValue) : row.gradeValue + " из 100";
  }
  return row.gradeOutcome === "pass" ? "Зачтено" : row.gradeOutcome === "fail" ? "Не зачтено" : null;
}

export async function readStudyPlan(actor: Actor, now: Date): Promise<StudyPlan> {
  const { rows } = await getPool().query<PlanRow>(`
    SELECT p.id, s.id AS "semesterId", s.is_current AS "isCurrent", m.semester_number AS "semesterNumber",
      d.title, d.assessment, m.assessment_label AS "assessmentLabel", m.department, m.hours,
      m.coursework_hours AS "courseworkHours", g.value::float8 AS "gradeValue", g.scale AS "gradeScale", g.outcome AS "gradeOutcome"
    FROM study_plan_items p
    JOIN disciplines d ON d.id = p.discipline_id
    JOIN semesters s ON s.id = d.semester_id
    LEFT JOIN study_plan_details m ON m.plan_item_id = p.id
    LEFT JOIN grades g ON g.plan_item_id = p.id AND g.kind IN ('final', 'credit') AND g.published_at <= $2
    WHERE p.student_id = $1 AND d.group_id = $3
    ORDER BY s.starts_on, s.id, m.position NULLS LAST, d.title, p.id
  `, [actor.id, now, actor.group_id]);
  const reserved = new Set(rows.flatMap(row => row.semesterNumber === null ? [] : [row.semesterNumber]));
  const bySemester = new Map<string, StudyPlan["semesters"][number]>();
  for (const row of rows) {
    let semester = bySemester.get(row.semesterId);
    if (!semester) {
      const explicit = rows.find(item => item.semesterId === row.semesterId && item.semesterNumber !== null)?.semesterNumber;
      let number = explicit ?? 1;
      if (explicit == null) {
        while (reserved.has(number)) number++;
        reserved.add(number);
      }
      semester = { id: row.semesterId, number, isCurrent: row.isCurrent, rows: [] };
      bySemester.set(row.semesterId, semester);
    }
    semester.rows.push({
      id: row.id, title: row.title, type: row.assessmentLabel ?? assessments[row.assessment], department: row.department,
      hours: row.hours, grade: gradeLabel(row),
    });
    if (row.courseworkHours !== null) {
      semester.rows.push({ id: row.id + "-coursework", title: row.title, type: "Курсовая работа",
        department: row.department, hours: row.courseworkHours, grade: null });
    }
  }
  return studyPlanResponse.parse({ semesters: [...bySemester.values()].sort((a, b) => b.number - a.number) });
}
