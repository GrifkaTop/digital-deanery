import { downloadBook } from "@/server/library/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return downloadBook(request, (await context.params).id); }
