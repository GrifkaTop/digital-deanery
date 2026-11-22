import { getLibraryBook } from "@/server/library/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return getLibraryBook(request, (await context.params).id); }
