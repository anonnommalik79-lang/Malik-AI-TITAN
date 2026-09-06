/**
 * How a TikTok creator is named inside Malik.
 *
 * Pure and import-free on purpose: the collision rules below are the part most
 * likely to be wrong, and they are worth testing without a database, a network
 * or a Next runtime. lib/shorts/tiktok.ts does the Supabase half.
 */

/** malik_shorts_profiles.username: unique, and checked against this. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._]{2,32}$/
export const USERNAME_MAX = 32

/** The namespace TikTok creators live in, mirroring `youtube:<channelId>`. */
export function tiktokCreatorKey(openId: string) {
  return `tiktok:${String(openId || "").trim()}`
}

/**
 * The real @handle, when TikTok gives us one.
 *
 * /v2/user/info/ does not return a handle field at all - display_name is a
 * free-text name, not the @. The handle only appears inside profile_deep_link
 * (https://www.tiktok.com/@handle), so it is parsed out of there, and when the
 * link is missing or shaped differently the answer is null. Nothing here
 * invents a handle: a made-up @ that points at somebody else's real TikTok is
 * worse than no handle.
 */
export function parseTikTokHandle(profileDeepLink?: string | null): string | null {
  const link = String(profileDeepLink || "").trim()
  if (!link) return null
  const match = link.match(/tiktok\.com\/@([A-Za-z0-9._]{2,24})/)
  return match ? match[1] : null
}

/**
 * A small deterministic hash, written out rather than imported.
 *
 * FNV-1a over the open id. It needs to be stable across processes and
 * deployments - the same creator must resolve to the same username forever -
 * and it must not pull node:crypto into a file that may one day be imported
 * from the browser. It is not a security primitive and is not used as one.
 */
export function stableHash(value: string, length: number): string {
  let hash = 0x811c9dc5
  const text = String(value || "")
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  // One pass gives 8 hex characters; longer requests are filled by rehashing
  // the digest so the result stays deterministic instead of being padded.
  let out = hash.toString(16).padStart(8, "0")
  let seed = hash
  while (out.length < length) {
    seed = Math.imul(seed ^ 0x9e3779b9, 0x01000193) >>> 0
    out += seed.toString(16).padStart(8, "0")
  }
  return out.slice(0, length)
}

function sanitize(value: string) {
  return String(value || "").replace(/[^A-Za-z0-9._]/g, "")
}

/** Cut to `max` characters without leaving a trailing dot, which reads as truncation. */
function clip(value: string, max: number) {
  return value.slice(0, max).replace(/\.+$/, "")
}

/**
 * Usernames to try, in order, for one TikTok creator.
 *
 * The real handle is never taken as-is. malik_shorts_profiles.username is
 * unique across every profile, so a TikTok creator called @malik would collide
 * with a Malik user who registered @malik first - and the import would fail on
 * a name clash between two unrelated people. The `tt.` prefix puts imported
 * creators in their own namespace, which removes that class of collision
 * entirely; the remaining ones (two TikTok handles that truncate to the same
 * 32 characters, or the same prefixed name already taken) fall through to a
 * hash of the open id.
 *
 * Every candidate is derived from the open id and the handle only, so the same
 * creator produces the same list on every sync - the username never churns.
 * The real handle and display name are stored separately and are what the UI
 * actually shows.
 */
export function tiktokUsernameCandidates(openId: string, handle?: string | null): string[] {
  const clean = sanitize(handle || "")
  const digest = stableHash(String(openId || "unknown"), 12)
  const candidates: string[] = []

  if (clean.length >= 2) {
    candidates.push(clip(`tt.${clean}`, USERNAME_MAX))
    const suffix = `.${digest.slice(0, 5)}`
    candidates.push(clip(`tt.${clip(clean, USERNAME_MAX - 3 - suffix.length)}`, USERNAME_MAX - suffix.length) + suffix)
  }

  // Always available and always valid: 3 + 12 = 15 characters, well inside the
  // limit, and unique per open id. This is why resolution can never run out of
  // options and fail the import.
  candidates.push(`tt.${digest}`)

  return candidates.filter((name, index, list) => USERNAME_PATTERN.test(name) && list.indexOf(name) === index)
}

/**
 * The prefix that marks a username as ours rather than the platform's.
 *
 * `tt.cristiano` is a Malik row key: it exists because
 * malik_shorts_profiles.username is unique across every profile and a real
 * TikTok @ can collide with a Malik user who registered the same name. It is
 * correct as a key and wrong as something to show a person.
 */
export const IMPORTED_USERNAME_PREFIX = "tt."

/**
 * The @ a person should see, or null when we do not know it.
 *
 * One source of truth: a TikTok-issued URL. profile_deep_link gives it at
 * connection time and every post's share_url gives it afterwards
 * (tiktok.com/@handle/video/...), and both go through the same parser. What is
 * never done is inventing one - not from the display name, and not by stripping
 * our own prefix off a username, because `tt.cristiano.a91f2` and `tt.9f3a...`
 * would both decode into a handle that points at somebody else's real TikTok.
 *
 * A username without the prefix is a real platform handle (that is how YouTube
 * channels are stored) and passes through. Otherwise the answer is null, and
 * the caller shows the display name with no @ at all.
 */
export function resolvePublicHandle(input: { handle?: string | null; username?: string | null }): string | null {
  const handle = String(input.handle || "").trim()
  if (handle) return handle
  const username = String(input.username || "").trim()
  if (!username || username.startsWith(IMPORTED_USERNAME_PREFIX)) return null
  return username
}

/** True when this username is a Malik-internal key and must not be shown as an @. */
export function isImportedUsername(username?: string | null) {
  return String(username || "").startsWith(IMPORTED_USERNAME_PREFIX)
}
