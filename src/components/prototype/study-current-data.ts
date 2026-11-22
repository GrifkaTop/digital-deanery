import { subjects, teacherNames } from "./academic-data";

export const studyDemoDate = "2026-11-17";
export const currentWeek = 12;

export const studyWorkLabels = {
  lab: "Лабораторная работа",
  homework: "Домашнее задание",
  control: "Рубежный контроль",
  seminar: "Семинар",
  coursework: "Курсовая работа",
  module: "Модуль",
} as const;
export const studyStageLabels = { planned: "Запланировано", assigned: "Выдано", completed: "Сдано, на проверке", defended: "Защищено" } as const;

export type WorkKind = keyof typeof studyWorkLabels;
export type WorkStage = keyof typeof studyStageLabels;
export type CurrentWork = {
  id: string;
  title: string;
  kind: WorkKind;
  week: number;
  dueOn: string | null;
  stage: WorkStage;
  submittedAt: string | null;
  gradedAt: string | null;
  points: number | null;
  maxPoints: number;
  moduleId: string | null;
};
export type StudyModule = {
  id: string;
  title: string;
  workIds: string[];
};
export type Attendance = {
  id: string;
  date: string;
  status: "attended" | "distinction" | "absent" | "planned";
};
export type CurrentSubject = {
  id: string;
  title: string;
  teacher: string;
  assessment: string;
  grade: string | null;
  works: CurrentWork[];
  modules: StudyModule[];
  attendance: Attendance[];
  semesterMaxPoints: number;
  examMaxPoints: number;
  examPoints: number | null;
};

export const isClosedWork = (work: CurrentWork) => work.stage === "defended";
export const isOverdueWork = (work: CurrentWork) => work.stage === "assigned" && work.dueOn !== null && work.dueOn < studyDemoDate;

function work(kind: WorkKind, number: number, title: string, week: number, dueOn: string | null, stage: WorkStage, options: {
  submittedAt?: string;
  gradedAt?: string;
  points?: number;
  maxPoints?: number;
} = {}): CurrentWork {
  return {
    id: `${kind}-${number}`, title, kind, week, dueOn, stage,
    submittedAt: options.submittedAt ?? null, gradedAt: options.gradedAt ?? null,
    points: options.points ?? null, maxPoints: options.maxPoints ?? 20, moduleId: null,
  };
}

const at = (date: string, time = "15:20") => `${date}T${time}:00+03:00`;
const published = (points: number, submitted: string, graded: string, maxPoints = 20) => ({
  points, maxPoints, submittedAt: at(submitted), gradedAt: at(graded, "17:40"),
});

const moduleTitles = [
  ["Учебная коммуникация", "Работа с источниками", "Аргументация"],
  ["Подготовка данных", "Статистика и гипотезы", "Моделирование"],
  ["Спрос и рыночный выбор", "Фирма и конкуренция"],
  ["Источники и исторический контекст", "Анализ и аргументация"],
  ["Правовые основы", "Практика решения кейсов"],
  ["Модель системы", "Прототип и хранилище", "Проверка решения"],
];

