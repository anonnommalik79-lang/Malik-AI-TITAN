import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const SUPPORTED = new Set([
  "auto", "ru", "en", "kk", "tr", "de", "fr", "es", "it", "pt", "uk", "pl", "nl", "ar", "zh-CN", "ja", "ko", "hi",
])

const MAX_TEXT_LENGTH = 3000
const MAX_SEGMENT_BYTES = 450

function detectLanguage(text: string) {
  if (/[ӘәҒғҚқҢңӨөҰұҮүҺһ]/.test(text)) return "kk"
  if (/[ぁ-ゟ゠-ヿ]/.test(text)) return "ja"
  if (/[가-힣]/.test(text)) return "ko"
  if (/[一-鿿]/.test(text)) return "zh-CN"
  if (/[؀-ۿ]/.test(text)) return "ar"
  if (/[А-Яа-яЁёІіЇїЄєҐґ]/.test(text)) {
    if (/[ІіЇїЄєҐґ]/.test(text)) return "uk"
    return "ru"
  }
  if (/[ĞğİıŞşÇçÖöÜü]/.test(text)) return "tr"
  return "en"
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function splitSegment(value: string, maxBytes = MAX_SEGMENT_BYTES) {
  if (!value) return [] as string[]
  if (byteLength(value) <= maxBytes) return [value]

  const chunks: string[] = []
  let current = ""

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ""
  }

  for (const token of value.split(/(\s+)/)) {
    if (!token) continue
    const candidate = current + token
    if (byteLength(candidate) <= maxBytes) {
      current = candidate
      continue
    }

    if (current.trim()) flush()

    if (byteLength(token) <= maxBytes) {
      current = token
      continue
    }

    let hard = ""
    for (const char of Array.from(token)) {
      const next = hard + char
      if (byteLength(next) > maxBytes && hard) {
        chunks.push(hard)
        hard = char
      } else {
        hard = next
      }
    }
    current = hard
  }

  flush()
  return chunks
}

function splitText(text: string) {
  const lines = text.split(/(\n+)/)
  const output: Array<{ text: string; separator: boolean }> = []

  for (const part of lines) {
    if (!part) continue
    if (/^\n+$/.test(part)) {
      output.push({ text: part, separator: true })
      continue
    }

    const sentences = part.split(/(?<=[.!?。！？])\s+/u)
    let current = ""

    const flush = () => {
      if (!current.trim()) return
      for (const chunk of splitSegment(current.trim())) output.push({ text: chunk, separator: false })
      current = ""
    }

    for (const sentence of sentences) {
      if (!sentence) continue
      const candidate = current ? `${current} ${sentence}` : sentence
      if (byteLength(candidate) <= MAX_SEGMENT_BYTES) current = candidate
      else {
        flush()
        current = sentence
      }
    }
    flush()
  }

  return output
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

async function translateSegment(text: string, source: string, target: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const params = new URLSearchParams({
      q: text,
      langpair: `${source}|${target}`,
      mt: "1",
    })

    const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    if (!response.ok) throw new Error(`translation_upstream_${response.status}`)

    const payload = await response.json()
    const translated = payload?.responseData?.translatedText
    const status = Number(payload?.responseStatus || 200)

    if (status >= 400 || typeof translated !== "string" || !translated.trim()) {
      throw new Error("translation_empty")
    }

    return decodeEntities(translated.trim())
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = String(body?.text || "").trim()
    const requestedSource = String(body?.source || "auto")
    const target = String(body?.target || "en")

    if (!text) return NextResponse.json({ error: "Введите текст для перевода." }, { status: 400 })
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `Максимум ${MAX_TEXT_LENGTH} символов за один перевод.` }, { status: 400 })
    }
    if (!SUPPORTED.has(requestedSource) || !SUPPORTED.has(target) || target === "auto") {
      return NextResponse.json({ error: "Неподдерживаемая языковая пара." }, { status: 400 })
    }

    const source = requestedSource === "auto" ? detectLanguage(text) : requestedSource
    if (source === target) {
      return NextResponse.json({ translatedText: text, detectedSource: source, provider: "direct" })
    }

    const pieces = splitText(text)
    let translatedText = ""

    for (const piece of pieces) {
      if (piece.separator) {
        translatedText += piece.text
        continue
      }

      const translated = await translateSegment(piece.text, source, target)
      if (translatedText && !translatedText.endsWith("\n") && !translatedText.endsWith(" ")) translatedText += " "
      translatedText += translated
    }

    return NextResponse.json({
      translatedText: translatedText.trim(),
      detectedSource: source,
      provider: "mymemory",
    })
  } catch (error) {
    console.error("Malik Translator error:", error)
    return NextResponse.json(
      { error: "Сервис перевода временно не ответил. Повторите через несколько секунд." },
      { status: 502 },
    )
  }
}
