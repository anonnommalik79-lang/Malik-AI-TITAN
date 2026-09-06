/**
 * Counter arithmetic for the Malik Shorts feed.
 *
 * Two numbers describe one imported video and they are not interchangeable.
 * `external` is what the source platform reports - 40,000 likes that a TikTok
 * earned on TikTok - and it only ever changes when we re-sync from that
 * platform. `local` is what happened inside Malik: the likes, saves and reposts
 * stored in malik_shorts_counters, which start at zero for every import.
 *
 * They used to be conflated. The feed wrote the external number into the field
 * the action rail renders, then malik_shorts_interact returned the *local*
 * counters after a like and the client spread them over the item - so a TikTok
 * showing 40,000 likes dropped to 1 the moment somebody tapped the heart, and
 * stayed wrong until reload. Adding a special case for TikTok would have moved
 * the bug rather than removed it.
 *
 * So the rule is one rule, for every source: the visible number is the sum, the
 * two inputs are kept apart, and nothing recomputes display except this file.
 * A Malik-native post has no external half and its sum is simply its local
 * counters, which is why it needs no branch of its own.
 *
 * Everything here is pure and free of imports - it runs in the route, in the
 * browser, and in the verifier without a database.
 */

export type LocalCounters = {
  views: number
  likes: number
  comments: number
  reposts: number
  saves: number
  shares: number
}

export type ExternalCounters = {
  views?: number
  likes?: number
  comments?: number
  shares?: number
}

export type DisplayCounters = LocalCounters

const LOCAL_KEYS: Array<keyof LocalCounters> = ["views", "likes", "comments", "reposts", "saves", "shares"]

