import "server-only"

import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

/**
 * One Malik user, several connected platforms.
 *
 * Identity stays with WorkOS: a person signs in once, and YouTube and TikTok
 * hang off that single account rather than becoming second and third Malik
 * users. malik_shorts_external_accounts already models exactly that - its key
 * is (user_key, provider) - so both rows coexist for one WorkOS id and nothing
 * about the schema needs to change.
 *
 * This is a standalone reader on purpose. YouTube connection is being built in
 * parallel, and a shared endpoint edited from two sides is a merge conflict
 * waiting to happen. Here the provider is a parameter: the moment YouTube rows
 * start landing in that table, this returns them with no edit at all.
 */

export type ShortsProviderId = "youtube" | "tiktok"

export const SHORTS_PROVIDERS: ShortsProviderId[] = ["youtube", "tiktok"]

export type ShortsProviderProfile = {
  displayName: string
  avatar: string | null
  username: string
}

export type ShortsProviderState = {
  connected: boolean
  profile?: ShortsProviderProfile
  /** Present only when connected; lets the UI warn before a token lapses. */
  tokenExpiresAt?: string | null
  scopes?: string[]
}

export type ShortsProviderAccounts = {
  workosAuthenticated: boolean
  /** False when the Shorts tables are not configured - nothing can be stored yet. */
  persistence: boolean
  providers: Record<ShortsProviderId, ShortsProviderState>
}

function emptyProviders(): Record<ShortsProviderId, ShortsProviderState> {
  return {
    youtube: { connected: false },
    tiktok: { connected: false },
  }
}

function toProfile(row: any): ShortsProviderProfile {
  const displayName = String(row?.display_name || row?.username || "").trim()
  const username = String(row?.username || row?.provider_user_id || "").trim()
  return {
    displayName: displayName || username || "Аккаунт",
    avatar: row?.avatar_url ? String(row.avatar_url) : null,
    username,
  }
}

/**
 * The account contract the Shorts UI reads.
 *
 * Never throws: a viewer with no WorkOS session, no Shorts database, or a
 * database that is refusing connections all get the same shape back with
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

  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_external_accounts?select=provider,provider_user_id,username,display_name,avatar_url,granted_scopes,token_expires_at&user_key=eq.${
      encodeURIComponent(key)
    }&provider=in.(${SHORTS_PROVIDERS.join(",")})`,
  ).catch(() => [] as any[])

  const providers = emptyProviders()
  for (const row of rows || []) {
    const provider = String(row?.provider || "") as ShortsProviderId
    if (!SHORTS_PROVIDERS.includes(provider)) continue
    providers[provider] = {
      connected: true,
      profile: toProfile(row),
      tokenExpiresAt: row?.token_expires_at || null,
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
