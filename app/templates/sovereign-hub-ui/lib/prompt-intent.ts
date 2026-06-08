export type GenerationIntent = "code" | "site" | "media" | "general"

export type ResponseMode = "chat" | "code" | "canvas"

const CREATE_VERBS = [
  "создай", "сделай", "сгенерируй", "построй", "собери", "напиши", "сверстай",
  "build", "generate", "create", "make", "design", "craft",
]

const SITE_KEYWORDS = [
  "сайт", "site", "website", "landing", "лендинг", "страниц", "интерфейс",
  "dashboard", "дашборд", "ui", "ux", "шаблон", "template", "canvas", "preview",
  "web app", "frontend", "saas", "портал",
]

const CODE_KEYWORDS = [
  "код", "code", "react", "component", "компонент", "html", "css", "next",
  "vue", "app", "tsx", "jsx", "typescript", "javascript", "tailwind",
]

const MEDIA_KEYWORDS = [
  "фото", "изображ", "картин", "нарисуй", "image", "photo", "picture",
  "видео", "ролик", "video", "runway", "kling", "анимац",
]

const SYSTEM_COMMANDS = ["/admin_db", "/admin", "/stats"]

function normalizePrompt(prompt: string) {
  return String(prompt || "").toLowerCase().trim()
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function hasCreateSignal(text: string) {
  return CREATE_VERBS.some((verb) => text.includes(verb))
}

/** Detect primary generation intent from user prompt. */
export function detectGenerationIntent(
  prompt: string,
  attachments: Array<{ kind?: string }> = [],
): GenerationIntent {
  const text = normalizePrompt(prompt)
  if (!text) return "general"

  if (SYSTEM_COMMANDS.some((cmd) => text.startsWith(cmd))) return "general"

  const attachmentKinds = new Set(attachments.map((item) => item.kind))
  const hasMediaAttachment =
    attachmentKinds.has("image") || attachmentKinds.has("video") || attachmentKinds.has("audio")

  const mediaOnly =
    hasAny(text, MEDIA_KEYWORDS) &&
    !hasAny(text, SITE_KEYWORDS) &&
    !hasAny(text, CODE_KEYWORDS.filter((k) => !["app"].includes(k)))

  if (mediaOnly || (hasMediaAttachment && /analyze|анализ|опис|describe|scan/i.test(text))) {
    return "media"
  }

  const siteSignal =
    hasAny(text, SITE_KEYWORDS) ||
    /\blanding page\b/.test(text) ||
    /\bweb\s*app\b/.test(text)

  const codeSignal = hasAny(text, CODE_KEYWORDS)

  if (siteSignal && (hasCreateSignal(text) || text.length > 36 || /\b(app|saas|dashboard|react)\b/.test(text))) {
    return "site"
  }

  if (codeSignal && (hasCreateSignal(text) || /\b(component|dashboard|app|landing|react|vue|next)\b/.test(text))) {
    return "code"
  }

  if (hasCreateSignal(text) && (siteSignal || codeSignal)) {
    return siteSignal ? "site" : "code"
  }

  return "general"
}

/** Open V0-style right canvas for code/site generation flows. */
export function shouldOpenCanvasSplit(intent: GenerationIntent): boolean {
  return intent === "code" || intent === "site"
}

/** Map intent to legacy dashboard response mode. */
export function intentToResponseMode(intent: GenerationIntent): ResponseMode {
  if (intent === "site") return "canvas"
  if (intent === "code") return "code"
  return "chat"
}

/** Whether request should run project/canvas orchestration (streaming artifact). */
export function isCanvasProjectRequest(intent: GenerationIntent): boolean {
  return intent === "site" || intent === "code"
}

/** Extract largest markdown code block from streamed text. */
export function extractLargestCodeBlock(text: string): string {
  const ticks = "```"
  const regex = new RegExp(ticks + "(?:([a-zA-Z0-9_+\\-]*)\\s*)?\\n([\\s\\S]*?)" + ticks, "g")
  const matches = [...String(text || "").matchAll(regex)]
  if (!matches.length) return ""

  const biggest = matches.reduce((max, match) => {
    const bodyLen = (match[2] || "").length
    const maxLen = (max[2] || "").length
    return bodyLen > maxLen ? match : max
  }, matches[0])

  return (biggest[2] || "").trim()
}

/** Stable hash for iframe remount — only when content meaningfully changes. */
export function canvasContentHash(code: string): string {
  const normalized = code.trim()
  if (!normalized) return "empty"
  const len = normalized.length
  const head = normalized.slice(0, 120)
  const tail = normalized.slice(-80)
  return `${len}:${head}:${tail}`
}
