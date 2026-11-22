import "./progress-ring.css";

export function ProgressRing({ fill, value, maximum, label, className }: {
  fill: number;
  value: number | string;
  maximum: number | null;
  label?: string;
  className?: string;
}) {
  return <span className={className ? `p-progress-ring ${className}` : "p-progress-ring"}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <svg viewBox="0 0 48 48" fill="none" strokeWidth="3" aria-hidden="true">
      <circle className="p-progress-ring-track" cx="24" cy="24" r="20"/>
      <circle className="p-progress-ring-arc" cx="24" cy="24" r="20" pathLength="100"
        strokeDasharray={`${fill} 100`} strokeLinecap="round" visibility={fill === 0 ? "hidden" : undefined}
        transform="rotate(-90 24 24)"/>
    </svg>
    <span className="p-progress-ring-value" aria-hidden="true">
      <span className="p-progress-ring-earned">{value}</span>
      {maximum !== null && <span className="p-progress-ring-maximum">/{maximum}</span>}
    </span>
  </span>;
}
