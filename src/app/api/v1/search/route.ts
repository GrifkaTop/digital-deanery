import { z } from "zod";
import { searchResponse } from "@/contracts/search";
import { handle, HttpError, json, requireActor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { visibilityNow } from "@/server/clock";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.strictObject({ q: z.string().trim().min(1).max(100) });
const sections = [
  { id: "/today", title: "Сегодня" }, { id: "/schedule", title: "Расписание" },
  { id: "/study", title: "Учёба" }, { id: "/requests", title: "Заявки" },
  { id: "/inbox", title: "Входящие" }, { id: "/profile", title: "Профиль" },
  { id: "/sports", title: "Физкультура" },
];
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const fields = Object.fromEntries(Array.from(params.keys(), key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)]));
    const parsed = querySchema.safeParse(fields);
    if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
    const { rows } = await getPool().query(`
      SELECT 'discipline' AS type,p.id::text AS id,d.title FROM study_plan_items p
      JOIN disciplines d ON d.id=p.discipline_id WHERE p.student_id=$1 AND position(lower($3) in lower(d.title))>0
      UNION ALL
      SELECT 'teacher',t.id::text,t.full_name FROM teachers t WHERE position(lower($3) in lower(t.full_name))>0
      AND EXISTS (SELECT FROM lesson_teachers lt JOIN lessons l ON l.id=lt.lesson_id
        JOIN disciplines d ON d.id=l.discipline_id JOIN lesson_revisions r ON r.lesson_id=lt.lesson_id AND r.version=lt.version
        WHERE lt.teacher_id=t.id AND d.group_id=$2 AND r.published_at <= $4)
      ORDER BY title,id LIMIT 50`, [actor.id, actor.group_id, parsed.data.q, visibilityNow()]);
    const matchingSections = sections.filter(section => section.title.toLocaleLowerCase("ru").includes(parsed.data.q.toLocaleLowerCase("ru")))
      .map(section => ({ ...section, type: "section" }));
    return json(searchResponse.parse({ items: [...matchingSections, ...rows] }));
  });
}
