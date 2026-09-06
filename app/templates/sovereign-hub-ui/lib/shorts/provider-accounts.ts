import "server-only"

import { getShortsSupabaseConfig, getTikTokShortsConfig, getYouTubeShortsConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import { freshnessLabel, type TikTokSyncState } from "@/lib/shorts/tiktok-sync-policy"

/**
 * One Malik user, several connected platforms.
 *
 * Identity stays with WorkOS: a person signs in once, and YouTube and TikTok
 * hang off that single account rather than becoming second and third Malik
 * users. malik_shorts_external_accounts already models exactly that - its key
 * is (user_key, provider), enforced by a unique constraint - so both rows
 * coexist for one WorkOS id and the schema needs no change.
 *
 * This is a standalone reader on purpose. YouTube connection is being built in
 * parallel, and a shared endpoint edited from two sides is a merge conflict
 * waiting to happen. Here the provider is a parameter: the moment YouTube rows
 * start landing in that table, this returns them with no edit at all.
 *
 * SECURITY: the select list below is an allow-list, never `*`. The same row
 * holds access_token_encrypted and refresh_token_encrypted, and a `select=*`
 * here would put encrypted credentials one JSON response away from the
 * browser. Nothing in this file may return a token, a secret, or a key - not
 * even an encrypted one, and not inside metadata, which is why metadata is
 * projected field by field rather than passed through.
 */

export type ShortsProviderId = "youtube" | "tiktok"

export const SHORTS_PROVIDERS: ShortsProviderId[] = ["youtube", "tiktok"]

export type ShortsProviderProfile = {
  displayName: string
  avatar: string | null
  username: string
}

export type ShortsProviderState = {
  /** Whether the server has the credentials to offer this provider at all. */
  configured: boolean
  connected: boolean
  profile?: ShortsProviderProfile
  /** `tiktok:<open_id>` - the public creator this connection publishes as. */
  creatorKey?: string | null
  /** Last successful import, ISO. Null when never synced. */
  lastSyncAt?: string | null
  /** Bounded count of materialised posts; `postCountCapped` marks the ceiling. */
  postCount?: number
  postCountCapped?: boolean
  freshness?: "never" | "fresh" | "stale" | "failing"
  /** Present only when the last import failed, so the UI can explain the gap. */
  lastError?: string | null
  scopes?: string[]
}

export type ShortsProviderAccounts = {
  workosAuthenticated: boolean
  /** False when the Shorts tables are not configured - nothing can be stored yet. */
  persistence: boolean
  providers: Record<ShortsProviderId, ShortsProviderState>
}

/** How many post rows are counted before reporting a capped number. */
const POST_COUNT_CAP = 200

function emptyProviders(): Record<ShortsProviderId, ShortsProviderState> {
  return {
    youtube: { configured: Boolean(getYouTubeShortsConfig()), connected: false },
    tiktok: { configured: Boolean(getTikTokShortsConfig()), connected: false },
  }
}

function toProfile(row: any): ShortsProviderProfile {
  const displayName = String(row?.display_name || row?.username || "").trim()
  const username = String(row?.username || "").trim()
  return {
    displayName: displayName || username || "Аккаунт",
    avatar: row?.avatar_url ? String(row.avatar_url) : null,
    username,
  }
}

/**
 * How many posts this creator has, and when the newest one arrived.
 *
 * The timestamp matters as much as the count. A connection made before sync
 * stamps existed has no last_sync_at, so with the count alone freshnessLabel
 * answered "never" for an account whose videos were imported an hour ago -
 * a false alarm on every legacy connection. Ordering by created_at gets the
 * newest row in the same request, and it stands in for the missing stamp.
 */
async function readCreatorPosts(creatorKey: string, provider: ShortsProviderId) {
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_posts?select=id,created_at&source=eq.${provider}&creator_key=eq.${
      encodeURIComponent(creatorKey)
    }&order=created_at.desc&limit=${POST_COUNT_CAP}`,
  ).catch(() => [] as any[])
  const count = rows?.length || 0
  return { count, capped: count >= POST_COUNT_CAP, newestPostAt: rows?.[0]?.created_at || null }
}

/**
 * The account contract the Shorts UI reads.
 *
 * Never throws: a viewer with no WorkOS session, no Shorts database, or a
 * database refusing connections all get the same shape back with
 * `connected: false`, because a connection panel that renders an exception is
 * worse than one that says "not connected".
 */
export async function getShortsProviderAccounts(userKey: string | null | undefined): Promise<ShortsProviderAccounts> {
  const key = String(userKey || "").trim()
  if (!key) {
    return { workosAuthenticated: false, persistence: Boolean(getShortsSupabaseConfig()), providers: emptyProviders() }
  }
  if (!getShortsSupabaseConfig()) {
    return { workosAuthenticated: true, persistence: false, providers: emptyProviders() }
  }

  // Allow-list, not `*`: see the SECURITY note above.
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_external_accounts?select=provider,provider_user_id,username,display_name,avatar_url,granted_scopes,metadata&user_key=eq.${
      encodeURIComponent(key)
    }&provider=in.(${SHORTS_PROVIDERS.join(",")})`,
  ).catch(() => [] as any[])

  const providers = emptyProviders()

  for (const row of rows || []) {
    const provider = String(row?.provider || "") as ShortsProviderId
    if (!SHORTS_PROVIDERS.includes(provider)) continue

    const openId = String(row?.provider_user_id || "")
    const creatorKey = openId ? `${provider}:${openId}` : null
    // Only these two fields are read out of metadata. It also holds whatever a
    // provider handed us at connection time, and passing the object through
    // would be exactly the leak this file exists to avoid.
    const meta = row?.metadata || {}
    const lastSyncAt = meta.last_sync_at || null
    const lastErrorAt = meta.last_sync_error_at || null

    const posts = creatorKey
      ? await readCreatorPosts(creatorKey, provider)
      : { count: 0, capped: false, newestPostAt: null }
    const state: TikTokSyncState = {
      connected: true,
      creatorKey,
      lastSyncAt,
      lastErrorAt,
      hasPosts: posts.count > 0,
      // Passed through rather than dropped: without it a connection older than
      // the sync stamps reports "never" while holding freshly imported videos.
      newestPostAt: posts.newestPostAt,
    }

    providers[provider] = {
      configured: providers[provider].configured,
      connected: true,
      profile: toProfile(row),
      creatorKey,
      lastSyncAt,
      postCount: posts.count,
      postCountCapped: posts.capped,
      freshness: freshnessLabel(state),
      lastError: meta.last_sync_error ? String(meta.last_sync_error).slice(0, 200) : null,
      scopes: Array.isArray(row?.granted_scopes) ? row.granted_scopes.map(String) : [],
    }
  }

  return { workosAuthenticated: true, persistence: true, providers }
}

/** True when this WorkOS user has that platform linked. */
export async function hasProviderConnection(userKey: string | null | undefined, provider: ShortsProviderId) {
  const accounts = await getShortsProviderAccounts(userKey)
  return accounts.providers[provider]?.connected === true
}
