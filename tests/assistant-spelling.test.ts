import { expect, it } from "vitest";
import { repairIntentWords } from "../src/server/assistant/spelling";

it.each([
  ["рассписание на завтра", "расписание на завтра"],
  ["расписание на затвра", "расписание на завтра"],
  ["какие занятя сегодня", "какие занятия сегодня"],
  ["где ближайшя пара", "где ближайшая пара"],
  ["когда стпендия", "когда стипендия"],
  ["когда стиипендия", "когда стипендия"],
  ["когда стпиендия", "когда стипендия"],
  ["когда стипендиа", "когда стипендия"],
  ["дедлайн по java", "дедлайн по java"],
  ["задач", "задач"],
  ["завтра сессия или экзамен", "завтра сессия или экзамен"],
])("repairs intent words without changing unrelated words: %s", (input, expected) => {
  expect(repairIntentWords(input)).toBe(expected);
});

const wordsWithUniqueDeletionRepairs = ["расписание", "послезавтра", "стипендия", "каникулы"];

it.each(wordsWithUniqueDeletionRepairs)("repairs each single character deletion in %s", (word) => {
  const variants = new Set([...word].map((_, index) => word.slice(0, index) + word.slice(index + 1)));
  for (const variant of variants) expect(repairIntentWords(variant), variant).toBe(word);
});

it.each([
  ["как плучить материальну помщь??", "как получить материальную помощь??"],
  ["как получить матпомощь", "как получить материальная помощь"],
  ["как оформить соцстипендию", "как оформить социальная стипендия"],
  ["хочу в общагу", "хочу в общежитие"],
  ["общежите", "общежитие"],
  ["академичский отпуск", "академический отпуск"],
  ["апелляця", "апелляция"],
  ["консультаця", "консультация"],
  ["пересдча", "пересдача"],
  ["восстановлние", "восстановление"],
  ["оплта обучения", "оплата обучения"],
])("repairs document-topic words and common aliases: %s", (input, expected) => {
  expect(repairIntentWords(input)).toBe(expected);
});
