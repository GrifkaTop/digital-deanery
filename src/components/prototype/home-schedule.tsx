"use client";

import type { z } from "zod";
import { todayLesson } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { timetableRoom, timetableTeacher } from "./live-lesson-display";
import "./home-schedule.css";

const time = new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", timeZone: "Europe/Moscow" });
const day = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export function NextLesson() {
  const auth = useAtlasSession();
  if (!auth) return null;

  return <Resource url="/api/v1/today?block=lesson" schema={todayLesson} onUnauthorized={auth.onUnauthorized}>
    {data => <NextLessonCard {...data}/>}
  </Resource>;
}

export function NextLessonCard({ date, nearest: legacyNearest, upcomingToday, hasLessonsToday, change }: z.infer<typeof todayLesson>) {
  const nearest = upcomingToday === undefined ? legacyNearest : upcomingToday;
  const begin = nearest ? time.format(new Date(nearest.startsAt)) : "";
  const end = nearest ? time.format(new Date(nearest.endsAt)) : "";
  const nextDay = nearest && dateInMoscow(nearest.startsAt) !== date;
  const teacher = nearest && timetableTeacher(nearest);
  return <section className="hm-next" aria-labelledby="hm-next-title" data-upcoming={nearest ? "" : undefined}>
    {nearest && <div className="hm-next-start">
      <time className="hm-next-begin" dateTime={nearest.startsAt} aria-label={"Начало в " + begin}>{begin}</time>
      <time className="hm-next-end" dateTime={nearest.endsAt} aria-label={"Окончание в " + end}>{end}</time>
    </div>}
    <div className="hm-next-copy">
      <h2 id="hm-next-title">Следующая пара</h2>
      {nearest ? <>
        <a className="hm-next-title-link" href={"#lesson/" + nearest.id}><strong>{nearest.title}</strong></a>
        <ul className="hm-next-facts" role="list">
          {nextDay && <li><time dateTime={nearest.startsAt}>{day.format(new Date(nearest.startsAt))}</time></li>}
          {teacher?.name && <li title={teacher.name}>{teacher.id ? <a href={"#teacher/" + teacher.id}>{teacher.name}</a> : teacher.name}</li>}
          <li>{nearest.previousRoom ? nearest.previousRoom.room + " → " + timetableRoom(nearest) : timetableRoom(nearest)}</li>
          {(nearest.status === "moved" || nearest.status === "replaced") && <li className="hm-next-change">{nearest.reason ?? "Занятие изменено"}</li>}
        </ul>
      </> : <p>{hasLessonsToday ? "Следующих пар сегодня нет" : "Сегодня пар нет"}</p>}
      {change && <p className="hm-next-change"><a href={"#lesson/" + change.id}>{change.title}</a>{" · "}
        {day.format(new Date(change.startsAt))} · {time.format(new Date(change.startsAt))}–{time.format(new Date(change.endsAt))} ·{" "}
        {change.previousRoom ? change.previousRoom.room + " → " + timetableRoom(change) : change.reason ?? "Занятие изменено"}
      </p>}
    </div>
  </section>;
}
