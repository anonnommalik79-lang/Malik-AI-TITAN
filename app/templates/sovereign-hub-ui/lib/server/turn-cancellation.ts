/**
 * «Стоп» that really stops the server.
 *
 * A chat turn keeps generating after the browser disconnects: its stream is
 * teed into durable storage so a closed tab still gets its answer. That same
 * design meant an explicit Stop only cut the browser's copy, while the model
 * kept writing (and spending) to the end. Each running turn now registers an
 * AbortController here; the owner's Stop request aborts it, which cancels the
 * model call and saves what was written so far.
 *
 * Process-local on purpose: a turn runs in the process that started it. A
 * stop that reaches another instance reports "not-running" and changes nothing.
 */

type RunningTurn = { ownerId: string; controller: AbortController; startedAt: number }
type GlobalWithTurns = typeof globalThis & { __malikRunningTurnsV1?: Map<string, RunningTurn> }

export const STOPPED_BY_USER = "Остановлено пользователем."
const MAX_RUNNING = 512
const STALE_MS = 30 * 60_000

function running() {
  const scope = globalThis as GlobalWithTurns
  if (!scope.__malikRunningTurnsV1) scope.__malikRunningTurnsV1 = new Map()
  return scope.__malikRunningTurnsV1
}

/** Called when a turn starts generating. The returned signal aborts on the owner's Stop. */
export function registerRunningTurn(turnId: string, ownerId: string) {
  const turns = running()
  const now = Date.now()
  // Bounded: entries are released when a turn ends; anything older than the
  // longest answer is a leak and is dropped first.
  if (turns.size >= MAX_RUNNING) {
    for (const [id, turn] of turns) {
      if (turns.size < MAX_RUNNING && now - turn.startedAt < STALE_MS) break
      turns.delete(id)
    }
  }
  const controller = new AbortController()
  turns.set(turnId, { ownerId, controller, startedAt: now })
  return controller.signal
}

/** Called when a turn has ended, however it ended. */
export function releaseRunningTurn(turnId: string) {
  running().delete(turnId)
}

export type StopResult = "stopped" | "not-running" | "forbidden"

/** The owner's Stop: aborts the running generation. Someone else's turn is never touched. */
export function stopRunningTurn(turnId: string, ownerId: string): StopResult {
  const turn = running().get(turnId)
  if (!turn) return "not-running"
  if (!ownerId || turn.ownerId !== ownerId) return "forbidden"
  if (!turn.controller.signal.aborted) turn.controller.abort(STOPPED_BY_USER)
  return "stopped"
}

export function runningTurnCount() {
  return running().size
}
