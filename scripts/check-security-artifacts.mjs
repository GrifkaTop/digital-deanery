import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const compose = process.argv.slice(2);
if (!compose.includes("-p")) throw new Error("Pass an explicit disposable Compose project");
const config = parseEnv(readFileSync(".env", "utf8"));
const names = [
  "AUTH_SECRET", "POSTGRES_PASSWORD", "APP_DB_PASSWORD",
  "DEMO_A_PASSWORD", "DEMO_B_PASSWORD", "DEMO_MOBILE_PASSWORD", "ASSISTANT_QWEN_API_KEY",
];

for (const [label, args] of [
  ["public bundle", ["exec", "-T", "--index", "1", "app", "tar", "-cf", "-", "public", ".next/static"]],
  ["container logs", ["logs", "--no-color", "app", "db", "caddy", "migrate"]],
]) {
  const contents = execFileSync("docker", [...compose, ...args], {
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const matches = names.filter((name) => {
    const value = config[name];
    return value && (contents.includes(value) || contents.includes(encodeURIComponent(value)));
  });
  if (matches.length) throw new Error(`${label}: found values from ${matches.join(", ")}`);
  console.log(`${label}: checked ${contents.length} bytes`);
}
