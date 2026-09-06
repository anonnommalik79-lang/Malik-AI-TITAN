import "server-only"
import { shortsSupabaseRequest } from "@/lib/shorts/server"
import { YouTubeError } from "./errors"
import { nonce } from "./security"
import type { Channel } from "./contracts"

export type Connection = {
  workos_user_id: string; access_encrypted: string; refresh_encrypted: string; expires_at: string
  scopes: string[]; channels: Channel[]; channel_id: string | null; saved_playlist_id: string | null; saved_playlist_checked?: boolean; updated_at: string
}
export async function db<T>(path: string, init?: RequestInit): Promise<T> {
  try { return await shortsSupabaseRequest<T>(path, { ...init, signal: AbortSignal.timeout(15000) }) }
  catch { throw new YouTubeError("DATABASE_UNAVAILABLE", 503) }
}
export const ownerFilter = (user: string) => `workos_user_id=eq.${encodeURIComponent(user)}`
export async function connection(user: string) {
  const rows = await db<Connection[]>(`youtube_connections?${ownerFilter(user)}&select=*&limit=1`)
  return rows[0] || null
}
export async function patchConnection(user: string, patch: Partial<Connection>) {
  await db(`youtube_connections?${ownerFilter(user)}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
}
export async function locked<T>(user: string, operation: string, fn: () => Promise<T>) {
  const lease = nonce()
  const acquired = await db<boolean>("rpc/youtube_acquire_lock", { method: "POST", body: JSON.stringify({ p_user: user, p_operation: operation, p_lease: lease }) })
  if (!acquired) throw new YouTubeError("BUSY", 409)
  try { return await fn() }
  finally { await db("rpc/youtube_release_lock", { method: "POST", body: JSON.stringify({ p_user: user, p_operation: operation, p_lease: lease }) }).catch(() => {}) }
}
