import { getLibraryBookings } from "@/server/library/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getLibraryBookings;
