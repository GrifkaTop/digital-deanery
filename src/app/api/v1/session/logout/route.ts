import { handle, logout } from "@/server/auth/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) { return handle(()=>logout(request)); }
