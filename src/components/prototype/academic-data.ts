// Synthetic demonstration fixtures shared by student and teacher schedules.
export const teacherNames = ["Северова Арина Павловна", "Леснов Марк Андреевич", "Озёрский Лев Михайлович", "Берестова Ева Сергеевна", "Полевая Нина Викторовна", "Луговой Ян Олегович"];
export const teacherIds = ["severova", "lesnov", "ozersky", "berestova", "polevaya", "lugovoy"];
export const subjects = ["Иностранный язык", "Анализ данных", "Экономика", "История России", "Правоведение", "Прикладная информатика"];
export const timetableOwnGroup = "ИС-31";
export type Lesson = { title: string; kind: string; time: string; end: string; room: string; teacher: string; previousRoom?: string };
export type WorkTag = "ДЗ" | "РК1" | "ЛР";
export type Homework = { title: string; instructions: string[]; deliverable: string; dueInDays: number };
type Review = { topics: string[]; format: string };
export type TimetableLesson = Lesson & { id: string; parity: "both" | "numerator" | "denominator"; group: string; workTags: WorkTag[]; homework?: Homework; review?: Review };
export const timetableLessonKinds: Partial<Record<string, string>> = {
  "Лекция": "lecture", "Практика": "practice", "Семинар": "seminar", "Лабораторная работа": "lab",
};
export const timetableSlots = [
  { start: "08:30", end: "10:05" },
  { start: "10:15", end: "11:50" },
  { start: "12:00", end: "13:35" },
  { start: "13:50", end: "15:25" },
  { start: "15:40", end: "17:15" },
  { start: "17:25", end: "19:00" },
  { start: "19:10", end: "20:45" },
] as const;

const dataAnalysisReview: Review = {
  topics: ["Среднее значение, медиана и размах", "Чтение таблиц и диаграмм", "Объяснение результатов на примере набора данных"],
  format: "Письменная работа на паре: короткие вопросы и задачи по учебному набору данных.",
};
const homeworkBySubject: Homework[] = [
  { title: "Чтение и пересказ", instructions: ["Выберите учебный текст на иностранном языке объёмом 300–400 слов.", "Выпишите 10 новых слов с переводом.", "Подготовьте пересказ из 8–10 предложений."], deliverable: "Текст пересказа и словарь в одном PDF.", dueInDays: 3 },
  { title: "Среднее значение и медиана", instructions: ["Используйте учебный набор баллов: 12, 15, 18, 9, 20, 14.", "Вычислите среднее значение, медиану и размах.", "Постройте столбчатую диаграмму и сформулируйте два вывода о результатах."], deliverable: "PDF с расчётами, диаграммой и выводами. Приложите код, если использовали Python.", dueInDays: 3 },
  { title: "Спрос и предложение", instructions: ["Составьте вымышленный пример изменения спроса на товар.", "Постройте график и отметьте исходную и новую точки равновесия.", "Объясните изменение цены и объёма продаж в 5–7 предложениях."], deliverable: "Один PDF с графиком и пояснением.", dueInDays: 3 },
  { title: "Анализ исторического источника", instructions: ["Выберите учебный исторический источник из материалов курса.", "Укажите автора, период и обстоятельства создания.", "Сформулируйте основной тезис и приведите два аргумента из текста."], deliverable: "Краткий анализ на 1–2 страницы в PDF.", dueInDays: 3 },
  { title: "Разбор учебной ситуации", instructions: ["Опишите вымышленную ситуацию заключения договора на оказание услуг.", "Выделите стороны, предмет договора и обязанности каждой стороны.", "Составьте три вопроса для обсуждения на семинаре."], deliverable: "PDF на 1–2 страницы с разбором и вопросами.", dueInDays: 3 },
  { title: "Проектирование приложения", instructions: ["Опишите вымышленный сервис записи на консультацию.", "Выделите основные сущности и их связи.", "Нарисуйте схему данных и укажите обязательные поля."], deliverable: "PDF со схемой и пояснениями.", dueInDays: 3 },
];

