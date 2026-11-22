import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { assessments } from "../src/contracts/academics";
import * as schema from "../src/server/db/schema";
import { seedAtlasAcademicFixtures } from "./seed-atlas-academics";

const profileSeeds = [
  { account: 1, group: "Маяк-21", disciplines: [
    ["DATA", "Анализ данных", "exam"],
    ["WRITE", "Академическое письмо", "exam"],
    ["LOGIC", "Основы логики", "credit"],
    ["LAW", "Право цифровой среды", "exam"],
    ["MODELS", "Моделирование общественных процессов", "graded_credit"],
    ["EN", "Английский язык для исследовательских проектов", "exam"],
  ] },
  { account: 2, group: "Орбита-11", disciplines: [
    ["COMM", "Практикум коммуникаций", "exam"],
    ["MEDIA", "Медиаграмотность", "credit"],
    ["SPEECH", "Основы публичного выступления", "graded_credit"],
    ["TEAM", "Командное взаимодействие", "credit"],
    ["ELECT", "Введение в моделирование коммуникаций", "exam"],
  ] },
] as const;

const disciplineSeed = z.tuple([z.string().min(1), z.string().min(1), z.enum(assessments)]);
function id(table: number, key: number) {
  return `20000000-0000-4000-8000-${String(table).padStart(2, "0")}${String(key).padStart(10, "0")}`;
}
const at = (day: number, time: string) =>
  new Date(`2026-11-${String(day).padStart(2, "0")}T${time}:00+03:00`);
const publishedAt = at(10, "08:00");

