import { z } from "zod";

export const purposes = { on_request: "По месту требования", study_contest: "Для учебного конкурса" };
export const reasons = { schedule_conflict: "Совпадение с занятием", preparation: "Нужно время для подготовки" };
export const slots = { option_a: "Вариант А · 24 ноября, 16:00 МСК", option_b: "Вариант Б · 25 ноября, 16:30 МСК" };
export const choices = { alternative_slot: "Выбрать другое время", keep_original: "Оставить исходное время" };
export const scholarshipKinds = { academic: "Академическая", social: "Социальная" };
const scholarshipPurposes = { on_request: "По месту требования", social_support: "Для оформления социальной поддержки" };
const scheduleGrounds = { sports: "Тренировки или соревнования", academic_mobility: "Академическая мобильность", other: "Другое основание" };
const dormitoryGrounds = { nonresident: "Проживаю в другом населённом пункте", exchange: "Обучаюсь по обмену", other: "Другое основание" };
const passActions = { initial: "Первичная выдача", lost: "Замена утраченного", damaged: "Замена повреждённого" };

type SelectField<T extends Record<string, string>> = { label: string; type: "select"; options: T };
function select<const T extends Record<string, string>>(label: string, options: T) {
  return { label, type: "select", options } satisfies SelectField<T>;
}

export type RequestField = { label: string } & (
  | SelectField<Record<string, string>>
  | { type: "discipline" | "date" | "month" }
  | { type: "textarea"; maxLength: number; optional?: true }
);

type RequestForm = {
  title: string;
  result: string; fields: Record<string, RequestField>;
};

export const requestForms = {
  study_certificate: {
    title: "Справка об обучении",
    result: "Образец PDF появится в кабинете.",
    fields: { purpose: select("Назначение", purposes) },
  },
  scholarship_certificate: {
    title: "Справка о начислении стипендии",
    result: "Если за выбранный период есть начисления, образец PDF появится в кабинете.",
    fields: {
      scholarshipKind: select("Вид стипендии", scholarshipKinds),
      fromMonth: { label: "Первый месяц периода", type: "month" },
      toMonth: { label: "Последний месяц периода", type: "month" },
      purpose: select("Назначение", scholarshipPurposes),
    },
  },
  consultation_reschedule: {
    title: "Перенос учебной консультации",
    result: "Решение появится в карточке заявки.",
    fields: {
      planId: { label: "Дисциплина", type: "discipline" },
      reason: select("Причина переноса", reasons),
      slot: select("Желаемое время", slots),
    },
  },
  individual_schedule: {
    title: "Индивидуальный график обучения",
    result: "После регистрации номер и статус будут доступны в кабинете.",
    fields: {
      startDate: { label: "Начало периода", type: "date" },
      endDate: { label: "Окончание периода", type: "date" },
      grounds: select("Основание", scheduleGrounds),
      changes: { label: "Дисциплины и запрашиваемые изменения", type: "textarea", maxLength: 1000 },
    },
  },
  dormitory: {
    title: "Предоставление места в общежитии",
    result: "После регистрации номер и статус будут доступны в кабинете.",
    fields: {
      startDate: { label: "Желаемая дата заселения", type: "date" },
      grounds: select("Основание обращения", dormitoryGrounds),
      comment: { label: "Комментарий", type: "textarea", maxLength: 500, optional: true },
    },
  },
  material_aid: {
    title: "Материальная помощь",
    result: "Заявление будет зарегистрировано для рассмотрения.",
    fields: { grounds: select("Основание", { financial: "Трудное материальное положение", other: "Другое основание" }), details: { label: "Обстоятельства обращения", type: "textarea", maxLength: 1000 } },
  },
  academic_leave: {
    title: "Академический отпуск",
    result: "Заявление будет зарегистрировано для рассмотрения.",
    fields: { grounds: select("Основание", { family: "Семейные обстоятельства", other: "Другое основание" }), startDate: { label: "Начало отпуска", type: "date" }, endDate: { label: "Окончание отпуска", type: "date" }, details: { label: "Обстоятельства обращения", type: "textarea", maxLength: 1000 } },
  },
  travel_compensation: {
    title: "Компенсация проезда до места жительства и отдыха",
    result: "Заявление будет зарегистрировано для рассмотрения.",
    fields: { route: { label: "Маршрут поездки", type: "textarea", maxLength: 500 }, travelDate: { label: "Дата поездки", type: "date" }, cost: { label: "Стоимость проезда в рублях", type: "textarea", maxLength: 12 }, details: { label: "Обстоятельства обращения", type: "textarea", maxLength: 1000 } },
  },
  campus_pass: {
    title: "Оформление пропуска в кампус",
    result: "После регистрации номер и статус будут доступны в кабинете.",
    fields: { action: select("Цель обращения", passActions) },
  },
} as const satisfies Record<string, RequestForm>;

