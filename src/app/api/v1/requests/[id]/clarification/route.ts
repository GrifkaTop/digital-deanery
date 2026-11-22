export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
import { postClarification } from "@/server/requests/http";
export async function POST(request: Request, { params }: Context) { return postClarification(request, (await params).id); }
