import { ProgressRing } from "./progress-ring";
import "./published-work-score.css";

type WorkScore = { points: number; maxPoints: number };

export function PublishedWorkScore({ points, maxPoints, id }: { points: number; maxPoints?: number; id?: string }) {
  return <dl className="p-work-score" id={id}>
    <dt>Баллы</dt>
    <dd><strong>{points}</strong>{maxPoints !== undefined && <> <span>из {maxPoints}</span></>}</dd>
  </dl>;
}

export function WorkScoreBadge({ points, maxPoints }: WorkScore) {
  const fill = maxPoints > 0 ? Math.min(100, Math.max(0, (100 * points) / maxPoints)) : 0;
  return <span className="p-work-score-badge">
    <ProgressRing fill={fill} value={points} maximum={maxPoints}/>
    <span className="sr-only">Баллы: {points} из {maxPoints}</span>
  </span>;
}
