import { scheduleTagCategory } from "./academic-categories";
import type { scheduleWorkCounts } from "./work-route";

export function ScheduleWorkCounters({ counts, descriptionId }: {
  counts: ReturnType<typeof scheduleWorkCounts>;
  descriptionId: string;
}) {
  const { homework, review } = counts;
  if (!homework && !review) return null;

  const description = [homework > 0 && `Домашние задания: ${homework}`, review > 0 && `Рубежные контроли: ${review}`]
    .filter(Boolean).join(". ");

  return <>
    <span id={descriptionId} hidden>{description}</span>
    <span className="sg-date-work" aria-hidden="true">
      {homework > 0 && <span data-work="ДЗ" data-academic-category={scheduleTagCategory["ДЗ"]}>{homework} ДЗ</span>}
      {review > 0 && <span data-work="РК" data-academic-category={scheduleTagCategory["РК1"]}>{review} РК</span>}
    </span>
  </>;
}
