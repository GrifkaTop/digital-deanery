export type DemoRequestStatus = "accepted" | "in-progress" | "needs-answer" | "ready";
export type DemoRequestFilter = "all" | "active" | "ready";

export type DemoRequest = {
  id: number;
  publicNo: string;
  name: string;
  purpose: string;
  details: string;
  status: DemoRequestStatus;
  createdAt: string;
  clarification?: string;
  history: readonly { status: DemoRequestStatus; at: string; note?: string }[];
};

const consultationQuestion = "Укажите, в какой день и время вы сможете прийти на консультацию.";

export const initialDemoRequests: DemoRequest[] = [
  {
    id: 3, publicNo: "ДЕМО-2026-003", name: "Справка об обучении", purpose: "По месту требования", details: "",
    status: "ready", createdAt: "2026-11-17T07:20:00.000Z",
    history: [
      { status: "accepted", at: "2026-11-17T07:20:00.000Z" },
      { status: "in-progress", at: "2026-11-17T07:35:00.000Z" },
      { status: "ready", at: "2026-11-17T08:10:00.000Z", note: "Подготовлен демонстрационный образец справки." },
    ],
  },
  {
    id: 2, publicNo: "ДЕМО-2026-002", name: "Перенос консультации", purpose: "Выбрать другое время", details: "",
    status: "needs-answer", createdAt: "2026-11-16T08:15:00.000Z", clarification: consultationQuestion,
    history: [
      { status: "accepted", at: "2026-11-16T08:15:00.000Z" },
      { status: "in-progress", at: "2026-11-16T10:00:00.000Z" },
      { status: "needs-answer", at: "2026-11-17T07:45:00.000Z", note: consultationQuestion },
    ],
  },
  {
    id: 1, publicNo: "ДЕМО-2026-001", name: "Место в общежитии", purpose: "Подать заявление на проживание", details: "",
    status: "in-progress", createdAt: "2026-11-13T12:10:00.000Z",
    history: [
      { status: "accepted", at: "2026-11-13T12:10:00.000Z" },
      { status: "in-progress", at: "2026-11-16T09:30:00.000Z" },
    ],
  },
];

export function filterDemoRequests(requests: readonly DemoRequest[], filter: DemoRequestFilter) {
  if (filter === "all") return requests;
  return requests.filter(request => filter === "ready" ? request.status === "ready" : request.status !== "ready");
}

export function createDemoRequest(requests: readonly DemoRequest[], draft: Pick<DemoRequest, "name" | "purpose" | "details">, now: string): DemoRequest {
  const id = requests.reduce((highest, request) => Math.max(highest, request.id), 0) + 1;
  return {
    id,
    publicNo: `ДЕМО-${now.slice(0, 4)}-${String(id).padStart(3, "0")}`,
    name: draft.name,
    purpose: draft.purpose.trim(),
    details: draft.details.trim(),
    status: "accepted",
    createdAt: now,
    history: [{ status: "accepted", at: now }],
  };
}

export function replyToDemoRequest(requests: DemoRequest[], id: number, reply: string, now: string): DemoRequest[] {
  if (!reply.trim()) return requests;
  const index = requests.findIndex(request => request.id === id && request.status === "needs-answer");
  if (index === -1) return requests;
  const request = requests[index];
  return requests.with(index, {
    ...request,
    status: "in-progress",
    clarification: undefined,
    history: [...request.history, { status: "in-progress", at: now, note: reply }],
  });
}
