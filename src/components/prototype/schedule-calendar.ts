import { timetableDateKey } from "./academic-data";
import { lessonsForScheduleScope, scheduleWeekDays, type ScheduleScope } from "./schedule-directory-data";

const encoder = new TextEncoder();

function foldLine(line: string) {
  let length = 0;
  let folded = "";
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (length + bytes > 75) {
      folded += "\r\n ";
      length = 1;
    }
    folded += character;
    length += bytes;
  }
  return folded;
}

function calendarText(value: string) {
  return value.replace(/([\\,;])/g, "\\$1").replace(/\r\n|\r|\n/g, "\\n");
}

const calendarInstant = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const lessonInstant = (day: string, time: string) => calendarInstant(new Date(`${day}T${time}:00+03:00`));

export function scheduleCalendar(monday: Date, scope: ScheduleScope) {
  const stamp = calendarInstant(new Date());
  const events = scheduleWeekDays(monday).flatMap(day => {
    const date = timetableDateKey(day);
    return lessonsForScheduleScope(scope, day).flatMap(lesson => [
      "BEGIN:VEVENT",
      `UID:atlas-${date}-${lesson.id}@schedule.atlas-demo.invalid`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${lessonInstant(date, lesson.time)}`,
      `DTEND:${lessonInstant(date, lesson.end)}`,
      `SUMMARY:${calendarText(lesson.title)}`,
      `LOCATION:${calendarText(lesson.room)}`,
      `DESCRIPTION:${calendarText(`${lesson.kind}\n${lesson.teacher}\nГруппа ${lesson.group}`)}`,
      "END:VEVENT",
    ]);
  });
  if (!events.length) return null;

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas Demo//Schedule//RU", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""]
    .map(foldLine).join("\r\n");
}
