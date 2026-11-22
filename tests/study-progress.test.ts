import { describe, expect, it } from "vitest";
import { currentSubjects, isOverdueWork, modulePoints, subjectEarnedPoints, studyDemoDate, workHref } from "../src/components/prototype/study-current-data";

describe("synthetic study progress",()=>{
 it("uses genuine semester budgets and a separate 30-point exam",()=>{
  for(const subject of currentSubjects){
   expect(subject.works.reduce((sum,work)=>sum+work.maxPoints,0)).toBe(subject.semesterMaxPoints);
   expect(subject.semesterMaxPoints+subject.examMaxPoints).toBe(100);
   if(subject.assessment==="Экзамен"){expect(subject.semesterMaxPoints).toBe(70);expect(subject.examMaxPoints).toBe(30);}
   expect(new Set(subject.works.map(work=>work.id)).size).toBe(subject.works.length);
   for(const work of subject.works){expect(work.maxPoints).toBeGreaterThan(0);if(work.points!==null){expect(work.points).toBeGreaterThanOrEqual(0);expect(work.points).toBeLessThanOrEqual(work.maxPoints);expect(work.gradedAt).not.toBeNull();}}
  }
 });
 it("groups homework and controls into two or three meaningful module aggregates",()=>{
  expect(new Set(currentSubjects.map(subject=>subject.modules.length))).toEqual(new Set([2,3]));
  for(const subject of currentSubjects){
   expect(subject.works.some(work=>work.kind==="module")).toBe(false);
   for(const module of subject.modules){
    const works=subject.works.filter(work=>module.workIds.includes(work.id));
    expect(works.some(work=>work.kind==="homework")).toBe(true);
    expect(works.some(work=>work.kind==="control")).toBe(true);
    expect(works.every(work=>work.moduleId===module.id)).toBe(true);
    const points=modulePoints(subject,module);
    expect(points.max).toBe(works.reduce((sum,work)=>sum+work.maxPoints,0));
    expect(points.earned).toBe(works.some(work=>work.points!==null)?works.reduce((sum,work)=>sum+(work.points??0),0):null);
   }
   expect(subject.works.filter(work=>work.kind==="lab").every(work=>work.moduleId===null)).toBe(true);
  }
 });
 it("keeps existing overdue and current-week deadlines, without module aggregate deadlines",()=>{
  const works=currentSubjects.flatMap(subject=>subject.works);
  expect(works.filter(isOverdueWork).map(work=>work.title).sort()).toEqual(["ЛР4 · Проверка гипотез","РК1 · Эластичность","Анализ исторического источника"].sort());
  const upcoming=works.filter(work=>(work.stage==="planned"||work.stage==="assigned")&&work.dueOn&&work.dueOn>=studyDemoDate&&work.dueOn<="2026-11-23");
  expect([...new Set(upcoming.map(work=>work.dueOn))].sort()).toEqual(["2026-11-17","2026-11-19","2026-11-20"]);
  expect(upcoming).toHaveLength(5);
  const analysis=currentSubjects.find(subject=>subject.id==="data-analysis")!;
  expect(analysis.works.find(work=>work.id==="homework-1")).toMatchObject({title:"Среднее значение и медиана",dueOn:"2026-11-20"});
  expect(analysis.works.find(work=>work.id==="control-1")).toMatchObject({title:"РК1 · Анализ учебного набора данных",dueOn:"2026-11-17"});
  expect(workHref(analysis.id,"homework-1")).toBe("#work/data-analysis/homework-1");
 });
 it("distinguishes published zero from an unpublished result",()=>{
  const subject=currentSubjects.find(subject=>subject.id==="economics")!;
  const zero=subject.works.find(work=>work.id==="homework-1")!;
  expect(zero.points).toBe(0);
  expect(subjectEarnedPoints({...subject,works:[zero]})).toBe(0);
  expect(subjectEarnedPoints({...subject,works:[{...zero,points:null}]})).toBeNull();
 });
 it("contains explicit normal, distinguished, absent and unmarked attendance",()=>{
  for(const subject of currentSubjects){expect(new Set(subject.attendance.map(item=>item.status))).toEqual(new Set(["attended","distinction","absent","planned"]));}
 });
});
