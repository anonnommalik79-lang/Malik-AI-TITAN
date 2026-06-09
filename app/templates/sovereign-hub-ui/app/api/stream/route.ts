import type { MalikAIMode } from "@/lib/ai/config"
import type { AIFileAttachment, AIMessage, AITaskType } from "@/lib/ai/types"
import { publicEngineForProvider, sanitizePublicText } from "@/lib/brand-provider-map"

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

type LiveResult = {
  provider: "groq" | "aws-bedrock"
  model: string
  text: string
}

const encoder = new TextEncoder()
const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
}

function env(name: string, fallback = "") {
  return (process.env[name] || fallback).trim()
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

function modelForMode(mode: MalikAIMode) {
  if (mode === "deep") return env("BEDROCK_DEEP_MODEL_ID", "amazon.nova-pro-v1:0")
  if (mode === "pro") return env("BEDROCK_PRO_MODEL_ID", "openai.gpt-oss-120b-1:0")
  if (mode === "code") return env("BEDROCK_CODE_MODEL_ID", "qwen.qwen3-coder-next")
  return env("BEDROCK_FAST_MODEL_ID", "qwen.qwen3-next-80b-a3b")
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

function messagesFor(prompt: string, body: StreamBody) {
  const history = Array.isArray(body.messages) ? body.messages : Array.isArray(body.history) ? body.history : []
  const cleaned = history
    .filter((message) => message && typeof message.content === "string" && message.content.trim())
    .slice(-8)
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user", content: message.content }))
  if (!cleaned.some((message) => message.role === "system")) {
    cleaned.unshift({ role: "system", content: "You are MALIK AI, a fast helpful AI assistant. Answer clearly in the user's language." })
  }
  if (!cleaned.some((message) => message.role === "user" && message.content.trim() === prompt)) {
    cleaned.push({ role: "user", content: prompt })
  }
  return cleaned
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string, body: StreamBody, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messagesFor(prompt, body),
      max_tokens: Math.min(Number(body.maxTokens || process.env.MAX_OUTPUT_TOKENS || 900), 2000),
      temperature: typeof body.temperature === "number" ? body.temperature : 0.35,
    }),
    signal,
  })

  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "") } }))
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`
    throw new Error(String(message).slice(0, 240))
  }
  const text = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || ""
  if (!String(text).trim()) throw new Error("empty response")
  return String(text)
}

async function callLiveProviders(mode: MalikAIMode, prompt: string, body: StreamBody, signal: AbortSignal): Promise<LiveResult> {
  const errors: string[] = []

  if (mode === "fast" && env("GROQ_API_KEY")) {
    const model = env("GROQ_MODEL", "llama-3.3-70b-versatile")
    try {
      const text = await callOpenAICompatible("https://api.groq.com/openai/v1", env("GROQ_API_KEY"), model, prompt, body, signal)
      return { provider: "groq", model, text }
    } catch (error) {
      errors.push(`groq: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const bedrockBase = env("OPENAI_BASE_URL", "https://bedrock-mantle.us-east-1.api.aws/v1")
  const model = modelForMode(mode)
  const keys = [env("OPENAI_API_KEY"), env("AWS_BEARER_TOKEN_BEDROCK"), env("OPENAI_API_KEY_BACKUP"), env("AWS_BEARER_TOKEN_BEDROCK_BACKUP")].filter(Boolean)
  for (const key of [...new Set(keys)]) {
    try {
      const text = await callOpenAICompatible(bedrockBase, key, model, prompt, body, signal)
      return { provider: "aws-bedrock", model, text }
    } catch (error) {
      errors.push(`bedrock:${model}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(errors.join(" | ") || "No live provider keys available")
}

function fallbackText(prompt: string, error?: string) {
  const suffix = error ? ` Error: ${error.slice(0, 320)}` : ""
  return prompt
    ? `MALIK AI received: "${prompt}". Live providers are configured, but this request failed.${suffix}`
    : `MALIK AI is ready. Send a prompt to continue.${suffix}`
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as StreamBody
  const prompt = pickPrompt(body)
  const task = body.task || (body.responseMode === "code" ? "code" : "chat")
  const mode = resolveMode(body, task)
  const finalTask = taskForMode(mode, task)

  if (!prompt) return streamText("MALIK AI is ready. Send a prompt to continue.", "demo-fallback", finalTask, false)

  try {
    const result = await callLiveProviders(mode, prompt, body, request.signal)
    return streamText(result.text, result.provider, finalTask, false)
  } catch (error) {
    return streamText(fallbackText(prompt, error instanceof Error ? error.message : String(error)), "demo-fallback", finalTask, true)
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/stream", mode: "direct-live-provider-routing-ready" })
}
