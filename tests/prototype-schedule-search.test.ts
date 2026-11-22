import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScheduleGrid } from "@/components/prototype/schedule-grid";
import { findScheduleTargets, ScheduleDirectory } from "@/components/prototype/search";
import { GroupSchedule, TeacherSchedule } from "@/components/prototype/teachers";

const back = createElement("a", { href: "#schedule" }, "К моему расписанию");

describe("Atlas schedule search", () => {
  it("finds teachers by surname and name with case-insensitive ё normalization", () => {
    expect(findScheduleTargets("  ОЗЕРСКИЙ лев ").teachers).toMatchObject([{ href: "#teacher/ozersky" }]);
    expect(findScheduleTargets("ёлизавета").teachers).toEqual([]);
  });

  it.each(["ИС-32", "ис‑32", "ис 32", "ис32", "is-32"])("finds the same synthetic group for %s", query => {
    expect(findScheduleTargets(query).groups).toMatchObject([{ href: "#group/is-32", title: "ИС-32" }]);
  });

  it("does not search private names or unrelated sections", () => {
    expect(findScheduleTargets("успеваемость")).toEqual({ teachers: [], groups: [] });
    expect(findScheduleTargets("Миронов")).toEqual({ teachers: [], groups: [] });
  });

  it("starts with a labeled, closed search button", () => {
    const markup = renderToStaticMarkup(createElement(ScheduleDirectory, { children: null }));
    expect(markup).toContain('aria-label="Поиск расписания" aria-expanded="false"');
    expect(markup).not.toContain("sg-directory-panel");
  });

  it("keeps both actions in the page heading and the week label above the dates", () => {
    const markup = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    const heading = markup.match(/<header class="sg-mobile-heading">.*?<\/header>/)?.[0];
    expect(heading).toContain('href="/prototype/schedule/export?scope=own&amp;week=2026-11-16" download=""');
    expect(heading).toContain('aria-label="Экспорт недели в календарь" title="Экспорт недели в календарь"');
    expect(heading).toContain('aria-label="Поиск расписания" aria-expanded="false" title="Поиск расписания"');
    expect(heading).not.toMatch(/>\s*(Экспорт|Поиск)\s*</);
    expect(heading).not.toContain("sg-week-indicator");
    expect(markup).toContain('<div class="sg-mobile-week"><p class="sg-week-indicator" aria-live="polite">12-я неделя · <strong class="sg-week-type">знаменатель</strong></p><div class="sg-mobile-days"');
  });

  it("uses the allowlisted group timetable without work links, tags or counters", () => {
    const markup = renderToStaticMarkup(createElement(GroupSchedule, { id: "is-32", back }));
    expect(markup).toContain("Группа ИС-32");
    expect(markup).toContain("Синтетическая учебная группа");
    expect(markup).toContain("is-32-2-1-both");
    expect(markup).toContain('href="#teacher/berestova"');
    expect(markup).toContain('/prototype/schedule/export?scope=group&amp;id=is-32&amp;week=2026-11-16');
    expect(markup).not.toMatch(/#work\/|sg-work-tags|sg-date-work/);
    const unknown = renderToStaticMarkup(createElement(GroupSchedule, { id: "unknown", back }));
    expect(unknown).toContain("Группа не найдена");
    expect(unknown).toContain('href="#schedule"');
    expect(unknown).not.toContain("sg-root");
  });

  it("includes classes from both demo groups in a teacher's timetable", () => {
    const markup = renderToStaticMarkup(createElement(TeacherSchedule, { id: "severova", back }));
    expect(markup).toContain("Северова Арина Павловна");
    expect(markup).toContain("корпус А · ИС-31");
    expect(markup).toContain("корпус Б · ИС-32");
    expect(markup).toContain('/prototype/schedule/export?scope=teacher&amp;id=severova&amp;week=2026-11-16');
  });
});
