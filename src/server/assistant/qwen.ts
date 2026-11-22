import "server-only";
import { request } from "node:http";
import { Readable } from "node:stream";
import { z } from "zod";
import type { AssistantModel } from "./classify";

const completion = z.object({ choices: z.tuple([z.object({
  finish_reason: z.literal("stop"),
  message: z.object({ content: z.string() }),
})]) });
class QwenGatewayError extends Error {
  constructor(readonly status: number) {
    super(`Qwen gateway returned HTTP ${status}`);
    this.name = "QwenGatewayError";
  }
}
const maxResponseBytes = 64 * 1024;

async function readCompletion(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Qwen response body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) throw new Error("Qwen response exceeds size limit");
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(completion.parse(JSON.parse(body + decoder.decode())).choices[0].message.content) as unknown;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function requestBridge(socketPath: string, body: string, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request({
      socketPath, path: "/v1/chat/completions", method: "POST", signal,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.destroy();
        reject(new QwenGatewayError(response.statusCode ?? 502));
        return;
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function gatewayUrl(value: string | undefined) {
  const endpoint = URL.parse(value?.trim() ?? "");
  if (!endpoint) return;
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname);
  const dockerBridge = /^172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.(?:\d{1,3})$/u.test(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && (loopback || dockerBridge))) return;
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^\/v1\/?$/u.test(endpoint.pathname)) return;
  endpoint.pathname = "/v1/chat/completions";
  return endpoint.href;
}

export function configuredQwenModel(env = process.env): AssistantModel | undefined {
  const model = env.ASSISTANT_QWEN_MODEL?.trim();
  const key = env.ASSISTANT_QWEN_API_KEY?.trim();
  const socketPath = env.ASSISTANT_QWEN_SOCKET?.trim();
  const url = gatewayUrl(env.ASSISTANT_QWEN_BASE_URL);
  if (!model || (socketPath ? !socketPath.startsWith("/") : !key || !url)) return;

  async function complete(instructions: { version: number; text: string }, input: object, signal: AbortSignal) {
    const body = JSON.stringify({
      model, stream: false, max_tokens: 256, temperature: 0, reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Версия инструкции ${instructions.version}\n${instructions.text}` },
        { role: "user", content: JSON.stringify(input) },
      ],
    });
    const response = socketPath
      ? await requestBridge(socketPath, body, signal)
      : await fetch(url!, {
        method: "POST", signal, cache: "no-store", redirect: "error",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
      });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new QwenGatewayError(response.status);
    }
    return readCompletion(response);
  }

  return {
    classify: ({ instructions, question, today, signal }) => complete(instructions, { question, today }, signal),
    selectSources: ({ instructions, question, candidates, signal }) => complete(instructions, { question, candidates }, signal),
  };
}
