import { getPublications } from "@/server/publications/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return getPublications("events", request, (await context.params).id); }
