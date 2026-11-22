import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const extractionOptions = { encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 } as const;

export async function extractDocumentPages(pdf: string, imagePrefix: string, forceOcr: boolean) {
  const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", "-eol", "unix", pdf, "-"], extractionOptions);
  const pages = stdout.split("\f");
  if (pages.length > 1 && !pages.at(-1)?.trim()) pages.pop();

  for (const [index, text] of pages.entries()) {
    if (!forceOcr && /[\p{L}\p{N}]/u.test(text)) continue;
    const page = String(index + 1);
    const image = `${imagePrefix}.png`;
    try {
      await run("pdftoppm", ["-f", page, "-l", page, "-singlefile", "-r", "220", "-png", pdf, imagePrefix], extractionOptions);
      const { stdout: recognized } = await run("tesseract", [image, "stdout", "-l", "rus+eng"], extractionOptions);
      pages[index] = recognized;
    } finally {
      await rm(image, { force: true });
    }
  }
  return pages.map((page) => page.replaceAll("\0", "").trim());
}

export function splitPage(text: string) {
  const limit = 1800;
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const boundary = remaining.slice(0, limit + 1);
    const split = Math.max(boundary.lastIndexOf("\n"), boundary.lastIndexOf(" "));
    const end = split > limit / 2 ? split : limit;
    chunks.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
