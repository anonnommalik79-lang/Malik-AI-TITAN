import { inflateRawSync } from "node:zlib"
import { providerFetch } from "@/lib/ai/providers/base"
import { runHiddenGeminiMultimodal } from "@/lib/server/hidden-gemini-multimodal"
import { transcribeAudio } from "@/lib/transcribe/groq-whisper"

export type MalikMultimodalAttachment = {
  id?: string
  name?: string
  mime?: string
  size?: number
  kind?: string
  base64?: string
  text?: string
  url?: string
}

export type MalikAttachmentRoute =
  | { kind: "none"; estimatedTokens: 0 }
  | { kind: "context"; prompt: string; estimatedTokens: number; files: string[] }
  | {
      kind: "answer"
      content: string
      provider: string
      model: string
      usage?: unknown
      estimatedTokens: number
      files: string[]
    }

const MAX_FILE_CONTEXT_CHARS = 180_000
const MAX_ARCHIVE_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_VISION_IMAGES = 3

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "css",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "kts", "go", "rs", "rb", "php", "swift",
  "c", "h", "cpp", "hpp", "cs", "sql", "sh", "bash", "zsh", "ps1", "toml", "ini", "env", "log",
  "tex", "rtf", "srt", "vtt",
])
const OFFICE_EXTENSIONS = new Set(["docx", "xlsx", "pptx"])

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function extension(name?: string) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ""
}

function attachmentMime(attachment: MalikMultimodalAttachment) {
  const mime = String(attachment.mime || "").toLowerCase().trim()
  if (mime && mime !== "application/octet-stream") return mime
  const ext = extension(attachment.name)
  if (ext === "pdf") return "application/pdf"
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (ext === "json") return "application/json"
  if (ext === "csv") return "text/csv"
  if (TEXT_EXTENSIONS.has(ext)) return "text/plain"
  return mime || "application/octet-stream"
}

function binaryKind(attachment: MalikMultimodalAttachment): "image" | "video" | "audio" | "document" | null {
  const mime = attachmentMime(attachment)
  const kind = String(attachment.kind || "").toLowerCase()
  if (kind === "image" || mime.startsWith("image/")) return "image"
  if (kind === "video" || mime.startsWith("video/")) return "video"
  if (kind === "audio" || mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf" || extension(attachment.name) === "pdf") return "document"
  return null
}

function isTextLike(attachment: MalikMultimodalAttachment) {
  if (typeof attachment.text === "string") return true
  const mime = attachmentMime(attachment)
  const ext = extension(attachment.name)
  return mime.startsWith("text/")
    || mime === "application/json"
    || mime === "application/xml"
    || /javascript|typescript|yaml|toml|sql/.test(mime)
    || TEXT_EXTENSIONS.has(ext)
}

function isOffice(attachment: MalikMultimodalAttachment) {
  return OFFICE_EXTENSIONS.has(extension(attachment.name))
}

function decodeBase64(attachment: MalikMultimodalAttachment) {
  if (!attachment.base64) return null
  try {
    return Buffer.from(attachment.base64, "base64")
  } catch {
    return null
  }
}

function xmlEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function xmlToText(xml: string) {
  return xmlEntities(
    xml
      .replace(/<w:tab\s*\/>/gi, "\t")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/a:p>/gi, "\n")
      .replace(/<\/row>/gi, "\n")
      .replace(/<\/c>/gi, "\t")
      .replace(/<\/si>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function unzipSelected(buffer: Buffer) {
  const entries = new Map<string, Buffer>()
  if (buffer.length < 22) return entries

  let eocd = -1
  const scanStart = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= scanStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) return entries

  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)

  for (let index = 0; index < entryCount && cursor + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8")

    const wanted =
      /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)
      || /^ppt\/slides\/slide\d+\.xml$/i.test(name)
      || /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(name)

    if (
      wanted
      && uncompressedSize <= MAX_ARCHIVE_ENTRY_BYTES
      && localOffset + 30 <= buffer.length
      && buffer.readUInt32LE(localOffset) === 0x04034b50
    ) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const dataEnd = dataStart + compressedSize
      if (dataEnd <= buffer.length) {
        const raw = buffer.subarray(dataStart, dataEnd)
        try {
          const value = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null
          if (value && value.length <= MAX_ARCHIVE_ENTRY_BYTES) entries.set(name, value)
        } catch {
          // A corrupt archive entry must not break the whole chat request.
        }
      }
    }

    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function officeText(attachment: MalikMultimodalAttachment) {
  const data = decodeBase64(attachment)
  if (!data) return ""
  const entries = unzipSelected(data)
  if (!entries.size) return ""

  const ext = extension(attachment.name)
  const selected = [...entries.entries()]
    .filter(([name]) => {
      if (ext === "docx") return name.startsWith("word/")
      if (ext === "pptx") return name.startsWith("ppt/slides/")
      if (ext === "xlsx") return name.startsWith("xl/")
      return false
    })
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))

  return selected
    .map(([name, value], index) => {
      const body = xmlToText(value.toString("utf8"))
      if (!body) return ""
      const label = ext === "pptx" ? `Slide ${index + 1}` : name.split("/").pop() || name
      return `[${label}]\n${body}`
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_FILE_CONTEXT_CHARS)
}

