import { getClinic, postClinic } from "@/server/clinic/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getClinic;
export const POST = postClinic;
