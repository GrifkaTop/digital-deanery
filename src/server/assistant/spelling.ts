// Only repair known interface words, and only when the correction is unique.
const vocabulary = new Set([
  "какой", "какая", "какие", "когда", "покажи", "ближайший", "ближайшая", "ближайшей", "следующий", "следующая",
  "дедлайн", "дедлайны", "задача", "задачи", "расписание", "занятие", "занятия", "пара", "пары", "пару", "сегодня", "завтра", "послезавтра",
  "получить", "материальная", "материальную", "помощь", "социальная", "социальную",
  "общежитие", "академический", "отпуск", "апелляция", "пересдача", "пропуск", "обучения",
  "материалы", "дисциплины", "консультация", "консультацию", "восстановление", "перевод", "оплата",
  "учебник", "книга", "пособие", "литература", "библиотека",
  "скидка", "продлить", "заказать", "справка", "справку",
  "стипендия", "выплата", "каникулы", "оценки", "оценка", "этого",
]);

function oneEditAway(word: string, target: string) {
  if (Math.abs(word.length - target.length) > 1) return false;
  let index = 0;
  while (index < word.length && word[index] === target[index]) index++;
  const left = word.slice(index);
  const right = target.slice(index);
  if (word.length !== target.length) return left.slice(1) === right || right.slice(1) === left;
  return left.slice(1) === right.slice(1) ||
    (left.length >= 2 && left[0] === right[1] && left[1] === right[0] && left.slice(2) === right.slice(2));
}

const lookalikes: Record<string, string> = { a: "а", c: "с", e: "е", k: "к", o: "о", p: "р", x: "х", y: "у" };

export function repairIntentWords(question: string) {
  const expanded = question
    .replace(/(?<!\p{L})матпомощ\p{L}*(?!\p{L})/gu, "материальная помощь")
    .replace(/(?<!\p{L})соц[.\s]*стип(?:ендия|ендию|уха|уху)?(?!\p{L})/gu, "социальная стипендия")
    .replace(/(?<!\p{L})общаг(?:а|у|е|и|ой)(?!\p{L})/gu, "общежитие")
    .replace(/(?<!\p{L})академотпуск(?!\p{L})/gu, "академический отпуск");
  return expanded.replace(/(?<!\p{L})[a-zа-я]{4,16}(?!\p{L})/gu, (original) => {
    if (!/[а-я]/u.test(original)) return original;
    const word = original.replace(/[acekopxy]/gu, (letter) => lookalikes[letter]);
    if (vocabulary.has(word)) return word;
    const candidates = [...vocabulary].filter((target) => oneEditAway(word, target));
    return candidates.length === 1 ? candidates[0] : original;
  });
}

export function normalizeDayAfterTomorrow(question: string) {
  return question.replace(/(?<!\p{L})после\s+(?:завтра|звтра)(?!\p{L})/giu, "послезавтра");
}
