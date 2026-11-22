import "server-only";
import { open } from "node:fs/promises";
import { NextResponse } from "next/server";
import { assistantDocument, assistantRequest, assistantResponse, type AssistantWidget } from "@/contracts/assistant";
import { parseDocumentVersionId } from "@/contracts/assistant-files";
import type { TodayDeadline } from "@/contracts/academics";
import { addDays, dateInMoscow } from "@/contracts/calendar";
import { checkCsrf, handle, HttpError, json, requireActor, type Actor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";
import { assistantDeadlines, deadlineToday, disciplineDetail, studyList } from "@/server/academics/study";
import { healthPassport, sportsAttendance } from "@/server/sports/http";
import { byPublicNumber, list as listRequests } from "@/server/requests/store";
import { kindLabel, statusLabel } from "@/contracts/requests";
import {
  classifyFromWords, classifyWithModel, isPeriodFollowUp, normalizeQuestion, questionScope, selectSourcesWithModel, type AssistantModel,
} from "./classify";
import { conciseDocumentAnswer } from "./documents";
import { getImportedDocument, getPublishedPdfPath, getPublishedTopicCards, getSourcePdfPage, searchDocumentFiles } from "./files";

import { catalogTopic } from "./catalog-topics";
import { catalogAnswer } from "./catalog-answer";
import { reviewedDocumentAnswer } from "./reviewed";
import { campusAnswer } from "./campus";
import { sportsAnswer } from "./sports";
import { normalizeDayAfterTomorrow, repairIntentWords } from "./spelling";
import { answerSchedule, localSchedule, moscowShortDate, moscowTime } from "./schedule";

import { answerLibrary, libraryQuery, correctedLibraryQuery } from "./library";

function action(label: string, href: string): AssistantWidget {
  return { type: "actions", items: [{ label, href }] };
}

function deadlineWidget(item: TodayDeadline): AssistantWidget {
  const date = new Date(item.dueAt);
  return {
    type: "deadline", id: item.id, title: item.title,
    dueLabel: `${moscowShortDate.format(date)} · ${moscowTime.format(date)}`,
    isOverdue: item.state === "overdue", required: item.required,
    href: "requestId" in item ? `/requests/${item.requestId}`
      : item.assignmentId ? `/assignments/${item.assignmentId}` : `/study/${item.planId}`,
  };
}

function parseAssistantResponse(input: unknown) {
  const response = assistantResponse.parse(input);
  let documentShown = false;
  response.cards = response.cards.filter((card) => {
    if (!card.link.href.startsWith("/today/assistant/documents/")) return true;
    if (documentShown) return false;
    documentShown = true;
    return true;
  });
  return response;
}

const rateWindowMs = 60_000;
const requestsPerSession = 30;
const sessionAttempts = new Map<string, number>();
let windowStart = 0;

function belongsToDocument(href: string, key: string) {
  const id = /^\/today\/assistant\/documents\/([^#]+)#section-\d+$/u.exec(href)?.[1];
  return id ? parseDocumentVersionId(id)?.key === key : false;
}

function retryAfter(sessionId: string) {
  const now = Date.now();
  if (now >= windowStart + rateWindowMs) {
    windowStart = now;
    sessionAttempts.clear();
  }
  const count = sessionAttempts.get(sessionId) ?? 0;
  if (count >= requestsPerSession) return Math.ceil((windowStart + rateWindowMs - now) / 1000);
  sessionAttempts.set(sessionId, count + 1);
  return 0;
}

async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_JSON");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    let text = "";
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        void reader.cancel().catch(() => {});
        throw new HttpError(422, "INVALID_FIELDS");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body = assistantRequest.safeParse(JSON.parse(text + decoder.decode()));
    if (!body.success) throw new HttpError(422, "INVALID_FIELDS");
    return body.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON");
  } finally {
    reader.releaseLock();
  }
}

async function runModelStep<T>(task: (deadline: AbortSignal) => Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return undefined;
  let onAbort: () => void = () => {};
  try {
    const work = Promise.resolve().then(() => task(signal));
    const abort = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([work, abort]);
  } catch (error) {
    console.warn("assistant.model_step_failed", {
      reason: signal.aborted ? "aborted" : error instanceof Error ? error.name : "unknown",
      status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : undefined,
    });
    return undefined;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function currentActor(previous: Actor) {
  const latest = await requireActor();
  if (latest.session_id !== previous.session_id || latest.id !== previous.id) throw new HttpError(401, "UNAUTHENTICATED");
  if (latest.group_id !== previous.group_id) throw new HttpError(409, "SESSION_CHANGED");
  return latest;
}

export function askAssistant(request: Request, model?: AssistantModel) {
  return handle(async () => {
    const actor = await requireActor();
    await checkCsrf(request);
    if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
    const { question, context } = await readInput(request);
    const retry = retryAfter(actor.session_id);
    if (retry) {
      const response = json({ code: "RATE_LIMITED" }, 429);
      response.headers.set("Retry-After", String(retry));
      return response;
    }
    const today = dateInMoscow(visibilityNow());
    const normalized = normalizeQuestion(question).replace(/\s+/gu, " ");
    const repaired = normalizeDayAfterTomorrow(repairIntentWords(normalized));
    const sports = sportsAnswer(normalized);
    if (sports) {
      await currentActor(actor);
      return json(parseAssistantResponse(sports));
    }
    const campus = campusAnswer(normalized);
    if (campus && !(/паспорт\p{L}* здоров/u.test(normalized) && /когда|срок|действ|заканч/u.test(normalized))) {
      await currentActor(actor);
      return json(parseAssistantResponse(campus));
    }
    const bookQuery = libraryQuery(normalized);
    if (bookQuery !== undefined) {
      const current = await currentActor(actor);
      let answer = await answerLibrary(current, bookQuery);
      if (answer.kind === "empty" && model && bookQuery) {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
        const corrected = await runModelStep(deadline => correctedLibraryQuery(question, model.classify, deadline), signal);
        if (corrected && corrected !== bookQuery) {
          const latest = await currentActor(actor);
          answer = { ...await answerLibrary(latest, corrected), processing: "qwen" };
        }
      }
      await currentActor(actor);
      return json(parseAssistantResponse(answer));
    }
    if (/^как (?:подать|создать|оформить) заявку[?! .]*$/u.test(normalized)) {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "answer", category: "quick", cards: [],
        text: "1. Откройте каталог услуг и выберите нужную.\n2. Нажмите **«Оформить»** и заполните форму.\n3. Отправьте заявку. Её статус появится в разделе **«Мои заявки»**.",
        widgets: [action("Открыть каталог услуг", "/prototype#services")] }));
    }
    const catalogIntent = catalogTopic(repaired);
    const modelSignal = model && AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
    const directGrade = /^(?:(?:какие|какая|покажи) (?:у меня )?|мои )?(?:мои )?оценк(?:а|и) по (.+?)[?!.]*$/u.exec(normalized);
    const gradeOverview = /^(?:мои оценки|оценки|(?:какие|покажи) (?:у меня |мои )?оценки(?: у меня)?)[?!.]*$/u.test(repaired) ||
      /^(?:скажи,?\s*)?(?:какие|покажи какие) оценки (?:мне|у меня) (?:уже |успели )?(?:выставили|выставить|поставили|поставить)(?: в (?:этом|текущем) семестре)?[?!.]*$/u.test(repaired);
    const gradeFollowUp = context?.subject === "grades" ? /^(?:а )?по (.+?)[?!.]*$/u.exec(normalized) : null;
    const directRequest = /^(?:(?:какой )?статус |покажи |мои )?(?:моих |моей |мои |моя )?заяв(?:ки|ок|ка|ке|ку)(?: (?:номер )?([а-я]{2}-\d{4}-\d+))?[?!.]*$/iu.exec(question.trim());
    const directAttendance = /^(?:(?:какая|покажи) (?:у меня )?|моя )?(?:моя )?посещаемост\p{L}*(?: по физкультуре)?[?!.]*$/u.test(normalized);
    const generalAttendance = /болел|не пришел|пропустил/u.test(normalized) && /ноль|пропуск|отметк|справк/u.test(normalized);
    const retakeAttempts = /(?:пересда|не сдал|завалил).*(?:попыт|сколько|раз)|(?:сколько|попыт).*(?:пересда|экзамен)/u.test(normalized);
    const certificateQuestion = /справк\p{L}* об обучени/u.test(repaired) ||
      (/справк/u.test(repaired) && /как|где|когда|подат|заказ|оформ|бумаж/u.test(repaired) &&
        !/стипенди|начисл|здоров|медицин|паспорт/u.test(repaired));
    const generalRules = generalAttendance || retakeAttempts;
    const personalQuestion = !catalogIntent && !certificateQuestion && !generalRules && /оценк|заявк|посещаемост/u.test(normalized);
    const personalTried = Boolean(model && modelSignal && personalQuestion && !directGrade && !gradeOverview && !gradeFollowUp && !directRequest && !directAttendance);
    const personalIntent = model && modelSignal && personalTried
      ? await runModelStep((signal) => classifyWithModel(question, model.classify, signal, today), modelSignal) : undefined;
    if (personalTried && (!personalIntent || personalIntent.kind === "search" || personalIntent.kind === "unsupported") && /(?<!\p{L})(?:мои|моих|моей|моя|мой|мне|у меня)(?!\p{L})/u.test(normalized)) {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "clarify", cards: [],
        text: "Уточните, какие личные сведения вам нужны и, для оценок, название дисциплины." }));
    }
    const gradeName = directGrade?.[1] ?? gradeFollowUp?.[1] ??
      (personalIntent?.kind === "personal_grades" ? personalIntent.discipline : undefined);
    if (gradeName || gradeOverview || personalIntent?.kind === "personal_grades") {
      const current = await currentActor(actor);
      const now = visibilityNow();
      const plan = await studyList(current, undefined, now);
      const name = gradeName && normalizeQuestion(gradeName.trim());
      const matches = name ? plan.items.filter((item) => normalizeQuestion(item.title) === name)
        : plan.items.filter((item) => item.hasGrades);
      const gradeContext = { topics: [], subject: "grades" as const };
      const processing = personalIntent?.kind === "personal_grades" ? "qwen" : "catalog";
      if (name && matches.length !== 1) {
        await currentActor(actor);
        return json(parseAssistantResponse({ kind: "clarify", category: "quick", cards: [],
          context: gradeContext, processing, text: "Укажите точное название дисциплины из вашего учебного плана.",
          widgets: [action("Открыть успеваемость", "/study")] }));
      }
      const groups = await Promise.all(matches.slice(0, 8).map(async (item) => {
        const detail = await disciplineDetail(current, item.id, now);
        return detail.grades.map((grade) => {
          const resultText = grade.value !== null ? `${grade.value} из ${grade.scale === "hundred" ? 100 : 5}`
            : grade.outcome === "pass" ? "Зачтено" : grade.outcome === "fail" ? "Не зачтено" : "Результат не указан";
          const tone = grade.outcome === "pass" || (grade.scale === "five" && grade.value === 5) ? "success"
            : grade.outcome === "fail" || (grade.scale === "five" && grade.value === 2) ? "warning" : "neutral";
          return { title: item.title, label: grade.label, resultText, tone, href: `/study/${item.id}` } as const;
        });
      }));
      await currentActor(actor);
      const items = groups.flat();
      return json(parseAssistantResponse({ kind: items.length ? "answer" : "empty", category: "quick", cards: [],
        context: gradeContext, processing,
        text: items.length ? (name ? "Оценки по дисциплине" : matches.length > 8 ? "Оценки по первым восьми дисциплинам" : "Оценки за текущий семестр")
          : "Опубликованных оценок пока нет.",
        widgets: items.length ? [{ type: "grades", items, allGradesHref: "/study" }]
          : [action("Открыть успеваемость", "/study")] }));
    }
    if (directRequest || personalIntent?.kind === "personal_requests") {
      const current = await currentActor(actor);
      const number = directRequest?.[1]?.toUpperCase() ?? question.match(/(?<![\p{L}\p{N}])[А-Я]{2}-\d{4}-\d{4,19}(?![\p{L}\p{N}-])/iu)?.[0].toUpperCase();
      const found = number ? await byPublicNumber(current, number) : null;
      const items = number ? (found ? [found] : []) : (await listRequests(current, "all")).items.slice(0, 5);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: items.length ? "answer" : "empty", category: "quick", cards: [],
        text: items.length ? (number ? "Статус заявки" : "Последние заявки")
          : number ? "Заявка с таким номером не найдена." : "Заявок пока нет.",
        widgets: items.length ? [{ type: "actions", items: items.map(item => ({
          label: `${kindLabel[item.kind]} · ${item.publicNo}`, description: statusLabel[item.status], href: `/requests/${item.id}`,
        })) }] : [action("Перейти к заявкам", "/requests")] }));
    }
    if (directAttendance || personalIntent?.kind === "personal_attendance") {
      const current = await currentActor(actor);
      const records = await sportsAttendance(current, visibilityNow());
      await currentActor(actor);
      const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "medium" });
      return json(parseAssistantResponse({ kind: records.length ? "answer" : "empty", category: "quick", cards: [],
        text: records.length ? ["Последние отметки по физкультуре", "", ...records.map((record) =>
          `- ${date.format(new Date(record.startsAt))} · ${record.title} · **${record.attended ? "Присутствовал" : "Отсутствовал"}**`)].join("\n")
          : "Отметок о посещении физкультуры пока нет.",
        widgets: [action("Открыть физкультуру", "/sports")] }));
    }
    const passportMention = /паспорт\p{L}* здоров\p{L}*/u.test(normalized);
    const passportRenewal = /продл|продлен|обнов|переоформ/u.test(repaired);
    const passportFollowUp = context?.subject === "health_passport" &&
      /^(?:а )?(?:как|где|когда|можно ли) (?:его |паспорт )?(?:продлить|обновить|переоформить)[?!.]*$/u.test(repaired);
    if (!context?.subject && /^(?:а )?(?:как|где|когда|можно ли) его (?:продлить|обновить|переоформить)[?!.]*$/u.test(repaired)) {
      return json(parseAssistantResponse({ kind: "clarify", cards: [], text: "Уточните, что именно вы хотите продлить." }));
    }
    if ((passportMention && passportRenewal) || passportFollowUp) {
      await currentActor(actor);
      const cards = (await searchDocumentFiles("продление паспорта здоровья", today))
        .filter(({ title, text }) => /паспорт\p{L}* здоров\p{L}*/u.test(normalizeQuestion(title + " " + text)) &&
          /продл|продлен|обнов|переоформ/u.test(normalizeQuestion(text))).slice(0, 4);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: cards.length ? "answer" : "empty", cards, processing: "catalog",
        context: { topics: [], subject: "health_passport" },
        widgets: [action("Открыть поликлинику", "/prototype#clinic")],
        text: cards.length ? "Найденные сведения о продлении паспорта здоровья" : "Для продления обратитесь в медицинский кабинет. В опубликованных документах нет подтверждённого порядка продления паспорта здоровья.",
      }));
    }
    if (context?.subject === "health_passport" && /^(?:а )?(?:как|где|когда|можно ли) его [\p{L}]+[?!.]*$/u.test(normalized)) {
      return json(parseAssistantResponse({ kind: "clarify", cards: [], context,
        text: "Уточните, что вы хотите узнать о паспорте здоровья." }));
    }
    const otherPerson = /другого|другой студент|чуж|одногруппник/u.test(normalized);
    if (!otherPerson && /медицинск\p{L}* групп/u.test(normalized) && /моя|мой|у меня|какая|какую|узнать|посмотреть/u.test(normalized)) {
      const current = await currentActor(actor);
      const passport = await healthPassport(current);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: passport?.medicalGroup ? "answer" : "empty", category: "quick", cards: [], processing: "catalog",
        context: { topics: [], subject: "health_passport" },
        text: passport?.medicalGroup ? `Медицинская группа: ${passport.medicalGroup}.` : "Медицинская группа не указана.",
        widgets: [action("Открыть физкультуру", "/sports")] }));
    }
    if (!otherPerson && /допуск/u.test(normalized) && /физкультур|спорт/u.test(normalized) && /мои|мой|у меня|есть ли|действует ли|допущен/u.test(normalized) && !/когда|срок|до какого|истека|продл/u.test(normalized)) {
      const current = await currentActor(actor);
      const passport = await healthPassport(current);
      await currentActor(actor);
      const status = !passport ? "Сведения о медицинском допуске не опубликованы."
        : !passport.admitted ? "Медицинский допуск не подтверждён."
        : passport.validUntil < today ? "Срок медицинского допуска истёк."
        : "Медицинский допуск подтверждён.";
      return json(parseAssistantResponse({ kind: passport ? "answer" : "empty", category: "quick", cards: [], processing: "catalog",
        context: { topics: [], subject: "health_passport" }, text: status,
        widgets: [action("Открыть физкультуру", "/sports")] }));
    }
    const expiryQuestion = /когда|срок|действ|заканч|истека|до какого/u.test(normalized);
    const passportExpiry = passportMention && expiryQuestion;
    if (/^вернемся к первому вопросу[?!.]*$/u.test(normalized)) {
      return json(parseAssistantResponse({ kind: "clarify", text: "Напишите вопрос, к которому хотите вернуться.", cards: [], context }));
    }
    const disciplineDeadlines = /^дедлайн(?:ы|и|с)? по (.+?)[?!.]*$/u.exec(normalized);
    const allDeadlines = /^(?:дедл(?:ай|а)ны общие|общие дедл(?:ай|а)ны|все дедл(?:ай|а)ны)[?!.]*$/u.test(normalized);
    const more = /^(?:а )?(?:еще (?:какие(?: есть)?|что есть)|какие еще есть|что еще есть)[?!.]*$/u.test(normalized);
    const moreDeadlines = /^(?:а )?(?:какие (?:еще )?(?:у меня |мои )?дедл(?:ай|а)ны(?: еще| есть)?|(?:покажи|перечисли) (?:мои |остальные |все )?дедл(?:ай|а)ны)[?!.]*$/u.test(normalized);
    if (more && !context?.deadlines && !context?.schedule && !context?.topics.length && !context?.subject) {
      return json(parseAssistantResponse({ kind: "clarify", cards: [], text: "Уточните, что ещё показать." }));
    }
    async function deadlineList(discipline?: string, excludeId?: string, processing: "catalog" | "qwen" = "catalog", onlyNearest = false) {
      const current = await currentActor(actor);
      const now = visibilityNow();
      const seenIds = onlyNearest && excludeId ? [...new Set([...(context?.deadlines?.seenIds ?? []), excludeId])] : [];
      const deadlines = await assistantDeadlines(current, now, discipline, onlyNearest ? seenIds : excludeId ? [excludeId] : []);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: deadlines.length ? "answer" : "empty", category: "quick", cards: [],
        processing, context: { topics: [], deadlines: { excludeId: onlyNearest ? deadlines[0]?.id ?? excludeId : excludeId, seenIds: onlyNearest ? [...seenIds, ...(deadlines[0] ? [deadlines[0].id] : [])].slice(-30) : undefined } },
        text: deadlines.length ? (onlyNearest ? "Следующий дедлайн" : discipline ? "Дедлайны по дисциплине" : "Обязательные дедлайны")
          : excludeId ? "Других незавершённых обязательных дедлайнов нет." : "Подходящих незавершённых обязательных дедлайнов нет. Для поиска по предмету укажите его название из учебного плана.",
        widgets: deadlines.length ? deadlines.slice(0, onlyNearest ? 1 : 5).map(deadlineWidget) : [action("Открыть дедлайны", "/prototype#deadlines")],
      }));
    }
    if (disciplineDeadlines || allDeadlines || moreDeadlines || (more && context?.deadlines)) {
      const excludeId = more || (moreDeadlines && /(?:еще|остальные)/u.test(normalized))
        ? context?.deadlines?.excludeId : undefined;
      return deadlineList(disciplineDeadlines?.[1].trim(), excludeId);
    }
    const increasedGrant = /повышенн\p{L}*(?: (?:государственн|академическ)\p{L}*)* стипенди/u;
    const increasedFollowUp = context?.topics.includes("scholarship_rules") &&
      /^(?:а )?(?:(?:как получить|как оформить) )?повышенную[?!.]*$/u.test(normalized);
    if (increasedGrant.test(normalized) || increasedFollowUp) {
      await currentActor(actor);
      const cards = (await searchDocumentFiles("повышенная академическая стипендия", today))
        .filter(({ title, text }) => increasedGrant.test(normalizeQuestion(title + " " + text))).slice(0, 4);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: cards.length ? "answer" : "empty", cards, processing: "catalog",
        text: cards.length ? "По документам о повышенной стипендии" : "В опубликованных документах нет подтверждённых сведений о повышенной стипендии.",
      }));
    }
    async function nearestDeadline(processing: "catalog" | "qwen" = "catalog") {
      const current = await currentActor(actor);
      const now = visibilityNow();
      const deadline = await deadlineToday(current, now);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: deadline ? "answer" : "empty", category: "quick", cards: [],
        processing, context: { topics: [], deadlines: { excludeId: deadline?.id } },
        text: deadline ? "Ближайший дедлайн" : "Ближайших дедлайнов нет.",
        widgets: deadline ? [deadlineWidget(deadline)] : [action("Открыть дедлайны", "/prototype#deadlines")] }));
    }
    const nextItem = /^(?:а )?(?:следующ(?:ий|ая|ее)(?: какой| какая)?|что (?:дальше|потом|после этого)|после этого|дальше что|потом какой)[?!.]*$/u.test(repaired);
    if (nextItem && context?.deadlines) {
      if (!context.deadlines.excludeId) {
        return json(parseAssistantResponse({ kind: "clarify", category: "quick", cards: [], context,
          text: "После какого дедлайна показать следующий? Можно спросить о ближайшем." }));
      }
      return deadlineList(undefined, context.deadlines.excludeId, "catalog", true);
    }
    if (nextItem && !context?.schedule) {
      return json(parseAssistantResponse({ kind: "clarify", cards: [], context, text: "Уточните, что показать следующим." }));
    }
    const nearestTask = /^(?:(?:какой|какая|когда|покажи) )?(?:(?:мой )?(?:ближайший|следующий) дедлайн|(?:ближайший|следующий) мой дедлайн|(?:ближайшая|следующая) (?:учебная )?задача|(?:ближайшую|следующую) (?:учебную )?задачу)[?!.]*$/u;
    if (nearestTask.test(repaired) || /^(?:когда|какой) дедлайн (?:ближайший|следующий)[?!.]*$/u.test(repaired)) return nearestDeadline();
    const scholarshipDefinition = /(?<!\p{L})(?:стипенди|стипух)/u.test(normalized) &&
      /(?<!\p{L})(?:что\s+(?:это\s+)?такое|что\s+(?:означает|значит)|определени|это\s+(?:вообще\s+)?что|что\s+за)/u.test(normalized);
    const missingScholarship = /(?<!\p{L})(?:стипенди|стипух)/u.test(normalized) &&
      /(?<!\p{L})(?:почему|причин|из-за\s+чего)/u.test(normalized) &&
      /(?<!\p{L})(?:не\s+(?:приход|приш|поступ|перечисл|выплат|получ)|задерж|нет)/u.test(normalized);
    const ambiguousPayment = /(?<!\p{L})(?:выплат|перечислен)/u.test(normalized) && !/(?<!\p{L})(?:стипенди|стипух)/u.test(normalized);
    const paymentFollowUp = /^(?:а )?(?:когда (?:выплата|перечисление|(?:я )?получу деньги(?: от университета)?)|когда (?:выплатят|перечислят)(?: деньги)?)[?!.]*$/u.test(normalized.trim());
    const hasPaymentContext = context?.topics.length === 1 && context.topics[0] === "scholarship_payment";
    const paymentContinuation = paymentFollowUp && hasPaymentContext;
    if (/^(?:а )?при чем (?:тут|здесь)(?:\s|[?!.,]|$)/u.test(normalized)) {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "clarify", cards: [], context,
        text: hasPaymentContext ? "К вопросу о выплате каникулы не относятся. Мы говорили о дате выплаты академической стипендии."
          : "Похоже, предыдущий ответ ушёл в сторону. Уточните, что вы хотели узнать.",
      }));
    }
    const shortPaymentQuestion = /^(?:когда стипендия|стипендия когда)[?!.]*$/u.test(repaired.trim());
    const local = classifyFromWords(repaired);
    const followUp = isPeriodFollowUp(normalized, today);
    const scholarship = /(?<!\p{L})(?:стипенди|стипух)/u.test(repaired);
    const multiTopic = local?.kind === "topics" && local.topics.some((topic) => topic === "session" || topic === "holidays");
    // Consultation and milestone-control questions belong to the general catalog.
    // The student's ordinary lesson schedule cannot establish these event dates.
    const consultationReschedule = /встреч\p{L}*.{0,60}разбор\p{L}*.{0,40}вопрос/u.test(repaired) &&
      /друг\p{L}*\s+время|перенести/u.test(repaired);
    const certificateDownload = context?.subject === "study_certificate" &&
      /^(?:а )?где (?:ее )?(?:потом )?(?:можно )?(?:скачать|получить|забрать)(?: ее)?[?!.]*$/u.test(repaired);
    const debtDocumentDate = /(?<![\p{L}\p{N}])уч[\s‑–—-]*04(?!\d)/u.test(normalized) &&
      /индивидуальн\p{L}*.{0,30}дат\p{L}*|дат\p{L}*.{0,30}индивидуальн/u.test(normalized) && /пересдач/u.test(normalized);
    if (debtDocumentDate) {
      const cards = (await searchDocumentFiles("академическая задолженность пересдача индивидуальная дата", today))
        .filter(({ link, text }) => belongsToDocument(link.href, "academic-debt") &&
          /общий документ не устанавливает индивидуальную дату[.!]/iu.test(text)).slice(0, 1);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: cards.length ? "answer" : "empty", cards, processing: "catalog",
        text: cards.length ? "В опубликованном пункте УЧ-04 указано: общий документ не устанавливает индивидуальную дату пересдачи."
          : "В опубликованных документах не найдены подтверждённые сведения об индивидуальной дате пересдачи." }));
    }
    const libraryRenewal = /кни[гж]|издани|учебник|абонемент/u.test(repaired) && /держать|дольше/u.test(repaired);
    const documentLookup = catalogIntent
      ? { key: catalogIntent.keys[0], query: catalogIntent.query }
      : libraryRenewal
        ? { key: "library-service-rules", query: "срок продление учебного издания" }
      : generalAttendance
      ? { key: "attendance-rules", query: "пропуск болезнь автоматически ноль уважительная причина" }
      : retakeAttempts
        ? { key: "academic-debt", query: "повторная аттестация не более двух раз попытки" }
      : certificateDownload
      ? { key: "study-certificates", query: "получение готовой справки PDF карточка заявки" }
      : certificateQuestion
        ? { key: "study-certificates", query: "справка об обучении подача подготовка получение" }
      : consultationReschedule
        ? { key: "consultation-rescheduling", query: "перенос консультации заявка причина варианты времени" }
        : undefined;
    const catalogEventOnly = Boolean(catalogIntent) || generalRules || consultationReschedule || /консультац|рубежн.{0,20}контрол|контрол.{0,20}рубежн|практик|выпускн.{0,12}работ|вкр/u.test(normalized);
    const schedule = catalogEventOnly ? undefined : localSchedule(repaired, today, context?.schedule);
    const lessonRequest = repaired.replace(/^вместо (?:расписани[ея]|пар|заняти[йя])(?!\p{L})/u, "");
    const lessonMention = /расписан|(?<!\p{L})(?:пар(?:а|ы|у|е|ой)?|заняти\p{L}*|аудитори\p{L}*|преподавател\p{L}*)(?!\p{L})/u.test(lessonRequest);
    const changeQuestion = /^что (?:отменили|перенесли|заменили)(?!\p{L})/u.test(normalized);
    const exam = /(?<!\p{L})экзамен/u.test(normalized);
    const deadlineMention = /(?<!\p{L})(?:дедлайн|задач|задани|сдава|сдать|успеть|срок)/u.test(repaired);
    const otherRequest = exam || deadlineMention || scholarship || multiTopic || /(?<!\p{L})(?:льгот|правил|документ|положени)/u.test(normalized);
    const libraryQuestion = /^(?:как|можно ли) (?:продлить (?:библиотечный абонемент|книгу|срок возврата книги)|вернуть книгу)[?!.]*$/u.test(normalized);
    const searchLibrary = async () => (await searchDocumentFiles(question, today))
      .filter(({ title }) => /библиоте[кч]|абонемент/u.test(normalizeQuestion(title)));
    const libraryMatches = libraryQuestion ? await searchLibrary() : [];
    const librarySources = libraryMatches.length > 0;
    const shouldClassify = !documentLookup && !shortPaymentQuestion && !paymentContinuation && !personalTried && !librarySources && !schedule && (!catalogEventOnly || lessonMention) &&
      (lessonMention || exam || deadlineMention || !followUp && (!local || (scholarship && !multiTopic && local.kind !== "unsupported")));
    const modelClassification = personalIntent ?? (model && modelSignal && shouldClassify
      ? await runModelStep((signal) => classifyWithModel(question, model.classify, signal, today), modelSignal)
      : undefined);
    const modelPassportExpiry = modelClassification?.kind === "health_passport" && expiryQuestion &&
      /паспорт|здоров|медицин|допуск/u.test(normalized);
    if (passportExpiry || modelPassportExpiry) {
      const current = await currentActor(actor);
      const passport = await healthPassport(current);
      await currentActor(actor);
      const date = passport && new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", dateStyle: "long" })
        .format(new Date(passport.validUntil + "T12:00:00Z"));
      return json(parseAssistantResponse({ kind: passport ? "answer" : "empty", category: "quick", cards: [],
        processing: modelClassification?.kind === "health_passport" ? "qwen" : "catalog",
        context: { topics: [], subject: "health_passport" },
        text: date ? "Паспорт здоровья действует до " + date : "Срок действия паспорта здоровья не указан.",
        widgets: [action("Открыть поликлинику", "/prototype#clinic")],
      }));
    }
    let usedModel = Boolean(modelClassification);
    if (/(?<!\p{L})(?:перенеси|отмени)(?!\p{L})|измени.*расписан|запиши.*пар/u.test(normalized)) {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "unsupported", text: "Помощник может читать расписание и его изменения. Для изменения занятия обратитесь в деканат.", cards: [] }));
    }
    if (!context?.schedule && /^что у меня (?:сегодня|завтра|послезавтра)[?!.]*$/u.test(repaired)) {
      return json(parseAssistantResponse({ kind: "clarify", cards: [], text: "Уточните, показать расписание занятий или учебные дедлайны?" }));
    }
    const fallbackNearest = /^(?:нет,? )?(?:какой дедлайн нужно сделать мне|какую из учебных работ надо сдать раньше остальных|что у меня горит по учебе,? с чего начать|подскажи,? за какую работу мне браться в первую очередь по срокам)[?!.]*$/u.test(repaired);
    if (fallbackNearest && (!modelClassification || modelClassification.kind === "clarify" || modelClassification.kind === "unsupported")) return nearestDeadline();
    const conflictingSchedule = modelClassification?.kind === "schedule" &&
      (otherRequest || (!lessonMention && !changeQuestion && !schedule));
    if (modelClassification?.kind === "deadlines" && !lessonMention && !scholarship && !exam && !catalogEventOnly &&
        !/льгот|заяв|подач|стипен|правил|документ/u.test(normalized)) {
      const { mode, discipline } = modelClassification;
      const filter = discipline ? normalizeQuestion(discipline) : undefined;
      if (mode === "nearest" && !filter) return nearestDeadline("qwen");
      return deadlineList(filter, mode === "more" ? context?.deadlines?.excludeId : undefined, "qwen", mode === "nearest");
    }
    const unresolvedQuickRequest = (lessonMention || changeQuestion || exam || deadlineMention) &&
      (!modelClassification || modelClassification.kind === "unsupported") && (!local || lessonMention);
    if (!schedule && !catalogEventOnly && (conflictingSchedule || unresolvedQuickRequest)) {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "clarify", cards: [],
        text: exam
          ? "Уточните, нужен общий период сессии или дата конкретного экзамена. Даты экзаменов доступны в разделе «Учёба»."
          : "Уточните, какое событие, срок или правило вас интересует." }));
    }
    const scheduleQuery = catalogEventOnly ? undefined : modelClassification?.kind === "schedule" ? modelClassification : schedule;
    if (scheduleQuery && /(?<!\p{L})послезавтра(?!\p{L})/u.test(repaired)
        && questionScope(repaired, today).dates.length === 1
        && !/\d/u.test(repaired)) {
      scheduleQuery.date = addDays(today, 2);
    }
    // Explicit status in the question is authoritative even if the model returns a broader mode.
    if (scheduleQuery) {
      if (/отмен/u.test(normalized)) scheduleQuery.mode = "cancelled";
      else if (/перен[ое]с/u.test(normalized)) scheduleQuery.mode = "moved";
      else if (/замен/u.test(normalized)) scheduleQuery.mode = "replaced";
    }
    if (scheduleQuery) {
      const current = await currentActor(actor);
      const answer = await answerSchedule(current, scheduleQuery, visibilityNow(), modelClassification?.kind === "schedule" ? "qwen" : "catalog");
      await currentActor(actor);
      return json(parseAssistantResponse(answer));
    }
    const localComposite = (scholarshipDefinition || missingScholarship) && /(?<!\p{L})(?:когда|через\s+сколько|дата|график)/u.test(normalized);
    if (modelClassification?.kind === "multiple" || localComposite) {
      await currentActor(actor);
      const topics = new Set(modelClassification?.kind === "multiple" ? modelClassification.topics : []);
      const missing = new Set(modelClassification?.kind === "multiple" ? modelClassification.missing : []);
      if (scholarshipDefinition) topics.add("scholarship_definition");
      if (missingScholarship) missing.add("scholarship_missing");
      if (localComposite) topics.add("scholarship_payment");
      if (ambiguousPayment) topics.delete("scholarship_payment");
      const scope = questionScope(normalized, today);
      const results = await getPublishedTopicCards([...topics], scope, today);
      await currentActor(actor);
      const cards = results.flat();
      const messages: string[] = [];
      if (missing.has("scholarship_definition") && !scholarshipDefinition) messages.push("В опубликованных документах нет определения стипендии.");
      if (missing.has("scholarship_missing")) messages.push("Я не вижу личный статус выплаты и не могу определить причину. Обратитесь в деканат.");
      if (missing.has("clarify") || ambiguousPayment) messages.push("Уточните, о какой выплате или теме идёт речь.");
      if (results.some((result) => !result.length)) messages.push("По части вопроса в опубликованных документах нет сведений за указанный период.");
      return json(parseAssistantResponse({ kind: cards.length ? "answer" : "empty", cards,
        text: [conciseDocumentAnswer(cards), ...messages].filter(Boolean).join("\n\n") || "В опубликованных документах нет сведений.", concise: cards.length > 0, processing: usedModel ? "qwen" : "catalog",
        context: topics.size ? { topics: [...topics] } : undefined }));
    }
    if (scholarshipDefinition || modelClassification?.kind === "scholarship_definition") {
      await currentActor(actor);
      const [cards] = await getPublishedTopicCards(["scholarship_definition"], questionScope(normalized, today), today);
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: cards.length ? "answer" : "empty", cards, processing: usedModel ? "qwen" : "catalog",
        context: { topics: ["scholarship_definition"] },
        concise: cards.length > 0, text: cards.length ? conciseDocumentAnswer(cards) : "В опубликованных документах нет определения стипендии. Можно спросить об условиях назначения или дате выплаты.",
      }));
    }
    if (missingScholarship || modelClassification?.kind === "scholarship_missing") {
      await currentActor(actor);
      return json(parseAssistantResponse({ kind: "unsupported", cards: [], processing: usedModel ? "qwen" : "catalog",
        text: "Я не вижу личный статус выплаты и не могу определить причину. Обратитесь в деканат, чтобы уточнить её.",
      }));
    }
    const classification = documentLookup ? { kind: "search" as const, keywords: [documentLookup.query] }
      : shortPaymentQuestion || paymentContinuation
      ? { kind: "topics" as const, topics: ["scholarship_payment" as const] }
      : paymentFollowUp
        ? { kind: "clarify" as const }
        : !local && followUp && context?.topics.length === 1
      ? { kind: "topics" as const, topics: context.topics }
      : !local && followUp
        ? { kind: "clarify" as const }
        : (ambiguousPayment && modelClassification?.kind === "topics" && modelClassification.topics.includes("scholarship_payment")
          ? { kind: "clarify" as const } : modelClassification) ?? (ambiguousPayment
          ? { kind: "clarify" as const } : local ?? { kind: "unsupported" as const });
    await currentActor(actor);
    if (classification.kind !== "topics") {
      if (classification.kind !== "clarify") {
        const query = classification.kind === "search" ? classification.keywords.join(" ") : question;
        const canonicalQuestion = catalogIntent ? repaired
          : classification.kind === "search" && catalogTopic(query) ? query : repaired;
        const search = async () => {
          if (documentLookup) return (await searchDocumentFiles(query, today))
            .filter(({ link }) => (catalogIntent?.keys ?? [documentLookup.key]).some((key) => belongsToDocument(link.href, key)));
          if (librarySources) return searchLibrary();
          const matches = await searchDocumentFiles(query, today);
          return !matches.length && query !== question ? searchDocumentFiles(question, today) : matches;
        };
        const candidates = librarySources ? libraryMatches : await search();
        const catalog = await catalogAnswer(canonicalQuestion, candidates, (id) => getImportedDocument(id, today));
        if (catalog) {
          await currentActor(actor);
          return json(parseAssistantResponse({ kind: "answer", concise: true, processing: canonicalQuestion !== repaired ? "qwen" : "catalog", ...catalog }));
        }
        let cards = candidates.slice(0, 4);
        let summary: string | undefined;
        const reviewed = reviewedDocumentAnswer(repaired, candidates);
        if (reviewed) {
          const current = await search();
          const confirmed = reviewedDocumentAnswer(repaired, current);
          if (confirmed) {
            summary = confirmed.summary;
            cards = confirmed.cards;
          }
        }
        if (!summary && model && !catalogEventOnly && modelSignal && !modelSignal.aborted && (!(shouldClassify || personalTried) || modelClassification) && candidates.length) {
          const selection = await runModelStep((signal) => selectSourcesWithModel(reviewed?.query ?? question, candidates, model.selectSources, signal), modelSignal);
          // An editor can withdraw or replace a source while the model is working.
          const current = await search();
          const sameCandidates = current.length === candidates.length &&
            current.every((card, index) => {
              const previous = candidates[index];
              return card.link.href === previous.link.href && card.link.label === previous.link.label &&
                card.title === previous.title && card.text === previous.text;
            });
          cards = selection?.length && sameCandidates ? selection : current.slice(0, 4);
          if (selection?.length && sameCandidates) {
            usedModel = true;
            summary = reviewed?.confirm(selection);
            if (!summary && !reviewed && selection.length === 1) {
              const body = selection[0].text.split("Учебный материал. При расхождении")[0];
              const paragraphs = body.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
              const last = paragraphs.at(-1)?.replace(/\s+/gu, " ");
              // Keep the whole paragraph, including its conditions and exceptions.
              if (paragraphs.length === 1 && last && last.length <= 500 && /[.!?]$/u.test(last) && !/^\d+[.\s]/u.test(last)) {
                summary = last;
              }
            }
            if (reviewed && !summary) cards = current.slice(0, 4);
          }
        }
        await currentActor(actor);
        if (cards.length) {
          const certificate = (certificateDownload || certificateQuestion) && cards.some(({ link }) => belongsToDocument(link.href, "study-certificates"));
          const certificateForm = certificate && cards[0].link.href.endsWith("#section-1") && Boolean(summary);
          return json(parseAssistantResponse({ kind: "answer", text: summary
            ? (certificateForm ? summary : summary + "\n\nПроверьте, отвечает ли этот пункт на весь вопрос. Общие правила не подтверждают индивидуальное право.")
            : "Найденные фрагменты документов. Полный ответ по ним не подтверждён.",
            context: certificate ? { topics: [], subject: "study_certificate" } : undefined,
            widgets: certificate ? [certificateForm
              ? action("Заказать справку", "/requests/new?kind=study_certificate")
              : action("Перейти к заявкам", "/requests")] : undefined,
            concise: summary ? true : undefined, cards, processing: usedModel ? "qwen" : "catalog" }));
        }
      }
      const text = classification.kind === "clarify"
        ? (paymentFollowUp || ambiguousPayment ? "О какой выплате вы спрашиваете? Например, об академической стипендии." : "Уточните, пожалуйста, что именно вы хотите узнать.")
        : "По этому вопросу в каталоге нет подходящего документа. Можно спросить о выплате и назначении академической стипендии, датах сессии или каникул.";
      const kind = classification.kind === "clarify" ? "clarify" : "unsupported";
      return json(parseAssistantResponse({ kind, text, cards: [], context: kind === "clarify" ? context : undefined, processing: usedModel ? "qwen" : "catalog" }));
    }
    const scope = questionScope(normalized, today);
    const results = await getPublishedTopicCards([...new Set(classification.topics)], scope, today);
    await currentActor(actor);
    const cards = results.flat();
    if (!cards.length) return json(parseAssistantResponse({
      kind: "empty", text: "В опубликованных документах нет сведений по этому вопросу за указанный период.", cards, context: { topics: classification.topics }, processing: usedModel ? "qwen" : "catalog",
    }));
    return json(parseAssistantResponse({
      kind: "answer", concise: true, text: conciseDocumentAnswer(cards) + (results.some((result) => !result.length)
        ? "\n\nПо части вопроса в опубликованных документах нет сведений за указанный период."
        : ""),
      cards, context: { topics: classification.topics }, processing: usedModel ? "qwen" : "catalog",
    }));
  });
}

