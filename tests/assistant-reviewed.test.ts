import { expect, it } from "vitest";
import { reviewedDocumentAnswer } from "../src/server/assistant/reviewed";
import library from "../documents/sources/library-service-rules.json";
import certificates from "../documents/sources/study-certificates.json";
import { documentVersionId } from "../src/contracts/assistant-files";

const certificateCard = {
  title: certificates.title,
  text: `${certificates.sections[0].text}\n\nУчебный материал. При расхождении применяются действующие акты. Страница 1`,
  link: { label: "СП-01", href: `/today/assistant/documents/${documentVersionId(certificates.id, "68bbb163fbc760ac0df6f1ca4c1ef30386966a2c9d654d1cb86d18001007d58c")}#section-1` },
};

it("keeps the deadline, renewal limit and booking exception when the published section matches", () => {
  const card = {
    title: library.title, text: `${library.sections[1].text}\n\nУчебный материал. При расхождении применяются действующие акты. Страница 2`,
    link: { label: "ББ-02", href: "/today/assistant/documents/file-library-service-rules-2aaae577ee3b79ffcb1ce08d9463f5e455fe6f13747555097338c0b22fefa6c7#section-2" },
  };
  const other = { ...card, text: card.text.replace("7 дней", "8 дней") };
  const answer = reviewedDocumentAnswer("учебник нужен подольше, получится держать его еще?", [card, other]);
  expect(answer?.confirm([card])).toContain("До даты возврата его можно продлить один раз на 7 дней, если его никто не забронировал.");
  expect(answer?.confirm([other])).toBeUndefined();
  expect(reviewedDocumentAnswer("можно продлить книгу?", [other])).toBeUndefined();
  expect(reviewedDocumentAnswer("куда сдать учебник?", [card])).toBeUndefined();
});

it("answers how to submit a study certificate request from its verified source", () => {
  for (const question of ["Как подать заявку на справку об обучении?", "Где оформить справку об обучении?", "Как заказать справку?"]) {
    const answer = reviewedDocumentAnswer(question, [certificateCard]);
    expect(answer?.summary).toBe("Данные студента подставятся из профиля.\n\n1. Откройте форму справки об обучении.\n2. Выберите **назначение справки**.\n3. Проверьте данные и отправьте форму.");
    expect(answer?.cards).toEqual([certificateCard]);
    expect(answer?.confirm([certificateCard])).toBe(answer?.summary);
  }
  expect(reviewedDocumentAnswer("Как подать заявку на справку об обучении?", [])).toBeUndefined();
});

it("returns at most one verified document for a certificate question", () => {
  const otherCard = {
    ...certificateCard,
    text: `${certificates.sections[1].text}\n\nУчебный материал. При расхождении применяются действующие акты. Страница 2`,
    link: { ...certificateCard.link, href: certificateCard.link.href.replace("section-1", "section-2") },
  };
  const answer = reviewedDocumentAnswer("Как подать заявку и сколько ждать справку?", [certificateCard, otherCard]);
  expect(answer?.cards).toHaveLength(1);
  expect(answer?.summary).toContain("срок подготовки не указан");
  expect(answer?.confirm([certificateCard, otherCard])).toBe(answer?.summary);
});

it("keeps the instructions for a new PDF revision with the same checked section", () => {
  const question = "Как подать заявку на справку об обучении?";
  const republished = { ...certificateCard, link: { ...certificateCard.link,
    href: certificateCard.link.href.replace(/[a-f0-9]{64}/u, "a".repeat(64)) } };
  expect(reviewedDocumentAnswer(question, [republished])?.cards).toEqual([republished]);
  expect(reviewedDocumentAnswer(question, [{ ...republished, text: "Обратитесь лично." }])).toBeUndefined();
});
