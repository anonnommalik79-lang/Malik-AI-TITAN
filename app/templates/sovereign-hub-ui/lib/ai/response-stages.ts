import type { ExecutionTrace } from "@/lib/ai/chat-execution"

/**
 * The progress line under «Думаю…» while an answer is being prepared.
 *
 * These are interface statuses written by Malik AI, NOT the model's hidden
 * reasoning: nothing here is extracted from, or pretends to be, a chain of
 * thought. Each stage advances on something the browser can observe — time
 * since the request was sent, a step the server reported, the model call
 * starting, the first characters of the answer — and never runs ahead of
 * the answer: the last working stage waits until text really arrives.
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

/** Earliest moment each working stage may appear, from the request start. */
export const RESPONSE_STAGE_MIN_MS = [0, 850, 1900, 3200] as const

/** How long «Готово» stays before the block folds away, and the fold itself. */
export const RESPONSE_STAGE_DONE_HOLD_MS = 520
export const RESPONSE_STAGE_COLLAPSE_MS = 420

export type ResponseStageSignals = {
  /** Milliseconds since the request was sent. */
  elapsedMs: number
  /** Steps the server itself reported for this turn (not the client's "sent"). */
  serverSteps: number
  /** The server says the model has started writing the answer. */
  modelStarted: boolean
  /** The first characters of the answer are on screen. */
  writing: boolean
}

/**
 * The stage to show for the observed signals: 0…3 while working, 4 once the
 * answer is being written. Callers keep the maximum they have shown, so a
 * stage never goes backwards.
 */
export function responseStageIndex(signals: ResponseStageSignals): number {
  if (signals.writing) return RESPONSE_STAGE_DONE_INDEX
  let index = 0
  RESPONSE_STAGE_MIN_MS.forEach((at, stage) => {
    if (signals.elapsedMs >= at) index = stage
  })
  // The server confirmed it is working on this request: the context step is
  // real. The model call starting means the answer is being formed.
  if (signals.serverSteps > 0) index = Math.max(index, 2)
  if (signals.modelStarted) index = Math.max(index, 3)
  return Math.min(index, RESPONSE_STAGES.length - 1)
}

/** What the progress line may read from a turn's execution trace. */
export function responseStageSignalsFromTrace(trace: ExecutionTrace | undefined): Pick<ResponseStageSignals, "serverSteps" | "modelStarted"> {
  const steps = trace?.steps || []
  // The dashboard adds one local step («Отправка запроса») before the
  // server answers; everything else was reported by the server.
  const serverSteps = steps.filter((step) => !step.id.endsWith(":request")).length
  const modelStarted = steps.some((step) => step.kind === "model")
  return { serverSteps, modelStarted }
}

/** Rows to draw: finished stages, the current one and «Готово», newest last. */
export function responseStageRows(index: number, visible = 3): Array<{ label: string; state: "done" | "current"; stage: number }> {
  const rows: Array<{ label: string; state: "done" | "current"; stage: number }> = []
  const last = Math.min(index, RESPONSE_STAGE_DONE_INDEX)
  for (let stage = 0; stage <= last; stage += 1) {
    const label = stage === RESPONSE_STAGE_DONE_INDEX ? RESPONSE_STAGE_DONE : RESPONSE_STAGES[stage]
    const finished = stage < last || stage === RESPONSE_STAGE_DONE_INDEX
    rows.push({ label, state: finished ? "done" : "current", stage })
  }
  return rows.slice(-Math.max(1, visible))
}