/** Negative, NaN, Infinity and strings all become a countable non-negative integer. */
export function counter(value: unknown): number {
  const numeric = Math.floor(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

/** Undefined stays undefined: "TikTok never told us" is not the same as "zero". */
export function optionalCounter(value: unknown): number | undefined {
  if (value == null) return undefined
  const numeric = Math.floor(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

export function normalizeLocal(raw: Partial<Record<keyof LocalCounters, unknown>> | null | undefined): LocalCounters {
  const source = raw || {}
  return {
    views: counter(source.views),
    likes: counter(source.likes),
    comments: counter(source.comments),
    reposts: counter(source.reposts),
    saves: counter(source.saves),
    shares: counter(source.shares),
  }
}

/**
 * The external half, or undefined when the row carries none.
 *
 * A row where every external column is null is a post that was never imported
 * from anywhere - returning `{}` there would make `hasExternalCounters` true
 * and imply a platform that reported nothing, which is a different claim.
 */
export function normalizeExternal(raw: Partial<Record<keyof ExternalCounters, unknown>> | null | undefined): ExternalCounters | undefined {
  const source = raw || {}
  const external: ExternalCounters = {
    views: optionalCounter(source.views),
    likes: optionalCounter(source.likes),
    comments: optionalCounter(source.comments),
    shares: optionalCounter(source.shares),
  }
  const any = Object.values(external).some((value) => value !== undefined)
  return any ? external : undefined
}

export function hasExternalCounters(external: ExternalCounters | null | undefined): boolean {
  if (!external) return false
  return Object.values(external).some((value) => value !== undefined)
}

/**
 * What the action rail shows.
 *
 * External plus local, per counter. Reposts and saves have no external half -
 * neither YouTube nor TikTok exposes them, and a repost inside Malik is a Malik
 * action - so they pass through as local, which is also why this returns the
 * same shape for every source.
 */
export function displayMetrics(local: LocalCounters, external?: ExternalCounters | null): DisplayCounters {
  return {
    views: counter(external?.views) + local.views,
    likes: counter(external?.likes) + local.likes,
    comments: counter(external?.comments) + local.comments,
    reposts: local.reposts,
    saves: local.saves,
    shares: counter(external?.shares) + local.shares,
  }
}

export type ShortMetricsShape = DisplayCounters & {
  local?: LocalCounters
  external?: ExternalCounters
  watchTimeMs?: number
  completionRate?: number
}

/** The metrics object the API returns: display on top, both halves kept underneath. */
export function buildShortMetrics(
  localRaw: Partial<Record<keyof LocalCounters, unknown>> | null | undefined,
  externalRaw: Partial<Record<keyof ExternalCounters, unknown>> | null | undefined,
): ShortMetricsShape {
  const local = normalizeLocal(localRaw)
  const external = normalizeExternal(externalRaw)
  return { ...displayMetrics(local, external), local, ...(external ? { external } : {}) }
}

/**
 * Fold the interaction response back into an item, on the client.
 *
 * malik_shorts_interact answers with the local counters only - that is correct
 * and it is all it can know. Spreading that answer over the item is what broke
 * external numbers, so instead it replaces the local half and the display is
 * recomputed from both. The external half is carried forward untouched: no
 * interaction can change what a video did on TikTok.
 *
 * A response with no metrics (follow, share, a fallback answer) returns the
 * previous object unchanged rather than a rebuilt one, so React sees no update
 * where nothing moved.
 */
export function applyLocalCounters(
  previous: ShortMetricsShape,
  incoming: Partial<Record<keyof LocalCounters, unknown>> | null | undefined,
): ShortMetricsShape {
  if (!incoming || typeof incoming !== "object") return previous
  const touched = LOCAL_KEYS.some((key) => incoming[key] != null)
  if (!touched) return previous

  // Only the counters the response actually mentions move; the rest keep the
  // value they already had, so a partial answer cannot zero a field.
  const base = previous.local || normalizeLocal(previous)
  const local: LocalCounters = { ...base }
  for (const key of LOCAL_KEYS) if (incoming[key] != null) local[key] = counter(incoming[key])

  return {
    ...previous,
    ...displayMetrics(local, previous.external),
    local,
  }
}

/**
 * What each action does to a local counter when the database is unreachable.
 *
 * The interaction endpoint has an offline path that used to answer with a
 * `metrics` object holding `likes: 1`, and `metrics` means *absolute local
 * counters* everywhere else. Feeding that to applyLocalCounters replaced a
 * local count of 37 with 1 and dragged the display from 40,037 down to 40,001 -
 * the same class of bug as the original overwrite, one layer further in.
 *
 * So the offline answer carries deltas under a different name, and the two
 * shapes never share a field. `view` is absent deliberately: a view recorded
 * while the database is down is not counted twice when it comes back.
 */
export const LOCAL_ACTION_DELTAS: Record<string, { key: keyof LocalCounters; delta: number }> = {
  like: { key: "likes", delta: 1 },
  unlike: { key: "likes", delta: -1 },
  save: { key: "saves", delta: 1 },
  unsave: { key: "saves", delta: -1 },
  repost: { key: "reposts", delta: 1 },
  unrepost: { key: "reposts", delta: -1 },
  share: { key: "shares", delta: 1 },
}

export type LocalCounterDelta = { key: keyof LocalCounters; delta: number }

/** The delta an action implies, or null for actions that move no counter. */
export function localDeltaForAction(action: string): LocalCounterDelta | null {
  return LOCAL_ACTION_DELTAS[action] || null
}

/**
 * Apply an offline action's delta. Never replaces a counter with an absolute
 * value, so an existing local count survives a round trip that failed.
 */
export function applyLocalDelta(previous: ShortMetricsShape, action: string): ShortMetricsShape {
  const move = localDeltaForAction(action)
  if (!move) return previous
  return bumpLocalCounter(previous, move.key, move.delta)
}

/** Add to a local counter without waiting for a round trip. Clamped at zero. */
export function bumpLocalCounter(
  previous: ShortMetricsShape,
  key: keyof LocalCounters,
  delta: number,
): ShortMetricsShape {
  const base = previous.local || normalizeLocal(previous)
  const local: LocalCounters = { ...base, [key]: Math.max(0, base[key] + delta) }
  return { ...previous, ...displayMetrics(local, previous.external), local }
}

/**
 * Which sources carry a platform counter at all.
 *
 * Kept as a named predicate rather than an inline `source === "youtube"` so the
 * next imported platform is one entry here instead of a condition to find in
 * three files.
 */
export function usesExternalMetrics(source: string): boolean {
  return source === "youtube" || source === "tiktok"
}
