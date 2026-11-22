import type { AssistantResponse } from "@/contracts/assistant";

export function campusAnswer(question: string): AssistantResponse | undefined {
  const q = question.toLowerCase().replaceAll("ё", "е");
  const clinic = /поликлиник|(?<!\p{L})врач\p{L}*|(?<!\p{L})афк(?!\p{L})|адаптивн\p{L}* физкультур/u.test(q);
  const vuc = /(?<!\p{L})вуц(?!\p{L})|военн\p{L}* учебн\p{L}* центр/u.test(q);
  if (!clinic && !vuc) return;
  if (clinic && vuc) return;
  const title = clinic ? "Поликлиника" : "Военный учебный центр";
  let text = `Откройте раздел «${title}», чтобы посмотреть доступные сведения и действия.`;
  if (clinic && /запис|прием/u.test(q)) text = "В разделе «Поликлиника» можно выбрать свободное время и записаться к врачу факультета или отменить запись.";
  else if (clinic && /афк|адаптивн/u.test(q)) text = "В разделе «Поликлиника» доступна демонстрационная заявка на АФК. Период появится после публикации решения.";
  else if (vuc && /подать|подач|поступ|заявлен|отбор/u.test(q)) text = "В демонстрационном разделе ВУЦ можно подать заявление, записаться на испытания и следить за опубликованными результатами и решением.";
  else if (vuc && /расписан|допуск/u.test(q)) text = "Расписание и дальнейшие требования доступны в разделе ВУЦ после публикации допуска к обучению.";
  return { kind: "answer", category: "quick", processing: "catalog", text, cards: [], widgets: [{ type: "actions", items: [{ label: `Открыть раздел «${title}»`, href: clinic ? "/prototype#clinic" : "/prototype#vuc" }] }] };
}
