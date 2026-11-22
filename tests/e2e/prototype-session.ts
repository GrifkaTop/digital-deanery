import { expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export async function signInToPrototype(request: APIRequestContext, baseURL: string | undefined, profile?: "A") {
  if (!baseURL) throw new Error("Configure a Playwright HTTPS base URL.");
  const origin = new URL(baseURL).origin;
  const availability = await request.get("/api/v1/session/demo");
  const demo = availability.ok() && (await availability.json()).enabled === true;
  const csrf = await request.get("/api/v1/csrf");
  expect(csrf.status()).toBe(200);
  const headers = { Origin: origin, "X-CSRF-Token": (await csrf.json()).token };

  if (demo && !profile) {
    expect((await request.post("/api/v1/session/demo", { headers, data: {} })).status()).toBe(200);
    return;
  }

  const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
  const login = process.env.DEMO_A_LOGIN ?? env.DEMO_A_LOGIN;
  const password = process.env.DEMO_A_PASSWORD ?? env.DEMO_A_PASSWORD;
  if (!login || !password) throw new Error("Configure the existing synthetic A credentials for this test stand.");
  expect((await request.post("/api/v1/session/login", { headers, data: { login, password } })).status()).toBe(200);
}
