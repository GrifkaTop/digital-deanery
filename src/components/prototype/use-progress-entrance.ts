import { useLayoutEffect, useState } from "react";

const duration = 840;

export function useProgressEntrance(visible: boolean, target: number | null) {
  const [progress, setProgress] = useState(1);

  useLayoutEffect(() => {
    if (!visible || !target) return;

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      setProgress(1);
      return;
    }

    const start = performance.now();
    let frame: number;
    function update(now: number) {
      const elapsed = Math.min(Math.max((now - start) / duration, 0), 1);
      setProgress(1 - (1 - elapsed) ** 3);
      if (elapsed < 1) frame = requestAnimationFrame(update);
    }
    function finish() {
      cancelAnimationFrame(frame);
      setProgress(1);
    }

    setProgress(0);
    frame = requestAnimationFrame(update);
    motion.addEventListener("change", finish);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", finish);
    };
  }, [target, visible]);

  return progress;
}
