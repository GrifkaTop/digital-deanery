import type { AssistantResponse } from "@/contracts/assistant";

/** Only describes actions and rules visible in the prototype, never personal results. */
export function sportsAnswer(question: string): AssistantResponse | undefined {
  const q = question.toLowerCase().replaceAll("ё", "е");
  if (!/физкультур|спорт|тренировк/u.test(q)) return;
  if (/(?<!\p{L})(?:мой|моя|мои|моих|мою|мне|меня|у меня|я)(?!\p{L})/u.test(q)) return;
  let text: string | undefined;
  if (/зач[её]т/u.test(q) && /услов|получ|сдать|нуж|сколько|балл|посещ/u.test(q)) {
    text = "В демонстрации для зачёта нужны оба условия: минимум 60 баллов и 16 посещений. Личные результаты и выполнение условий доступны в разделе «Физкультура».";
  } else if (/норматив/u.test(q) && /где|посмотр|найти|результат|какие/u.test(q)) {
    text = "Результаты нормативов за выбранный семестр можно посмотреть в разделе «Физкультура» под медицинским допуском. Если результатов нет, появится пустое состояние.";
  } else if (/отмен/u.test(q) && /запис/u.test(q)) {
    text = "В разделе «Физкультура» откройте «Мои записи» и нажмите «Отменить запись» у нужного занятия.";
  } else if (/запис|мест|заняти|расписан/u.test(q) && /как|где|можно|сколько|запис|расписан/u.test(q)) {
    text = "В разделе «Физкультура» выберите занятие со свободными местами и нажмите «Записаться». Одновременно можно иметь не больше двух активных записей на занятия и бассейн; отработки доступны дополнительно.";
  }
  if (!text) return;
  return { kind: "answer", category: "quick", processing: "catalog", cards: [], text,
    widgets: [{ type: "actions", items: [{ label: "Открыть физкультуру", href: "/sports" }] }] };
}
