import { runMalikBrain } from "@/lib/ai/brain"
import { responseDepthLimits, resolveResponseDepth } from "@/lib/ai/response-depth"
import type { AIFileAttachment, AIMessage, AITaskType } from "@/lib/ai/types"
import type { ThinkingStepId } from "@/lib/ai/safe-thinking"
import { publicStatusLabel } from "@/lib/ai/safe-thinking"
import { publicEngineForProvider, sanitizePublicText } from "@/lib/brand-provider-map"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { persistChatExchange } from "@/lib/server/chat-persistence"

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
  userEmail?: string
  username?: string
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

function splitChunks(text: string) {
  return text.match(/.{1,52}(?:\s|$)/g) || [text]
}

function sseResponse(
  text: string,
  provider: string,
  status = 200,
  metadata: { fallbackUsed?: boolean; task?: string; safeMode?: boolean; thinkingSteps?: Array<{ id: string; label: string; state: string }> } = {},
) {
  const engine = publicEngineForProvider(provider, metadata.task || "chat")
  const requestId = crypto.randomUUID()
  const stream = new ReadableStream({
    async start(controller) {
      for (const step of metadata.thinkingSteps || []) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: step })}\n\n`))
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { engine: engine.title, engineId: engine.id, fallbackUsed: Boolean(metadata.fallbackUsed), safeMode: Boolean(metadata.safeMode), requestId } })}\n\n`))
      for (const chunk of splitChunks(sanitizePublicText(text))) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
        await new Promise((resolve) => setTimeout(resolve, 12))
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: {
      ...SSE_HEADERS,
      "X-Malik-Engine": engine.id,
      "X-Malik-Fallback": String(Boolean(metadata.fallbackUsed)),
      "X-Malik-Request-Id": requestId,
    },
  })
}

function demoFallback(prompt: string) {
  if (!prompt) return "MALIK AI is ready in safe backup mode. Send a prompt to continue."
  return `I received your request: "${prompt}". MALIK AI is using safe backup mode right now. Chat, Canvas and generators remain available; please retry shortly.`
}

function normalizeTask(body: StreamBody): AITaskType | undefined {
  if (body.task) return body.task
  if (body.responseMode === "code") return "code"
  if (body.responseMode === "canvas") return "project"
  return undefined
}

function backendCandidates() {
  if (process.env.MALIK_BACKEND_PROXY_ENABLED !== "true") return []
  const configured = process.env.MALIK_BACKEND_URL?.trim().replace(/\/$/, "")
  return [...new Set([configured].filter(Boolean) as string[])]
}

function streamEndpoint(base: string) {
  return base.endsWith("/api/stream") ? base : `${base}/api/stream`
}

function proxySseResponse(upstream: ReadableStream<Uint8Array>, controller: AbortController, parentSignal: AbortSignal, abortFromParent: () => void) {
  const stream = new ReadableStream<Uint8Array>({
    async start(target) {
      const reader = upstream.getReader()
      const decoder = new TextDecoder()
      const timeout = setTimeout(() => controller.abort(new Error("Runtime stream timed out")), 60_000)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          target.enqueue(encoder.encode(sanitizePublicText(decoder.decode(value, { stream: true }))))
        }
        target.close()
      } catch (error) {
        target.error(error)
      } finally {
        clearTimeout(timeout)
        parentSignal.removeEventListener("abort", abortFromParent)
        reader.releaseLock()
      }
    },
    cancel(reason) {
      controller.abort(reason)
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS, "X-Malik-Engine": "core", "X-Malik-Fallback": "false", "X-Malik-Request-Id": crypto.randomUUID() },
  })
}

async function tryBackendProxy(body: StreamBody, signal: AbortSignal) {
  for (const base of backendCandidates()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), base.includes("127.0.0.1") ? 500 : 1800)
    const abortFromParent = () => controller.abort(signal.reason)
    let streaming = false
    if (signal.aborted) abortFromParent()
    else signal.addEventListener("abort", abortFromParent, { once: true })
    try {
      const response = await fetch(streamEndpoint(base), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: pickPrompt(body),
          task: normalizeTask(body),
          messages: body.messages || body.history,
        }),
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) continue
      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("text/event-stream") && response.body) {
        streaming = true
        clearTimeout(timeout)
        return proxySseResponse(response.body, controller, signal, abortFromParent)
      }
      const payload = contentType.includes("application/json") ? await response.json() : await response.text()
      const text = typeof payload === "string" ? payload : String(payload?.content || payload?.text || payload?.message || payload?.response || "")
      if (text.trim()) return sseResponse(text, "backend-proxy")
    } catch {
      // The direct server-side router below is the expected fallback.
    } finally {
      if (!streaming) {
        clearTimeout(timeout)
        signal.removeEventListener("abort", abortFromParent)
      }
    }
  }
  return null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as StreamBody
  const prompt = pickPrompt(body)
  const entitlement = await resolveRequestEntitlement(request)
  const backendResponse = await tryBackendProxy(body, request.signal)
  if (backendResponse) return backendResponse
  const task = normalizeTask(body) || "chat"
  const responseDepth = resolveResponseDepth(body.responseDepth, entitlement.plan)
  const depthLimits = responseDepthLimits(responseDepth)
  try {
    const thinkingEvents: Array<{ id: string; label: string; state: string }> = []
    const result = await runMalikBrain(
      {
        prompt: body.question?.trim() || prompt,
        task,
        messages: body.messages || body.history,
        attachments: body.attachments,
        userId: entitlement.userId,
        userEmail: entitlement.userId,
        plan: entitlement.plan,
        maxTokens: body.maxTokens || depthLimits.maxTokens,
        temperature: body.temperature ?? depthLimits.temperature,
        metadata: { responseDepth },
        signal: request.signal,
      },
      (step: ThinkingStepId) => {
        thinkingEvents.push({ id: step, label: publicStatusLabel(step), state: "active" })
      },
    )
    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2)
    const finalText = result.success && output.trim() ? output : demoFallback(prompt)
    if (entitlement.authenticated && finalText.trim()) {
      void persistChatExchange({
        userEmail: entitlement.userId,
        userMessage: prompt,
        assistantMessage: finalText,
        provider: result.provider,
        title: prompt.slice(0, 80),
      })
    }
    return sseResponse(finalText, result.success ? result.provider : "demo-fallback", 200, {
      fallbackUsed: !result.success || result.fallbackUsed,
      safeMode: result.safeMode,
      thinkingSteps: result.thinkingSteps.length ? result.thinkingSteps : thinkingEvents,
      task,
    })
  } catch {
    return sseResponse(demoFallback(prompt), "demo-fallback", 200, { fallbackUsed: true, task })
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/stream", mode: "runtime-routing-ready" })
}
