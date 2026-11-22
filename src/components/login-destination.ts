import { z } from "zod";
import { scheduleQuery, studyQuery } from "@/contracts/academics";
import { inboxFilter } from "@/contracts/inbox";
import { librarySubject } from "@/contracts/library";
import { requestFilter, requestKinds } from "@/contracts/requests";

export const atlasPath = "/";
export const atlasLoginHref = "/login?next=%2F";

const cabinetPaths = /^\/(?:today(?:\/assistant(?:\/documents\/[a-z0-9-]+)?)?|profile|schedule(?:\/[\w-]+)?|study(?:\/[\w-]+)?|requests(?:\/[\w-]+)?|inbox(?:\/[\w-]+)?|assignments\/[\w-]+|sports|search|teachers\/[\w-]+)$/;
const atlasSections = /^#(?:today|schedule|search|study|session|plan|services|sports|inbox|profile|settings|deadlines|assistant|events|all-events|news|clinic|vuc|military|library|library-loans|requests)$/u;
const atlasDetails = /^#(?:(?:study|teacher|group|news|events|lesson|inbox|requests)\/[a-z0-9-]+|library\/[a-z0-9-]+(?:\/read)?|work\/(?:[a-z0-9-]+)|work\/(?:[a-z0-9-]+\/[a-z0-9-]+|lesson\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/(?:homework|control)))$/u;

const scheduleParameters = { date: scheduleQuery.shape.date, view: scheduleQuery.shape.view };
const semesterParameters = { semester: studyQuery.shape.semester };
const atlasParameters: Record<string, Record<string, z.ZodType>> = {
  "#schedule": scheduleParameters,
  "#search": scheduleParameters,
  "#teacher": scheduleParameters,
  "#study": semesterParameters,
  "#plan": semesterParameters,
  "#session": semesterParameters,
  "#library": { subjectId: librarySubject.shape.id },
  "#inbox": { filter: inboxFilter },
  "#requests": { filter: requestFilter },
  "#requests/new": { kind: z.enum(requestKinds) },
};

export function atlasFragment(hash: string) {
  const separator = hash.indexOf("?");
  const path = separator === -1 ? hash : hash.slice(0, separator);
  if (!atlasSections.test(path) && !atlasDetails.test(path)) return "";
  if (separator === -1) return path;

  const section = path.split("/")[0];
  const schemas = atlasParameters[path] ?? (section === "#library" || section === "#teacher" ? atlasParameters[section] : undefined);
  if (!schemas) return path;

  const query = new URLSearchParams(hash.slice(separator + 1));
  const accepted = new URLSearchParams();
  for (const [key, schema] of Object.entries(schemas)) {
    const [value, ...repeats] = query.getAll(key);
    if (value !== undefined && repeats.length === 0 && schema.safeParse(value).success) accepted.set(key, value);
  }
  return accepted.size ? path + "?" + accepted.toString() : path;
}

export function documentFragment(url: Pick<Location, "pathname" | "hash">) {
  return url.pathname.startsWith("/today/assistant/documents/") && /^#section-[a-z0-9-]+$/u.test(url.hash) ? url.hash : "";
}

export function loginDestination(location: Pick<Location, "origin" | "search" | "hash">) {
  const next = new URLSearchParams(location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return atlasPath;

  let url: URL;
  try { url = new URL(next, location.origin); } catch { return atlasPath; }
  if (url.origin !== location.origin) return atlasPath;
  if (url.pathname === "/prototype" && !url.search) return atlasPath + atlasFragment(url.hash || location.hash);
  if (url.pathname === atlasPath && !url.search) return atlasPath + atlasFragment(url.hash || location.hash);
  if (!cabinetPaths.test(url.pathname)) return atlasPath;
  return url.pathname + url.search + documentFragment(url);
}
