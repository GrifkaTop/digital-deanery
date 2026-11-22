import { assessments, examKinds, gradeKinds, gradeOutcomes, gradeScales, lessonKinds, lessonStatuses } from "../../contracts/academics";
import { notificationKinds } from "../../contracts/inbox";
import { requestActions, requestActors, requestKinds, requestStatuses } from "../../contracts/requests";
import { sql } from "drizzle-orm";
import { customType, date, foreignKey, index, jsonb, pgSequence, numeric, unique, uniqueIndex, pgEnum, integer, primaryKey, pgTable, uuid, text, boolean, timestamp, check, smallint } from "drizzle-orm/pg-core";
export const accounts = pgTable("accounts", {
 id: uuid().defaultRandom().primaryKey(), login: text().notNull().unique(), passwordHash: text("password_hash").notNull(), isActive: boolean("is_active").notNull().default(true), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(), changesInitializedAt: timestamp("changes_initialized_at",{withTimezone:true}),
}, t => [check("login_normalized", sql`${t.login} = lower(btrim(${t.login})) AND length(${t.login}) > 0`)]);
export const groups = pgTable("groups", {id:uuid().defaultRandom().primaryKey(),code:text().notNull().unique(),faculty:text().notNull(),program:text().notNull(),course:smallint().notNull(),educationLevel:text("education_level"),studyMode:text("study_mode")}, t=>[check("course_range",sql`${t.course} between 1 and 4`)]);
export const students = pgTable("students", {id:uuid().defaultRandom().primaryKey(),accountId:uuid("account_id").notNull().unique().references(()=>accounts.id),groupId:uuid("group_id").notNull().references(()=>groups.id),fullName:text("full_name").notNull(),studentNumber:text("student_number").unique(),email:text(),avatarKey:text("avatar_key")});

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const sessions = pgTable("sessions", {
 id: uuid().defaultRandom().primaryKey(),
 accountId: uuid("account_id").notNull().references(() => accounts.id),
 tokenHash: bytea("token_hash").notNull().unique(),
 createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
 expiresAt: timestamp("expires_at", {withTimezone:true}).notNull(),
}, t => [index("sessions_account_idx").on(t.accountId), index("sessions_expiry_idx").on(t.expiresAt), check("session_expiry", sql`${t.expiresAt} > ${t.createdAt}`), check("session_hash_length", sql`octet_length(${t.tokenHash}) = 32`)]);
export const rateScope = pgEnum("rate_scope", ["ip", "ip_login"]);
export const loginRateLimits = pgTable("login_rate_limits", {
 scope: rateScope().notNull(), bucketHash: bytea("bucket_hash").notNull(),
 windowStartAt: timestamp("window_start_at", {withTimezone:true}).notNull(), count: integer().notNull(),
}, t => [primaryKey({columns:[t.scope,t.bucketHash,t.windowStartAt]}), check("rate_count",sql`${t.count} >= 0`)]);

export const assessment = pgEnum("assessment", assessments);
export const gradeKind = pgEnum("grade_kind", gradeKinds);
export const gradeScale = pgEnum("grade_scale", gradeScales);
export const gradeOutcome = pgEnum("grade_outcome", gradeOutcomes);
export const lessonKind = pgEnum("lesson_kind", lessonKinds);
export const lessonStatus = pgEnum("lesson_status", lessonStatuses);
export const examKind = pgEnum("exam_kind", examKinds);

