import { bulletinDate } from "./home-content";

type SportsNormDefinition = {
  id: string;
  title: string;
  unit: string;
  direction: "higher" | "lower";
};

export type SportsNorm = SportsNormDefinition & (
  | { result: number; status: "passed" | "failed" }
  | { result: null; status: "unattempted" }
);

export type SportsSemester = {
  id: string;
  label: string;
  attended: number;
  goal: number;
  points: number;
  norms: readonly SportsNorm[];
  priorYearId?: string;
};

export const sportsMinimumPoints = 60;

const sprint: SportsNormDefinition = { id: "sprint", title: "Бег на 100 м", unit: "с", direction: "lower" };
const jump: SportsNormDefinition = { id: "jump", title: "Прыжок в длину с места", unit: "см", direction: "higher" };
const pushUps: SportsNormDefinition = { id: "push-ups", title: "Отжимания", unit: "повт.", direction: "higher" };
const forwardBend: SportsNormDefinition = { id: "forward-bend", title: "Наклон вперёд", unit: "см", direction: "higher" };

export const sportsSemesters: readonly SportsSemester[] = [
  {
    id: "semester-5", label: "5 семестр · осень 2026", attended: 12, goal: 16, points: 24, priorYearId: "semester-3",
    norms: [
      { ...sprint, result: 14.8, status: "passed" },
      { ...jump, result: 185, status: "failed" },
      { ...pushUps, result: null, status: "unattempted" },
      { ...forwardBend, result: 8, status: "passed" },
    ],
  },
  {
    id: "semester-4", label: "4 семестр · весна 2026", attended: 18, goal: 16, points: 74,
    norms: [
      { ...sprint, result: 14.9, status: "passed" },
      { ...jump, result: 192, status: "passed" },
      { ...pushUps, result: 17, status: "passed" },
    ],
  },
  {
    id: "semester-3", label: "3 семестр · осень 2025", attended: 16, goal: 16, points: 68,
    norms: [
      { ...sprint, result: 15.4, status: "passed" },
      { ...jump, result: 178, status: "failed" },
      { ...pushUps, result: 16, status: "passed" },
    ],
  },
];

export function sportsPassCriteria(semester: SportsSemester) {
  const pointsMet = semester.points >= sportsMinimumPoints;
  const visitsMet = semester.attended >= semester.goal;
  return { pointsMet, visitsMet, passed: pointsMet && visitsMet };
}

export function compareSportsNorm(semester: Pick<SportsSemester, "priorYearId">, norm: SportsNorm,
  terms: readonly Pick<SportsSemester, "id" | "norms">[] = sportsSemesters) {
  if (norm.result === null || !semester.priorYearId) return null;

  const previous = terms.find(term => term.id === semester.priorYearId);
  const priorResult = previous?.norms.find(item =>
    item.id === norm.id && item.unit === norm.unit && item.direction === norm.direction,
  )?.result;
  if (priorResult === undefined || priorResult === null) return null;

  const improvement = norm.direction === "higher" ? norm.result - priorResult : priorResult - norm.result;
  return { priorResult, improvement };
}

export const healthPassport = { group: "Основная", validThrough: "2026-11-25" };

const millisecondsPerDay = 86_400_000;
const warningDays = 14;

export function passportValidity(validThrough: string, today: string): {
  daysRemaining: number;
  kind: "valid" | "expiring" | "expired";
} {
  const daysRemaining = (bulletinDate(validThrough).getTime() - bulletinDate(today).getTime()) / millisecondsPerDay;
  const kind = daysRemaining < 0 ? "expired" : daysRemaining <= warningDays ? "expiring" : "valid";
  return { daysRemaining, kind };
}
