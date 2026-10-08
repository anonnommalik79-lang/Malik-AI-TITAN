/** Bounded retry policy for authenticated cloud chat history snapshots.
 * No background worker, cross-account state or provider calls.
 */
export function accountChatRetryDelay(attempt: number): number {
  const safe = Math.max(0, Math.min(6, Number.isFinite(attempt) ? Math.floor(attempt) : 0))
  return Math.min(30_000, 850 * 2 ** safe)
}

export function accountChatWriteConfirmed(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false
  const state = payload as Record<string, unknown>
  return state.ok === true && state.configured === true && state.stored === true
}

/** A newer locally prepared snapshot takes precedence over a failed older PUT. */
export function shouldRetryAccountChatWrite(sentRevision: number, latestRevision: number, disposed: boolean): boolean {
  return !disposed && sentRevision === latestRevision
}
