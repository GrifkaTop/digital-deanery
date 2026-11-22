"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronRight } from "lucide-react";
import { CabinetLink } from "./cabinet-link";
import { compactDate } from "./compact-date";

import { useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import type { Profile } from "@/contracts/auth";
import { studyResponse } from "@/contracts/academics";
import { requestFieldValue, requestForms, type RequestField } from "@/contracts/request-forms";
import { serviceFormKind, serviceList, type CreateRequestKind, type Service } from "@/contracts/services";
import {
  choices, clarifyRequest, createRequest, kindLabel, nextStep, requestDetail,
  requestFilter, requestList, requestResult, slots, statusLabel, type RequestKind, type RequestSummary,
} from "@/contracts/requests";
import { Resource } from "./resource";
import { AtlasTextarea } from "./prototype/atlas-textarea";

type FormValues = { fields: Record<string, string> };
type Draft = FormValues & { kind: CreateRequestKind; service: Service };
type Clarification = { key: string; choice: keyof typeof choices; expectedVersion: number };
export type RequestMemory = { draft?: Draft; createKey?: string; clarify?: Clarification & { id: string } };
export type RequestScreen = "requests" | "requestNew" | "requestDetail";
type Search = Record<string, string | string[] | undefined>;
const dates = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow",
});
const date = (value: string) => dates.format(new Date(value)) + " МСК";
const filters = { all: "Все", active: "В работе", reply: "Ждут ответа", closed: "Завершённые" };
const tones = {
  submitted: "info", in_progress: "info", needs_clarification: "warning",
  ready: "success", approved: "success", registered: "neutral", rejected: "danger",
};

function Status({ status }: { status: RequestSummary["status"] }) {
  return <span className={`status-tag tone-${tones[status]}`}>{status === "ready" && <CheckCircle2 size={14} aria-hidden="true" />}{statusLabel[status]}</span>;
}
const catalogUrl = "/api/v1/services";
const quickOrderCodes = ["study_certificate", "consultation_reschedule"];
const serviceHref = (code: string) => "/requests/new?" + new URLSearchParams({ kind: code });

function quickOrders(items: Service[]) {
  return quickOrderCodes.flatMap((code) => {
    const service = items.find((entry) => entry.code === code && serviceFormKind(entry));
    return service ? [service] : [];
  });
}

export function TodayRequestSlot({ item, onUnauthorized }: { item: RequestSummary | null; onUnauthorized: () => void }) {
  if (!item) return <section className="data-panel today-quick-order">
    <h2 className="today-summary-title">Быстрый заказ без очереди</h2>
    <Resource url={catalogUrl} schema={serviceList} onUnauthorized={onUnauthorized}>
      {({ items }) => {
        const services = quickOrders(items);
        return services.length ? services.map(({ code, title }) =>
          <CabinetLink className="data-row today-summary-action" key={code} href={serviceHref(code)}>
            {title}<ChevronRight size={16} aria-hidden="true" />
          </CabinetLink>) : <CabinetLink href="/requests/new">К каталогу услуг</CabinetLink>;
      }}
    </Resource>
  </section>;

  return <section className="data-panel today-request">
    <div className="today-request-header"><h2 className="today-summary-title">Заявки</h2><CabinetLink className="today-new-request" href="/requests/new">+ Новая заявка</CabinetLink></div>
    <CabinetLink className="data-row compact-request request-tracker" href={`/requests/${item.id}`}>
      <span className="row-body">
        <strong>{kindLabel[item.kind]}</strong>
        <span className="row-meta request-number">{item.publicNo}</span>
        <span className={`request-inline-status request-status-${item.status}`}>
          {item.status === "ready" && <CheckCircle2 size={14} aria-hidden="true" />}
          {item.status === "ready" ? "Готова к скачиванию" : item.status === "needs_clarification" ? "Нужен ответ" : statusLabel[item.status]}
        </span>
      </span>
      <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
    </CabinetLink>

  </section>;
}

