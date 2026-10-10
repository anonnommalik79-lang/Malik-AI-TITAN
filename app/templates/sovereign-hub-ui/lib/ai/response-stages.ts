import type { ExecutionTrace } from "@/lib/ai/chat-execution"

/**
 * The progress line under «Думаю…» while an answer is being prepared.
 *
 * These are interface statuses written by Malik AI, NOT the model's hidden
 * reasoning: nothing here is extracted from, or pretends to be, a chain of
 * thought. A stage is shown only when the work it names really happened:
 * «Определяю задачу» once the server reports any step, «Проверяю контекст»
 * only when it searched, read a page, a file or a connection, «Формирую
 * ответ» once the model call starts. A stage that did not happen is never
 * shown, not even as done, and time alone never moves the line forward.
 */
export const RESPONSE_STAGES = [
  "Анализирую запрос…",
  "Определяю задачу…",
  "Проверяю контекст…",
  "Формирую ответ…",
] as const

export const RESPONSE_STAGE_DONE = "Готово"

/** Index of the "done" row, after the four working stages. */
export const RESPONSE_STAGE_DONE_INDEX = RESPONSE_STAGES.length

/** How long «Готово» stays before the block folds away, and the fold itself. */
export const RESPONSE_STAGE_DONE_HOLD_MS = 520
export const RESPONSE_STAGE_COLLAPSE_MS = 420

export type ResponseStageSignals = {
  /** Milliseconds since the request was sent. */
  elapsedMs: number
  /** Steps the server itself reported for this turn (not the client's "sent"). */
  serverSteps: number
  /** The server searched, read a page, a file or a connection for this turn. */
  contextChecked?: boolean
  /** The server says the model has started writing the answer. */
  modelStarted: boolean
  /** The first characters of the answer are on screen. */
  writing: boolean
}

/** Did the work a stage names really happen? Stage 0 is the request itself. */
export function responseStageHappened(stage: number, signals: Omit<ResponseStageSignals, "elapsedMs" | "writing">): boolean {
  if (stage === 0) return true
  if (stage === 1) return signals.serverSteps > 0
  if (stage === 2) return Boolean(signals.contextChecked)
  if (stage === 3) return signals.modelStarted
  return false
}

/**
 * The stage to show for the observed signals: 0…3 while working, 4 once the
 * answer is being written - the highest stage whose work really happened.
 * Callers keep the maximum they have shown, so a stage never goes backwards.
 */
export function responseStageIndex(signals: ResponseStageSignals): number {
  if (signals.writing) return RESPONSE_STAGE_DONE_INDEX
  for (let stage = RESPONSE_STAGES.length - 1; stage > 0; stage -= 1) {
    if (responseStageHappened(stage, signals)) return stage
  }
  return 0
}

/** What the progress line may read from a turn's execution trace. */
export function responseStageSignalsFromTrace(trace: ExecutionTrace | undefined): Pick<ResponseStageSignals, "serverSteps" | "modelStarted" | "contextChecked"> {
  const steps = trace?.steps || []
  // The dashboard adds one local step («Отправка запроса») before the
  // server answers; everything else was reported by the server.
  const server = steps.filter((step) => !step.id.endsWith(":request"))
  const serverSteps = server.length
  const modelStarted = server.some((step) => step.kind === "model")
  const contextChecked = server.some((step) => step.kind === "search" || step.kind === "read" || step.kind === "file" || step.kind === "plugin")
  return { serverSteps, modelStarted, contextChecked }
}

/**
 * Rows to draw: finished stages, the current one and «Готово», newest last.
 * With `happened`, a stage whose work never took place is left out.
 */
export function responseStageRows(index: number, visible = 3, happened?: (stage: number) => boolean): Array<{ label: string; state: "done" | "current"; stage: number }> {
  const rows: Array<{ label: string; state: "done" | "current"; stage: number }> = []
  const last = Math.min(index, RESPONSE_STAGE_DONE_INDEX)
  for (let stage = 0; stage <= last; stage += 1) {
    if (happened && stage !== last && stage < RESPONSE_STAGE_DONE_INDEX && !happened(stage)) continue
    const label = stage === RESPONSE_STAGE_DONE_INDEX ? RESPONSE_STAGE_DONE : RESPONSE_STAGES[stage]
    const finished = stage < last || stage === RESPONSE_STAGE_DONE_INDEX
    rows.push({ label, state: finished ? "done" : "current", stage })
  }
  return rows.slice(-Math.max(1, visible))
}
