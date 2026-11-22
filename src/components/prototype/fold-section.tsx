"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { readFoldPreference, writeFoldPreference } from "./atlas-ui-preferences";
import "./fold-section.css";

export function FoldBody({ id, className, expanded, desktopExpanded, children }: {
  id: string;
  className?: string;
  expanded: boolean;
  desktopExpanded?: boolean;
  children: ReactNode;
}) {
  return <div id={id} className="pf-reveal" data-fold-closed={!expanded || undefined}
    data-desktop-expanded={desktopExpanded || undefined} inert={!expanded && !desktopExpanded}>
    <div className="pf-reveal-inner">
      <div className={className}>{children}</div>
    </div>
  </div>;
}

export function FoldSection({ title, headingId, className, headingClassName, bodyClassName, leading, meta, children, level = 2, beforeHeading, desktopExpanded }: {
  title: string;
  headingId?: string;
  className?: string;
  headingClassName?: string;
  bodyClassName?: string;
  leading?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  level?: 1 | 2;
  beforeHeading?: ReactNode;
  desktopExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(readFoldPreference(headingId) ?? true); }, [headingId]);
  const id = useId();
  const heading = headingId ?? `${id}-heading`;
  const content = `${id}-content`;
  const Heading = level === 1 ? "h1" : "h2";

  return <section className={`pf-section${className ? ` ${className}` : ""}`} aria-labelledby={heading} data-fold-open={expanded} data-desktop-expanded={desktopExpanded || undefined}>
    {beforeHeading}
    <Heading id={heading} tabIndex={level === 1 ? -1 : undefined} aria-label={title} className={`pf-heading${headingClassName ? ` ${headingClassName}` : ""}`}>
      <button type="button" className="pf-toggle" aria-label={title} aria-expanded={expanded} aria-controls={content} onClick={() => {
        const next = !expanded;
        setExpanded(next);
        writeFoldPreference(headingId, next);
      }}>
        <span className="pf-title">{leading}<span>{title}</span></span>
        <span className="pf-trailing">{meta}<ChevronDown className="pf-chevron" size={19} aria-hidden="true"/></span>
      </button>
      {desktopExpanded && <span className="pf-desktop-title">{leading}<span>{title}</span>{meta}</span>}
    </Heading>
    <FoldBody id={content} className={bodyClassName} expanded={expanded} desktopExpanded={desktopExpanded}>{children}</FoldBody>
  </section>;
}
