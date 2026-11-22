import { demoLoginAvailable, handle, json, login } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => json(await demoLoginAvailable()));
}

export function POST(request: Request) {
  return handle(() => login(request, true));
}
