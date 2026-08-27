import { providerFetch } from "@/lib/ai/providers/base"

export type HiddenMultimodalAttachment = {
  kind?: string
  mime?: string
  base64?: string
  url?: string
  name?: string
}

const DEFAULT_MODEL = "gemini-3.7-flash"

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function mediaKind(attachment: HiddenMultimodalAttachment): "image" | "video" | "audio" | null {
  const kind = String(attachment.kind || "").toLowerCase()
  const mime = String(attachment.mime || "").toLowerCase()
  if (kind === "image" || mime.startsWith("image/")) return "image"
  if (kind === "video" || mime.startsWith("video/")) return "video"
  if (kind === "audio" || mime.startsWith("audio/")) return "audio"
  return null
}

export function hasHiddenGeminiMedia(attachments?: HiddenMultimodalAttachment[]) {
  return Array.isArray(attachments) && attachments.some((attachment) => Boolean(mediaKind(attachment)))
}

function defaultMime(kind: "image" | "video" | "audio") {
  if (kind === "image") return "image/jpeg"
  if (kind === "video") return "video/mp4"
  return "audio/mpeg"
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

export async function runHiddenGeminiMultimodal(input: {
  prompt: string
  systemPrompt: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  attachments?: HiddenMultimodalAttachment[]
  signal?: AbortSignal
}) {
  const key = env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY") || env("GOOGLE_AI_API_KEY")
  if (!key) throw new Error("HIDDEN_MULTIMODAL_NOT_CONFIGURED")

  const model = env("GEMINI_MULTIMODAL_MODEL") || DEFAULT_MODEL
  const media = (input.attachments || []).filter((attachment) => Boolean(mediaKind(attachment)))
  const requestInput: any[] = []
  const historyText = compactHistory(input.history)
  requestInput.push({
    type: "text",
    text: historyText
      ? `Conversation context:\n${historyText}\n\nCurrent user request:\n${input.prompt}`
      : input.prompt,
  })

  for (const attachment of media) {
    const kind = mediaKind(attachment)
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

  const response = await providerFetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model,
        system_instruction: input.systemPrompt,
        input: requestInput,
      }),
      signal: input.signal,
    },
    Number(process.env.GEMINI_MULTIMODAL_TIMEOUT_MS || 60_000),
  )

  const payload = await response.json().catch(() => ({}))
  const text = outputText(payload)
  if (!response.ok || !text) {
    const providerMessage = payload?.error?.message || payload?.message || `Gemini multimodal returned ${response.status}`
    throw new Error(providerMessage)
  }

  return {
    content: text,
    provider: "malik-multimodal",
    model: "malik-vision-hidden",
    usage: payload?.usage,
  }
}
