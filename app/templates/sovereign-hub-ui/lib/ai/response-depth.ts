import type { AIPlan } from "./types"

export type ResponseDepth = "fast" | "deep" | "ultra"

export type ChatSendOptions = {
  responseDepth?: ResponseDepth
  research?: boolean
}

const STORAGE_KEY = "malik_response_depth"

export function canUseUltra(plan: AIPlan = "free"): boolean {
  return plan === "pro" || plan === "ultra" || plan === "owner"
}

export function loadResponseDepth(plan: AIPlan = "free"): ResponseDepth {
  if (typeof window === "undefined") return "fast"
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "ultra" && canUseUltra(plan)) return "ultra"
    if (saved === "deep") return "deep"
    return "fast"
  } catch {
    return "fast"
  }
}

export function saveResponseDepth(depth: ResponseDepth): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, depth)
  } catch {
    /* best effort */
  }
}

export function responseDepthInstruction(depth: ResponseDepth): string {
  if (depth === "ultra") {
    return `
[MALIK_RESPONSE_DEPTH_ULTRA]
Режим ULTRA (Pro/Max): максимальное качество для сложных задач.
Сначала молча разбери задачу на слои, затем выдай production-ready результат.
Для кода: полная архитектура, все файлы, типы, edge cases, тесты, безопасность, деплой-чеклист.
Для проектов: стратегия, структура, риски, метрики, пошаговый план внедрения.
Для СМИ: материал «под публикацию» без сокращений и без выдуманных фактов.
Используй лучшие доступные модели — ответ должен быть на уровне senior-эксперта.
`.trim()
  }
  if (depth === "deep") {
    return `
[MALIK_RESPONSE_DEPTH_DEEP]
Режим глубокого мышления: сначала молча разбери задачу, затем дай развёрнутый ответ.
Для сложного кода: архитектура, файлы, edge cases, тесты, безопасность, пошаговая проверка.
Для проектов: полный план, структура, риски, чеклист внедрения.
Не сокращай ответ ради скорости — журналисты и инженеры должны получить готовый материал.
`.trim()
  }
  return `
[MALIK_RESPONSE_DEPTH_FAST]
Режим быстрого ответа: сразу по делу, без длинных вступлений.
Короткие абзацы, главное в начале. Для простых вопросов — 3–8 предложений.
`.trim()
}

export function responseDepthLimits(depth: ResponseDepth): { maxTokens: number; temperature: number; minAnswerChars: number } {
  if (depth === "ultra") {
    return { maxTokens: 8000, temperature: 0.5, minAnswerChars: 400 }
  }
  if (depth === "deep") {
    return { maxTokens: 4000, temperature: 0.45, minAnswerChars: 200 }
  }
  return { maxTokens: 900, temperature: 0.3, minAnswerChars: 40 }
}

/** Server-side: downgrade ultra if plan does not allow it. */
export function resolveResponseDepth(depth: unknown, plan: AIPlan): ResponseDepth {
  const wanted = depth === "ultra" ? "ultra" : depth === "deep" ? "deep" : "fast"
  if (wanted === "ultra" && !canUseUltra(plan)) return "deep"
  return wanted
}
