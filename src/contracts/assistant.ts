import { z } from "zod";
import { documentPdfPath } from "./assistant-files";

export const assistantQuestionLimit = 500;
export const assistantTopic = z.enum(["scholarship_payment", "scholarship_rules", "scholarship_definition", "session", "holidays"]);
export const scheduleIntent = z.strictObject({
  kind: z.literal("schedule"), date: z.iso.date(), view: z.enum(["day", "week"]),
  mode: z.enum(["list", "nearest", "changes", "cancelled", "moved", "replaced"]), filter: z.string().trim().max(100),
});
export const assistantContext = z.strictObject({ topics: assistantTopic.array().max(4), schedule: scheduleIntent.optional(), deadlines: z.strictObject({ excludeId: z.uuid().optional(), seenIds: z.uuid().array().max(30).optional() }).optional(), subject: z.enum(["health_passport", "grades", "study_certificate"]).optional() });
export const assistantRequest = z.strictObject({
  question: z.string().trim().min(1).max(assistantQuestionLimit),
  context: assistantContext.optional(),
});
export const assistantClassification = z.discriminatedUnion("kind", [
  scheduleIntent,
  z.strictObject({ kind: z.literal("deadlines"), mode: z.enum(["nearest", "list", "more"]), discipline: z.string().trim().min(1).max(100).nullable() }),
  z.strictObject({ kind: z.literal("multiple"), topics: assistantTopic.array().max(4), missing: z.array(z.enum(["scholarship_definition", "scholarship_missing", "clarify"])).max(3) }).refine((value) => value.topics.length + value.missing.length > 0),
  z.strictObject({ kind: z.literal("topics"), topics: assistantTopic.array().min(1).max(4) }),
  z.strictObject({ kind: z.literal("search"), keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(8) }),
  z.strictObject({ kind: z.enum(["scholarship_definition", "scholarship_missing"]) }),
  z.strictObject({ kind: z.enum(["clarify", "unsupported"]) }),
  z.strictObject({ kind: z.literal("health_passport") }),
  z.strictObject({ kind: z.literal("personal_grades"), discipline: z.string().trim().min(1).max(100).nullable() }),
  z.strictObject({ kind: z.literal("personal_requests"), publicNo: z.string().regex(/^[А-Я]{2}-\d{4}-\d{4,19}$/u).nullable() }),
  z.strictObject({ kind: z.literal("personal_attendance") }),
]);
export const assistantSourceSelection = z.strictObject({
  references: z.array(z.number().int().positive()).max(4).refine((items) => new Set(items).size === items.length),
});

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const assistantDocument = z.strictObject({
  id: slug,
  title: z.string(),
  number: z.string(),
  issuedOn: z.iso.date(),
  pdfHref: z.string().regex(documentPdfPath).optional(),
  sections: z.array(z.strictObject({ id: slug, title: z.string(), text: z.string() })).min(1),
});

const uuidPath = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const lessonHref = z.string().regex(new RegExp(`^/schedule/${uuidPath}$`, "u"));
const disciplineHref = z.string().regex(new RegExp(`^/study/${uuidPath}$`, "u"));
const deadlineHref = z.string().regex(new RegExp(`^/(?:assignments|study|requests)/${uuidPath}$`, "u"));
const actionHref = z.union([
  z.enum(["/schedule", "/study", "/sports", "/requests", "/requests/new?kind=study_certificate",
    "/prototype#deadlines", "/prototype#services", "/prototype#library", "/prototype#clinic", "/prototype#vuc"]),
  z.string().regex(new RegExp(`^(?:/requests/|/prototype#library/)${uuidPath}$`, "u")),
]);

export const assistantWidget = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("lesson"), id: z.uuid(), dateLabel: z.string(), timeRange: z.string(),
    title: z.string(), room: z.string(), teacher: z.string().optional(), status: z.string().optional(),
    href: lessonHref,
  }),
  z.strictObject({
    type: z.literal("deadline"), id: z.uuid(), title: z.string(), dueLabel: z.string(),
    isOverdue: z.boolean(), required: z.boolean().optional(), href: deadlineHref,
  }),
  z.strictObject({
    type: z.literal("grades"), items: z.array(z.strictObject({
      title: z.string(), label: z.string(), resultText: z.string(),
      tone: z.enum(["success", "warning", "neutral"]), href: disciplineHref.optional(),
    })).min(1), allGradesHref: z.literal("/study"),
  }),
  z.strictObject({
    type: z.literal("actions"), items: z.array(z.strictObject({
      label: z.string(), description: z.string().optional(), href: actionHref,
    })).min(1),
  }),
]);

export type AssistantWidget = z.infer<typeof assistantWidget>;

export const assistantResponse = z.strictObject({
  kind: z.enum(["answer", "empty", "clarify", "unsupported"]),
  category: z.enum(["quick", "document"]).default("document"),
  processing: z.enum(["qwen", "catalog"]).optional(),
  text: z.string(),
  widgets: assistantWidget.array().optional(),
  concise: z.boolean().optional(),
  context: assistantContext.optional(),
  cards: z.array(z.strictObject({
    title: z.string(), text: z.string(),
    link: z.strictObject({
      label: z.string(),
      href: z.string().regex(/^(?:\/today\/assistant\/documents\/[a-z0-9-]+#section-[a-z0-9-]+)$/u),
    }),
  })),
});

export type AssistantTopic = z.infer<typeof assistantTopic>;
export type AssistantClassification = z.infer<typeof assistantClassification>;
export type AssistantDocument = z.infer<typeof assistantDocument>;
export type AssistantResponse = z.infer<typeof assistantResponse>;
