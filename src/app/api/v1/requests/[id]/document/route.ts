export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
import { getDocument } from "@/server/requests/http";
export async function GET(_request: Request, { params }: Context) { return getDocument((await params).id); }
