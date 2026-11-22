"use client";

import { useCallback, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type RefObject } from "react";
import "./atlas-textarea.css";

function usesNativeSizing() {
  return typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
}

function fitHeight(field: HTMLTextAreaElement) {
  if (!field.offsetWidth) return;
  const scroll = field.scrollTop;
  field.style.height = "auto";
  const borders = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + borders}px`;
  field.scrollTop = scroll;
}

export function AtlasTextarea({ className, fieldRef, inputRef, value, ...props }: ComponentPropsWithoutRef<"textarea"> & {
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  inputRef?: (element: HTMLTextAreaElement | null) => void;
  value: string;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = fieldRef ?? localRef;
  const mergeRef = useCallback((element: HTMLTextAreaElement | null) => {
    ref.current = element;
    inputRef?.(element);
  }, [inputRef, ref]);

  useLayoutEffect(() => {
    if (ref.current && !usesNativeSizing()) fitHeight(ref.current);
  }, [ref, value]);

  useLayoutEffect(() => {
    const field = ref.current;
    if (!field || usesNativeSizing()) return;
    let width = field.offsetWidth;
    const fitOnWidthChange = () => {
      if (field.offsetWidth === width) return;
      width = field.offsetWidth;
      fitHeight(field);
    };
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fitOnWidthChange);
      return () => window.removeEventListener("resize", fitOnWidthChange);
    }
    const observer = new ResizeObserver(fitOnWidthChange);
    observer.observe(field);
    return () => observer.disconnect();
  }, [ref]);

  return <textarea {...props} ref={inputRef ? mergeRef : ref} value={value} className={className ? `atlas-autogrow ${className}` : "atlas-autogrow"}/>;
}
