import { askAssistant } from "@/server/assistant/http";
import { configuredQwenModel } from "@/server/assistant/qwen";

export const runtime = "nodejs";

export function POST(request: Request) {
  return askAssistant(request, configuredQwenModel());
}
