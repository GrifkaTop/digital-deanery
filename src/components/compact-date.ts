const compactDateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});

export function compactDate(value: string) {
  return compactDateTime.format(new Date(value));
}
