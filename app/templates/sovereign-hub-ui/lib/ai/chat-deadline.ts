/**
 * How long one chat answer may take, end to end.
 *
 * Every step of the full pipeline (search, expert review, synthesis) has its
 * own limit, but nothing bounded the whole: a question once kept the server
 * busy for eleven minutes without a single word and ended in «Сервер слишком
 * долго не отдаёт готовый ответ». These are the server's promises for a text
 * answer; the browser derives its waits from them, so the server always
 * speaks first.
 *
 * - `rescueAtMs`: no word by then means the full pipeline is stuck. It is
 *   stopped, and one direct model call answers from the evidence already found.
 * - `rescueMs`: the most that direct answer may take.
 * - `hardMs`: an answer still being written by then is delivered as it
 *   stands, with «Продолжить» under it, instead of being lost.
 */
export type ChatAnswerDeadline = { rescueAtMs: number; rescueMs: number; hardMs: number }

export function chatAnswerDeadline(kind: { code: boolean; deep: boolean; site?: boolean; game?: boolean }): ChatAnswerDeadline {
  // The MAX engine's own wall clock for this kind of request
  // (maxResponseWallMs), plus room for search and planning before it starts.
  const engineMs = kind.code ? (kind.deep ? 300_000 : 240_000) : kind.deep ? 160_000 : 115_000
  // A game is built, run, repaired and polished before its first word reaches
  // the chat: silence is normal there, and a text rescue would replace a game.
  const rescueAtMs = kind.game ? 14 * 60_000 : engineMs + 50_000
  const rescueMs = 75_000
  // A website streams its first draft early, then may get an upgrade pass:
  // that second pass needs room before the answer is closed as written.
  return { rescueAtMs, rescueMs, hardMs: rescueAtMs + rescueMs + 45_000 + (kind.site ? 150_000 : 0) }
}

function settleBy<T>(promise: Promise<T>, at: number): Promise<{ done: true; value: T } | { done: false }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ done: false }), Math.max(0, at - Date.now()))
    promise.then((value) => { clearTimeout(timer); resolve({ done: true, value }) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

/** Quota, sign-in and the person's own «Стоп» are answers in themselves; never paper over them. */
function rescuableFailure(error: unknown) {
  if ((error as Error)?.name === "AbortError") return false
  const status = Number((error as { status?: unknown })?.status)
  return !Number.isFinite(status) || status >= 500
}

/**
 * Holds a text answer to its deadline. A run that has written nothing by
 * `rescueAtMs`, or failed without a word, is stopped and replaced by
 * `rescue`; one that fails mid-answer or is still writing at `hardMs` is
 * delivered as written, with «Продолжить». The person gets an answer, never
 * a timeout.
 */
export async function withinChatDeadline<T>(main: Promise<T>, deadline: ChatAnswerDeadline, startedAt: number, run: {
  wrote: () => boolean
  stop: () => void
  rescue: () => Promise<T>
  partial: (reason: "time" | "interrupted") => T
}): Promise<T> {
  const recover = (error: unknown) => {
    if (!rescuableFailure(error)) throw error
    console.warn("[MALIK_CHAT_DEADLINE] run failed", JSON.stringify({ wrote: run.wrote(), error: error instanceof Error ? error.message : String(error) }))
    run.stop()
    return run.wrote() ? run.partial("interrupted") : run.rescue()
  }
  let first: { done: true; value: T } | { done: false }
  try { first = await settleBy(main, startedAt + deadline.rescueAtMs) }
  catch (error) { return recover(error) }
  if (first.done) return first.value
  if (!run.wrote()) {
    console.warn("[MALIK_CHAT_DEADLINE] no text by the rescue deadline, rescuing", JSON.stringify({ afterMs: Date.now() - startedAt }))
    run.stop()
    main.catch(() => {})
    return run.rescue()
  }
  let second: { done: true; value: T } | { done: false }
  try { second = await settleBy(main, startedAt + deadline.hardMs) }
  catch (error) { return recover(error) }
  if (second.done) return second.value
  console.warn("[MALIK_CHAT_DEADLINE] hard deadline, delivering the written text", JSON.stringify({ afterMs: Date.now() - startedAt }))
  run.stop()
  main.catch(() => {})
  return run.partial("time")
}
