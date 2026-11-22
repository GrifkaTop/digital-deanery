import { handle, me } from "@/server/auth/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) { return handle(()=>me(request)); }
