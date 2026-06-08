import type { MalikAIMode } from "@/lib/ai/config"
import { handleModeAI } from "@/lib/server/mode-ai-handler"
import { handlePublicTextAI } from "@/lib/server/public-ai"

export const runtime = "nodejs"

function replayRequest(request: Request, body: unknown) {
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
    signal: request.signal,
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const mode = String(body?.mode || "fast").toLowerCase()
  if (mode === "fast" || mode === "deep" || mode === "pro") {
    return handleModeAI(replayRequest(request, body), mode as MalikAIMode)
  }
  return handlePublicTextAI(replayRequest(request, body), "chat")
}
