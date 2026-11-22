"use client";

import { useEffect, useRef } from "react";

const intervalMs = 60_000;

export function useQwenWarmup(generation: number | null) {
  const lastSignal = useRef(-Infinity);

  useEffect(() => {
    if (generation === null) return;
    const controller = new AbortController();
    const warmup = (event?: Event) => {
      if (document.hidden || (event && !event.isTrusted) || performance.now() - lastSignal.current < intervalMs) return;
      lastSignal.current = performance.now();
      void fetch("/api/v1/assistant/warmup", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "X-Qwen-Warmup": "1" },
      }).catch(() => {});
    };

    window.addEventListener("pointerdown", warmup, { passive: true });
    window.addEventListener("wheel", warmup, { passive: true });
    window.addEventListener("keydown", warmup);
    const suspend = () => {
      if (document.hidden) controller.abort();
    };
    const abort = () => controller.abort();
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("pagehide", abort);
    warmup();

    return () => {
      abort();
      window.removeEventListener("pointerdown", warmup);
      window.removeEventListener("wheel", warmup);
      window.removeEventListener("keydown", warmup);
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("pagehide", abort);
    };
  }, [generation]);
}
