import { changeLibraryBooking } from "@/server/library/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return changeLibraryBooking(request, (await context.params).id, true); }
export async function DELETE(request: Request, context: Context) { return changeLibraryBooking(request, (await context.params).id, false); }
