export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
import { getNotice } from "@/server/inbox/http";
export async function GET(_request: Request, { params }: Context) { return getNotice((await params).id); }