const enumeration = <T extends Record<string, string>>(options: T) => z.enum(Object.keys(options) as (keyof T & string)[]);
const date = z.iso.date().refine((value) => value >= "1900-01-01", "Укажите дату начиная с 1900 года.");
export const yearMonth = z.string().regex(/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/, "Укажите месяц и год.");
const text = (max: number) => z.string().trim().min(1, "Заполните поле.").max(max);
export const scholarshipKind = enumeration(scholarshipKinds);
export const studyForm = z.strictObject({ schemaVersion: z.literal(1).default(1), purpose: enumeration(purposes) });
const consultationFields = { reason: enumeration(reasons), slot: enumeration(slots) };
export const legacyConsultation = z.strictObject({ schemaVersion: z.literal(1).default(1), ...consultationFields });
export const consultationForm = z.strictObject({ schemaVersion: z.literal(2), planId: z.uuid(), ...consultationFields });
export const scholarshipForm = z.strictObject({
  schemaVersion: z.literal(2), scholarshipKind, fromMonth: yearMonth, toMonth: yearMonth,
  purpose: enumeration(scholarshipPurposes),
}).refine(({ fromMonth, toMonth }) => fromMonth <= toMonth, {
  path: ["toMonth"], message: "Последний месяц должен быть не раньше первого.",
});
const applicationDates = { schemaVersion: z.literal(2), startDate: date, endDate: date };
const dateOrder = ({ startDate, endDate }: { startDate: string; endDate: string }) => startDate <= endDate;
const dateError = { path: ["endDate"], message: "Дата окончания должна быть не раньше даты начала." };
export const individualScheduleForm = z.strictObject({
  ...applicationDates, grounds: enumeration(scheduleGrounds), changes: text(1000),
}).refine(dateOrder, dateError);
export const legacyDormitoryForm = z.strictObject({
  ...applicationDates, grounds: enumeration(dormitoryGrounds), comment: text(500).optional(),
}).refine(dateOrder, dateError).refine(({ grounds, comment }) => grounds !== "other" || Boolean(comment), {
  path: ["comment"], message: "Укажите основание в комментарии.",
});
export const dormitoryForm = z.strictObject({ schemaVersion: z.literal(3), startDate: date, grounds: enumeration(dormitoryGrounds), comment: text(500).optional() }).refine(({ grounds, comment }) => grounds !== "other" || Boolean(comment), { path: ["comment"], message: "Укажите основание в комментарии." });
export const materialAidForm = z.strictObject({ schemaVersion: z.literal(2), grounds: z.enum(["financial", "other"]), details: text(1000) });
export const academicLeaveForm = z.strictObject({ ...applicationDates, grounds: z.enum(["family", "other"]), details: text(1000) }).refine(dateOrder, dateError);
export const travelCompensationForm = z.strictObject({ schemaVersion: z.literal(2), route: text(500), travelDate: date, cost: z.string().regex(/^(?=.*[1-9])\d{1,9}(?:[.,]\d{1,2})?$/, "Укажите положительную сумму в рублях."), details: text(1000) });
export const campusPassForm = z.strictObject({ schemaVersion: z.literal(2), action: enumeration(passActions) });

export function requestFieldValue(field: RequestField, value: string) {
  if (field.type === "select") return field.options[value] ?? value;
  if (field.type === "date") return value.split("-").reverse().join(".");
  if (field.type === "month" && yearMonth.safeParse(value).success) return formatRequestMonth(value);
  return value;
}

export function formatRequestMonth(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(value + "-01T00:00:00Z"));
}