export const semesters = pgTable("semesters", {
  id: uuid().defaultRandom().primaryKey(),
  label: text().notNull().unique(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  isCurrent: boolean("is_current").notNull(),
}, (t) => [
  check("semester_dates", sql`${t.startsOn} < ${t.endsOn}`),
  uniqueIndex("semester_current_idx").on(t.isCurrent).where(sql`${t.isCurrent}`),
]);

export const disciplines = pgTable("disciplines", {
  id: uuid().defaultRandom().primaryKey(),
  groupId: uuid("group_id").notNull().references(() => groups.id),
  semesterId: uuid("semester_id").notNull().references(() => semesters.id),
  code: text().notNull(),
  title: text().notNull(),
  assessment: assessment().notNull(),
}, (t) => [unique().on(t.groupId, t.semesterId, t.code)]);

export const studyPlanItems = pgTable("study_plan_items", {
  id: uuid().defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
}, (t) => [unique().on(t.studentId, t.disciplineId)]);

export const studyPlanDetails = pgTable("study_plan_details", {
  planItemId: uuid("plan_item_id").primaryKey().references(() => studyPlanItems.id, { onDelete: "cascade" }),
  semesterNumber: integer("semester_number").notNull(),
  department: text(),
  hours: integer(),
  assessmentLabel: text("assessment_label"),
  courseworkHours: integer("coursework_hours"),
  position: integer().notNull().default(0),
}, (t) => [
  check("study_plan_details_number", sql`${t.semesterNumber} >= 1`),
  check("study_plan_details_hours", sql`${t.hours} >= 0 AND ${t.courseworkHours} >= 0`),
]);

export const grades = pgTable("grades", {
  id: uuid().defaultRandom().primaryKey(),
  planItemId: uuid("plan_item_id").notNull().references(() => studyPlanItems.id),
  kind: gradeKind().notNull(),
  label: text().notNull(),
  value: numeric(),
  scale: gradeScale(),
  outcome: gradeOutcome(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [
  index("grades_plan_publication_idx").on(t.planItemId, t.publishedAt),
  uniqueIndex("grades_final_idx").on(t.planItemId).where(sql`${t.kind} in ('final', 'credit')`),
  check("grade_value_scale", sql`(${t.value} IS NULL AND ${t.scale} IS NULL) OR
    (${t.value} IS NOT NULL AND ${t.scale} IS NOT NULL AND
      ((${t.scale} = 'five' AND ${t.value} BETWEEN 1 AND 5) OR
       (${t.scale} = 'hundred' AND ${t.value} BETWEEN 0 AND 100)))`),
  check("grade_outcome_required", sql`${t.kind} = 'current' OR ${t.publishedAt} IS NULL OR ${t.outcome} IS NOT NULL`),
  check("credit_without_value", sql`${t.kind} <> 'credit' OR ${t.value} IS NULL`),
]);

export const lessons = pgTable("lessons", {
  id: uuid().defaultRandom().primaryKey(),
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
}, (t) => [unique().on(t.disciplineId, t.originalStartsAt)]);

export const lessonRevisions = pgTable("lesson_revisions", {
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id),
  version: integer().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  room: text().notNull(),
  building: text(),
  format: text().notNull().default("in_person"),
  teacherName: text("teacher_name").notNull(),
  kind: lessonKind().notNull(),
  status: lessonStatus().notNull(),
  reason: text(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.lessonId, t.version] }),
  index("lesson_revisions_date_idx").on(t.startsAt, t.lessonId),
  check("lesson_revision_version", sql`${t.version} > 0`),
  check("lesson_revision_times", sql`${t.startsAt} < ${t.endsAt}`),
  check("lesson_revision_format", sql`${t.format} IN ('in_person', 'remote')`),
  check("lesson_revision_reason", sql`${t.status} = 'planned' OR (${t.reason} IS NOT NULL AND btrim(${t.reason}) <> '')`),
]);

export const examEvents = pgTable("exam_events", {
  id: uuid().defaultRandom().primaryKey(),
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  kind: examKind().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  room: text(),
  building: text(),
  format: text().notNull().default("in_person"),
}, (t) => [
  index("exams_discipline_idx").on(t.disciplineId, t.startsAt),
  check("exam_publication_time", sql`${t.publishedAt} IS NULL OR ${t.startsAt} IS NOT NULL`),
  check("exam_format", sql`${t.format} IN ('in_person', 'remote')`),
]);

