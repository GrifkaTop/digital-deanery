import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyProgressPage } from "@/components/prototype/deadlines";
import { demoHomeDate } from "@/components/prototype/home-content";
import { SportsPrototype } from "@/components/prototype/services-sports";
import { compareSportsNorm, healthPassport, passportValidity, sportsPassCriteria, sportsSemesters } from "@/components/prototype/sports-demo";

describe("Atlas sports demonstration", () => {
  it("preserves the current term's attendance and provides two completed historical terms", () => {
    const [current, ...historical] = sportsSemesters;
    expect(current).toMatchObject({ id: "semester-5", attended: 12, goal: 16, points: 24 });
    expect(historical.map(({ id }) => id)).toEqual(["semester-4", "semester-3"]);
    expect(historical.map(semester => sportsPassCriteria(semester).passed)).toEqual([true, true]);
  });

  it.each([
    [24, 12, false, false, false],
    [60, 15, true, false, false],
    [59, 16, false, true, false],
    [60, 16, true, true, true],
  ])("evaluates both pass requirements with %i points and %i visits", (points, attended, pointsMet, visitsMet, passed) => {
    expect(sportsPassCriteria({ ...sportsSemesters[0], points, attended })).toEqual({ pointsMet, visitsMet, passed });
  });

  it("computes improvement in both directions and keeps a worse result negative", () => {
    const current = sportsSemesters[0];
    const [sprint, jump] = current.norms;
    const sprintDifference = compareSportsNorm(current, sprint);
    expect(sprintDifference?.priorResult).toBe(15.4);
    expect(sprintDifference?.improvement).toBeCloseTo(0.6);
    expect(compareSportsNorm(current, jump)).toEqual({ priorResult: 178, improvement: 7 });
    expect(compareSportsNorm(current, { ...jump, result: 175, status: "failed" })).toEqual({ priorResult: 178, improvement: -3 });
  });

  it("omits comparisons without a matching past result or compatible unit and direction", () => {
    const [current, spring] = sportsSemesters;
    const [sprint, , pushUps, forwardBend] = current.norms;
    expect(compareSportsNorm(current, pushUps)).toBeNull();
    expect(compareSportsNorm(current, forwardBend)).toBeNull();
    expect(compareSportsNorm(spring, spring.norms[0])).toBeNull();
    expect(compareSportsNorm(current, { ...sprint, unit: "мин" })).toBeNull();
    expect(compareSportsNorm(current, { ...sprint, direction: "higher" })).toBeNull();
  });

  it("renders current PE criteria and a link in the study view", () => {
    const markup = renderToStaticMarkup(createElement(StudyProgressPage, { visible: true, children: null }));
    expect(markup).toContain('href="#sports"');
    expect(markup).toContain("Посещения: 12 из 16");
    expect(markup).toContain('aria-label="Посещения: 12 из 16"');
    expect(markup).toContain('Баллы для зачёта: 24 из 60');
    expect(markup).toContain("Условия зачёта не выполнены");
  });

  it("uses the shared ring for current attendance and exposes final criteria to assistive technology", () => {
    const markup = renderToStaticMarkup(createElement(SportsPrototype, { visible: true }));
    expect(markup).toContain('class="p-progress-ring ss-ring" aria-hidden="true"');
    expect(markup).toContain('stroke-dasharray="75 100" stroke-linecap="round"');
    expect(markup).toContain('<span class="p-progress-ring-earned">12</span><span class="p-progress-ring-maximum">/16</span>');
    expect(markup).toContain('<dt>Посещения</dt><dd><strong>12</strong> · минимум 16</dd>');
  });

  it("shows eight days left for the demo passport on the shared demo date", () => {
    expect(healthPassport.group).toBe("Основная");
    expect(passportValidity(healthPassport.validThrough, demoHomeDate)).toEqual({ daysRemaining: 8, kind: "expiring" });
  });

  it.each([
    ["2026-11-10", 15, "valid"],
    ["2026-11-11", 14, "expiring"],
    ["2026-11-25", 0, "expiring"],
    ["2026-11-26", -1, "expired"],
  ])("classifies passport validity on %s", (today, daysRemaining, kind) => {
    expect(passportValidity(healthPassport.validThrough, today)).toEqual({ daysRemaining, kind });
  });

  it("counts whole calendar days across the end of a year", () => {
    expect(passportValidity("2027-01-01", "2026-12-31")).toEqual({ daysRemaining: 1, kind: "expiring" });
  });
});