export function RequestRow({ item, back }: { item: RequestSummary; back?: string }) {
  const query = back ? "?" + new URLSearchParams({ back }) : "";
  return <CabinetLink className="data-row chevron-row" href={`/requests/${item.id}${query}`}>
    <span className="row-body">
      <strong>{kindLabel[item.kind]}</strong>
      <span className="row-meta"><span className="request-number">{item.publicNo}</span> · {compactDate(item.createdAt)}</span>
      <span className="row-meta">{nextStep[item.status]}</span>
    </span>
    <Status status={item.status} />
    <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
  </CabinetLink>;
}

function Requests({ search, onUnauthorized }: { search: Search; onUnauthorized: () => void }) {
  const parsed = requestFilter.safeParse(search.filter);
  const filter = parsed.success ? parsed.data : "all";
  const query = new URLSearchParams({ filter });
  if (typeof search.cursor === "string") query.set("cursor", search.cursor);
  const back = "/requests?" + query.toString();
  return <>
    <div className="requests-heading">
      <h1>Заявки</h1>
      <CabinetLink className="primary-link" href="/requests/new">Новая заявка</CabinetLink>
    </div>
    <div className="segmented request-filters" aria-label="Фильтр заявок">
      {Object.entries(filters).map(([key, label]) =>
        <CabinetLink key={key} href={`/requests?filter=${key}`} aria-current={key === filter ? "true" : undefined}>{label}</CabinetLink>)}
    </div>
    <div className="desktop-columns"><div className="desktop-main-column">
    <Resource url={"/api/v1/requests?" + query.toString()} schema={requestList} onUnauthorized={onUnauthorized}>
      {({ items, nextCursor }) => <>
        <section className="data-panel">
          {items.length ? items.map((item) => <RequestRow key={item.id} item={item} back={back} />) : <>
            <p>{filter === "all" ? "У вас пока нет заявок" : "Нет заявок с таким статусом"}</p>
            {filter !== "all" && <CabinetLink className="back-link" href="/requests">Показать все</CabinetLink>}
          </>}
        </section>
        {nextCursor && <CabinetLink className="back-link" href={"/requests?" + new URLSearchParams({ filter, cursor: nextCursor })}>Следующая страница</CabinetLink>}
      </>}
    </Resource>
    </div><aside className="desktop-context data-panel"><h2>Быстрое оформление</h2><p className="muted">Выберите тип обращения</p>
      <Resource url={catalogUrl} schema={serviceList} onUnauthorized={onUnauthorized}>
        {({ items }) => quickOrders(items).map(({ code, title, description }) =>
          <CabinetLink className="context-link" key={code} href={serviceHref(code)}>
            <span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={16} aria-hidden="true" />
          </CabinetLink>)}
      </Resource>
    </aside></div>
  </>;
}

