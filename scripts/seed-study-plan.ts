import { createHash } from "node:crypto";
import { Pool } from "pg";

type SeedEntry = { title: string; department: string; type: string; hours: number; grade: string | null };
function entry(title: string, department: string, type: string, hours: number, grade: string | null = null): SeedEntry {
  return { title, department, type, hours, grade };
}
function id(value: string) {
  const hex = createHash("sha256").update("atlas:study-plan:" + value).digest("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), "4" + hex.slice(13, 16), "8" + hex.slice(17, 20), hex.slice(20, 32)].join("-");
}

const curriculum: Partial<Record<number, SeedEntry[]>> = {
  1: [
    entry("Линейная алгебра", "МАТ", "Экзамен", 144, "Хорошо"),
    entry("Основы программирования", "ИС", "Экзамен", 144, "Отлично"),
    entry("История России", "ГН", "Зачёт", 72, "Зачтено"),
    entry("Иностранный язык · Начальный курс", "ИЯ", "Дифференцированный зачёт", 108, "Хорошо"),
    entry("Введение в информационные системы", "ИС", "Зачёт", 72, "Зачтено"),
  ],
  2: [
    entry("Математический анализ", "МАТ", "Экзамен", 144, "Отлично"),
    entry("Алгоритмы и структуры данных", "ИС", "Экзамен", 144, "Хорошо"),
    entry("Дискретная математика", "МАТ", "РЭКЗ", 108, "Хорошо"),
    entry("Алгоритмизация учебной задачи", "ИС", "Курсовая работа", 72, "Отлично"),
    entry("Ознакомительная практика", "ИС", "Практика", 108, "Зачтено"),
  ],
  3: [
    entry("Объектно-ориентированное программирование", "ИС", "Экзамен", 144, "Отлично"),
    entry("Теория вероятностей", "МАТ", "Экзамен", 108, "Хорошо"),
    entry("Компьютерные сети", "ИС", "Зачёт", 108, "Зачтено"),
    entry("Философия", "ГН", "Дифференцированный зачёт", 72, "Отлично"),
    entry("Моделирование учебной системы", "ИС", "Курсовой проект", 72, "Хорошо"),
  ],
  4: [
    entry("Операционные системы", "ИС", "Экзамен", 144, "Хорошо"),
    entry("Проектирование баз данных", "ИС", "Экзамен", 144, "Отлично"),
    entry("Математическая статистика", "МАТ", "Дифференцированный зачёт", 108, "Удовлетворительно"),
    entry("Интерфейсы и взаимодействие", "ИС", "Зачёт", 72, "Зачтено"),
    entry("Технологическая практика", "ИС", "Практика", 144, "Зачтено"),
  ],
  6: [
    entry("Архитектура информационных систем", "ИС", "Экзамен", 144),
    entry("Информационная безопасность", "ИБ", "Экзамен", 108),
    entry("Тестирование программных систем", "ИС", "Дифференцированный зачёт", 108),
    entry("Разработка веб-приложений", "ИС", "Курсовой проект", 72),
    entry("Проектно-технологическая практика", "ИС", "Практика", 144),
  ],
  7: [
    entry("Распределённые системы", "ИС", "Экзамен", 144),
    entry("Управление ИТ-проектами", "ЭК", "Зачёт", 108),
    entry("Интеллектуальные системы", "ИС", "РЭКЗ", 108),
    entry("Мобильная разработка", "ИС", "Курсовая работа", 72),
    entry("Исследовательский семинар", "ИС", "Зачёт", 72),
  ],
  8: [
    entry("Эксплуатация и сопровождение систем", "ИС", "Дифференцированный зачёт", 108),
    entry("Экономика ИТ-проекта", "ЭК", "Зачёт", 72),
    entry("Преддипломная практика", "ИС", "Практика", 216),
    entry("Выпускная квалификационная работа", "ИС", "Защита ВКР", 216),
  ],
};

const period: Record<number, [string, string]> = {
  1: ["2024-09-01", "2025-01-31"], 2: ["2025-02-01", "2025-06-30"],
  3: ["2025-09-01", "2026-01-31"], 4: ["2026-02-01", "2026-06-30"],
  6: ["2027-02-01", "2027-06-30"], 7: ["2027-09-01", "2028-01-31"], 8: ["2028-02-01", "2028-06-30"],
};
const grades = { "Отлично": 5, "Хорошо": 4, "Удовлетворительно": 3 };
const currentRows = [
  ["Иностранный язык", "ИЯ", 108, null, null],
  ["Анализ данных", "ИС", 144, null, null],
  ["Экономика", "ЭК", 108, null, null],
  ["История России", "ГН", 72, null, null],
  ["Правоведение", "ПР", 72, 36, null],
  ["Прикладная информатика", "ИС", 108, null, "Курсовая работа"],
] as const;
const profile3 = "10000000-0000-4000-8000-000000000003";

async function seed() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL required");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112030)");
    const { rows: [student] } = await client.query<{ id: string; groupId: string }>(
      'SELECT id, group_id AS "groupId" FROM students WHERE account_id=$1', [profile3]);
    if (!student) { await client.query("COMMIT"); return; }

    for (const [index, [title, department, hours, extra, assessmentLabel]] of currentRows.entries()) {
      await client.query(`
        INSERT INTO study_plan_details(plan_item_id,semester_number,department,hours,coursework_hours,assessment_label,position)
        SELECT p.id,5,$3,$4,$5,$6,$7
        FROM study_plan_items p JOIN disciplines d ON d.id=p.discipline_id JOIN semesters s ON s.id=d.semester_id
        WHERE p.student_id=$1 AND d.title=$2 AND s.is_current
        ON CONFLICT(plan_item_id) DO UPDATE SET department=EXCLUDED.department,hours=EXCLUDED.hours,
          coursework_hours=EXCLUDED.coursework_hours,assessment_label=EXCLUDED.assessment_label,position=EXCLUDED.position
      `, [student.id, title, department, hours, extra, assessmentLabel, index]);
    }
    for (const [term, [starts, ends]] of Object.entries(period)) {
      const { rows: [knownTerm] } = await client.query<{ id: string }>(
        "SELECT id FROM semesters WHERE starts_on=$1 ORDER BY is_current DESC,id LIMIT 1", [starts]);
      const semester = knownTerm?.id ?? id("semester:" + term);
      await client.query("INSERT INTO semesters(id,label,starts_on,ends_on,is_current) VALUES($1,$2,$3,$4,false) ON CONFLICT DO NOTHING",
        [semester, "Учебный план · семестр " + term, starts, ends]);
      for (const [index, item] of (curriculum[Number(term)] ?? []).entries()) {
        const key = term + ":" + index;
        const discipline = id("discipline:" + key);
        const plan = id("plan:" + key);
        const assessment = item.type === "Экзамен" || item.type === "РЭКЗ" ? "exam"
          : item.type === "Зачёт" || item.type === "Практика" ? "credit" : "graded_credit";
        await client.query(`INSERT INTO disciplines(id,group_id,semester_id,code,title,assessment)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET group_id=EXCLUDED.group_id WHERE disciplines.code=EXCLUDED.code`,
          [discipline, student.groupId, semester, "ATLAS-PLAN-" + key, item.title, assessment]);
        await client.query("INSERT INTO study_plan_items(id,student_id,discipline_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [plan, student.id, discipline]);
        await client.query(`INSERT INTO study_plan_details(plan_item_id,semester_number,department,hours,assessment_label,position)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [plan, Number(term), item.department, item.hours, item.type, index]);
        if (!item.grade) continue;
        const value = grades[item.grade as keyof typeof grades] ?? null;
        await client.query(`INSERT INTO grades(id,plan_item_id,kind,label,value,scale,outcome,published_at)
          VALUES($1,$2,$3,$4,$5,$6,'pass',$7::date::timestamp AT TIME ZONE 'Europe/Moscow') ON CONFLICT DO NOTHING`,
          [id("grade:" + key), plan, value === null ? "credit" : "final", item.grade, value, value === null ? null : "five", ends]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => { console.error("Study plan seed failed"); process.exitCode = 1; });
