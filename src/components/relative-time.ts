import { addDays, dateInMoscow } from "@/contracts/calendar";

const days = new Intl.PluralRules("ru-RU");
function dayCount(count: number) {
  const form = days.select(count);
  return `${count} ${form === "one" ? "день" : form === "few" ? "дня" : "дней"}`;
}

export function relativeTime(value: string, now: number, kind: "lesson" | "deadline") {
  const remaining = Date.parse(value) - now;
  if (remaining <= 0) return kind === "deadline" ? "Просрочено" : null;

  const minutes = Math.ceil(remaining / 60_000);
  const today = dateInMoscow(new Date(now));
  const date = dateInMoscow(value);
  const prefix = kind === "lesson" ? "Через" : "Осталось";
  if (kind === "lesson" && date === addDays(today, 1)) return "Завтра";
  if (minutes < 60) return `${prefix} ${minutes} мин`;
  if (minutes < 24 * 60) return `${prefix} ${Math.ceil(minutes / 60)} ч`;
  return `${prefix} ${dayCount(Math.ceil(remaining / 86_400_000))}`;
}
