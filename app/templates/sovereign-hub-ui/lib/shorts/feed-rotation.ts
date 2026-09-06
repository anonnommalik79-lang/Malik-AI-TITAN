import type { MalikShortItem, MalikShortSource } from "@/lib/shorts/types"

/**
 * Deterministic provider rotation for the Malik Shorts feed.
 *
 * The feed used to pick one of three hard-coded patterns with Math.random and
 * shuffle each bucket before mixing, which had two costs. A viewer refreshing
 * the page got a different provider order every time, so "why is it all YouTube
 * now" was unanswerable - there was no order to point at. And the mixed result
 * could not be tested: nothing about `Math.random()` is assertable.
 *
 * Rotation here is round-robin over the providers that actually have content:
 * one item from each in turn, and a provider that runs out is dropped from the
 * cycle rather than leaving a gap. Order *inside* a provider is untouched -
 * whatever the caller sorted by (published_at, relevance) survives, because
 * that ordering is the provider's own recommendation and not ours to scramble.
 *
 * This file is deliberately standalone and free of imports from the feed route:
 * the route gets a two-line change, and the logic can be tested without Next,
 * Supabase, or a network.
 */

/**
 * The cycle. YouTube leads because it is the one provider that has content
 * without any user having connected an account; TikTok follows because it is
 * the one a connected creator contributes; Malik-native closes the round.
 */
export const ROTATION_ORDER: MalikShortSource[] = ["youtube", "tiktok", "malik"]

/**
 * One video is one video, whichever bucket it arrived in.
 *
 * The key is `source + source_id`, so `youtube:123` and `tiktok:123` are two
 * different videos - the ids come from different namespaces and collide freely.
 * Rows without a source id fall back to the Malik post id, which is a uuid.
 */
export function dedupeBySource<T extends { source: MalikShortSource; sourceId?: string; id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.source}:${item.sourceId || item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function bucketBySource<T extends { source: MalikShortSource }>(items: T[]): Record<MalikShortSource, T[]> {
  const buckets: Record<MalikShortSource, T[]> = { malik: [], tiktok: [], youtube: [] }
  for (const item of items) {
    if (buckets[item.source]) buckets[item.source].push(item)
    else buckets.malik.push(item)
  }
  return buckets
}

/**
 * Round-robin the providers, newest-first inside each one.
 *
 * With YouTube and TikTok both full the result alternates strictly:
 * YT TK YT TK YT TK. Add Malik posts and the round becomes YT TK M. When a
 * provider empties it leaves the cycle and the rest keep alternating between
 * themselves - the feed never stalls on an empty slot, and it never falls back
 * to "whatever is left" while another provider still has content to offer.
 */
export function rotateBySource<T extends { source: MalikShortSource }>(items: T[], limit: number): T[] {
  const buckets = bucketBySource(items)

  // Only providers that actually brought something join the cycle. A provider
  // whose API failed is simply absent here, which is what keeps one outage from
  // emptying the whole feed.
  const cycle = ROTATION_ORDER.filter((source) => buckets[source].length > 0)
  if (!cycle.length) return []

  const output: T[] = []

  while (output.length < limit) {
    let placed = false
    // One full turn around the cycle, always from the same starting provider.
    // Advancing the start between rounds is what produced YT TK TK YT: round
    // two began at TikTok, so the round boundary broke the alternation the
    // rotation exists to guarantee.
    for (let step = 0; step < cycle.length && output.length < limit; step += 1) {
      const next = buckets[cycle[step]].shift()
      if (next) {
        output.push(next)
        placed = true
      }
    }
    // A turn that placed nothing means every bucket is empty.
    if (!placed) break
  }

  return output
}

/** Dedupe, then rotate. The single call the feed route makes. */
export function buildRotatedFeed<T extends { source: MalikShortSource; sourceId?: string; id: string }>(
  items: T[],
  limit: number,
): T[] {
  return rotateBySource(dedupeBySource(items), limit)
}

/**
 * Which counters the UI should show for a given source.
 *
 * An imported video's numbers belong to the platform it came from: a TikTok
 * with 40k views has 40k views in Malik Shorts too, and showing the Malik-local
 * interaction count (zero, until somebody likes it here) reads as a broken
 * feed. Malik-native posts are the opposite case - their local counters are the
 * real ones, and there is no external number to prefer.
 */
export function usesExternalMetrics(source: MalikShortSource) {
  return source === "youtube" || source === "tiktok"
}

export type { MalikShortItem }
