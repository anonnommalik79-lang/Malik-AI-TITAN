import { handleModeAI } from "@/lib/server/mode-ai-handler"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return handleModeAI(request, "code")
}
