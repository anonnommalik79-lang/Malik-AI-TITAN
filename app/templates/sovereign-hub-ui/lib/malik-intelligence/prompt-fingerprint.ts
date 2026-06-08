import { checksum } from "./id"

export function normalizePromptForFingerprint(prompt: string) {
  return String(prompt || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 2000)
}

export function promptFingerprint(prompt: string) {
  return checksum(normalizePromptForFingerprint(prompt))
}

export function promptComplexity(prompt: string) {
  const text = String(prompt || "")
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const hasCode = /```|function|class|import|export|def |const |let |var /i.test(text)
  const hasMedia = /video|видео|photo|image|фото|картин|нарис/i.test(text)
  const hasBuild = /создай|build|generate|сгенер|сделай|проект|сайт|код/i.test(text)
  return {
    words,
    chars: text.length,
    hasCode,
    hasMedia,
    hasBuild,
    score: Math.min(100, words + (hasCode ? 25 : 0) + (hasMedia ? 18 : 0) + (hasBuild ? 15 : 0)),
  }
}