export function homeworkForSubject(title: string) {
  return homeworkBySubject[subjects.indexOf(title)];
}

/** day uses JavaScript weekdays: 1 Monday … 6 Saturday; 0 Sunday. */
export function templateLessons(day: number): TimetableLesson[] {
  if (day === 0) return [];
  const make = (i: number, subject: number, slotIndex: number, parity: TimetableLesson["parity"] = "both", kind = "Лабораторная работа"): TimetableLesson => {
    const { start: time, end } = timetableSlots[slotIndex];
    const workTags: WorkTag[] = kind === "Лабораторная работа" ? ["ЛР"] : day === 2 && i === 1 ? ["РК1", "ДЗ"] : (day + i) % 3 === 0 ? ["ДЗ"] : [];
    return {
      id: `${day}-${i}-${parity}`, title: subjects[subject], teacher: teacherNames[subject], time, end, parity, kind,
      room: ["314 · корпус А", "305 · корпус А", "412 · корпус А"][i % 3], group: timetableOwnGroup,
      workTags, homework: workTags.includes("ДЗ") ? homeworkBySubject[subject] : undefined,
      review: workTags.includes("РК1") ? dataAnalysisReview : undefined,
    };
  };
  if (day === 5) return [
    make(0, 4, 1, "both", "Лекция"),
    make(1, 4, 2, "both", "Семинар"),
    make(2, 5, 3, "numerator"),
    make(2, 1, 3, "denominator"),
    make(3, 5, 4, "numerator"),
    make(3, 1, 4, "denominator"),
  ];
  const result = Array.from({ length: day === 6 ? 2 : 3 }, (_, i) =>
    make(i, (day + i + 4) % subjects.length, i, i === 0 ? "both" : (day + i) % 2 ? "numerator" : "denominator", ["Лекция", "Практика", "Семинар"][i]));
  if (day === 2) result[2].previousRoom = "112";
  if (day === 1) result.push(make(3, 5, 5, "numerator"), make(4, 5, 6, "numerator"));
  return result;
}

export const timetableDemoNow = new Date(2026, 10, 17, 10, 45);
export const timetableMinute = (time: string) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
const semesterStart = new Date(2026, 8, 1);
const semesterEnd = new Date(2027, 0, 1);
const firstMonday = new Date(2026, 7, 31, 12);

export function shiftTimetableDate(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

export function timetableDateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, "0")).join("-");
}

export function timetableLessonState(day: Date, lesson: Pick<Lesson, "time" | "end">, now = timetableDemoNow) {
  const date = timetableDateKey(day);
  const today = timetableDateKey(now);
  if (date !== today) return date < today ? "past" : "upcoming";

  const minute = now.getHours() * 60 + now.getMinutes();
  if (minute >= timetableMinute(lesson.end)) return "past";
  return minute >= timetableMinute(lesson.time) ? "current" : "upcoming";
}

export function timetableWeek(date: Date) {
  const monday = shiftTimetableDate(date, -((date.getDay() + 6) % 7));
  const number = Math.round((monday.getTime() - firstMonday.getTime()) / 604800000) + 1;
  const parity = number % 2 ? "numerator" : "denominator";
  return { monday, number, parity } as const;
}

export function isTimetableDateInSemester(date: Date) {
  return date >= semesterStart && date < semesterEnd;
}

export function lessonsFor(date: Date): TimetableLesson[] {
  if (!isTimetableDateInSemester(date)) return [];
  const { parity } = timetableWeek(date);
  return templateLessons(date.getDay()).filter(lesson => lesson.parity === "both" || lesson.parity === parity)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function todayTimetablePreview(now: Date) {
  const lessons = lessonsFor(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  return {
    nextLesson: lessons.find(lesson => timetableMinute(lesson.time) >= nowMinute),
    hasLessons: lessons.length > 0,
  };
}
