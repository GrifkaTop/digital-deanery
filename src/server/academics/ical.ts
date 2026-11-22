import type { Lesson } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";

const labels = { lecture: "Лекция", seminar: "Семинар", practice: "Практика", laboratory: "Лабораторная" };
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const timestamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

// RFC 5545 folds at 75 octets, without splitting UTF-8 characters.
function fold(line: string) {
  const lines: string[] = [];
  let part = "", bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) { lines.push(part); part = " "; bytes = 1; }
    part += character; bytes += length;
  }
  lines.push(part);
  return lines.join("\r\n");
}

export function calendarFile(items: Lesson[], start: string, end: string, now: Date) {
  const events = items.filter(item => item.status !== "cancelled" && dateInMoscow(new Date(item.startsAt)) >= start && dateInMoscow(new Date(item.startsAt)) < end);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Digital Deanery//Schedule//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Расписание"];
  for (const item of events) {
    const teachers = item.teacher.trim() || item.teachers?.map(teacher => teacher.fullName).join(", ");
    const description = [labels[item.kind], teachers && `Преподаватель: ${teachers}`, item.status === "moved" && "Перенесено", item.status === "replaced" && "Заменено", item.reason].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${item.id}@digital-deanery`, `DTSTAMP:${timestamp(now.toISOString())}`, `LAST-MODIFIED:${timestamp(item.publishedAt)}`, `SEQUENCE:${item.version}`, `DTSTART:${timestamp(item.startsAt)}`, `DTEND:${timestamp(item.endsAt)}`, `SUMMARY:${escapeText(item.title)}`, `DESCRIPTION:${escapeText(description)}`, `LOCATION:${escapeText([item.building, item.room].filter(Boolean).join(", "))}`, "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
