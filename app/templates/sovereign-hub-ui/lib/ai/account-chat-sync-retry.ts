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


/** Show each cloud-sync incident type just once per signed-in account/browser.
 * A failed browser-storage write still allows one in-memory notice, rather
 * than crashing the chat or silently hiding an important first warning.
 */
const claimedAccountChatNotices = new Set<string>()
export type AccountChatSyncNotice = "not-configured" | "unavailable"

export function claimAccountChatSyncNotice(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  accountKey: string,
  notice: AccountChatSyncNotice,
): boolean {
  if (!accountKey || accountKey === "guest") return false
  const key = `malik_chat_sync_notice_seen_v1:${accountKey}:${notice}`
  if (claimedAccountChatNotices.has(key)) return false
  try {
    if (storage?.getItem(key) === "1") {
      claimedAccountChatNotices.add(key)
      return false
    }
    storage?.setItem(key, "1")
  } catch {
    // In privacy mode, fall back to once per page without blocking the app.
  }
  claimedAccountChatNotices.add(key)
  return true
}