async function seed() {
  const connectionString = z.string().min(1).parse(process.env.MIGRATION_DATABASE_URL);
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  const semesterId = id(1, 1);
  try {
    await db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(8112026)");
      await tx.insert(schema.semesters).values({
        id: semesterId, label: "Осень 2026", startsOn: "2026-09-01", endsOn: "2027-01-31", isCurrent: true,
      }).onConflictDoNothing();

      for (const demo of profileSeeds) {
        const accountId = `10000000-0000-4000-8000-00000000000${demo.account}`;
        const [student] = await tx.select().from(schema.students).where(eq(schema.students.accountId, accountId));
        const [group] = await tx.select().from(schema.groups).where(eq(schema.groups.code, demo.group));
        if (!student || !group) throw new Error("Seed the profiles first");

        const key = demo.account * 100;
        const matchingGroup = student.groupId === group.id;
        for (const [index, item] of demo.disciplines.entries()) {
          const [code, title, assessment] = disciplineSeed.parse(item);
          const disciplineId = id(2, key + index);
          await tx.insert(schema.disciplines).values({
            id: disciplineId, groupId: group.id, semesterId, code, title, assessment,
          }).onConflictDoNothing();
          if (!matchingGroup) continue;

          const planId = id(3, key + index);
          await tx.insert(schema.studyPlanItems).values({
            id: planId, studentId: student.id, disciplineId,
          }).onConflictDoNothing();

          if (demo.account === 2 || index >= 2) {
            const credit = assessment === "credit";
            await tx.insert(schema.grades).values({
              id: id(4, key + index), planItemId: planId, kind: credit ? "credit" : "final",
              label: credit ? "Зачёт" : "Итог за семестр", value: credit ? null : "5",
              scale: credit ? null : "five", outcome: "pass", publishedAt,
            }).onConflictDoNothing();
          } else if (index === 1) {
            await tx.insert(schema.grades).values({
              id: id(4, key + index), planItemId: planId, kind: "current",
              label: "Первое задание", value: "0", scale: "hundred", publishedAt,
            }).onConflictDoNothing();
          }
        }

        await tx.insert(schema.examEvents).values([
          { id: id(5, key), disciplineId: id(2, key), kind: "exam",
            startsAt: at(demo.account === 1 ? 24 : 25, "10:00"), room: "415", publishedAt },
          { id: id(5, key + 1), disciplineId: id(2, key + (demo.account === 1 ? 1 : 4)),
            kind: "exam", startsAt: null, publishedAt: null },
        ]).onConflictDoNothing();

        if (demo.account === 1 && matchingGroup) {
          await tx.insert(schema.deadlines).values([
            { id: id(6, 1), disciplineId: id(2, key), studentId: student.id, title: "Загрузить расчёт к практикуму",
              dueAt: at(16, "18:00"), required: true, publishedAt },
            { id: id(6, 2), disciplineId: id(2, key), studentId: student.id, title: "Сдать черновик проекта",
              dueAt: at(19, "18:00"), required: true, publishedAt },
          ]).onConflictDoNothing();
        }
        if (demo.account === 2) {
          await tx.insert(schema.deadlines).values({
            id: id(6, 3), disciplineId: id(2, key + 4), groupId: group.id, title: "Выбрать электив",
            dueAt: at(27, "18:00"), required: true, publishedAt,
          }).onConflictDoNothing();
        }

        const lesson = async (key: number, index: number, startsAt: Date, room: string,
          change?: Partial<typeof schema.lessonRevisions.$inferInsert>) => {
          const lessonId = id(7, key);
          await tx.insert(schema.lessons).values({
            id: lessonId, disciplineId: id(2, demo.account * 100 + index), originalStartsAt: startsAt,
          }).onConflictDoNothing();
          await tx.select({ id: schema.lessons.id }).from(schema.lessons)
            .where(eq(schema.lessons.id, lessonId)).for("update");
          const end = (start: Date) => new Date(start.getTime() + 90 * 60_000);
          const original = {
            lessonId, version: 1, startsAt, endsAt: end(startsAt), room,
            teacherName: demo.account === 1 ? "Лира Маячная" : "Мирон Орбитный",
            kind: "seminar", status: "planned", publishedAt,
          } as const;
          await tx.insert(schema.lessonRevisions).values(original).onConflictDoNothing();
          if (change) {
            await tx.insert(schema.lessonRevisions).values({
              ...original, ...change, version: 2, endsAt: end(change.startsAt ?? startsAt),
              publishedAt: at(16, "12:00"),
            }).onConflictDoNothing();
          }
        };

        if (demo.account === 1) {
          await lesson(key, 0, at(17, "10:40"), "214", {
            room: "408", status: "moved", reason: "В аудитории 214 меняют проектор.",
          });
          await lesson(key + 1, 1, at(18, "09:00"), "215", {
            startsAt: at(19, "12:10"), status: "moved", reason: "В исходное время проходит учебный семинар.",
          });
          await lesson(key + 2, 2, at(20, "09:00"), "311", {
            teacherName: "Арина Макетова", status: "replaced", reason: "Занятие ведёт другой преподаватель.",
          });
        } else {
          await lesson(key, 0, at(18, "11:20"), "307");
          await lesson(key + 1, 1, at(20, "09:00"), "313", {
            status: "cancelled", reason: "Аудитория закрыта на обслуживание.",
          });
        }

        const historicalDays = [12, 13, 16, 19, 21];
        const upcomingDays = demo.account === 1 ? [23, 25, 27] : [24, 26, 28];
        for (const day of [...historicalDays, ...upcomingDays]) {
          const lessonTime = demo.account === 1 ? "14:00" : "15:40";
          await lesson(key + 10 + day, 3, at(day, lessonTime), "310");
        }
        const omittedDays = demo.account === 1 ? [24, 26, 28] : [23, 25, 27];
        for (const day of omittedDays) {
          const lessonId = id(7, key + 10 + day);
          const [latest] = await tx.select().from(schema.lessonRevisions)
            .where(eq(schema.lessonRevisions.lessonId, lessonId))
            .orderBy(schema.lessonRevisions.version).limit(1);
          if (latest?.status === "planned") await tx.insert(schema.lessonRevisions).values({
            ...latest, version: latest.version + 1, status: "cancelled",
            reason: "Занятие относится к другой учебной группе по расписанию недели.",
            publishedAt: at(22, "09:00"),
          }).onConflictDoNothing();
        }
      }

      await seedAtlasAcademicFixtures(tx, semesterId);
    });
    console.log("Synthetic academic data ready");
  } finally {
    await pool.end();
  }
}

seed().catch(() => {
  console.error("Academic seed failed; check migrations, profiles and database configuration");
  process.exitCode = 1;
});
