import { changeBooking } from "@/server/sports/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return changeBooking(request, (await context.params).id, "active"); }
export async function DELETE(request: Request, context: Context) { return changeBooking(request, (await context.params).id, "cancelled"); }
