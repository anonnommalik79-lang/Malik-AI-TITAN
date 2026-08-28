import { shouldUseWeb } from "@/lib/ai/web-search-policy"
import type { ComputeOperation } from "./types"

export async function chatComputeOperation(request: Request): Promise<ComputeOperation> {
  const body = await request.clone().json().catch(() => ({}))
  const messages = Array.isArray(body.messages) ? body.messages : []
  const prompt = String(body.originalQuestion || body.prompt || body.message || body.question || body.input || body.text || body.content || messages.filter((item: { role?: string }) => item.role === "user").at(-1)?.content || "")
  return shouldUseWeb(prompt, body) ? "research" : "chat"
}

export async function generationComputeOperation(request: Request): Promise<ComputeOperation> {
  const body = await request.clone().json().catch(() => ({}))
  const pathname = new URL(request.url).pathname
  const kind = String(pathname === "/api/generate" ? body.kind || body.type || "" : pathname.split("/").pop() || "").toLowerCase()
  if (["photo", "image", "images"].includes(kind)) return "image"
  if (["video", "videos"].includes(kind)) return "video"
  if (["audio", "voice", "speech"].includes(kind)) return "voice"
  return "chat"
}
