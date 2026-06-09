import type { MalikAIMode } from "@/lib/ai/config"
import { routeModeAI } from "@/lib/ai/provider-registry"
import type { AIFileAttachment, AIMessage, AITaskType } from "@/lib/ai/types"
import { publicEngineForProvider, sanitizePublicText } from "@/lib/brand-provider-map"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"

type StreamBody = {
  message?: string
  prompt?: string
  question?: string
  originalQuestion?: string
  input?: string
  text?: string
  task?: AITaskType
  responseMode?: string
  messages?: AIMessage[]
  history?: AIMessage[]
  attachments?: AIFileAttachment[]
  responseDepth?: "fast" | "deep" | "ultra"
  maxTokens?: number
  temperature?: number
}

const encoder = new TextEncoder()
const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
}

function pickPrompt(body: StreamBody) {
  const direct = body.originalQuestion || body.message || body.prompt || body.input || body.text || body.question
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const last = Array.isArray(body.messages)
    ? [...body.messages].reverse().find((item) => typeof item?.content === "string" && item.content.trim())
    : null
  return last?.content?.trim() || ""
}

function resolveMode(body: StreamBody, task?: AITaskType): MalikAIMode {
  const value = String(body.responseMode || "").toLowerCase()
  if (["fast", "deep", "pro", "code", "photo", "video"].includes(value)) return value as MalikAIMode
  if (task === "code") return "code"
  if (task === "image") return "photo"
  if (task === "video") return "video"
  if (body.responseDepth === "ultra") return "pro"
  if (body.responseDepth === "deep") return "deep"
  return "fast"
}

function taskForMode(mode: MalikAIMode, task?: AITaskType): AITaskType {
  if (mode === "code") return "code"
  if (mode === "photo") return "image"
  if (mode === "video") return "video"
  return task || "chat"
}

function splitChunks(text: string) {
  return text.match(/.{1,70}(?:\s|$)/g) || [text]
}

function streamText(text: string, provider: string, task: AITaskType, fallbackUsed = false) {
  const engine = publicEngineForProvider(provider, task)
  const requestId = crypto.randomUUID()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { engine: engine.title, engineId: engine.id, fallbackUsed, safeMode: fallbackUsed, requestId } })}\n\n`))
      for (const chunk of splitChunks(sanitizePublicText(text))) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "X-Malik-Engine": engine.id,
      "X-Malik-Fallback": String(fallbackUsed),
      "X-Malik-Request-Id": requestId,
    },
  })
}

function fallbackText(prompt: string) {
  return prompt
    ? `MALIK AI received: "${prompt}". Live providers are configured, but this request failed. Try Fast mode again in a few seconds.`
    : "MALIK AI is ready. Send a prompt to continue."
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as StreamBody
  const prompt = pickPrompt(body)
  const task = body.task || (body.responseMode === "code" ? "code" : "chat")
  const mode = resolveMode(body, task)
  const finalTask = taskForMode(mode, task)
  const entitlement = await resolveRequestEntitlement(request)

  try {
    const result = await routeModeAI(mode, {
      prompt,
      task: finalTask,
      messages: body.messages || body.history,
      attachments: body.attachments,
      userId: entitlement.userId,
      userEmail: entitlement.userId,
      plan: entitlement.plan,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      signal: request.signal,
    })

    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2)
    if (result.success && output.trim()) {
      return streamText(output, result.provider, finalTask, Boolean(result.fallbackUsed))
    }

    return streamText(fallbackText(prompt), "demo-fallback", finalTask, true)
  } catch {
    return streamText(fallbackText(prompt), "demo-fallback", finalTask, true)
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/stream", mode: "mode-provider-routing-ready" })
}
