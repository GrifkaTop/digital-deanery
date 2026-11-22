import { request as httpRequest } from "node:http";
import { NextResponse } from "next/server";
import { checkOrigin, handle, HttpError, requireActor } from "@/server/auth/service";

export const runtime = "nodejs";

function requestWarmup(socketPath: string) {
  return new Promise<void>((resolve, reject) => {
    const request = httpRequest({
      socketPath, path: "/warmup", method: "POST", signal: AbortSignal.timeout(2_000),
    }, (response) => {
      response.resume();
      if (response.statusCode === 202) resolve();
      else reject(new HttpError(503, "UNAVAILABLE"));
    });
    request.on("error", reject);
    request.end();
  });
}

export function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    // Cross-site forms cannot set this header and this route grants no CORS access.
    if (request.headers.get("x-qwen-warmup") !== "1") throw new HttpError(403, "CSRF_REJECTED");
    const body = request.body?.getReader();
    if (body) {
      if (!(await body.read()).done) {
        void body.cancel().catch(() => {});
        throw new HttpError(422, "INVALID_FIELDS");
      }
      body.releaseLock();
    }
    await requireActor();
    const socketPath = process.env.ASSISTANT_QWEN_SOCKET?.trim();
    if (socketPath?.startsWith("/") && process.env.ASSISTANT_QWEN_MODEL?.trim()) {
      await requestWarmup(socketPath);
    }
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store, private" } });
  });
}
