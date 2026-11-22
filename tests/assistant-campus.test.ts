import { expect, it } from "vitest";
import { assistantResponse } from "@/contracts/assistant";
import { campusAnswer } from "@/server/assistant/campus";

it("answers basic campus questions and links unknown questions to the appropriate page", () => {
  for (const [question, href, fragment] of [
    ["Как записаться к врачу?", "/prototype#clinic", "записаться"],
    ["Как подать заявку на АФК?", "/prototype#clinic", "АФК"],
    ["Как подать заявление в ВУЦ?", "/prototype#vuc", "заявление"],
    ["Когда расписание ВУЦ?", "/prototype#vuc", "допуска"],
    ["Сколько стоит поликлиника?", "/prototype#clinic", "Откройте"],
    ["Какой мой результат ВУЦ?", "/prototype#vuc", "Откройте"],
  ]) {
    const answer = assistantResponse.parse(campusAnswer(question!));
    expect(answer.text).toContain(fragment);
    expect(answer.widgets).toMatchObject([{ type: "actions", items: [{ href }] }]);
  }
  expect(campusAnswer("Когда мой паспорт здоровья заканчивается?")).toBeUndefined();
  expect(() => assistantResponse.parse({ ...campusAnswer("ВУЦ"), cards: [{ title: "x", text: "", link: { label: "x", href: "/prototype#settings" } }] })).toThrow();
});
