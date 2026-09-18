import { providerFetch } from "@/lib/ai/providers/base"

export type HiddenMultimodalAttachment = {
  kind?: string
  mime?: string
  base64?: string
  url?: string
  name?: string
}

type SupportedPart = "image" | "video" | "audio" | "document"

const DEFAULT_MODEL = "gemini-3.5-flash-lite"
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash"

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function attachmentKind(attachment: HiddenMultimodalAttachment): SupportedPart | null {
  const kind = String(attachment.kind || "").toLowerCase()
  const mime = String(attachment.mime || "").toLowerCase()
  const name = String(attachment.name || "").toLowerCase()
  if (kind === "image" || mime.startsWith("image/")) return "image"
  if (kind === "video" || mime.startsWith("video/")) return "video"
  if (kind === "audio" || mime.startsWith("audio/")) return "audio"
  if (kind === "document" || mime === "application/pdf" || name.endsWith(".pdf")) return "document"
  return null
}

export function hasHiddenGeminiMedia(attachments?: HiddenMultimodalAttachment[]) {
  return Array.isArray(attachments) && attachments.some((attachment) => Boolean(attachmentKind(attachment)))
}

function defaultMime(kind: SupportedPart) {
  if (kind === "image") return "image/jpeg"
  if (kind === "video") return "video/mp4"
  if (kind === "audio") return "audio/mpeg"
  return "application/pdf"
}

function dataUrlPayload(url: string) {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/i)
  if (!match) return null
  return { mime: match[1], data: match[2] }
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim()
  const steps = Array.isArray(payload?.steps) ? payload.steps : []
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]
    if (step?.type !== "model_output" || !Array.isArray(step?.content)) continue
    const text = step.content
      .map((part: any) => part?.type === "text" && typeof part?.text === "string" ? part.text : "")
      .join("")
      .trim()
    if (text) return text
  }

  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    const text = parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim()
    if (text) return text
  }
  return ""
}

function compactHistory(history?: Array<{ role: "user" | "assistant"; content: string }>) {
  if (!Array.isArray(history)) return ""
  return history
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-8)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`)
    .filter(Boolean)
    .join("\n")
}

function modelChain() {
  return [...new Set([
    env("GEMINI_MULTIMODAL_MODEL") || env("GEMINI_VISION_MODEL") || DEFAULT_MODEL,
    env("GEMINI_FALLBACK_MODEL") || DEFAULT_FALLBACK_MODEL,
  ].filter(Boolean))]
}

async function callGemini(input: {
  key: string
  model: string
  systemPrompt: string
  requestInput: any[]
  signal?: AbortSignal
}) {
  const response = await providerFetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-goog-api-key": input.key,
      },
      body: JSON.stringify({
        model: input.model,
        system_instruction: input.systemPrompt,
        input: input.requestInput,
      }),
      signal: input.signal,
    },
    Number(process.env.GEMINI_MULTIMODAL_TIMEOUT_MS || 90_000),
  )

  const payload = await response.json().catch(() => ({}))
  const text = outputText(payload)
  if (!response.ok || !text) {
    const providerMessage = payload?.error?.message || payload?.message || `Gemini multimodal returned ${response.status}`
    const error = new Error(providerMessage) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return { text, usage: payload?.usage || payload?.usageMetadata }
}

export async function runHiddenGeminiMultimodal(input: {
  prompt: string
  systemPrompt: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  attachments?: HiddenMultimodalAttachment[]
  signal?: AbortSignal
}) {
  const key = env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY") || env("GOOGLE_AI_API_KEY")
  if (!key) throw new Error("HIDDEN_MULTIMODAL_NOT_CONFIGURED")

  const media = (input.attachments || []).filter((attachment) => Boolean(attachmentKind(attachment)))
  const requestInput: any[] = []
  const historyText = compactHistory(input.history)
  requestInput.push({
    type: "text",
    text: historyText
      ? `Conversation context:\n${historyText}\n\nCurrent user request:\n${input.prompt}`
      : input.prompt,
  })

  for (const attachment of media) {
    const kind = attachmentKind(attachment)
    if (!kind) continue
    let mime = attachment.mime || defaultMime(kind)
    let data = attachment.base64 || ""
    if (!data && attachment.url?.startsWith("data:")) {
      const parsed = dataUrlPayload(attachment.url)
      if (parsed) {
        mime = parsed.mime
        data = parsed.data
      }
    }
    if (!data) continue
    requestInput.push({ type: kind, data, mime_type: mime })
  }

  if (requestInput.length <= 1) throw new Error("HIDDEN_MULTIMODAL_MEDIA_MISSING")

  let lastError: unknown = null
  for (const model of modelChain()) {
    try {
      const result = await callGemini({
        key,
        model,
        systemPrompt: input.systemPrompt,
        requestInput,
        signal: input.signal,
      })
      return {
        content: result.text,
        provider: "malik-multimodal",
        model: "malik-vision-hidden",
        providerModel: model,
        usage: result.usage,
      }
    } catch (error) {
      lastError = error
      console.warn("[MALIK_MULTIMODAL] Gemini model failed", model, error instanceof Error ? error.message : String(error))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HIDDEN_MULTIMODAL_FAILED")
}
