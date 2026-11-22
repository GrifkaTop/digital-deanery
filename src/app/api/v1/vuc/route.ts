import { getVuc, postVuc } from "@/server/vuc/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getVuc;
export const POST = postVuc;