export function getAssistantDocument(request: Request, id: string) {
  return handle(async () => {
    await requireActor();
    if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
    const today = dateInMoscow(visibilityNow());
    const document = await getImportedDocument(id, today);
    if (!document) throw new HttpError(404, "NOT_FOUND");
    return json(assistantDocument.parse(document));
  });
}

export function openAssistantSource(request: Request, id: string) {
  return handle(async () => {
    await requireActor();
    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    if (!section || !/^[1-9]\d*$/u.test(section) || [...url.searchParams.keys()].length !== 1) throw new HttpError(422, "INVALID_FIELDS");
    const today = dateInMoscow(visibilityNow());
    const document = await getImportedDocument(id, today);
    if (!document?.sections.some((part) => part.id === section)) throw new HttpError(404, "NOT_FOUND");
    const page = await getSourcePdfPage(id, section, today);
    const destination = page && document.pdfHref ? `${document.pdfHref}#page=${page}` : `/today/assistant/documents/${id}#section-${section}`;
    return new NextResponse(null, { status: 307, headers: {
      Location: destination,
      "Cache-Control": "no-store, private",
    } });
  });
}

export function getAssistantPdf(request: Request, id: string) {
  return handle(async () => {
    await requireActor();
    if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
    const path = await getPublishedPdfPath(id, dateInMoscow(visibilityNow()));
    if (!path) throw new HttpError(404, "NOT_FOUND");
    const file = await open(path, "r");
    try {
      const { size } = await file.stat();
      // Node and DOM declarations differ for the same Web Streams API.
      const stream = file.readableWebStream({ autoClose: true }) as unknown as ReadableStream<Uint8Array>;
      return new NextResponse(stream, { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Content-Length": String(size),
        "Cache-Control": "no-store, private",
      } });
    } catch (error) {
      await file.close();
      throw error;
    }
  });
}
