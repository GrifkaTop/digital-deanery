"use client";

import { ProgressRing } from "./progress-ring";
import { useProgressEntrance } from "./use-progress-entrance";

export function LiveStudyScore({ score, maximum }: { score: number | null; maximum: number }) {
  const progress = useProgressEntrance(true, score);
  if (maximum <= 0) return null;

  const precision = String(score).split(".")[1]?.length ?? 0;
  const value = score === null ? "—" : Number((score * progress).toFixed(precision));
  const fill = score === null ? 0 : Math.min(100, Math.max(0, score / maximum * 100)) * progress;
  const label = score === null ? "Баллы за семестр не опубликованы" : "Баллы за семестр: " + score + " из " + maximum;
  return <ProgressRing fill={fill} value={value} maximum={maximum} label={label}/>;
}
