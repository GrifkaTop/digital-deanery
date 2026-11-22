import { getPublications } from "@/server/publications/http";
export const GET = (request: Request) => getPublications("events", request);
