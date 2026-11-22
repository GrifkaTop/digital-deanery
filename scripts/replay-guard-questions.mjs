import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv, isDeepStrictEqual } from "node:util";
import { request } from "@playwright/test";

const output = process.argv[2];
if (!output) throw new Error("Pass the path for a synthetic JSONL report.");
const fixtures = JSON.parse(readFileSync(new URL("../tests/fixtures/guard-questions.json", import.meta.url), "utf8"));
const env = parseEnv(readFileSync(".env", "utf8"));
const scenarios = [
  ...Object.entries(fixtures.ordinary).flatMap(([topic, questions]) =>
    questions.map((question) => ({ topic, ordinary: true, turns: [question] }))),
  ...fixtures.followups.map((turns) => ({ topic: "followup", ordinary: true, turns })),
  ...fixtures.probes.map((question) => ({ topic: "probe", ordinary: false, turns: [question] })),
];

async function session(port) {
  const origin = `https://localhost:${port}`;
  const client = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true, timeout: 20_000 });
  const csrf = async () => {
    const response = await client.get("/api/v1/csrf");
    if (!response.ok()) throw new Error(`CSRF: HTTP ${response.status()}`);
    return { Origin: origin, "X-CSRF-Token": (await response.json()).token };
  };
  try {
    const login = await client.post("/api/v1/session/login", {
      headers: await csrf(), data: { login: env.DEMO_A_LOGIN, password: env.DEMO_A_PASSWORD },
    });
    if (!login.ok()) throw new Error(`Login: HTTP ${login.status()}`);
    const headers = await csrf();
    return {
      async ask(question, context) {
        const response = await client.post("/api/v1/assistant/ask", { headers, data: { question, context } });
        if (!response.ok()) throw new Error(`Assistant on port ${port}: HTTP ${response.status()}`);
        return response.json();
      },
      async close() {
        try {
          await client.post("/api/v1/session/logout", { headers });
        } finally {
          await client.dispose();
        }
      },
    };
  } catch (error) {
    await client.dispose();
    throw error;
  }
}

const visible = ({ kind, category, message, cards }) => ({ kind, category, message, cards });
writeFileSync(output, "", { flag: "wx", mode: 0o600 });
let count = 0;
let qwenCount = 0;
let index = 0;
while (index < scenarios.length) {
  const qwen = await session(8443);
  try {
    const catalog = await session(8444);
    try {
      let remaining = 29;
      while (index < scenarios.length && scenarios[index].turns.length <= remaining) {
        const { topic, ordinary, turns } = scenarios[index++];
        let context;
        for (const question of turns) {
          // Both routes receive the same context from the preceding Qwen-arm turn.
          const [baseline, fallback] = await Promise.all([qwen.ask(question, context), catalog.ask(question, context)]);
          if (fallback.processing === "qwen") throw new Error("The comparison route enabled Qwen");
          context = baseline.context;
          remaining--;
          count++;
          if (baseline.processing === "qwen") qwenCount++;
          appendFileSync(output, JSON.stringify({
            id: count, topic, ordinary, question, baseline, fallback,
            changed: !isDeepStrictEqual(visible(baseline), visible(fallback)),
          }) + "\n");
        }
      }
      console.log(`Saved ${count} turns, ${qwenCount} influenced by Qwen`);
    } finally {
      await catalog.close();
    }
  } finally {
    await qwen.close();
  }
}
if (!qwenCount) throw new Error("The Qwen arm produced no model-influenced answers");
