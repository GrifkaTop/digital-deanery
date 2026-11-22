"use client";

import type { z } from "zod";
import { deadlinesResponse } from "@/contracts/academics";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { assignmentLabel } from "@/contracts/assignments";
import { dateInMoscow } from "@/contracts/calendar";
import type { AcademicCategory } from "./academic-categories";
import { DeadlineBoard, type DeadlineBoardItem } from "./deadline-list";

type DeadlineList = z.infer<typeof deadlinesResponse>;
type LiveDeadlineItem = DeadlineList["items"][number];

const routes = { assignment: "work", discipline: "study", request: "requests" } as const;
const categories = new Map<string, AcademicCategory>([["dz", "homework"], ["rk", "control"], ["lr", "lab"]]);

function deadlineCard(item: LiveDeadlineItem): DeadlineBoardItem {
  const { target } = item;
  const assignment = target.kind === "assignment" ? target : undefined;
  const tag = assignment ? assignmentLabel(assignment.workKind, assignment.number)
    : target.kind === "request" ? "Заявка" : "Учебная работа";
  const category = assignment ? categories.get(assignment.workKind)
    : target.kind === "request" ? "request" : undefined;
  const back = "?back=%23deadlines";
  const title = item.title.startsWith(tag + " · ") ? item.title.slice(tag.length + 3) : item.title;

  return {
    id: item.id,
    dueOn: dateInMoscow(item.dueAt),
    subject: item.subjectTitle,
    title,
    tag,
    category,
    href: "#" + routes[target.kind] + "/" + target.id + back,
  };
}

export function LiveDeadlineBoard({ data }: { data: DeadlineList }) {
  return <DeadlineBoard today={data.today} items={data.items.map(deadlineCard)}/>;
}

export function LiveDeadlines() {
  const auth = useAtlasSession();
  if (!auth) return null;
  return <Resource url="/api/v1/deadlines" schema={deadlinesResponse} onUnauthorized={auth.onUnauthorized}>
    {data => <LiveDeadlineBoard data={data}/>}
  </Resource>;
}
