import { getDiscipline } from "@/server/academics/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getDiscipline((await params).id);
}
