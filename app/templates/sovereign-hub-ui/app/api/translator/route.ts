import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUPPORTED = new Set([
  "auto", "ru", "en", "kk", "tr", "de", "fr", "es", "it", "pt", "uk", "pl", "nl", "ar", "zh-CN", "ja", "ko", "hi",
])

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Russian",
  en: "English",
  kk: "Kazakh",
  tr: "Turkish",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  uk: "Ukrainian",
  pl: "Polish",
  nl: "Dutch",
  ar: "Arabic",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
}

const MAX_TEXT_LENGTH = 5000
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

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ""
}

function geminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim()
}

async function translateWithGemini(text: string, source: string, target: string) {
  const key = env("GEMINI_TRANSLATOR_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY")
  if (!key) return ""

  const model = env("GEMINI_TRANSLATOR_MODEL", "MALIK_GEMINI_MODEL") || "gemini-3.7-flash"
  const sourceName = LANGUAGE_NAMES[source] || source
  const targetName = LANGUAGE_NAMES[target] || target
  const prompt = [
    "You are Malik Translator.",
    `Translate the following text from ${sourceName} to ${targetName}.`,
    "Return ONLY the translated text.",
    "Preserve paragraph breaks, punctuation, numbers, URLs, product names, code identifiers and proper names when appropriate.",
    "Do not explain the translation and do not add quotation marks or notes.",
    "TEXT:",
    text,
  ].join("\n")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.05,
          maxOutputTokens: 4096,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) return ""
    const payload = await response.json().catch(() => ({}))
    return geminiText(payload)
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
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
      } else hard = next
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
    for (const chunk of splitSegment(part)) output.push({ text: chunk, separator: false })
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
    const params = new URLSearchParams({ q: text, langpair: `${source}|${target}`, mt: "1" })
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
    if (status >= 400 || typeof translated !== "string" || !translated.trim()) throw new Error("translation_empty")
    return decodeEntities(translated.trim())
  } finally {
    clearTimeout(timer)
  }
}

async function translateClassic(text: string, source: string, target: string) {
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
  return translatedText.trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = String(body?.text || "").trim()
    const requestedSource = String(body?.source || "auto")
    const target = String(body?.target || "en")

    if (!text) return NextResponse.json({ error: "Введите текст для перевода." }, { status: 400 })
    if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: `Максимум ${MAX_TEXT_LENGTH} символов за один перевод.` }, { status: 400 })
    if (!SUPPORTED.has(requestedSource) || !SUPPORTED.has(target) || target === "auto") return NextResponse.json({ error: "Неподдерживаемая языковая пара." }, { status: 400 })

    const source = requestedSource === "auto" ? detectLanguage(text) : requestedSource
    if (source === target) return NextResponse.json({ translatedText: text, detectedSource: source, provider: "malik-translator" })

    const gemini = await translateWithGemini(text, source, target)
    const translatedText = gemini || await translateClassic(text, source, target)

    return NextResponse.json({
      translatedText,
      detectedSource: source,
      provider: "malik-translator",
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Malik Translator error:", error)
    return NextResponse.json({ error: "Сервис перевода временно не ответил. Повторите через несколько секунд." }, { status: 502 })
  }
}
