import "server-only";
import { z } from "zod";

export function visibilityNow() {
  const fixed = process.env.DEMO_ACADEMIC_NOW;
  if (fixed && /^https:\/\/localhost(?::[0-9]{1,5})?$/.test(process.env.APP_ORIGIN ?? "")) {
    const parsed = z.iso.datetime().parse(fixed);
    return new Date(parsed);
  }
  return new Date();
}

