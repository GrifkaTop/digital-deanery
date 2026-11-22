import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcademicPlan } from "@/components/prototype/study-plan";
import { studyPlanResponse } from "@/contracts/study-plan";

const semester = "f0000000-0000-4000-8000-000000000005";
const prior = "f0000000-0000-4000-8000-000000000004";
const data = studyPlanResponse.parse({ semesters: [
  { id: semester, number: 5, isCurrent: true, rows: [
    { id: "data", title: "Анализ данных", type: "Экзамен", department: "ИС", hours: 144, grade: "0 из 100" },
    { id: "coursework", title: "Анализ данных", type: "Курсовая работа", department: "ИС", hours: 36, grade: null },
    { id: "lang", title: "Иностранный язык", type: "Зачёт", department: null, hours: null, grade: "Зачтено" },
  ] },
  { id: prior, number: 4, isCurrent: false, rows: [
    { id: "stats", title: "Математическая статистика", type: "Экзамен", department: "МАТ", hours: 108, grade: "Отлично" },
  ] },
] });

describe("Atlas canonical study plan", () => {
  it("renders the real rows with original table, semester controls and distinct zero", () => {
    const html = renderToStaticMarkup(createElement(AcademicPlan, { back: "Назад", data }));
    expect(html).toContain("ap-table");
    expect(html).toContain("Семестр 5<span> · текущий");
    expect(html).toContain("Предыдущий семестр");
    expect(html).toContain("Следующий семестр");
    expect(html).toContain("Итоги 5-го семестра");
    expect(html).toContain("Известные часы");
    expect(html).toContain("0 из 100");
    expect(html).toContain("Оценка не опубликована");
    expect(html).not.toContain("Математическая статистика");
  });

  it("uses the selected semester and handles no rows without synthetic data", () => {
    const chosen = renderToStaticMarkup(createElement(AcademicPlan, { back: "Назад", data, initialSemesterId: prior }));
    expect(chosen).toContain("Математическая статистика");
    expect(chosen).not.toContain("Анализ данных");
    const empty = renderToStaticMarkup(createElement(AcademicPlan, { back: "Назад", data: { semesters: [] } }));
    expect(empty).toContain("Учебный план пока недоступен");
    expect(empty).not.toContain("ap-table");
  });
});
