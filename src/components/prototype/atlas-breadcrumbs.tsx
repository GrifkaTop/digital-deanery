import type { MouseEventHandler } from "react";
import { ChevronRight, House } from "lucide-react";
import "./atlas-breadcrumbs.css";

type AtlasCrumb =
  | { label: string; href: string; onClick?: MouseEventHandler<HTMLAnchorElement> }
  | { label: string; onSelect: () => void };

export function AtlasBreadcrumbs({ parents = [], current, className, onHome }: {
  parents?: readonly AtlasCrumb[];
  current: string;
  className?: string;
  onHome?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return <nav className={`atlas-breadcrumbs${className ? ` ${className}` : ""}`} aria-label="Путь к странице">
    <ol role="list">
      <li><a href="#today" className="atlas-breadcrumb-home p-route-back" aria-label="Главная" onClick={event => {
        onHome?.(event);
        if (!event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      }}><House size={17} aria-hidden="true"/></a></li>
      {parents.map(crumb => <li key={crumb.label}>
        <ChevronRight size={14} aria-hidden="true"/>
        {"href" in crumb
          ? <a href={crumb.href} className="p-route-back" onClick={crumb.onClick}>{crumb.label}</a>
          : <button type="button" onClick={crumb.onSelect}>{crumb.label}</button>}
      </li>)}
      <li><ChevronRight size={14} aria-hidden="true"/><span aria-current="page">{current}</span></li>
    </ol>
  </nav>;
}
