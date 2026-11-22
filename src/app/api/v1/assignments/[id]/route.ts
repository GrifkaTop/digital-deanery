import { getAssignment } from "@/server/assignments/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return getAssignment((await context.params).id);
}
