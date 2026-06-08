/** Public-safe status steps — never expose chain-of-thought. */

export type ThinkingStepId =
  | "received"
  | "analyzing"
  | "reading_files"
  | "checking_providers"
  | "selecting_model"
  | "generating"
  | "fallback"
  | "finalizing"
  | "done"

export type ThinkingStep = {
  id: ThinkingStepId
  label: string
  state: "pending" | "active" | "done"
}

export const THINKING_LABELS: Record<ThinkingStepId, string> = {
  received: "Запрос получен",
  analyzing: "Анализирую запрос...",
  reading_files: "Читаю вложения...",
  checking_providers: "Проверяю доступные провайдеры...",
  selecting_model: "Выбираю лучшую модель...",
  generating: "Генерирую ответ...",
  fallback: "Основной провайдер недоступен, переключаюсь на резерв...",
  finalizing: "Финализирую ответ...",
  done: "Готово",
}

export function buildThinkingPipeline(input: {
  hasAttachments?: boolean
  fallbackExpected?: boolean
}): ThinkingStep[] {
  const steps: ThinkingStepId[] = ["received", "analyzing"]
  if (input.hasAttachments) steps.push("reading_files")
  steps.push("checking_providers", "selecting_model", "generating")
  if (input.fallbackExpected) steps.push("fallback")
  steps.push("finalizing", "done")
  return steps.map((id, index) => ({
    id,
    label: THINKING_LABELS[id],
    state: index === 0 ? "active" : "pending",
  }))
}

export function advanceThinkingStep(steps: ThinkingStep[], activeId: ThinkingStepId): ThinkingStep[] {
  let passed = false
  return steps.map((step) => {
    if (step.id === activeId) {
      passed = true
      return { ...step, state: "active" }
    }
    if (!passed) return { ...step, state: "done" }
    return step
  })
}

export function publicStatusLabel(stepId: ThinkingStepId): string {
  return THINKING_LABELS[stepId]
}
