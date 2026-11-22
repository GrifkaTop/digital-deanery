import { cleanGeneratedPage, parseDocumentVersionId } from "@/contracts/assistant-files";
import type { AssistantResponse } from "@/contracts/assistant";
import library from "../../../documents/sources/library-service-rules.json";
import certificates from "../../../documents/sources/study-certificates.json";

type Card = AssistantResponse["cards"][number];
const reviewed = [
  { source: library, section: 2, topic: "Срок выдачи и условия продления учебного издания", intent: /продл|срок|держать|дольше/u,
    summary: "Учебное издание выдают на 14 календарных дней. До даты возврата его можно продлить один раз на 7 дней, если его никто не забронировал." },
  { source: certificates, section: 1, topic: "Как подать заявку на справку об обучении", intent: /под[а-я]*|оформ[а-я]*|заказ[а-я]*|заявк[а-я]*|получить|нужна|нужно|^справк\p{L}* об обучени\p{L}*[?!.]*$/u,
    summary: "Данные студента подставятся из профиля.\n\n1. Откройте форму справки об обучении.\n2. Выберите **назначение справки**.\n3. Проверьте данные и отправьте форму." },
  { source: certificates, section: 2, topic: "Срок подготовки справки об обучении", intent: /срок|сколько|когда|быстро/u,
    summary: "Готовность образца справки можно проверить в карточке заявки. В документе срок подготовки не указан." },
  { source: certificates, section: 3, topic: "Где получить справку об обучении и доступна ли бумажная копия", intent: /бумаж|скача|забра|получ|pdf/u,
    summary: "Готовый образец справки в PDF появится в карточке заявки. В форме нельзя выбрать бумажный экземпляр." },
];
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();

export function reviewedDocumentAnswer(question: string, candidates: Card[]) {
  const entries = reviewed.flatMap((entry) => {
    if (!entry.intent.test(question)) return [];
    if (entry.source === library ? !/кни[гж]|издани|учебник|абонемент/u.test(question) : !/справ/u.test(question)) return [];
    const card = candidates.find((candidate) => {
      const match = /^\/today\/assistant\/documents\/([^#]+)#section-(\d+)$/u.exec(candidate.link.href);
      return match && parseDocumentVersionId(match[1])?.key === entry.source.id && Number(match[2]) === entry.section &&
        normalize(cleanGeneratedPage(candidate.text, true).split("Учебный материал. При расхождении")[0]) ===
          normalize(entry.source.sections[entry.section - 1].text);
    });
    return card ? [{ ...entry, card }] : [];
  });
  if (!entries.length) return;
  const summary = entries.map(({ summary }) => summary).join("\n\n");
  return {
    query: entries.map(({ topic }) => topic).join(". "),
    summary,
    cards: entries.slice(0, 1).map(({ card }) => card),
    confirm(selection: Card[]) {
      if (selection.length !== entries.length || entries.some(({ card }) => !selection.includes(card))) return;
      return summary;
    },
  };
}
