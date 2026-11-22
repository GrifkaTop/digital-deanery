import { getAssistantPdf } from "@/server/assistant/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getAssistantPdf(request, id);
}