/** Allocate an integer semester budget, keeping the proportions of published fixture marks. */
function allocateSemesterPoints(works: CurrentWork[], budget: number) {
  const totalWeight = works.reduce((sum, item) => sum + item.maxPoints, 0);
  const allocations = works.map(item =>
    Math.max(1, Math.floor(item.maxPoints * budget / totalWeight)),
  );
  let remaining = budget - allocations.reduce((sum, value) => sum + value, 0);
  const order = works
    .map((item, index) => ({
      index,
      remainder: item.maxPoints * budget / totalWeight - allocations[index],
    }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let index = 0; remaining > 0; index++, remaining--) {
    allocations[order[index % order.length].index]++;
  }

  return works.map((item, index) => ({
    ...item,
    maxPoints: allocations[index],
    points: item.points === null
      ? null
      : Math.round(item.points * allocations[index] / item.maxPoints),
  }));
}

function discipline(
  index: number,
  id: string,
  assessment: string,
  rawWorks: CurrentWork[],
  grade: string | null = null,
): CurrentSubject {
  const modules: StudyModule[] = moduleTitles[index].map((title, n) => ({
    id: `module-${n + 1}`,
    title,
    workIds: [],
  }));
  const works: CurrentWork[] = rawWorks.map(item => ({
    ...item,
    kind: item.kind === "module" ? "control" : item.kind,
    title: item.kind !== "module" ? item.title
      : index === 1 ? "РК2 · Регрессионная модель"
      : "РК2 · Рынки и конкуренция",
  }));

  for (const item of works) {
    if (item.kind !== "homework" && item.kind !== "control") continue;
    const n = Math.min(
      modules.length - 1,
      Math.floor((item.week - 1) / (modules.length === 3 ? 6 : 9)),
    );
    item.moduleId = modules[n].id;
    modules[n].workIds.push(item.id);
  }

  modules.forEach((module, n) => {
    for (const kind of ["homework", "control"] as const) {
      if (works.some(item => item.moduleId === module.id && item.kind === kind)) continue;
      const past = n === 0;
      const dueOn = past ? "2026-09-25" : n === 1 ? "2026-11-27" : "2026-12-11";
      const item: CurrentWork = {
        id: `${module.id}-${kind}`,
        title: `${kind === "homework" ? "ДЗ" : "РК"} · ${module.title}`,
        kind,
        week: past ? 4 : n === 1 ? 13 : 15,
        dueOn,
        stage: past ? "defended" : "planned",
        submittedAt: past ? at(dueOn) : null,
        gradedAt: past ? at("2026-09-28", "17:40") : null,
        points: past ? 8 : null,
        maxPoints: 10,
        moduleId: module.id,
      };
      works.push(item);
      module.workIds.push(item.id);
    }
  });

  const semesterMaxPoints = assessment === "Экзамен" ? 70 : 100;
  const attendanceDates = [
    "2026-09-14", "2026-09-21", "2026-10-05", "2026-10-19",
    "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23",
  ];
  const attendance: Attendance[] = attendanceDates.map((date, n) => ({
    id: `attendance-${n + 1}`,
    date,
    status: n === 7 ? "planned"
      : n === 2 ? "absent"
      : n === 1 || n === 5 ? "distinction"
      : "attended",
  }));

  return {
    id,
    title: subjects[index],
    teacher: teacherNames[index],
    assessment,
    grade,
    works: allocateSemesterPoints(works, semesterMaxPoints),
    modules,
    attendance,
    semesterMaxPoints,
    examMaxPoints: assessment === "Экзамен" ? 30 : 0,
    examPoints: null,
  };
}

export const workHref = (subjectId: string, workId: string) =>
  `#work/${encodeURIComponent(subjectId)}/${encodeURIComponent(workId)}`;

export function subjectEarnedPoints(subject: CurrentSubject): number | null {
  const graded = subject.works.filter(item => item.points !== null);
  return graded.length ? graded.reduce((sum, item) => sum + (item.points ?? 0), 0) : null;
}

export function modulePoints(subject: CurrentSubject, module: StudyModule) {
  const works = subject.works.filter(item => module.workIds.includes(item.id));
  const published = works.filter(item => item.points !== null);
  return {
    earned: published.length
      ? published.reduce((sum, item) => sum + (item.points ?? 0), 0)
      : null,
    max: works.reduce((sum, item) => sum + item.maxPoints, 0),
    publishedCount: published.length,
  };
}
export const currentSubjects: CurrentSubject[] = [
  discipline(0, "foreign-language", "Дифференцированный зачёт", [
    work("seminar", 1, "Лексика: кампус и учёба", 4, "2026-09-25", "defended", published(8, "2026-09-25", "2026-09-25", 10)),
    work("homework", 1, "Аудирование и конспект", 7, "2026-10-16", "defended", published(17, "2026-10-14", "2026-10-19")),
    work("control", 1, "РК1 · Письменная часть", 10, "2026-11-06", "defended", published(21, "2026-11-06", "2026-11-09", 30)),
    work("homework", 2, "Чтение и пересказ", 12, "2026-11-19", "assigned"),
    work("seminar", 2, "Дискуссия по учебной теме", 14, "2026-12-04", "planned", { maxPoints: 10 }),
    work("control", 2, "РК2 · Устная часть", 16, "2026-12-18", "planned", { maxPoints: 30 }),
  ]),
  discipline(1, "data-analysis", "Экзамен", [
    work("lab", 1, "ЛР1 · Подготовка данных", 3, "2026-09-18", "defended", published(18, "2026-09-17", "2026-09-21")),
    work("lab", 2, "ЛР2 · Описательная статистика", 6, "2026-10-09", "defended", published(16, "2026-10-12", "2026-10-15")),
    work("lab", 3, "ЛР3 · Визуализация данных", 9, "2026-10-30", "completed", { submittedAt: at("2026-11-02", "11:05") }),
    work("lab", 4, "ЛР4 · Проверка гипотез", 11, "2026-11-13", "assigned"),
    work("homework", 1, "Среднее значение и медиана", 12, "2026-11-20", "assigned"),
    work("control", 1, "РК1 · Анализ учебного набора данных", 12, "2026-11-17", "assigned", { maxPoints: 30 }),
    work("lab", 5, "ЛР5 · Регрессионная модель", 15, "2026-12-11", "planned"),
    work("module", 1, "Промежуточный модуль", 16, "2026-12-18", "planned", { maxPoints: 30 }),
  ]),
  discipline(2, "economics", "Экзамен", [
    work("seminar", 1, "Разбор рыночной ситуации", 4, "2026-09-23", "defended", published(10, "2026-09-23", "2026-09-23", 10)),
    work("homework", 1, "Спрос и предложение", 8, "2026-10-23", "defended", published(0, "2026-10-23", "2026-10-26")),
    work("control", 1, "РК1 · Эластичность", 11, "2026-11-11", "assigned", { maxPoints: 30 }),
    work("seminar", 2, "Издержки фирмы", 12, "2026-11-19", "assigned", { maxPoints: 10 }),
    work("module", 1, "Модуль: рынки и конкуренция", 15, "2026-12-09", "planned", { maxPoints: 30 }),
  ]),
  discipline(3, "russian-history", "Зачёт", [
    work("seminar", 1, "Разбор исторических карт", 5, "2026-10-02", "defended", published(12, "2026-10-02", "2026-10-05", 15)),
    work("homework", 1, "Анализ исторического источника", 10, "2026-11-06", "assigned"),
    work("control", 1, "Пересдача контрольной работы", 12, "2026-11-20", "assigned", { maxPoints: 30 }),
    work("seminar", 2, "Источники и аргументация", 13, "2026-11-27", "assigned", { maxPoints: 15 }),
  ]),
  discipline(4, "law", "Зачёт", [
    work("seminar", 1, "Разбор юридической ситуации", 3, "2026-09-18", "defended", published(10, "2026-09-18", "2026-09-21", 10)),
    work("homework", 1, "Разбор учебной ситуации", 7, "2026-10-16", "defended", published(18, "2026-10-16", "2026-10-20")),
    work("coursework", 1, "Проект решения учебного кейса", 11, "2026-11-12", "completed", { submittedAt: at("2026-11-11"), maxPoints: 30 }),
    work("control", 1, "РК1 · Право и ответственность", 13, "2026-11-26", "assigned", { maxPoints: 30 }),
  ]),
  discipline(5, "applied-computing", "Курсовая работа", [
    work("lab", 1, "ЛР1 · Модель предметной области", 2, "2026-09-11", "defended", published(17, "2026-09-10", "2026-09-14")),
    work("lab", 2, "ЛР2 · Прототип интерфейса", 5, "2026-10-02", "defended", published(19, "2026-10-02", "2026-10-05")),
    work("lab", 3, "ЛР3 · Хранилище и запросы", 8, "2026-10-23", "defended", published(15, "2026-10-26", "2026-10-30")),
    work("lab", 4, "ЛР4 · Тестирование прототипа", 11, "2026-11-13", "completed", { submittedAt: at("2026-11-13") }),
    work("lab", 5, "ЛР5 · Сценарии приёмки", 13, "2026-11-27", "assigned"),
    work("coursework", 1, "Курсовая работа · Проектирование приложения", 16, "2026-12-18", "planned", { maxPoints: 40 }),
  ]),
];
