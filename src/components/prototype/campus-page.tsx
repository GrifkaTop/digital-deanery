import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import "./campus-page.css";

export function CampusPage({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return <div className="campus-page">
    <a className="campus-back" href="#profile"><ArrowLeft size={18} aria-hidden="true"/>К профилю</a>
    <header className="campus-heading">
      <span className="campus-heading-icon"><Icon aria-hidden="true" size={27}/></span>
      <div>
        <h1 id="campus-page-title" tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
    {children}
  </div>;
}
