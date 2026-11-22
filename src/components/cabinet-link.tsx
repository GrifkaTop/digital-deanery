"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function CabinetLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const path = usePathname();
  if ((path === "/" || path === "/prototype") && href.startsWith("/") && !href.startsWith("//")) {
    const match = /^\/(today|schedule|study|assignments|teachers|sports|requests|inbox|profile|library)(\/[^?#]*)?(\?[^#]*)?$/.exec(href);
    if (match) {
      const base = match[1] === "schedule" && match[2] ? "lesson" : match[1] === "assignments" ? "work" : match[1] === "teachers" ? "teacher" : match[1];
      href = "#" + base + (match[2] ?? "") + (match[3] ?? "");
    }
  }
  if ((path === "/" || path === "/prototype") && href.startsWith("#")) return <a {...props as React.ComponentProps<"a">} href={href} onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>} />;
  return <Link href={href} {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || props.target || props.download) return;

    const target = new URL(href, window.location.href);
    if (target.origin === window.location.origin && target.pathname === window.location.pathname &&
        target.search !== window.location.search && !target.hash) {
      event.preventDefault();
      window.history.pushState(null, "", target.pathname + target.search);
    }
  }} />;
}
