import "server-only";
import { z } from "zod";
import { scheduleIntent, type AssistantResponse } from "@/contracts/assistant";
import { addDays, dateInMoscow, mondayOf } from "@/contracts/calendar";
import type { Actor } from "@/server/auth/service";
import { lessonToday, listLessons } from "@/server/academics/schedule";
import { normalizeDayAfterTomorrow } from "./spelling";

type Intent = z.infer<typeof scheduleIntent>;
const normalize = (s: string) => s.toLowerCase().replaceAll("ё", "е");
const period = "(?: (?:(?:на )?(?:сегодня|завтра|послезавтра)|на неделю|на (?:этой|следующей) неделе))?";
const regularSchedule = new RegExp(`^(?:(?:(?:покажи )?расписание(?: у меня)?|(?:какие )?(?:у меня )?(?:пары|занятия)(?: у меня)?|у меня (?:есть )?(?:пары|занятия))${period}|(?:какие )?у меня${period} (?:есть )?(?:пары|занятия))[?!.]*$`, "u");
const nearest = /^(?:(?:какая|где|когда) )?(?:у меня )?(?:ближайшая|следующая) пара[?!.]*$/u;
const changes = new RegExp(`^(?:какие )?(?:пары|занятия) (?:отменены|отменили|перенесены|перенесли|заменены|заменили)${period}[?!.]*$`, "u");

export function localSchedule(question: string, today: string, previous?: Intent): Intent | undefined {
  const q = normalizeDayAfterTomorrow(normalize(question));
  const follow = previous && /^(?:(?:а|что(?: у меня)?)\s+)?(?:сегодня|(?:на )?(?:завтра|послезавтра)|на следующей неделе)[?!.\s]*$/u.test(q);
  if (!follow && !regularSchedule.test(q) && !nearest.test(q) && !changes.test(q)) return;
  const week = /недел/u.test(q);
  const date = /послезавтра/u.test(q) ? addDays(today, 2) : /завтра/u.test(q) ? addDays(today, 1)
    : week && /следующ/u.test(q) ? addDays(mondayOf(today), 7) : today;
  return { kind: "schedule", date, view: week ? "week" : "day", filter: follow ? previous.filter : "",
    mode: follow && previous.mode !== "nearest" ? previous.mode : /ближайш|следующ.*пар|куда.*идти/u.test(q) && !/завтра|недел/u.test(q) ? "nearest"
      : /отмен/u.test(q) ? "cancelled" : /перен[ое]с/u.test(q) ? "moved" : /замен/u.test(q) ? "replaced" : /измен/u.test(q) ? "changes" : "list" };
}

const dateTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long", timeStyle: "short" });
export const moscowTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", timeStyle: "short" });
const statuses = { planned: "По плану", moved: "Перенос", replaced: "Замена", cancelled: "Отменено" };
export const moscowShortDate = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" });
export async function answerSchedule(actor: Actor, intent: Intent, now: Date, processing: "qwen" | "catalog"): Promise<AssistantResponse> {
  // A filtered nearest request uses a bounded search of the next twelve weeks.
  let items;
  if (intent.mode === "nearest" && !intent.filter) {
    const result = await lessonToday(actor, now);
    items = result.nearest ? [result.nearest] : [];
  } else if (intent.mode === "nearest") {
    items = [];
    for (let week = 0; week < 12; week++) {
      const result = await listLessons(actor, addDays(dateInMoscow(now), week * 7), "week", now);
      items.push(...result.items.filter((item) => dateInMoscow(item.startsAt) >= result.start && dateInMoscow(item.startsAt) < result.end &&
        item.status !== "cancelled" && new Date(item.endsAt) > now &&
        normalize(`${item.title} ${item.teacher}`).includes(normalize(intent.filter))));
      if (items.length) break;
    }
    items = items.slice(0, 1);
  } else {
    const result = await listLessons(actor, intent.date, intent.view, now);
    items = result.items.filter((item) => (!intent.filter || normalize(`${item.title} ${item.teacher}`).includes(normalize(intent.filter))) &&
      (intent.mode === "changes" ? item.status !== "planned" : ["cancelled", "moved", "replaced"].includes(intent.mode) ? item.status === intent.mode : true));
  }
  const widgets = items.map((item) => ({
    type: "lesson" as const, id: item.id,
    dateLabel: moscowShortDate.format(new Date(item.startsAt)),
    timeRange: `${moscowTime.format(new Date(item.startsAt))}–${moscowTime.format(new Date(item.endsAt))}`,
    title: item.title, room: item.room, teacher: item.teacher,
    status: item.status === "planned" ? undefined : [
      statuses[item.status] + (item.reason ? `: ${item.reason}` : ""),
      item.status === "moved" ? `Исходное время: ${dateTime.format(new Date(item.originalStartsAt))}` : "",
    ].filter(Boolean).join(". "),
    href: `/schedule/${item.id}`,
  }));
  const period = intent.view === "week" ? "неделю с " + moscowShortDate.format(new Date(mondayOf(intent.date))) : moscowShortDate.format(new Date(intent.date));
  const text = widgets.length
    ? intent.mode === "nearest" ? "Ближайшая пара" : intent.mode === "list" ? `Расписание на ${period}` : "Изменения в расписании"
    : intent.mode === "nearest" ? (intent.filter ? "В ближайшие 12 недель подходящих занятий не найдено." : "Предстоящих занятий не найдено.")
      : `За ${period} подходящих занятий не найдено.`;
  return { kind: widgets.length ? "answer" : "empty", category: "quick", processing, context: { topics: [], schedule: intent },
    text, cards: [], widgets: widgets.length ? widgets : [{ type: "actions", items: [{ label: "Открыть расписание", href: "/schedule" }] }],
  };
}
