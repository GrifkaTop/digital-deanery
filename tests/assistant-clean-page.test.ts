import { expect, it } from "vitest";
import { cleanGeneratedPage } from "../src/contracts/assistant-files";

it("removes only known page decoration and retains the whole section", () => {
  const page = `ИНСТИТУТ ПРИКЛАДНЫХ ГУМАНИТАРНЫХ СИСТЕМ «СЕВЕРНАЯ ОРБИТА»

КОНКУРСНЫЙ ПРОТОТИП · СИНТЕТИЧЕСКИЙ ДОКУМЕНТ · № Т-01 от 2026-01-01

Правила

1. Условия
Заявление подают до 15 мая. Если студент отсутствует,
срок продлевают на 3 дня.

Учебный материал. При расхождении применяются нормативные правовые акты РФ и действующие
локальные акты организации.
Страница 1`;
  expect(cleanGeneratedPage(page)).toBe("Заявление подают до 15 мая. Если студент отсутствует,\nсрок продлевают на 3 дня.");
  const unknown = page.replace("Страница 1", "Другая подпись");
  expect(cleanGeneratedPage(unknown)).toBe(unknown);
  const wrapped = page.replace("Правила\n", "Академический календарь на 2026/27 учебный\n                                          год\n");
  expect(cleanGeneratedPage(wrapped)).toBe(wrapped);
  expect(cleanGeneratedPage(wrapped, true)).toBe("Заявление подают до 15 мая. Если студент отсутствует,\nсрок продлевают на 3 дня.");
});
