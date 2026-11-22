import { request as httpsRequest } from "node:https";
import { expect, test } from "@playwright/test";

const proxyLimit = 16_384;
const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost");

test.skip(origin.protocol !== "https:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
  "Requires the local Caddy test stand.");

function postLogin(size: number, csrf: string, knownLength: boolean) {
  return new Promise<number>((resolve, reject) => {
    const request = httpsRequest(new URL("/api/v1/session/login", origin), {
      method: "POST",
      rejectUnauthorized: false,
      timeout: 5000,
      headers: {
        Origin: origin.origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        Cookie: `__Host-csrf=${csrf}`,
        ...(knownLength ? { "Content-Length": size } : {}),
      },
    }, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
      response.once("error", reject);
    });
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("Timed out waiting for Caddy")));
    request.write("{}");
    request.end(" ".repeat(size - 2));
  });
}

for (const knownLength of [true, false]) {
  test(`Caddy caps JSON bodies ${knownLength ? "with" : "without"} Content-Length`, async ({ request }) => {
    const csrf = await request.get("/api/v1/csrf");
    expect(csrf.status()).toBe(200);
    const { token } = await csrf.json();

    // At the edge limit the login handler still enforces its smaller JSON contract.
    expect(await postLogin(proxyLimit, token, knownLength)).toBe(422);
    expect(await postLogin(proxyLimit + 1, token, knownLength)).toBe(413);
  });
}
