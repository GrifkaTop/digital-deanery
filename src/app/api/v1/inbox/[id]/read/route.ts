export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
import { readNotice } from "@/server/inbox/http";
export async function POST(request: Request, { params }: Context) { return readNotice(request, (await params).id); }