export const deadlines = pgTable("deadlines", {
  id: uuid().defaultRandom().primaryKey(),
  studentId: uuid("student_id").references(() => students.id),
  groupId: uuid("group_id").references(() => groups.id),
  disciplineId: uuid("discipline_id").references(() => disciplines.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  requestId: uuid("request_id").references(() => requests.id),
  title: text().notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  required: boolean().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, (t) => [
  check("deadline_target", sql`num_nonnulls(${t.disciplineId}, ${t.assignmentId}, ${t.requestId}) = 1 AND (${t.requestId} IS NULL OR ${t.studentId} IS NOT NULL)`),
  uniqueIndex("deadlines_assignment_unique").on(t.assignmentId),
  check("deadline_audience", sql`num_nonnulls(${t.studentId}, ${t.groupId}) = 1`),
  index("deadlines_student_due_idx").on(t.studentId, t.dueAt),
  index("deadlines_group_due_idx").on(t.groupId, t.dueAt),
]);

export const deadlineCompletions = pgTable("deadline_completions", {
  studentId: uuid("student_id").notNull().references(() => students.id),
  deadlineId: uuid("deadline_id").notNull().references(() => deadlines.id),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.studentId, t.deadlineId] })]);

export const requestKind = pgEnum("request_kind", requestKinds);
export const requestStatus = pgEnum("request_status", requestStatuses);
export const requestActor = pgEnum("request_actor", requestActors);
export const requestAction = pgEnum("request_action", requestActions);
export const notificationKind = pgEnum("notification_kind", notificationKinds);
export const requestNumber = pgSequence("request_number", { startWith: 100 });

export const requests = pgTable("requests", {
  id: uuid().defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  publicNo: text("public_no").notNull().unique(),
  kind: requestKind().notNull(),
  payload: jsonb().notNull(),
  status: requestStatus().notNull(),
  version: integer().notNull(),
  resultSnapshot: jsonb("result_snapshot"),
  nextTransitionAt: timestamp("next_transition_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [
  unique().on(t.studentId, t.id),
  index("requests_owner_created_idx").on(t.studentId, t.createdAt, t.id),
  index("requests_owner_updated_idx").on(t.studentId, t.updatedAt, t.id),
  index("requests_due_idx").on(t.nextTransitionAt).where(sql`${t.nextTransitionAt} IS NOT NULL`),
  check("requests_positive_version", sql`${t.version} > 0`),
  check("requests_valid_snapshot", sql`(${t.resultSnapshot} IS NOT NULL) = (${t.kind}::text IN ('study_certificate', 'scholarship_certificate') AND ${t.status} = 'ready')`),
  check("requests_valid_timer", sql`(${t.nextTransitionAt} IS NOT NULL) = (${t.status} IN ('submitted', 'in_progress'))`),
]);

export const scholarshipAccruals = pgTable("scholarship_accruals", {
  studentId: uuid("student_id").notNull().references(() => students.id),
  kind: text().notNull(),
  month: date().notNull(),
  amountKopecks: integer("amount_kopecks").notNull(),
}, (t) => [
  primaryKey({ columns: [t.studentId, t.kind, t.month] }),
  check("scholarship_kind", sql`${t.kind} IN ('academic', 'social')`),
  check("scholarship_month", sql`extract(day FROM ${t.month}) = 1`),
  check("scholarship_amount", sql`${t.amountKopecks} > 0`),
]);

export const requestHistory = pgTable("request_history", {
  requestId: uuid("request_id").notNull().references(() => requests.id),
  version: integer().notNull(),
  fromStatus: requestStatus("from_status"),
  toStatus: requestStatus("to_status").notNull(),
  actorKind: requestActor("actor_kind").notNull(),
  reason: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.requestId, t.version] }),
  check("request_history_initial", sql`${t.version} > 0 AND (${t.version} = 1) = (${t.fromStatus} IS NULL)`),
  check("request_history_reason", sql`${t.toStatus} NOT IN ('needs_clarification', 'rejected') OR (${t.reason} IS NOT NULL AND btrim(${t.reason}) <> '')`),
]);

