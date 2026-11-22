import { execFile } from "node:child_process";
import { chmodSync, lstatSync, readFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

const socket = "/run/qwen/bridge.sock";
const maxBytes = 64 * 1024;
const remote = readFileSync(new URL("./gateway.py", import.meta.url)).toString("base64");
const sshHost = process.env.TESLA_QWEN_SSH_HOST || "95.165.82.60";
const sshPort = process.env.TESLA_QWEN_SSH_PORT || "8022";
const sshUser = process.env.TESLA_QWEN_SSH_USER || "modelonly";
const model = process.env.ASSISTANT_QWEN_MODEL?.trim();
if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(sshHost)
    || !/^[a-z_][a-z0-9_-]*$/.test(sshUser)
    || !/^\d{1,5}$/.test(sshPort) || Number(sshPort) < 1 || Number(sshPort) > 65535) {
  throw new Error("Invalid Qwen SSH target");
}
const sshArgs = [
  "-F", "/dev/null", "-T", "-p", sshPort,
  "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
  "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=/run/tesla/known_hosts",
  "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ConnectTimeout=4",
  "-i", "/run/tesla/identity", `${sshUser}@${sshHost}`,
  `python3 -c 'import base64; exec(base64.b64decode("${remote}"))'`,
];

let warming = false;
let lastWarmup = -Infinity;
function warmup(response) {
  if (!model) {
    response.writeHead(503).end();
    return;
  }
  response.writeHead(202).end();
  if (warming || performance.now() - lastWarmup < 60_000) return;
  warming = true;
  lastWarmup = performance.now();
  // Cold loading has its own deadline and does not occupy the chat queue.
  const args = [...sshArgs.slice(0, -1), sshArgs.at(-1) + " warmup"];
  const payload = JSON.stringify({ model, stream: false, keep_alive: "5m" });
  function connect(attemptsLeft) {
    const child = execFile("ssh", args, {
      timeout: 60_000, maxBuffer: maxBytes, env: { ...process.env, LC_ALL: "C" },
    }, (error, _stdout, stderr) => {
      if (attemptsLeft > 1 && error?.code === 255 && /Connection timed out/i.test(stderr)) {
        connect(attemptsLeft - 1);
        return;
      }
      warming = false;
      if (error) console.warn("Qwen warmup request failed");
    });
    child.stdin.on("error", () => child.kill());
    child.stdin.end(payload);
  }
  connect(3);
}

if (lstatSync(socket, { throwIfNoEntry: false })?.isSocket()) unlinkSync(socket);
let active = 0;
const waiting = [];
function acquire(response) {
  if (active < 2) {
    active++;
    return Promise.resolve(true);
  }
  if (waiting.length >= 4) return Promise.resolve(false);
  return new Promise((resolve) => {
    const entry = { response, resolve };
    waiting.push(entry);
    response.once("close", () => {
      const index = waiting.indexOf(entry);
      if (index >= 0) {
        waiting.splice(index, 1);
        resolve(false);
      }
    });
  });
}
function release() {
  const next = waiting.shift();
  if (next) next.resolve(true);
  else active--;
}
const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, async (request, response) => {
  if (request.method === "POST" && request.url === "/warmup") {
    warmup(response);
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }
  const length = Number(request.headers["content-length"]);
  if (!Number.isSafeInteger(length) || length < 1 || length > maxBytes) {
    response.writeHead(413).end();
    return;
  }
  if (!await acquire(response)) {
    if (response.destroyed) return;
    response.writeHead(503).end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (response.destroyed) return;
    await new Promise((resolve) => {
      const child = execFile("ssh", sshArgs, { timeout: 11_000, maxBuffer: maxBytes, encoding: "buffer" },
        (error, stdout) => {
          if (!response.destroyed) {
            if (error) response.writeHead(502).end();
            else response.writeHead(200, { "Content-Type": "application/json" }).end(stdout);
          }
          resolve();
        });
      response.once("close", () => child.kill());
      child.stdin.on("error", () => child.kill());
      child.stdin.end(Buffer.concat(chunks));
    });
  } catch {
    if (!response.destroyed) response.writeHead(502).end();
  } finally {
    release();
  }
});
server.listen(socket, () => chmodSync(socket, 0o600));
