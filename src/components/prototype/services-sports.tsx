"use client";
import { useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, CalendarDays, ChartNoAxesColumn, Check, FileText, HeartPulse, MapPin, Search, UserRound, Waves } from "lucide-react";
import { AtlasTextarea } from "./atlas-textarea";
import { FoldSection } from "./fold-section";
import { bulletinDate, demoHomeDate } from "./home-content";
import { ProgressRing } from "./progress-ring";
import { createDemoRequest, initialDemoRequests, replyToDemoRequest } from "./request-demo";
import { PrototypeRequests } from "./request-pages";
import { compareSportsNorm, healthPassport, passportValidity, sportsMinimumPoints, sportsSemesters, type SportsNorm, type SportsSemester } from "./sports-demo";
import { useProgressEntrance } from "./use-progress-entrance";
import "./services-sports.css";

const services = [
  { name: "Справка об обучении", category: "Документы", description: "Подтверждение статуса студента для предоставления по месту требования." },
  { name: "Справка о стипендии", category: "Документы", description: "Сведения о назначенной стипендии за выбранный период." },
  { name: "Перенос консультации", category: "Учёба", description: "Запросите другую дату консультации с преподавателем." },
  { name: "Индивидуальный график", category: "Учёба", description: "Подайте обращение об изменении графика обучения." },
  { name: "Место в общежитии", category: "Кампус", description: "Обратитесь по вопросу проживания в общежитии." },
  { name: "Пропуск в кампус", category: "Кампус", description: "Оставьте запрос на оформление или замену пропуска." },
];
export function ServicesPrototype() {
  const [section, setSection] = useState<"catalog" | "requests">("catalog");
  const [category, setCategory] = useState("Все");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<(typeof services)[number] | null>(null);
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState(false);
  const [requests, setRequests] = useState(initialDemoRequests);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const filtered = services.filter((item) => (category === "Все" || item.category === category) && (item.name + " " + item.description).toLowerCase().includes(search.toLowerCase().trim()));
  function begin(item: (typeof services)[number]) { setSelected(item); setStep(1); setPurpose(""); setDetails(""); setError(false); }
  function next() { if (!purpose.trim()) { setError(true); return; } setError(false); setStep(2); }
  function submit() {
    if (!selected) return;
    const now = new Date().toISOString();
    setRequests(current => [createDemoRequest(current, { name: selected.name, purpose, details }, now), ...current]);
    setStep(3);
  }
  function answerRequest(id: number, answer: string) {
    const now = new Date().toISOString();
    setRequests(current => replyToDemoRequest(current, id, answer, now));
  }
  function close() { setSelected(null); setStep(0); }
  return <div className="ss-page">
    <header className="ss-header ss-services-heading"><h1 ref={pageHeading} tabIndex={-1}>Услуги и заявки</h1><span className="ss-demo">Демонстрационные данные</span></header>
    <nav className="ss-tabs" aria-label="Разделы услуг">
      <button type="button" aria-current={section === "catalog" ? "page" : undefined} onClick={() => { setSection("catalog"); setSelected(null); setStep(0); }}>Каталог услуг</button>
      <button type="button" aria-current={section === "requests" ? "page" : undefined} onClick={() => { setSection("requests"); setSelected(null); setStep(0); }}>Мои заявки <span>{requests.length}</span></button>
    </nav>
    <div hidden={section !== "catalog"}>
    {selected ? <section className="ss-form ss-panel">
      <div className="ss-form-toolbar"><button className="ss-back" onClick={close}><ArrowLeft size={18} aria-hidden="true"/> К каталогу</button>{step < 3 && <span className="ss-step">Шаг {step} из 2</span>}</div>
      {step < 3 ? <><h2>{step === 1 ? selected.name : "Проверьте заявку"}</h2>{step === 1 && <p className="ss-muted">{selected.description}</p>}
        {step === 1 ? <div className="ss-fields"><label>Цель обращения <span aria-hidden="true">*</span><input value={purpose} onChange={(e) => { setPurpose(e.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? "ss-purpose-error" : undefined} placeholder="Например, по месту требования" /></label>{error && <p className="ss-error" id="ss-purpose-error">Укажите цель обращения, чтобы продолжить.</p>}<label>Дополнительные сведения <span className="ss-optional">· необязательно</span><AtlasTextarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="Добавьте детали, которые помогут рассмотреть заявку" /></label><button className="ss-primary" onClick={next}>Продолжить <ArrowRight size={18}/></button></div> : <><dl className="ss-review"><div><dt>Услуга</dt><dd>{selected.name}</dd></div><div><dt>Цель</dt><dd>{purpose}</dd></div><div><dt>Дополнительно</dt><dd>{details || "Не указано"}</dd></div></dl><div className="ss-actions"><button className="ss-secondary" onClick={() => setStep(1)}>Изменить</button><button className="ss-primary" onClick={submit}>Отправить заявку <ArrowRight size={18}/></button></div></>}
      </> : <div className="ss-success"><span className="ss-success-icon"><Check size={25}/></span><h2>Заявка принята</h2><p>Она появилась в разделе «Мои заявки». Это демонстрация: после перезагрузки данные исчезнут.</p><button className="ss-primary" onClick={() => { close(); setSection("requests"); }}>Перейти к заявкам</button></div>}
    </section> : <><div className="ss-tools"><div className="ss-filter" role="group" aria-label="Категория услуг">{["Все", "Документы", "Учёба", "Кампус"].map((c) => <button key={c} className={category === c ? "active" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="ss-search"><Search size={19}/><span className="ss-sr">Поиск услуг</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск услуги" /></label></div><div className="ss-service-list">{filtered.map((item) => <article className="ss-service" key={item.name}><div className="ss-service-icon"><FileText size={21}/></div><div><h2>{item.name}</h2><span className="ss-category">{item.category}</span><p>{item.description}</p></div><button className="ss-open" onClick={() => begin(item)} aria-label={"Оформить: " + item.name}>Оформить <ArrowRight size={18}/></button></article>)}{filtered.length === 0 && <div className="ss-empty"><h2>Ничего не найдено</h2><p>Попробуйте изменить запрос или категорию.</p><button className="ss-secondary" onClick={() => { setSearch(""); setCategory("Все"); }}>Сбросить фильтры</button></div>}</div>
    </>}
    </div>
    <PrototypeRequests items={requests} visible={section === "requests"} heading={pageHeading} onAnswer={answerRequest}/>
  </div>;
}

const sports = {
  "Занятия": [
    { id: "yoga", name: "Йога", date: "2026-11-23", time: "18:00–19:00", teacher: "Марина Белова", place: "Зал движения", capacity: 16, occupied: 12 },
    { id: "volley", name: "Волейбол", date: "2026-11-25", time: "17:00–18:30", teacher: "Илья Соколов", place: "Игровой зал", capacity: 20, occupied: 19 },
  ],
  "Отработки": [
    { id: "training", name: "Общая физическая подготовка", date: "2026-11-27", time: "16:00–17:00", teacher: "Анна Орлова", place: "Спортивный зал", capacity: 15, occupied: 10 },
  ],
  "Бассейн": [
    { id: "swim", name: "Свободное плавание", date: "2026-11-28", time: "10:00–11:00", teacher: "Дмитрий Лебедев", place: "Бассейн · дорожки 1–3", capacity: 12, occupied: 12 },
    { id: "swim2", name: "Свободное плавание", date: "2026-11-28", time: "11:00–12:00", teacher: "Дмитрий Лебедев", place: "Бассейн · дорожки 1–3", capacity: 12, occupied: 8 },
  ],
};
export type SportTab = keyof typeof sports;
export type SportSession = { id: string; name: string; date: string; time: string; teacher: string; place: string; capacity: number; occupied: number; bookingOpen?: boolean };
type DisplaySportTerm = Omit<SportsSemester, "goal" | "points"> & {
  goal: number | null; points: number | null; minimumPoints?: number | null; result?: string | null;
};
export type LiveSportData = {
  today: string;
  passport: { group: string | null; validThrough: string; admitted?: boolean } | null;
  terms: readonly DisplaySportTerm[];
  currentId?: string;
  groups: Record<SportTab, SportSession[]>;
  booked: string[];
  pendingId: string | null;
  error?: string;
  onBooking: (id: string, cancel: boolean) => void;
};
const sportDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const passportDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayCountFormat = new Intl.NumberFormat("ru-RU", { style: "unit", unit: "day", unitDisplay: "long" });
const validityLabels = { valid: "Действует", expiring: "Скоро истекает", expired: "Срок истёк" };
const sportDate = (date: string) => sportDateFormat.format(bulletinDate(date));
const sessionTime = (item: SportSession) => `${sportDate(item.date)} · ${item.time}`;
const normStatusLabels = { passed: "Сдан", failed: "Не сдан", unattempted: "Не сдавался" };
const normNumberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const normMeasurement = (value: number, unit: SportsNorm["unit"]) => `${normNumberFormat.format(value)} ${unit}`;

function AttendanceRing({ visible, attended, goal }: { visible: boolean; attended: number; goal: number }) {
  const progress = useProgressEntrance(visible, attended);
  const fill = (goal === 0 ? 100 : Math.min(100, attended / goal * 100)) * progress;
  const count = Math.round(attended * progress);
  return <ProgressRing className="ss-ring" fill={fill} value={count} maximum={goal}/>;
}

function SportsSemesterProgress({ semester, visible }: { semester: DisplaySportTerm; visible: boolean }) {
  const { goal, minimumPoints = sportsMinimumPoints, points, attended } = semester;
  const passed = goal === null || points === null || minimumPoints === null ? null : attended >= goal && points >= minimumPoints;
  const conditions = [
    { name: "Баллы", value: points, required: minimumPoints },
    { name: "Посещения", value: attended, required: goal },
  ];

  return <div aria-live="polite">
    <div className="ss-progress-layout">
      {goal !== null && <AttendanceRing key={semester.id} visible={visible} attended={attended} goal={goal}/>}
      <div className="ss-progress-summary">
        <p><strong>Итог по семестру</strong></p>
        <p className="ss-pass-outcome" data-passed={passed ?? undefined}>{passed === null
          ? semester.result ?? "Итог не опубликован"
          : passed ? "Условия зачёта выполнены" : "Условия зачёта ещё не выполнены"}</p>
      </div>
    </div>
    <dl className="ss-pass-criteria" aria-label="Условия зачёта">
      {conditions.map(({ name, value, required }) => {
        const met = value !== null && required !== null ? value >= required : null;
        return <div key={name}>
          <dt>{name}</dt>
          <dd><strong>{value ?? "Не опубликованы"}</strong>{required !== null && ` · минимум ${required}`}</dd>
          {met !== null && <dd className="ss-pass-note" data-met={met}>{met ? "Условие выполнено" : `Осталось: ${required! - value!}`}</dd>}
        </div>;
      })}
    </dl>
  </div>;
}

function SportsNorms({ semester, terms }: { semester: DisplaySportTerm; terms: readonly DisplaySportTerm[] }) {
  return <FoldSection title="Нормативы" headingId="ss-norms-title" className="ss-sport-card ss-norms" headingClassName="ss-sport-heading" bodyClassName="ss-sport-body">
    <p className="ss-norms-period">{semester.label}</p>
    {semester.norms.length > 0 ? <ul className="ss-norm-list">
      {semester.norms.map(norm => {
        const comparison = compareSportsNorm(semester, norm, terms);
        const improvement = comparison?.improvement ?? 0;
        const trend = improvement > 0 ? "better" : improvement < 0 ? "worse" : "same";
        const change = improvement ? normMeasurement(Math.abs(improvement), norm.unit) : "";
        const comparisonText = improvement > 0 ? `Лучше на ${change}` : improvement < 0 ? `Хуже на ${change}` : "Без изменений";

        return <li key={norm.id}>
          <div className="ss-norm-heading">
            <h3>{norm.title}</h3><span className="ss-norm-status" data-status={norm.status}>{normStatusLabels[norm.status]}</span>
          </div>
          <dl className="ss-norm-results">
            <div><dt>Результат</dt><dd>{norm.result === null ? "Нет результата" : normMeasurement(norm.result, norm.unit)}</dd></div>
            {comparison && <div><dt>Год назад</dt><dd>{normMeasurement(comparison.priorResult, norm.unit)}</dd></div>}
          </dl>
          {comparison && <p className="ss-norm-trend" data-trend={trend}>{comparisonText}</p>}
        </li>;
      })}
    </ul> : <p className="ss-norms-empty">За этот семестр нормативы не опубликованы.</p>}
  </FoldSection>;
}

export function SportsPrototype({ visible, live }: { visible: boolean; live?: LiveSportData }) {
  const [tab, setTab] = useState<SportTab>("Занятия");
  const [demoBooked, setDemoBooked] = useState<string[]>(["yoga"]);
  const [semesterId, setSemesterId] = useState("");
  const terms = live?.terms ?? sportsSemesters;
  const semester = terms.find(item => item.id === semesterId)
    ?? terms.find(item => item.id === live?.currentId) ?? terms[0];
  const groups: Record<SportTab, SportSession[]> = live?.groups ?? sports;
  const booked = live?.booked ?? demoBooked;
  const reservations = Object.values(groups).flat().filter(item => booked.includes(item.id));
  const passport = live ? live.passport : { ...healthPassport, admitted: true };
  const validity = passport && passportValidity(passport.validThrough, live?.today ?? demoHomeDate);
  const expiryNote = !validity || validity.daysRemaining === 0 ? "Сегодня последний день действия." : `До окончания ${dayCountFormat.format(validity.daysRemaining)}.`;
  function toggleBooking(id: string) {
    if (live) { live.onBooking(id, booked.includes(id)); return; }
    setDemoBooked(current => current.includes(id) ? current.filter(existing => existing !== id) : current.length < 2 ? [...current, id] : current);
  }
  function cancelReservation(id: string) {
    toggleBooking(id);
    document.querySelector<HTMLButtonElement>("#ss-reservations-title > button")?.focus();
  }
  return <div className="ss-page">
    <header className="ss-header"><div><h1>Физкультура</h1></div><span className="ss-demo">{live ? "Демонстрационные данные" : "Демонстрация · данные не сохраняются"}</span></header>
    <div className="ss-sport-overview">
      <div className="ss-sport-overview-main">
      <FoldSection title="Медицинский допуск" headingId="ss-passport-title" className="ss-sport-card ss-passport" headingClassName="ss-sport-heading" bodyClassName="ss-sport-body" leading={<HeartPulse size={21} aria-hidden="true"/>}>
        {passport && validity ? <>
        <span className="ss-expiry" data-validity={validity.kind}>{passport.admitted === false ? "Допуск не подтверждён" : validityLabels[validity.kind]}</span>
        <dl className="ss-passport-facts">
          <div><dt>Медицинская группа</dt><dd>{passport.group ?? "Не указана"}</dd></div>
          <div><dt>Действует по</dt><dd><time dateTime={passport.validThrough}>{passportDateFormat.format(bulletinDate(passport.validThrough))}</time></dd><dd className="ss-validity-inclusive">включительно</dd></div>
        </dl>
        {validity.kind !== "valid" && <p className="ss-passport-note">{validity.kind === "expiring" && `${expiryNote} `}Для продления обратитесь в медицинский кабинет.</p>}
        </> : <p className="ss-reservations-empty">Сведения о допуске пока не опубликованы.</p>}
      </FoldSection>
      {semester && <SportsNorms semester={semester} terms={terms}/>}
      </div>
      <FoldSection title="Условия зачёта" headingId="ss-progress-title" className="ss-sport-card ss-progress" headingClassName="ss-sport-heading" bodyClassName="ss-sport-body" leading={<ChartNoAxesColumn size={21} aria-hidden="true"/>}>
        {semester ? <><label className="ss-sport-semester">Семестр
          <select value={semester.id} onChange={event => setSemesterId(event.target.value)}>
            {terms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <SportsSemesterProgress semester={semester} visible={visible}/>
        <small>Учитываются только состоявшиеся посещения.</small></> : <p className="ss-reservations-empty">Итоги посещений пока не опубликованы.</p>}
      </FoldSection>
    </div>
    <FoldSection title="Мои записи" headingId="ss-reservations-title" className="ss-sport-card ss-reservations" headingClassName="ss-sport-heading" bodyClassName="ss-sport-body" meta={<span className="ss-reservations-count">{booked.length} из 2</span>}>
      {live?.error && <p className="ss-error" role="alert">{live.error}</p>}
      <p className="ss-reservations-note"><span className="ss-sr">Активных записей: {booked.length} из 2. </span>Можно записаться максимум на два занятия одновременно.</p>
      {reservations.length === 0 ? <p className="ss-reservations-empty">Записей пока нет. Выберите занятие ниже.</p> : <div className="ss-reservation-list">{reservations.map(item => <article className="ss-reservation" key={item.id}>
        <header><span className="ss-service-icon"><CalendarDays size={21} aria-hidden="true"/></span><div><h3>{item.name}</h3><p><time dateTime={item.date}>{sportDate(item.date)}</time> · {item.time}</p></div></header>
        <dl><div><dt><UserRound size={16} aria-hidden="true"/>Преподаватель</dt><dd>{item.teacher}</dd></div><div><dt><MapPin size={16} aria-hidden="true"/>Место</dt><dd>{item.place}</dd></div></dl>
        <button type="button" className="ss-secondary" disabled={Boolean(live?.pendingId)} onClick={() => cancelReservation(item.id)} aria-label={`Отменить запись: ${item.name}, ${sessionTime(item)}`}>Отменить запись</button>
      </article>)}</div>}
    </FoldSection>
    <FoldSection title="Запись на занятия" headingId="ss-booking-title" className="ss-sport-card ss-booking" headingClassName="ss-sport-heading" bodyClassName="ss-sport-body" leading={<CalendarDays size={21} aria-hidden="true"/>}>
      <nav className="ss-tabs" aria-label="Виды занятий">{(Object.keys(groups) as SportTab[]).map((name) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
      {booked.length >= 2 && <p className="ss-limit" role="status">Вы записаны на два занятия. Отмените запись, чтобы выбрать другое.</p>}
      <div className="ss-sport-list">{groups[tab].map((item) => {
        const isBooked = booked.includes(item.id);
        const remaining = Math.max(0, item.capacity - item.occupied - (isBooked ? 1 : 0));
        const limitReached = booked.length >= 2;
        return <article className="ss-sport-row" key={item.id}>
          <div className="ss-service-icon">{tab === "Бассейн" ? <Waves size={21}/> : <Activity size={21}/>}</div>
          <div className="ss-sport-info"><h3>{item.name}</h3><p>{sessionTime(item)} · {item.place}</p><p>Преподаватель: {item.teacher}</p><span className={remaining === 0 ? "ss-full" : "ss-availability"}>{remaining === 0 ? "Свободных мест нет" : "Свободно мест: " + remaining + " из " + item.capacity}</span>{isBooked && <span className="ss-booked">Вы записаны</span>}</div>
          <button className={isBooked ? "ss-secondary" : "ss-primary"} disabled={Boolean(live?.pendingId) || !isBooked && (remaining === 0 || limitReached || item.bookingOpen === false)} onClick={() => toggleBooking(item.id)} aria-label={(isBooked ? "Отменить запись: " : "Записаться: ") + item.name + ", " + sessionTime(item)}>{isBooked ? "Отменить запись" : item.bookingOpen === false ? "Запись закрыта" : "Записаться"}</button>
        </article>;
      })}</div>
      {groups[tab].length === 0 && <p className="ss-reservations-empty">Для этого раздела занятий пока нет.</p>}
    </FoldSection>
  </div>;
}
