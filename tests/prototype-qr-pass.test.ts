import { StrictMode, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrototypeHome } from "@/components/prototype/home";

describe("Atlas demo pass", () => {
  it("renders a closed labelled dialog and synthetic QR with its trigger", () => {
    const markup = renderToStaticMarkup(createElement(StrictMode, null, createElement(PrototypeHome, {
      readNewsIds: [], onDetailClick: () => {},
    })));
    const dialog = markup.match(/<dialog\b([^>]*)>(.*?)<\/dialog>/su);
    const headingId = dialog?.[1].match(/aria-labelledby="([^"]+)"/u)?.[1];

    expect(markup).toMatch(/<button[^>]+aria-haspopup="dialog"[^>]*>.*?Показать пропуск/su);
    expect(dialog?.[1]).not.toMatch(/\bopen\b/u);
    expect(headingId).toBeTruthy();
    expect(dialog?.[2]).toContain(`<h2 id="${headingId}">QR-пропуск</h2>`);
    expect(dialog?.[2]).toContain('aria-label="Закрыть пропуск"');
    expect(dialog?.[2]).toMatch(/class="hm-qr"[^>]+aria-label="Демонстрационный QR-код пропуска"/u);
    expect(dialog?.[2]).toContain("Демонстрационный пропуск<br/>Не действует для прохода");
  });
});