export const requestOperations = pgTable("request_operations", {
  studentId: uuid("student_id").notNull().references(() => students.id),
  action: requestAction().notNull(),
  operationKey: uuid("operation_key").notNull(),
  fingerprint: bytea().notNull(),
  resultRequestId: uuid("result_request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.studentId, t.action, t.operationKey] }),
  foreignKey({ name: "request_operations_owned_result_fk", columns: [t.studentId, t.resultRequestId], foreignColumns: [requests.studentId, requests.id] }),
  check("request_operations_hash_length", sql`octet_length(${t.fingerprint}) = 32`),
]);

export const notifications = pgTable("notifications", {
  id: uuid().defaultRandom().primaryKey(),
  studentId: uuid("student_id").references(() => students.id),
  groupId: uuid("group_id").references(() => groups.id),
  kind: notificationKind().notNull(),
  important: boolean().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  lessonId: uuid("lesson_id").references(() => lessons.id),
  deadlineId: uuid("deadline_id").references(() => deadlines.id),
  requestId: uuid("request_id").references(() => requests.id),
  assignmentId: uuid("assignment_id"),
  sourceKey: text("source_key").notNull().unique(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("notifications_student_published_idx").on(t.studentId, t.publishedAt, t.id),
  index("notifications_group_published_idx").on(t.groupId, t.publishedAt, t.id),
  check("notifications_audience", sql`num_nonnulls(${t.studentId}, ${t.groupId}) = 1`),
  foreignKey({ name: "notifications_assignment_result_fk", columns: [t.studentId, t.assignmentId],
    foreignColumns: [studentAssignmentResults.studentId, studentAssignmentResults.assignmentId] }),
  check("notifications_target", sql`
    (${t.lessonId} IS NOT NULL) = (${t.kind} = 'schedule_change')
    AND (${t.deadlineId} IS NOT NULL) = (${t.kind} = 'deadline')
    AND (${t.requestId} IS NOT NULL) = (${t.kind} = 'request_update')
    AND (${t.assignmentId} IS NOT NULL) = (${t.kind}::text = 'assignment_result')
    AND (${t.kind}::text NOT IN ('request_update', 'assignment_result') OR ${t.studentId} IS NOT NULL)
  `),
]);
export const notificationStates = pgTable("notification_states", {
  studentId: uuid("student_id").notNull().references(() => students.id),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id),
  readAt: timestamp("read_at", { withTimezone: true }),
  changeSeenAt: timestamp("change_seen_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.studentId, t.notificationId] })]);

export const assistantPublications = pgTable("assistant_publications", {
  id: text().primaryKey(),
  revision: text().notNull(),
  title: text().notNull(),
  number: text().notNull(),
  issuedOn: date("issued_on").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  keywords: text().notNull().default(""),
  hasPdf: boolean("has_pdf").notNull().default(true),
}, (t) => [
  check("assistant_publication_id", sql`length(${t.id}) <= 64 AND ${t.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("assistant_publication_revision", sql`${t.revision} ~ '^[a-f0-9]{64}$'`),
]);

export const assistantScholarshipPayments = pgTable("assistant_scholarship_payments", {
  month: date().primaryKey(),
  payOn: date("pay_on").notNull(),
  documentId: text("document_id").notNull(),
  fragmentPosition: integer("fragment_position").notNull(),
}, (t) => [
  check("assistant_scholarship_month_start", sql`extract(day from ${t.month}) = 1`),
  foreignKey({
    columns: [t.documentId, t.fragmentPosition],
    foreignColumns: [assistantFragments.documentId, assistantFragments.position],
    name: "assistant_scholarship_fragment_fk",
  }).onDelete("cascade"),
]);

export const assistantFragments = pgTable("assistant_fragments", {
  documentId: text("document_id").notNull().references(() => assistantPublications.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  page: integer().notNull(),
  text: text().notNull(),
  keywords: text().notNull().default(""),
}, (t) => [
  primaryKey({ columns: [t.documentId, t.position] }),
  check("assistant_fragment_location", sql`${t.position} > 0 AND ${t.page} > 0`),
  index("assistant_fragment_search_idx").using("gin", sql`to_tsvector('russian'::regconfig, ${t.text} || ' ' || ${t.keywords})`),
]);

export const publicationStatus = pgEnum("publication_status", ["draft", "published", "archived"]);
export const extracurricularEvents = pgTable("extracurricular_events", {
  id: uuid().defaultRandom().primaryKey(),
  title: text().notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  kind: text().notNull().default("Событие"), place: text().notNull().default("Уточняется"),
  startsAt: timestamp("starts_at", { withTimezone: true }), endsAt: timestamp("ends_at", { withTimezone: true }),
  summary: text().notNull().default(""), body: text().notNull().default(""), participation: text().notNull().default(""),
  cover: jsonb(), status: publicationStatus().notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [
  check("event_times", sql`(${t.startsAt} IS NULL AND ${t.endsAt} IS NULL) OR (${t.startsAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.startsAt} < ${t.endsAt})`),
  check("extracurricular_title", sql`length(btrim(${t.title})) > 0`),
  check("extracurricular_dates", sql`${t.startsOn} <= ${t.endsOn}`),
  index("extracurricular_dates_idx").on(t.startsOn, t.endsOn),
]);

export const teachers = pgTable("teachers", {
  id: uuid().defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  avatarKey: text("avatar_key"),
});
export const disciplineTeachers = pgTable("discipline_teachers", {
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
}, t => [primaryKey({ columns: [t.disciplineId, t.teacherId] })]);
export const lessonTeachers = pgTable("lesson_teachers", {
  lessonId: uuid("lesson_id").notNull(), version: integer().notNull(),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
}, t => [primaryKey({ columns: [t.lessonId, t.version, t.teacherId] }),
  foreignKey({ columns: [t.lessonId, t.version], foreignColumns: [lessonRevisions.lessonId, lessonRevisions.version] })]);
export const scheduleRules = pgTable("schedule_rules", {
  id: uuid().defaultRandom().primaryKey(),
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  weekday: smallint().notNull(), startsOn: date("starts_on").notNull(), endsOn: date("ends_on").notNull(),
  startMinutes: integer("start_minutes").notNull(), endMinutes: integer("end_minutes").notNull(),
  recurrence: text().notNull(),
}, t => [check("schedule_rule_weekday", sql`${t.weekday} BETWEEN 1 AND 7`),
  check("schedule_rule_dates", sql`${t.startsOn} <= ${t.endsOn}`),
  check("schedule_rule_times", sql`${t.startMinutes} >= 0 AND ${t.endMinutes} <= 1440 AND ${t.startMinutes} < ${t.endMinutes}`),
  check("schedule_rule_recurrence", sql`${t.recurrence} IN ('weekly','numerator','denominator')`)]);
export const disciplineModules = pgTable("discipline_modules", {
  id: uuid().defaultRandom().primaryKey(), disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  title: text().notNull(), position: integer().notNull(),
}, t => [unique().on(t.disciplineId, t.position), unique().on(t.id, t.disciplineId), check("module_position", sql`${t.position} > 0`)]);
export const assignments = pgTable("assignments", {
  id: uuid().defaultRandom().primaryKey(),
  disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
  studentId: uuid("student_id").references(() => students.id),
  groupId: uuid("group_id").references(() => groups.id),
  kind: text().notNull(), number: integer(), title: text().notNull(), description: text().notNull(),
  actions: text().notNull(), requirements: text().notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  maxScore: numeric("max_score"),
  moduleId: uuid("module_id"),
}, t => [foreignKey({ columns: [t.moduleId, t.disciplineId], foreignColumns: [disciplineModules.id, disciplineModules.disciplineId] }), check("assignments_audience", sql`num_nonnulls(${t.studentId}, ${t.groupId}) = 1`),
  check("assignments_number", sql`${t.number} IS NULL OR ${t.number} > 0`),
  check("assignments_score", sql`${t.maxScore} IS NULL OR ${t.maxScore} >= 0`)]);
export const lessonAssignments = pgTable("lesson_assignments", {
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
}, t => [primaryKey({ columns: [t.lessonId, t.assignmentId] })]);
export const studentAssignmentResults = pgTable("student_assignment_results", {
  studentId: uuid("student_id").notNull().references(() => students.id),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
  stage: text().notNull(), score: numeric(), completedAt: timestamp("completed_at", { withTimezone: true }),
  defendedAt: timestamp("defended_at", { withTimezone: true }), publishedAt: timestamp("published_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.studentId, t.assignmentId] }),
  check("assignment_result_stage", sql`${t.stage} IN ('issued','completed','defended')`),
  check("assignment_result_times", sql`(${t.stage} = 'issued' AND ${t.completedAt} IS NULL AND ${t.defendedAt} IS NULL) OR (${t.stage} = 'completed' AND ${t.completedAt} IS NOT NULL AND ${t.defendedAt} IS NULL) OR (${t.stage} = 'defended' AND ${t.completedAt} IS NOT NULL AND ${t.defendedAt} IS NOT NULL AND ${t.defendedAt} >= ${t.completedAt})`),
  check("assignment_result_score", sql`${t.score} IS NULL OR ${t.score} >= 0`)]);
export const examTeachers = pgTable("exam_teachers", {
  examId: uuid("exam_id").notNull().references(() => examEvents.id),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
}, t => [primaryKey({ columns: [t.examId, t.teacherId] })]);
export const examAdmissions = pgTable("exam_admissions", {
  examId: uuid("exam_id").notNull().references(() => examEvents.id),
  studentId: uuid("student_id").notNull().references(() => students.id),
  status: text().notNull(), reason: text(),
}, t => [primaryKey({ columns: [t.examId, t.studentId] }),
  check("exam_admission_status", sql`${t.status} IN ('admitted','pending','action_required')`)]);
export const serviceCatalog = pgTable("service_catalog", {
  code: text().primaryKey(), title: text().notNull(), category: text().notNull(), description: text().notNull(),
  active: boolean().notNull(), contractVersion: integer("contract_version").notNull(),
}, t => [check("service_contract_version", sql`${t.contractVersion} > 0`)]);
export const sportsSessions = pgTable("sports_sessions", {
  id: uuid().defaultRandom().primaryKey(), kind: text().notNull(), title: text().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  teacherId: uuid("teacher_id").references(() => teachers.id),
  place: text().notNull(), capacity: integer().notNull(), bookingOpen: boolean("booking_open").notNull(),
}, t => [check("sports_kind", sql`${t.kind} IN ('class','makeup','pool')`),
  check("sports_times", sql`${t.startsAt} < ${t.endsAt}`), check("sports_capacity", sql`${t.capacity} >= 0`)]);
export const sportsBookings = pgTable("sports_bookings", {
  sessionId: uuid("session_id").notNull().references(() => sportsSessions.id),
  studentId: uuid("student_id").notNull().references(() => students.id),
  status: text().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.sessionId, t.studentId] }), check("sports_booking_status", sql`${t.status} IN ('active','cancelled')`)]);
export const sportsAttendance = pgTable("sports_attendance", {
  sessionId: uuid("session_id").notNull().references(() => sportsSessions.id),
  studentId: uuid("student_id").notNull().references(() => students.id), attended: boolean().notNull(),
}, t => [primaryKey({ columns: [t.sessionId, t.studentId] })]);
export const sportsSemesterResults = pgTable("sports_semester_results", {
  semesterId: uuid("semester_id").notNull().references(() => semesters.id),
  studentId: uuid("student_id").notNull().references(() => students.id), score: numeric(), result: text(),
  targetAttendance: integer("target_attendance"), minimumPoints: integer("minimum_points"),
  priorSemesterId: uuid("prior_semester_id").references(() => semesters.id),
}, t => [primaryKey({ columns: [t.semesterId, t.studentId] }), check("sports_target", sql`${t.targetAttendance} >= 0 AND ${t.minimumPoints} >= 0`), check("sports_result_score", sql`${t.score} IS NULL OR ${t.score} >= 0`)]);

export const sportsNormResults = pgTable("sports_norm_results", {
  semesterId: uuid("semester_id").notNull(),
  studentId: uuid("student_id").notNull(),
  code: text().notNull(), title: text().notNull(), unit: text().notNull(), direction: text().notNull(),
  status: text().notNull(), result: numeric(), position: integer().notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.semesterId, t.studentId, t.code] }),
  foreignKey({ columns: [t.semesterId, t.studentId], foreignColumns: [sportsSemesterResults.semesterId, sportsSemesterResults.studentId], name: "sports_norm_owner_fk" }).onDelete("cascade"),
  check("sports_norm_direction", sql`${t.direction} IN ('higher','lower')`),
  check("sports_norm_result", sql`(${t.status}='unattempted' AND ${t.result} IS NULL) OR (${t.status} IN ('passed','failed') AND ${t.result} IS NOT NULL)`),
]);

export const healthPassports = pgTable("health_passports", {
  studentId: uuid("student_id").primaryKey().references(() => students.id),
  validUntil: date("valid_until").notNull(), admitted: boolean().notNull(), medicalGroup: text("medical_group"),
});

export const eventAudiences = pgTable("event_audiences", {
 eventId: uuid("event_id").notNull().references(() => extracurricularEvents.id), groupId: uuid("group_id").notNull().references(() => groups.id),
}, t => [primaryKey({ columns: [t.eventId, t.groupId] })]);
export const newsPosts = pgTable("news_posts", {
 id: uuid().defaultRandom().primaryKey(), title: text().notNull(), summary: text().notNull(), body: text().notNull(),
 category: text().notNull(), pinned: boolean().notNull().default(false), status: publicationStatus().notNull().default("draft"),
 publishedAt: timestamp("published_at", { withTimezone: true }), author: text().notNull(),
 eventId: uuid("event_id").references(() => extracurricularEvents.id),
});
export const newsAudiences = pgTable("news_audiences", {
 newsId: uuid("news_id").notNull().references(() => newsPosts.id), groupId: uuid("group_id").notNull().references(() => groups.id),
}, t => [primaryKey({ columns: [t.newsId, t.groupId] })]);
export const lessonAttendance = pgTable("lesson_attendance", {
 studentId: uuid("student_id").notNull().references(() => students.id), lessonId: uuid("lesson_id").notNull().references(() => lessons.id),
 status: text().notNull(), publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.studentId, t.lessonId] }), check("attendance_status", sql`${t.status} IN ('present','distinction','absent')`)]);
export const studyScoreBreakdowns = pgTable("study_score_breakdowns", {
 planItemId: uuid("plan_item_id").primaryKey().references(() => studyPlanItems.id),
 semesterScore: numeric("semester_score"), semesterMax: numeric("semester_max").notNull(),
 examScore: numeric("exam_score"), examMax: numeric("exam_max"), publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, t => [check("breakdown_scores", sql`${t.semesterMax} >= 0 AND (${t.semesterScore} IS NULL OR ${t.semesterScore} BETWEEN 0 AND ${t.semesterMax}) AND (${t.examMax} IS NULL OR ${t.examMax} >= 0) AND (${t.examScore} IS NULL OR (${t.examMax} IS NOT NULL AND ${t.examScore} BETWEEN 0 AND ${t.examMax}))`)]);

export const librarySubjects = pgTable("library_subjects", {
  id: uuid().defaultRandom().primaryKey(), title: text().notNull().unique(),
});
export const libraryBooks = pgTable("library_books", {
  id: uuid().defaultRandom().primaryKey(), title: text().notNull(), author: text().notNull(), description: text().notNull(),
  content: text(), copies: integer().notNull().default(0), published: boolean().notNull().default(false),
}, t => [check("library_copies_nonnegative", sql`${t.copies} >= 0`)]);
export const libraryBookSubjects = pgTable("library_book_subjects", {
  bookId: uuid("book_id").notNull().references(() => libraryBooks.id), subjectId: uuid("subject_id").notNull().references(() => librarySubjects.id),
}, t => [primaryKey({columns: [t.bookId, t.subjectId]})]);
export const libraryBookings = pgTable("library_bookings", {
  bookId: uuid("book_id").notNull().references(() => libraryBooks.id), studentId: uuid("student_id").notNull().references(() => students.id),
  active: boolean().notNull().default(true), updatedAt: timestamp("updated_at", {withTimezone: true}).notNull().defaultNow(),
}, t => [primaryKey({columns: [t.bookId, t.studentId]})]);

export const vucTestSlots = pgTable("vuc_test_slots", {
  id: uuid().primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  place: text().notNull(),
}, t => [check("vuc_slot_time", sql`${t.startsAt} < ${t.endsAt}`)]);

export const vucApplications = pgTable("vuc_applications", {
  studentId: uuid("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  slotId: uuid("slot_id").references(() => vucTestSlots.id),
  bookedAt: timestamp("booked_at", { withTimezone: true }),
  physicalScore: integer("physical_score"),
  academicScore: integer("academic_score"),
  exercises: jsonb(),
  resultsPublishedAt: timestamp("results_published_at", { withTimezone: true }),
  decision: text(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, t => [
  check("vuc_application_booking", sql`(${t.slotId} IS NULL) = (${t.bookedAt} IS NULL) AND ${t.bookedAt} >= ${t.submittedAt}`),
  check("vuc_application_result", sql`
    (${t.resultsPublishedAt} IS NULL AND ${t.physicalScore} IS NULL AND ${t.academicScore} IS NULL AND ${t.exercises} IS NULL)
    OR (${t.resultsPublishedAt} IS NOT NULL AND ${t.bookedAt} IS NOT NULL AND ${t.resultsPublishedAt} >= ${t.bookedAt}
    AND ${t.physicalScore} IS NOT NULL AND ${t.physicalScore} BETWEEN 0 AND 100
    AND ${t.academicScore} IS NOT NULL AND ${t.academicScore} BETWEEN 0 AND 100 AND jsonb_typeof(${t.exercises}) IS NOT DISTINCT FROM 'object')`),
  check("vuc_application_decision", sql`(${t.decision} IS NULL AND ${t.decidedAt} IS NULL)
    OR (${t.decision} IS NOT NULL AND ${t.decision} IN ('admitted','not_admitted') AND ${t.decidedAt} IS NOT NULL
    AND ${t.resultsPublishedAt} IS NOT NULL AND ${t.decidedAt} >= ${t.resultsPublishedAt})`),
]);

export const clinicDoctors = pgTable("clinic_doctors", {
  id: uuid().primaryKey(),
  faculty: text().notNull().unique(),
  name: text().notNull(),
  place: text().notNull(),
});

export const clinicSlots = pgTable("clinic_slots", {
  id: uuid().primaryKey(),
  doctorId: uuid("doctor_id").notNull().references(() => clinicDoctors.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, t => [
  unique("clinic_slot_start").on(t.doctorId, t.startsAt),
  check("clinic_slot_time", sql`${t.startsAt} < ${t.endsAt}`),
]);

export const clinicAppointments = pgTable("clinic_appointments", {
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => clinicSlots.id),
  bookedAt: timestamp("booked_at", { withTimezone: true }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  passportUpdatedAt: timestamp("passport_updated_at", { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.studentId, t.slotId] }),
  uniqueIndex("clinic_active_appointment_student").on(t.studentId).where(sql`${t.cancelledAt} IS NULL AND ${t.completedAt} IS NULL`),
  uniqueIndex("clinic_occupied_slot").on(t.slotId).where(sql`${t.cancelledAt} IS NULL`),
  check("clinic_appointment_times", sql`
    (${t.cancelledAt} IS NULL OR ${t.cancelledAt} >= ${t.bookedAt})
    AND (${t.completedAt} IS NULL OR (${t.completedAt} >= ${t.bookedAt} AND ${t.cancelledAt} IS NULL))
    AND (${t.passportUpdatedAt} IS NULL OR (${t.completedAt} IS NOT NULL AND ${t.passportUpdatedAt} >= ${t.completedAt}))`),
]);

export const clinicAfkRequests = pgTable("clinic_afk_requests", {
  studentId: uuid("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  documentKey: text("document_key").notNull(),
  status: text().notNull().default("submitted"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, t => [
  check("clinic_afk_document", sql`${t.documentKey} = 'afk-demo-v1'`),
  check("clinic_afk_review", sql`
    (${t.status} = 'submitted' AND ${t.publishedAt} IS NULL AND ${t.startsOn} IS NULL AND ${t.endsOn} IS NULL)
    OR (${t.publishedAt} IS NOT NULL AND ${t.publishedAt} >= ${t.submittedAt} AND (
      (${t.status} = 'approved' AND ${t.startsOn} IS NOT NULL AND ${t.endsOn} IS NOT NULL AND ${t.startsOn} <= ${t.endsOn})
      OR (${t.status} = 'declined' AND ${t.startsOn} IS NULL AND ${t.endsOn} IS NULL)
    ))`),
]);
