import "server-only";
import { z } from "zod";
import { academicCalendarDocumentId, cleanGeneratedPage, scholarshipPolicyDocumentId } from "@/contracts/assistant-files";
import type { AssistantResponse, AssistantTopic } from "@/contracts/assistant";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" });
const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" });
const localDate = (value: string) => new Date(`${value}T12:00:00Z`);
const formatDate = (value: string) => dateLabel.format(localDate(value));

type Card = AssistantResponse["cards"][number];
export type DocumentScope = { years: string[]; months: string[]; dates: string[]; season?: "winter" | "summer" };
type Payment = { month: string; payOn: string; link: Card["link"] };
export type PublishedTopic = Exclude<AssistantTopic, "scholarship_payment">;
const dateValue = z.iso.date();
const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
type DateRange = { start: string; end: string };
type PublishedSection = { topic: PublishedTopic; title: string; text: string;
  period?: DateRange & { season: "winter" | "summer" } };

export const documentForTopic: Record<PublishedTopic, string> = {
  scholarship_definition: scholarshipPolicyDocumentId,
  scholarship_rules: scholarshipPolicyDocumentId,
  session: academicCalendarDocumentId,
  holidays: academicCalendarDocumentId,
};

function calendarPeriod(text: string): DateRange | undefined {
  const namedRange = /^\s*[:–—-]?\s*с (\d{1,2})(?: ([а-я]+)(?: (\d{4})(?: г(?:ода|\.))?)?)? по (\d{1,2}) ([а-я]+) (\d{4})(?!\d)/iu.exec(text);
  if (!namedRange) return undefined;
  const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = namedRange;
  const date = (day: string, month: string, year: string) =>
    `${year}-${String(months.indexOf(month.toLowerCase()) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  const start = date(startDay, startMonth ?? endMonth, startYear ?? endYear);
  const end = date(endDay, endMonth, endYear);
  return dateValue.safeParse(start).success && dateValue.safeParse(end).success && start <= end
    ? { start, end } : undefined;
}

export function publishedDocumentSection(key: string, rawText: string): PublishedSection | undefined {
  if (key !== scholarshipPolicyDocumentId && key !== academicCalendarDocumentId) return undefined;
  // Previously imported pages can still include the packet's wrapped title.
  const text = cleanGeneratedPage(rawText, true).replace(/\s+/gu, " ").trim();
  if (key === scholarshipPolicyDocumentId) {
    if (/^(?:Государственная )?академическая стипендия (?:[—–-]|это) .+/iu.test(text)) {
      return { topic: "scholarship_definition", title: "Определение", text };
    }
    if (/^(?:Государственная )?академическая стипендия[^.!?]*?назначается\s+[а-я]/iu.test(text)) {
      return { topic: "scholarship_rules", title: "Условия назначения", text };
    }
  }
  if (key === academicCalendarDocumentId) {
    const heading = /^(?:период )?(зимн\p{L}*|летн\p{L}*)\s+(сесси\p{L}*|каникул\p{L}*)/iu.exec(text);
    if (!heading) return undefined;
    const dates = calendarPeriod(text.slice(heading[0].length));
    if (!dates) return undefined;
    const season = heading[1].toLowerCase().startsWith("зимн") ? "winter" : "summer";
    const topic = heading[2].toLowerCase().startsWith("сесси") ? "session" : "holidays";
    const title = topic === "session"
      ? (season === "winter" ? "Зимняя сессия" : "Летняя сессия")
      : (season === "winter" ? "Зимние каникулы" : "Летние каникулы");
    return { topic, title, text, period: { ...dates, season } };
  }
}

export function sectionMatchesScope(section: PublishedSection, scope: DocumentScope, issuedOn: string, today: string) {
  if (section.period) {
    const { season, start, end } = section.period;
    return (!scope.season || scope.season === season) && matchesPeriod(start, end, scope);
  }
  return section.topic === "scholarship_definition" || matchesPeriod(issuedOn, today, { ...scope, months: [] });
}

function matchesPeriod(start: string, end: string, scope: DocumentScope) {
  if (scope.dates.length && !scope.dates.some((date) => start <= date && date <= end)) return false;
  const years = scope.years.length ? scope.years : [start.slice(0, 4), end.slice(0, 4)];
  return years.some((year) => {
    if (!scope.months.length) return start.slice(0, 4) <= year && year <= end.slice(0, 4);
    return scope.months.some((month) => {
      const period = `${year}-${month}`;
      return start.slice(0, 7) <= period && period <= end.slice(0, 7);
    });
  });
}

export function scholarshipPaymentCards(payments: Payment[], scope: DocumentScope, today: string): Card[] {
  const requestedPeriod = scope.years.length || scope.months.length || scope.dates.length || scope.season;
  const sorted = payments.toSorted((a, b) => a.payOn.localeCompare(b.payOn) || a.month.localeCompare(b.month));
  const selected = requestedPeriod ? sorted.filter(({ month, payOn }) => {
    const monthStart = `${month}-01`;
    if (scope.dates.length && !scope.dates.includes(payOn)) return false;
    if (scope.season === "winter" && !["12", "01", "02"].includes(month.slice(5))) return false;
    if (scope.season === "summer" && !["06", "07", "08"].includes(month.slice(5))) return false;
    return matchesPeriod(monthStart, monthStart, { ...scope, dates: [] });
  }) : sorted.filter(({ payOn }) => payOn >= today).slice(0, 1);
  return selected.map(({ month, payOn, link }) => ({
    title: requestedPeriod ? `Выплата за ${monthLabel.format(localDate(`${month}-01`))}` : "Ближайшая выплата",
    text: `Дата перечисления — ${formatDate(payOn).replace(/\.$/u, "")}. График действует для студентов, которым назначена академическая стипендия.`,
    link,
  }));
}

export function conciseDocumentAnswer(cards: Card[]): string {
  return cards.map((card) => `**${card.title}.** ${card.text}`).join("\n\n");
}