function localText(attachment: MalikMultimodalAttachment) {
  if (typeof attachment.text === "string" && attachment.text.trim()) {
    return attachment.text.slice(0, MAX_FILE_CONTEXT_CHARS)
  }
  if (isOffice(attachment)) return officeText(attachment)
  if (!isTextLike(attachment)) return ""

  const data = decodeBase64(attachment)
  if (!data) return ""
  return data.toString("utf8").replace(/\u0000/g, "").slice(0, MAX_FILE_CONTEXT_CHARS)
}

function attachmentLabel(attachment: MalikMultimodalAttachment, index: number) {
  return String(attachment.name || `attachment-${index + 1}`).slice(0, 180)
}

function dataUrl(attachment: MalikMultimodalAttachment) {
  if (attachment.url?.startsWith("data:image/")) return attachment.url
  if (!attachment.base64) return ""
  const mime = attachmentMime(attachment)
  return `data:${mime.startsWith("image/") ? mime : "image/jpeg"};base64,${attachment.base64}`
}

function responseContent(payload: any) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content.map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim()
  }
  return ""
}

async function visionRequest(input: {
  url: string
  key: string
  model: string
  prompt: string
  images: MalikMultimodalAttachment[]
  headers?: Record<string, string>
}) {
  const content: any[] = [{ type: "text", text: input.prompt }]
  for (const attachment of input.images.slice(0, MAX_VISION_IMAGES)) {
    const url = dataUrl(attachment)
    if (url) content.push({ type: "image_url", image_url: { url } })
  }
  if (content.length <= 1) throw new Error("VISION_IMAGE_MISSING")

  const response = await providerFetch(input.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.key}`,
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      ...(input.headers || {}),
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "system",
          content: "You are the Malik AI visual perception layer. Analyze only what is actually visible. Answer the user's request directly and never reveal internal provider names or credentials.",
        },
        { role: "user", content },
      ],
      max_tokens: 3000,
      temperature: 0.15,
      stream: false,
    }),
  }, Number(process.env.MALIK_MULTIMODAL_PROVIDER_TIMEOUT_MS || 60_000))

  const payload = await response.json().catch(() => ({}))
  const text = responseContent(payload)
  if (!response.ok || !text) {
    throw new Error(payload?.error?.message || payload?.message || `vision provider returned ${response.status}`)
  }
  return { content: text, usage: payload?.usage }
}

async function runVisionFallback(prompt: string, images: MalikMultimodalAttachment[]) {
  const groqKey = env("GROQ_API_KEY")
  if (groqKey) {
    try {
      const base = (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")
      const result = await visionRequest({
        url: `${base}/chat/completions`,
        key: groqKey,
        model: env("GROQ_VISION_MODEL") || "qwen/qwen3.8-27b",
        prompt,
        images,
      })
      return { ...result, provider: "malik-multimodal-fallback", model: "malik-vision-fast" }
    } catch (error) {
      console.warn("[MALIK_MULTIMODAL] Groq vision fallback failed", error instanceof Error ? error.message : String(error))
    }
  }

  const cloudflareKey = env("CLOUDFLARE_AUTH_TOKEN") || env("CLOUDFLARE_API_TOKEN") || env("CF_API_TOKEN")
  const accountId = env("CLOUDFLARE_ACCOUNT_ID") || env("CF_ACCOUNT_ID")
  if (cloudflareKey && accountId) {
    const models = [...new Set([
      env("CLOUDFLARE_VISION_MODEL") || "@cf/google/gemma-4-26b-a4b-it",
      env("CLOUDFLARE_VISION_FALLBACK_MODEL") || "@cf/qwen/qwen3.8-27b",
    ])]
    for (const model of models) {
      try {
        const result = await visionRequest({
          url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
          key: cloudflareKey,
          model,
          prompt,
          images,
        })
        return { ...result, provider: "malik-multimodal-fallback", model: "malik-vision-reserve" }
      } catch (error) {
        console.warn("[MALIK_MULTIMODAL] Cloudflare vision fallback failed", model, error instanceof Error ? error.message : String(error))
      }
    }
  }

  throw new Error("VISION_FALLBACK_UNAVAILABLE")
}

async function transcribeFallback(attachments: MalikMultimodalAttachment[]) {
  const chunks: string[] = []
  for (const [index, attachment] of attachments.entries()) {
    const data = decodeBase64(attachment)
    if (!data) continue
    const arrayBuffer = Uint8Array.from(data).buffer
    const result = await transcribeAudio(
      arrayBuffer,
      attachmentLabel(attachment, index),
      attachmentMime(attachment),
      {},
    )
    if (result.ok && result.text) chunks.push(`[${attachmentLabel(attachment, index)} transcript]\n${result.text}`)
  }
  return chunks.join("\n\n")
}

function attachContext(prompt: string, context: string) {
  if (!context.trim()) return prompt
  return [
    prompt,
    "",
    "[MALIK_ATTACHED_FILE_CONTENT]",
    "Use the following extracted attachment content as source material. Do not claim content that is not present.",
    context.slice(0, MAX_FILE_CONTEXT_CHARS),
    "[/MALIK_ATTACHED_FILE_CONTENT]",
  ].join("\n")
}

export function hasMalikAttachments(value: unknown): value is MalikMultimodalAttachment[] {
  return Array.isArray(value) && value.some((item) => item && typeof item === "object")
}

export function estimateMultimodalTokens(attachments?: MalikMultimodalAttachment[]) {
  if (!attachments?.length) return 0
  let total = 0
  for (const attachment of attachments) {
    const size = Math.max(0, Number(attachment.size || 0))
    const kind = binaryKind(attachment)
    if (typeof attachment.text === "string") {
      total += Math.max(250, Math.ceil(attachment.text.length / 4))
    } else if (kind === "image") {
      total += 2_200
    } else if (kind === "video") {
      total += Math.max(6_000, Math.ceil(size / 1_200))
    } else if (kind === "audio") {
      total += Math.max(2_500, Math.ceil(size / 1_600))
    } else if (kind === "document" || isOffice(attachment)) {
      total += Math.max(1_000, Math.ceil(size / 2_500))
    } else {
      total += Math.max(500, Math.ceil(size / 4_000))
    }
  }
  return Math.min(30_000, Math.max(250, total))
}

export async function routeMalikAttachments(input: {
  prompt: string
  systemPrompt: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  attachments?: MalikMultimodalAttachment[]
  signal?: AbortSignal
}): Promise<MalikAttachmentRoute> {
  const attachments = (input.attachments || []).filter(Boolean).slice(0, 8)
  if (!attachments.length) return { kind: "none", estimatedTokens: 0 }

  const estimatedTokens = estimateMultimodalTokens(attachments)
  const files = attachments.map(attachmentLabel)
  const textSections: string[] = []
  const binary: MalikMultimodalAttachment[] = []
  const unreadable: string[] = []

  for (const [index, attachment] of attachments.entries()) {
    const kind = binaryKind(attachment)

    // A browser-sampled video reaches the server as lightweight video metadata
    // plus chronological JPEG frames. Keep the metadata in the prompt context
    // instead of trying to send an empty video blob to the vision provider.
    if (
      kind === "video"
      && !attachment.base64
      && typeof attachment.text === "string"
      && attachment.text.includes("[MALIK_VIDEO_TIMELINE_METADATA]")
    ) {
      textSections.push(`[${attachmentLabel(attachment, index)}]\n${attachment.text}`)
      continue
    }

    if (kind) {
      binary.push({ ...attachment, mime: attachmentMime(attachment), kind })
      continue
    }

    const text = localText(attachment)
    if (text.trim()) {
      textSections.push(`[${attachmentLabel(attachment, index)}]\n${text}`)
    } else if (attachment.kind === "url" && attachment.url) {
      textSections.push(`[${attachmentLabel(attachment, index)}]\nURL: ${attachment.url}`)
    } else {
      unreadable.push(attachmentLabel(attachment, index))
    }
  }

  const localContext = textSections.join("\n\n").slice(0, MAX_FILE_CONTEXT_CHARS)
  const enrichedPrompt = attachContext(input.prompt, localContext)

  if (binary.length) {
    try {
      const result = await runHiddenGeminiMultimodal({
        prompt: enrichedPrompt,
        systemPrompt: input.systemPrompt,
        history: input.history,
        attachments: binary,
        signal: input.signal,
      })
      return {
        kind: "answer",
        content: result.content,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        estimatedTokens,
        files,
      }
    } catch (geminiError) {
      console.warn("[MALIK_MULTIMODAL] Gemini route failed", geminiError instanceof Error ? geminiError.message : String(geminiError))

      const audio = binary.filter((item) => binaryKind(item) === "audio")
      const remaining = binary.filter((item) => binaryKind(item) !== "audio")
      let fallbackPrompt = enrichedPrompt

      if (audio.length) {
        const transcript = await transcribeFallback(audio)
        if (transcript) fallbackPrompt = attachContext(fallbackPrompt, transcript)
      }

      if (remaining.length && remaining.every((item) => binaryKind(item) === "image")) {
        try {
          const fallback = await runVisionFallback(fallbackPrompt, remaining)
          return {
            kind: "answer",
            content: fallback.content,
            provider: fallback.provider,
            model: fallback.model,
            usage: fallback.usage,
            estimatedTokens,
            files,
          }
        } catch (fallbackError) {
          console.warn("[MALIK_MULTIMODAL] vision reserve exhausted", fallbackError instanceof Error ? fallbackError.message : String(fallbackError))
        }
      }

      if (!remaining.length && fallbackPrompt !== enrichedPrompt) {
        return { kind: "context", prompt: fallbackPrompt, estimatedTokens, files }
      }

      const blockedKinds = [...new Set(remaining.map((item) => binaryKind(item)).filter(Boolean))]
      throw new Error(
        `Не удалось прочитать вложение (${blockedKinds.join(", ") || "file"}). Основной мультимодальный маршрут и резерв сейчас недоступны.`,
      )
    }
  }

  if (localContext.trim()) {
    return { kind: "context", prompt: enrichedPrompt, estimatedTokens, files }
  }

  throw new Error(`Формат файла пока не удалось прочитать: ${unreadable.join(", ") || files.join(", ")}.`)
}