function useRequestMutation(onUnauthorized: () => void) {
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  async function send(
    path: string, key: string, payload: unknown, onInvalid?: () => void, onServiceChanged?: () => void,
  ) {
    if (controller.current) return null;
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/v1/csrf", { signal: abort.signal, cache: "no-store" });
      if (!csrf.ok) throw new Error("CSRF unavailable");
      const { token } = await csrf.json();
      const response = await fetch(path, {
        method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token, "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) { onUnauthorized(); return null; }
      if ((response.status === 404 || response.status === 422) && onInvalid) {
        const error = await response.json();
        setMessage(response.status === 404 ? "Выберите дисциплину из плана текущего семестра."
          : error.code === "PAST_DATE" ? "Дата должна быть не раньше сегодняшнего дня."
          : error.code === "FUTURE_TRAVEL" ? "Дата поездки не может быть в будущем." : "Проверьте данные формы и повторите отправку.");
        onInvalid();
        return null;
      }
      if (response.status === 409) {
        const { code } = await response.json();
        if (code === "SERVICE_UNAVAILABLE" || code === "SERVICE_VERSION_CONFLICT") {
          setMessage(code === "SERVICE_UNAVAILABLE" ? "Приём заявок по этой услуге приостановлен."
            : "Форма услуги обновилась. Откройте её заново из каталога.");
          onServiceChanged?.();
          return null;
        }
        setMessage("Состояние заявки изменилось. Проверьте список заявок или обновите карточку.");
        return null;
      }
      if (!response.ok) throw new Error("Request failed");
      return requestResult.parse(await response.json());
    } catch {
      if (!abort.signal.aborted) setMessage("Отправку не удалось подтвердить. Повторите её или проверьте список заявок.");
      return null;
    } finally {
      controller.current = null;
      if (!abort.signal.aborted) setPending(false);
    }
  }
  return { send, pending, message };
}

type FieldEntry = [string, RequestField];
function formFields(kind: RequestKind): FieldEntry[] {
  return Object.entries(requestForms[kind].fields);
}

function Requisites({ items }: { items: [string, string][] }) {
  return <dl className="request-requisites">
    {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function FormField({ name, field, form, remember, disciplines, required, atlas, className }: {
  name: string; field: RequestField; form: UseFormReturn<FormValues>;
  remember: () => void; disciplines: { id: string; title: string }[]; required: boolean; atlas?: boolean;
  className?: string;
}) {
  const id = `request-field-${name}`;
  const error = form.formState.errors.fields?.[name]?.message;
  const { ref, ...registration } = form.register(`fields.${name}`, { onChange: () => { form.clearErrors(`fields.${name}`); remember(); } });
  const control = {
    id, required, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined,
    ...registration,
  };
  return <div className={`request-field ${className ?? ""}`}>
    <label htmlFor={id}>{field.label}{!required && <span className="muted"> · необязательно</span>}</label>
    {field.type === "select" || field.type === "discipline" ? <select {...control} ref={ref}>
      <option value="">Выберите из списка</option>
      {field.type === "select"
        ? Object.entries(field.options).map(([value, label]) => <option key={value} value={value}>{label}</option>)
        : disciplines.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
    </select> : field.type === "textarea"
      ? atlas ? <AtlasTextarea {...control} inputRef={ref} value={form.watch(`fields.${name}`) ?? ""} maxLength={field.maxLength} rows={3} /> : <textarea {...control} ref={ref} maxLength={field.maxLength} rows={3} />
      : <input {...control} ref={ref} type={field.type} />}
    {error && <p id={`${id}-error`} className="error-message">{error}</p>}
  </div>;
}

function NewRequest({ search, profile, memory, onUnauthorized, atlas }: {
  search: Search; profile: Profile; memory: RequestMemory; onUnauthorized: () => void; atlas?: boolean;
}) {
  const router = useRouter();
  const onCreated = (id: string) => { if (window.location.pathname === "/" || window.location.pathname === "/prototype") window.location.hash = `requests/${id}`; else router.replace(`/requests/${id}`); };
  const formProps = { profile, memory, onUnauthorized, onCreated, atlas };
  const retry = memory.createKey ? memory.draft : undefined;
  if (retry) return <RequestForm key={retry.kind} kind={retry.kind} service={retry.service} {...formProps} />;
  const selected = typeof search.kind === "string" ? search.kind : memory.draft?.kind;
  return <Resource url={catalogUrl} schema={serviceList} onUnauthorized={onUnauthorized}>
    {({ items }) => {
      const service = items.find(({ code }) => code === selected);
      const kind = service && serviceFormKind(service);
      if (kind && service) return <RequestForm key={kind} kind={kind} service={service} {...formProps} />;
      return <RequestCatalog items={items} unavailable={Boolean(selected)} />;
    }}
  </Resource>;
}

function RequestCatalog({ items, unavailable }: { items: Service[]; unavailable: boolean }) {
  const categories = new Map<string, Service[]>();
  for (const service of items) {
    const group = categories.get(service.category);
    if (group) group.push(service);
    else categories.set(service.category, [service]);
  }
  return <>
    <CabinetLink className="back-link" href="/requests">Назад к заявкам</CabinetLink>
    <h1>Новая заявка</h1>
    {unavailable && <p role="status">Выбранная услуга сейчас недоступна для оформления.</p>}
    {items.length === 0 && <p>Доступных услуг пока нет.</p>}
    <div className="request-catalog">
      {[...categories].map(([category, services]) => <section className="data-panel" key={category}>
        <h2>{category}</h2>
        {services.map((service) => serviceFormKind(service)
          ? <CabinetLink key={service.code} className="data-row chevron-row" href={serviceHref(service.code)}>
            <span className="row-body"><strong>{service.title}</strong><span className="row-meta">{service.description}</span></span>
            <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
          </CabinetLink>
          : <div key={service.code} className="data-row">
            <span className="row-body"><strong>{service.title}</strong><span className="row-meta">{service.description}</span>
              <span className="row-meta">Форма услуги обновляется.</span></span>
          </div>)}
      </section>)}
    </div>
  </>;
}

type RequestFormProps = {
  kind: CreateRequestKind; service: Service; profile: Profile; memory: RequestMemory;
  onUnauthorized: () => void; onCreated: (id: string) => void; atlas?: boolean;
};

function RequestForm(props: RequestFormProps) {
  const { kind, memory, onUnauthorized } = props;
  const initialFields = memory.draft && memory.draft.kind === kind ? memory.draft.fields : {};
  const form = useForm<FormValues>({ defaultValues: { fields: initialFields } });
  if (kind === "consultation_reschedule") {
    return <Resource url="/api/v1/study" schema={studyResponse} onUnauthorized={onUnauthorized}>
      {(data) => <SelectedRequestForm {...props} form={form}
        disciplines={data.semesters.some((semester) => semester.id === data.semesterId && semester.isCurrent) ? data.items : []} />}
    </Resource>;
  }
  return <SelectedRequestForm {...props} form={form} disciplines={[]} />;
}

export function AtlasRequestConfirmation({ publicNo, id }: { publicNo: string; id: string }) {
  return <section className="ss-form ss-panel" aria-labelledby="atlas-request-confirmation-title">
    <div className="ss-form-toolbar">
      <a className="ss-back" href="#services"><ArrowLeft className="ss-back-icon" size={18} aria-hidden="true"/>К каталогу</a>
    </div>
    <div className="ss-success">
      <span className="ss-success-icon"><Check size={25} aria-hidden="true"/></span>
      <h2 id="atlas-request-confirmation-title" tabIndex={-1} ref={node => { node?.focus({ preventScroll: true }); }}>Заявка принята</h2>
      <p>Заявка {publicNo} появилась в разделе «Мои заявки».</p>
      <a className="ss-primary" href={"#requests/" + encodeURIComponent(id)}>Открыть заявку</a>
    </div>
  </section>;
}

function SelectedRequestForm({ form, kind, service, profile, memory, onUnauthorized, disciplines, onCreated, atlas }: RequestFormProps & {
  form: UseFormReturn<FormValues>; disciplines: { id: string; title: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(memory.createKey ? 2 : 1);
  const [acceptedRequest, setAcceptedRequest] = useState<z.output<typeof requestResult>>();
  const [destination, setDestination] = useState("/requests/new");
  const { send, pending, message } = useRequestMutation(onUnauthorized);
  const [locked, setLocked] = useState(Boolean(memory.createKey));
  const [unavailable, setUnavailable] = useState(false);
  const config = requestForms[kind];
  const fields = formFields(kind);
  const current = form.watch("fields");
  const noPlan = kind === "consultation_reschedule" && !disciplines.length;
  const remember = () => { memory.draft = { kind, service, fields: { ...form.getValues("fields") } }; };
  const entries: [string, string][] = [
    ["Студент", profile.fullName], ["Группа", profile.group], ["Факультет", profile.faculty],
  ];
  if (profile.studentNumber) entries.push(["Студенческий билет", profile.studentNumber]);
  for (const [name, field] of fields) {
    if (!current[name]?.trim()) continue;
    const value = field.type === "discipline" ? disciplines.find(({ id }) => id === current[name])?.title : requestFieldValue(field, current[name]);
    if (value) entries.push([field.label, value]);
  }
  const required = (name: string, field: RequestField) =>
    field.type !== "textarea" || !field.optional || (name === "comment" && current.grounds === "other");

  function confirmLeave(url: string) {
    setDestination(url);
    dialog.current?.showModal();
  }

  if (acceptedRequest) return <AtlasRequestConfirmation publicNo={acceptedRequest.publicNo} id={acceptedRequest.id}/>;

  return <div className={atlas ? "ss-form ss-panel request-form" : "request-form"}>
    {!atlas && <h1>Новая заявка</h1>}
    <form noValidate onSubmit={form.handleSubmit(async (draft) => {
      if (unavailable) return;
      const values = (memory.createKey && memory.draft ? memory.draft : draft).fields;
      const payload = { schemaVersion: service.contractVersion, ...Object.fromEntries(fields
        .filter(([name, field]) => required(name, field) || values[name]?.trim())
        .map(([name]) => [name, values[name] ?? ""])) };
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const dateField = kind === "dormitory" || kind === "academic_leave" ? "startDate" : kind === "travel_compensation" ? "travelDate" : null;
      if (!memory.createKey && dateField && values[dateField] && (dateField === "travelDate" ? values[dateField] > today : values[dateField] < today)) {
        form.setError(`fields.${dateField}`, { message: dateField === "travelDate" ? "Дата поездки не может быть в будущем." : "Дата должна быть не раньше сегодняшнего дня." });
        form.setFocus(`fields.${dateField}`);
        return;
      }
      const parsed = createRequest.safeParse({ kind, payload });
      if (!parsed.success) {
        let first: `fields.${string}` | undefined;
        for (const [name, field] of fields) {
          const issue = parsed.error.issues.find((entry) => entry.path[0] === "payload" && entry.path[1] === name);
          if (!issue) continue;
          const path = `fields.${name}` as const;
          first ??= path;
          form.setError(path, { message: !values[name]?.trim() ? "Заполните поле."
            : issue.code === "invalid_value" || field.type === "discipline" ? "Выберите значение из списка."
            : issue.code === "invalid_format" && field.type === "date" ? "Укажите корректную дату." : issue.message });
        }
        if (first) form.setFocus(first);
        return;
      }
      if (atlas && step === 1 && !locked) { remember(); setStep(2); return; }
      memory.draft = { kind, service, fields: { ...values } };
      memory.createKey ??= crypto.randomUUID();
      setLocked(true);
      const result = await send("/api/v1/requests", memory.createKey, parsed.data, () => {
        delete memory.createKey;
        setLocked(false);
      }, () => {
        delete memory.createKey;
        setLocked(false);
        setUnavailable(true);
      });
      if (result) {
        delete memory.draft;
        delete memory.createKey;
        if (atlas) setAcceptedRequest(result);
        else onCreated(result.id);
      }
    })}>
      <div className={atlas ? "ss-form-toolbar" : "request-form-toolbar"}>
        <CabinetLink className={atlas ? "ss-back" : "back-link"} href={atlas ? "#services" : "/requests"} onClick={(event) => {
          if (locked || !Object.values(current).some((value) => value?.trim())) return;
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          confirmLeave(atlas ? "#services" : "/requests");
        }}><ArrowLeft className={atlas ? "ss-back-icon" : "request-back-icon"} size={18} aria-hidden="true"/>{atlas ? "К каталогу" : "Назад к заявкам"}</CabinetLink>
        {atlas && <span className="ss-step">Шаг {step} из 2</span>}
      </div>
      <fieldset className={atlas ? "ss-fields atlas-request-fields" : "data-panel"} hidden={atlas && step !== 1} disabled={locked || unavailable}>
        <header className="request-service-heading">
          <h2>{service.title}</h2>
          <p className="muted">{kind === "academic_leave" ? "Заявление на академический отпуск" : service.description}</p>
          {kind === "academic_leave" ? <p className="request-form-note">Все поля обязательны · Демонстрационные данные</p> : <p className="muted">Все поля обязательны, если не указано иное. Используйте вымышленные сведения для демонстрации.</p>}
        </header>
        {noPlan && <p role="status">В текущем семестре нет дисциплин для выбора.</p>}
        {fields.map(([name, field]) => <FormField key={name} name={name} field={field} form={form}
          remember={remember} disciplines={disciplines} required={required(name, field)} atlas={atlas}
          className={kind === "academic_leave" && (name === "startDate" || name === "endDate") ? "request-date-field" : undefined} />)}
      </fieldset>
      <section className={atlas ? "ss-review" : "data-panel"} hidden={step !== 2}>
        <h2>Проверьте заявку</h2>
        <p><strong>Услуга: {service.title}</strong></p>
        <Requisites items={entries} />
        <p>{config.result}</p>
      </section>
      {message && <p role="alert" className="error-message">{message}</p>}
      {message && <CabinetLink className="back-link" href="/requests">Мои заявки</CabinetLink>}
      {atlas && step === 2 && !locked && <button type="button" className="ss-secondary" onClick={() => setStep(1)}>Изменить</button>}
      <button type="submit" className={atlas ? "ss-primary" : "login-submit"} disabled={pending || unavailable || (noPlan && !locked)}>
        {pending ? "Отправляем…" : locked ? "Повторить отправку" : atlas && step === 1 ? "Продолжить" : "Отправить заявку"}
      </button>
      {!locked && !atlas && <button type="button" className="quiet-button" onClick={() => confirmLeave("/requests/new")}>
        Выбрать другую услугу
      </button>}
    </form>
    <dialog className="request-dialog" ref={dialog} aria-labelledby="discard-title">
      <h2 id="discard-title">Покинуть форму?</h2>
      <p>Введённые данные будут очищены.</p>
      <form method="dialog"><button autoFocus type="submit">Остаться</button></form>
      <CabinetLink className="back-link" href={destination} onClick={() => {
        delete memory.draft;
        dialog.current?.close();
      }}>{destination === "/requests/new" ? "К каталогу услуг" : "К списку заявок"}</CabinetLink>
    </dialog>
  </div>;
}

export function SubmittedRequisites({ item, atlas }: { item: z.output<typeof requestDetail>; atlas?: boolean }) {
  const payload = item.payload;
  const values: Record<string, unknown> = payload;
  const entries: [string, string][] = [];
  if ("details" in payload) entries.push(["Описание обращения", payload.details]);
  else for (const [name, field] of formFields(item.kind)) {
    const value: unknown = field.type === "discipline" ? ("discipline" in payload && payload.discipline)
      : values[name];
    if (typeof value === "string" && value) entries.push([field.label, requestFieldValue(field, value)]);
  }
  if ("choice" in payload && payload.choice) entries.push(["Ответ на уточнение", choices[payload.choice]]);
  return <section className={atlas ? "atlas-request-panel" : "data-panel"}>
    <h2>Данные заявки</h2>
    <Requisites items={entries} />
  </section>;
}

export function Clarify({ item, memory, onUnauthorized, onSaved, atlas }: {
  item: z.output<typeof requestDetail>; memory: RequestMemory; onUnauthorized: () => void; onSaved: () => void; atlas?: boolean;
}) {
  const saved = memory.clarify?.id === item.id && memory.clarify.expectedVersion === item.version ? memory.clarify : undefined;
  const [choice, setChoice] = useState<keyof typeof choices | "">(saved?.choice ?? "");
  const { send, pending, message } = useRequestMutation(onUnauthorized);
  const alternate = "slot" in item.payload && item.payload.slot === "option_b" ? slots.option_a : slots.option_b;
  return <form className={atlas ? "atlas-request-panel atlas-request-reply" : "data-panel"} onSubmit={async (event) => {
    event.preventDefault();
    const parsed = clarifyRequest.safeParse({ choice, expectedVersion: item.version });
    if (!parsed.success) return;
    const key = saved?.choice === parsed.data.choice ? saved.key : crypto.randomUUID();
    memory.clarify = { id: item.id, key, ...parsed.data };
    const result = await send(`/api/v1/requests/${item.id}/clarification`, key, parsed.data);
    if (result) {
      delete memory.clarify;
      onSaved();
    }
  }}>
    <h2>Уточните время</h2>
    <p>{item.history.at(-1)?.reason}</p>
    <label htmlFor="clarification">Ваш ответ</label>
    <select id="clarification" required value={choice} disabled={pending || Boolean(saved)}
      onChange={(event) => setChoice(event.target.value as keyof typeof choices)}>
      <option value="">Выберите ответ</option>
      <option value="alternative_slot">{alternate}</option>
      <option value="keep_original">{choices.keep_original}</option>
    </select>
    {message && <p role="alert" className="error-message">{message}</p>}
    <button className={atlas ? "ss-primary" : "login-submit"} disabled={pending}>{pending ? "Отправляем…" : "Отправить уточнение"}</button>
  </form>;
}

function Detail({ id, search, memory, onUnauthorized }: {
  id: string; search: Search; memory: RequestMemory; onUnauthorized: () => void;
}) {
  const back = typeof search.back === "string" && search.back.startsWith("/requests?") ? search.back : "/requests";
  const [revision, setRevision] = useState(0);
  const endpoint = `/api/v1/requests/${encodeURIComponent(id)}`;
  return <>
    <CabinetLink className="back-link" href={back}>К заявкам</CabinetLink>
    <Resource key={endpoint} url={endpoint} schema={requestDetail} onUnauthorized={onUnauthorized} refreshMs={5_000} reloadKey={revision} retainPrevious>
      {(item) => <>
        <h1>{item.publicNo}</h1>
        <section className="data-panel">
          <h2>{kindLabel[item.kind]}</h2>
          <Status status={item.status} />
          <p className="muted">Подана {date(item.createdAt)}</p>
          <p>{nextStep[item.status]}</p>
          {(item.status === "approved" || item.status === "rejected") && <p>{item.history.at(-1)?.reason}</p>}
          {item.status === "ready" && <a className="primary-link" href={endpoint + "/document"} download>Скачать образец PDF</a>}
        </section>
        {item.status === "needs_clarification" &&
          <Clarify key={item.version} item={item} memory={memory} onUnauthorized={onUnauthorized} onSaved={() => setRevision((value) => value + 1)} />}
        <SubmittedRequisites item={item} />
        <section className="data-panel">
          <h2>История заявки</h2>
          <ol className="timeline">{item.history.map((entry) => <li key={entry.version}>
            <strong>{statusLabel[entry.toStatus]}</strong>
            <span className="row-meta">{date(entry.createdAt)} · {entry.actorKind === "student" ? "Студент" : "Кабинет"}</span>
            {entry.reason && <p>{entry.reason}</p>}
          </li>)}</ol>
        </section>
      </>}
    </Resource>
  </>;
}

export function RequestView({ screen, search, id, profile, memory, onUnauthorized, atlas }: {
  screen: RequestScreen; search: Search; id?: string; profile: Profile; memory: RequestMemory; onUnauthorized: () => void; atlas?: boolean;
}) {
  if (screen === "requestNew") return <NewRequest key={String(search.kind ?? "")} search={search} profile={profile} memory={memory} onUnauthorized={onUnauthorized} atlas={atlas} />;
  if (screen === "requestDetail") return <Detail id={id ?? ""} search={search} memory={memory} onUnauthorized={onUnauthorized} />;
  return <Requests search={search} onUnauthorized={onUnauthorized} />;
}
