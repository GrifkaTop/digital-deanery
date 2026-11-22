import { parseDocumentVersionId } from "@/contracts/assistant-files";
import type { AssistantDocument, AssistantResponse } from "@/contracts/assistant";
import { catalogSources, catalogTopic } from "./catalog-topics";

type Card = AssistantResponse["cards"][number];
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();

function sectionsFor(key: string, question: string): number[] {
  switch (key) {
    case "student-social-support": return /сколько|сумм|размер|положен|начисл/u.test(question) ? [2, 3]
      : /подать|оформ|документ|срок|когда/u.test(question) ? [1, 3] : [1, 2, 3];
    case "academic-debt": return /дат|когда/u.test(question) && !/попыт|раз/u.test(question) ? [3] : [2, 3];
    case "assessment-rules": return /промежуточ|зачет|экзамен/u.test(question) ? [3] : [2];
    case "attendance-rules": return /процент|автомат|ноль|штраф/u.test(question) ? [1, 2] : [2, 3];
    case "assessment-appeals": return /точно|пересмотр|зани[зж]/u.test(question) ? [1, 3] : [1, 2, 3];
    case "consultation-rescheduling": return [1, 2, 3];
    case "consultation-control-info": return [2, 3];
    case "learning-materials": return /распростран|публиков|авторск/u.test(question) ? [2] : [1, 3];
    case "discipline-overview": return [2, 3];
    case "academic-leave": return /вернут|возвращ|выйти/u.test(question) ? [2, 3] : [1, 3];
    case "transfer-restoration": return /восстанов/u.test(question) && !/перев/u.test(question) ? [2, 3] : [1, 3];
    case "tuition-payment": return [1, 2, 3];
    case "dormitory-rules": return /стоим|стоит|плат|цен/u.test(question) ? [2, 3] : [1, 3];
    case "practice-thesis": return /практик/u.test(question) && /вкр|выпускн/u.test(question) ? [1, 2, 3]
      : /вкр|выпускн/u.test(question) ? [2, 3] : [1, 3];
    case "service-directory": return /телефон|позвон|контакт|адрес|почт/u.test(question) ? [3] : [1];
    case "student-conduct-requests": return [1, 2, 3];
    default: return [1];
  }
}

// Prose is copied from independently checked source paragraphs, never generated facts.
export async function catalogAnswer(question: string, candidates: Card[], load: (id: string) => Promise<AssistantDocument | undefined>) {
  question = question.toLowerCase().replaceAll("ё", "е");
  const intent = catalogTopic(question);
  if (!intent) return;
  const answers: { text: string; card: Card }[] = [];
  for (const key of intent.keys) {
    const source = catalogSources.find((item) => item.id === key);
    const candidate = candidates.find((card) => {
      const id = /^\/today\/assistant\/documents\/([^#]+)#/u.exec(card.link.href)?.[1];
      return id && parseDocumentVersionId(id)?.key === key;
    });
    if (!source || !candidate) continue;
    const id = candidate.link.href.split("/documents/")[1].split("#")[0];
    const document = await load(id);
    if (!document) continue;
    const indices = sectionsFor(key, question);
    const evidence = indices.map((index) => {
      const text = source.sections[index - 1]?.text;
      const section = text && document.sections.find((part) => normalize(part.text.split("Учебный материал. При расхождении")[0]).endsWith(normalize(text)));
      return text && section ? { text, id: section.id } : undefined;
    });
    if (evidence.some((item) => !item)) continue;
    // Reject replacement/withdrawal between retrieval and answer formation.
    const current = await load(id);
    if (!current || evidence.some((item) => !item || !current.sections.some((part) => part.id === item.id &&
      normalize(part.text.split("Учебный материал. При расхождении")[0]).endsWith(normalize(item.text))))) continue;
    const text = evidence.map((item) => item!.text).join("\n\n");
    answers.push({ text, card: { title: document.title, text,
      link: { label: `${document.title} · № ${document.number}`, href: `/today/assistant/documents/${id}#section-${evidence[0]!.id}` } } });
  }
  if (!answers.length) return;
  return { text: answers.map((item) => item.text).join("\n\n") + (answers.length < intent.keys.length ? "\n\nПо остальным частям вопроса подтверждённые сведения не найдены." : ""), cards: [answers[0].card] };
}
