import "server-only";
import { repairIntentWords } from "./spelling";
import academicDebt from "../../../documents/sources/academic-debt.json";
import academicLeave from "../../../documents/sources/academic-leave.json";
import assessmentAppeals from "../../../documents/sources/assessment-appeals.json";
import assessmentRules from "../../../documents/sources/assessment-rules.json";
import attendanceRules from "../../../documents/sources/attendance-rules.json";
import consultationControlInfo from "../../../documents/sources/consultation-control-info.json";
import consultationRescheduling from "../../../documents/sources/consultation-rescheduling.json";
import disciplineOverview from "../../../documents/sources/discipline-overview.json";
import dormitoryRules from "../../../documents/sources/dormitory-rules.json";
import learningMaterials from "../../../documents/sources/learning-materials.json";
import practiceThesis from "../../../documents/sources/practice-thesis.json";
import serviceDirectory from "../../../documents/sources/service-directory.json";
import studentConductRequests from "../../../documents/sources/student-conduct-requests.json";
import studentSocialSupport from "../../../documents/sources/student-social-support.json";
import transferRestoration from "../../../documents/sources/transfer-restoration.json";
import tuitionPayment from "../../../documents/sources/tuition-payment.json";

export const catalogSources = [
  academicDebt,
  academicLeave,
  assessmentAppeals,
  assessmentRules,
  attendanceRules,
  consultationControlInfo,
  consultationRescheduling,
  disciplineOverview,
  dormitoryRules,
  learningMaterials,
  practiceThesis,
  serviceDirectory,
  studentConductRequests,
  studentSocialSupport,
  transferRestoration,
  tuitionPayment,
] as const;

type Topic = { key: string; query: string; matches: RegExp };

const topics: Topic[] = [
  { key: "consultation-rescheduling", query: "перенос консультации порядок заявка причина варианты времени", matches: /(?=.*(?:консультац|преподавател))(?=.*(?:перенос|перенест|изменить время|другое время|сдвинуть))/u },
  { key: "consultation-control-info", query: "консультации рубежные контрольные мероприятия даты формат расписание", matches: /(?:консультац|рубежн\p{L}* контрол|контрольн\p{L}* мероприят|контрольная точка)/u },
  { key: "assessment-rules", query: "текущий контроль промежуточная аттестация форма оценивание критерии", matches: /(?:аттестаци|текущ.{0,10}контрол|форм.{0,15}(?:контрол|экзамен|зачет)|как провер|проверяют|оцениван)/u },
  { key: "academic-debt", query: "академическая задолженность пересдача повторная аттестация попытки комиссия", matches: /(?:задолж|пересда|пересдат|повторн\p{L}* аттестаци|не сдал|не сдала|не сдан|долг по предмет)/u },
  { key: "attendance-rules", query: "посещение занятий пропуск болезнь подтверждение отсутствия требования", matches: /(?:пропуск|пропустил|пропустила|не приш[её]л|не пришла|болел|болела|посещаемост|посещение занятий|подтвердить отсутствие)/u },
  { key: "assessment-appeals", query: "обращение апелляция несогласие с оценкой пересмотр результата аттестации порядок срок", matches: /(?:апелляц|оспор|не соглас\p{L}* с оценк|оценк\p{L}* зани|пересмотр\p{L}* оцен|обжалован\p{L}* оцен|не соглас\p{L}* с результат)/u },
  { key: "learning-materials", query: "учебные материалы курса дисциплины программа где получить", matches: /(?:материал(?!ь)\p{L}* (?:курса|дисциплин|по предмету)|материал(?!ь)\p{L}* по|где взять материал|учебн\p{L}* материал|^материалы[?!.]*$)/u },
  { key: "discipline-overview", query: "список дисциплин учебного плана обзор учебных дисциплин", matches: /(?:какие дисциплин|список дисциплин|учебн\p{L}* план|обзор дисциплин|рабоч\p{L}* программ|программ\p{L}* дисциплин)/u },
  { key: "academic-leave", query: "академический отпуск основания оформление возвращение к обучению", matches: /(?:академ\p{L}* отпуск|академотпуск|взять академ|уйти в академ)/u },
  { key: "transfer-restoration", query: "перевод восстановление условия свободные места академическая разница", matches: /(?:перевест|перевод|восстанов|восстановлени|свободн\p{L}* мест\p{L}* для перевода)/u },
  { key: "student-social-support", query: "социальная поддержка социальная стипендия материальная помощь основания заявление", matches: /(?:социальн\p{L}* поддерж|социальн\p{L}* стипенд|материальн\p{L}* помощ|финансов\p{L}* помощ|льгот\p{L}* студент)/u },
  { key: "tuition-payment", query: "оплата обучения стоимость обучения скидки рассрочка договор", matches: /(?:оплат\p{L}* обучени|стоимост\p{L}* обучени|скидк|заплатить|рассрочк|платн\p{L}* обучени|рассрочк\p{L}* оплат|договор\p{L}* обучени)/u },
  { key: "dormitory-rules", query: "общежитие проживание место плата правила заселения", matches: /(?:общежити|мест\p{L}* для проживани|заселени|плата за проживани)/u },
  { key: "student-conduct-requests", query: "правила внутреннего распорядка права студента обращение жалоба порядок", matches: /(?:внутренн\p{L}* распоряд|правила поведения студент|права студент|как обратиться|порядок обращени|подать жалоб|куда обратиться)/u },
  { key: "practice-thesis", query: "производственная практика сроки место отчетность выпускная квалификационная работа ВКР", matches: /(?:практик|вкр|выпускн\p{L}* работ|дипломн\p{L}* работ|защит\p{L}* диплом)/u },
  { key: "service-directory", query: "справочник контактов телефон адрес деканат учебные сервисы подразделения", matches: /(?:контакт|телефон|позвон|адрес деканат|деканат|справочник сервис|куда писать|куда звонить)/u },
];

const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/gu, " ").trim();

/** Finds public document topics only; personal grades, deadlines and class schedules belong to their own handlers. */
export function catalogTopic(question: string): { keys: string[]; query: string } | undefined {
  const normalized = repairIntentWords(normalize(question));
  if (!normalized || /(?:какую оценку мне поставили|моя оценка|мои оценки|мой дедлайн|мои дедлайны|что мне сдавать|мое расписание|мои пары|какая у меня пара)/u.test(normalized)) return undefined;

  let selected = topics.filter(({ matches }) => matches.test(normalized));
  if (selected.some(({ key }) => key === "consultation-rescheduling") && !/когда|дат|ближайш/u.test(normalized)) {
    selected = selected.filter(({ key }) => key !== "consultation-control-info");
  }
  if (selected.some(({ key }) => key === "assessment-appeals") && !/распоряд|правила поведения/u.test(normalized)) {
    selected = selected.filter(({ key }) => key !== "student-conduct-requests");
  }
  if (!selected.length) return undefined;

  return {
    keys: [...new Set(selected.map(({ key }) => key))],
    query: [...new Set(selected.map(({ query }) => query))].join("; "),
  };
}
