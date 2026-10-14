import { CURATED_PHOTOS, curatedPhotoUrl, type CuratedPhoto } from "@/lib/sites/forge/photo-library"
import type { Blueprint } from "./blueprints"
import type { ForgePlan } from "./plan"
import type { PhotoMap, SitePhoto } from "./render"

/**
 * Malik Site Forge — photographs that belong to the subject.
 *
 * Order of preference for every slot (hero, about, booking, gallery, each
 * catalogue item):
 *  1. the curated library, when the business's topics are in it and the
 *     photo's real description matches the slot's search words;
 *  2. a live search (Pexels/Unsplash with keys, else Openverse/Wikimedia),
 *     licence-checked and credited, within a time budget;
 *  3. any curated photo of the business's topics;
 *  4. nothing — the page shows a quiet tile in the site's colours.
 * Each chosen photo carries two alternates, used if it fails to load.
 */

export type FoundPhoto = { url: string; credit?: string; link?: string }
export type PhotoFinder = (query: string, exclude: Set<string>) => Promise<FoundPhoto | null>

const STOP = new Set(["a", "an", "the", "of", "on", "in", "with", "and", "at", "to", "for", "is", "are", "it", "its", "top", "white", "brown", "black", "photo", "photography", "image", "picture", "close", "up", "shallow", "focus", "selective", "person", "persons", "people", "table", "wooden", "ceramic", "plate"])

function words(text: string) {
  return String(text || "").toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((word) => word.length > 2 && !STOP.has(word))
}

/** How many of the query's words the photo's description (or topic) carries. */
export function matchScore(query: string, photo: CuratedPhoto) {
  const wanted = words(query)
  const have = new Set([...words(photo.alt), ...words(photo.topic.replace(/-/g, " "))])
  const stems = [...have].map((word) => word.slice(0, 5))
  return wanted.reduce((score, word) => score + (have.has(word) ? 2 : stems.includes(word.slice(0, 5)) ? 1 : 0), 0)
}

type Slot = { key: string; query: string; width: number; height?: number; priority: number }

function slotsFor(plan: ForgePlan, blueprint: Blueprint): Slot[] {
  const slots: Slot[] = [
    { key: "hero", query: blueprint.photos.hero, width: 2000, priority: 0 },
    { key: "about", query: blueprint.photos.about, width: 1200, height: 1500, priority: 1 },
    ...plan.gallery.map((shot, index) => ({ key: `gallery:${index}`, query: shot.photo, width: 1000, priority: 2 + index })),
    ...plan.catalog.items.map((item, index) => ({ key: `item:${item.id}`, query: item.photo || item.name, width: 800, height: 600, priority: 10 + index })),
    { key: "booking", query: blueprint.photos.booking, width: 1200, height: 900, priority: 40 },
  ]
  return slots
}

export async function resolvePhotos(plan: ForgePlan, blueprint: Blueprint, options: { finder?: PhotoFinder; budgetMs?: number; maxSearches?: number } = {}): Promise<PhotoMap> {
  const result: PhotoMap = {}
  const used = new Set<string>()
  const pool = CURATED_PHOTOS.filter((photo) => blueprint.curated.includes(photo.topic))
  const slots = slotsFor(plan, blueprint)
  const curated = (photo: CuratedPhoto, slot: Slot): SitePhoto => {
    const sameTopic = pool.filter((item) => item.topic === photo.topic && item.id !== photo.id && !used.has(item.id)).slice(0, 2)
    return { url: curatedPhotoUrl(photo.id, slot.width, slot.height), alt: photo.alt, alts: sameTopic.map((item) => curatedPhotoUrl(item.id, slot.width, slot.height)) }
  }
  const pick = (slot: Slot, minimum: number) => {
    let best: { photo: CuratedPhoto; score: number } | null = null
    for (const photo of pool) {
      if (used.has(photo.id)) continue
      const score = matchScore(slot.query, photo)
      if (score >= minimum && (!best || score > best.score)) best = { photo, score }
    }
    return best?.photo || null
  }

  // 1. Curated photos whose descriptions match.
  const searches: Slot[] = []
  for (const slot of slots) {
    const photo = pool.length ? pick(slot, 2) : null
    if (photo) { used.add(photo.id); result[slot.key] = curated(photo, slot) }
    else searches.push(slot)
  }

  // 2. Live search for the rest, most visible slots first, inside a time budget.
  if (options.finder && searches.length) {
    const finder = options.finder
    const chosen = new Set<string>()
    const queue = searches.slice(0, options.maxSearches ?? 14)
    const budget = new Promise<void>((resolve) => setTimeout(resolve, options.budgetMs ?? 8000))
    const work = Promise.all(queue.map(async (slot) => {
      try {
        const found = await finder(slot.query, chosen)
        if (found && !chosen.has(found.url) && !result[slot.key]) { chosen.add(found.url); result[slot.key] = { url: found.url, alt: slot.query, credit: found.credit, link: found.link } }
      } catch { /* the next fallback covers it */ }
    }))
    await Promise.race([work, budget])
  }

  // 3. Any photo of the subject, rather than none.
  for (const slot of slots) {
    if (result[slot.key] || !pool.length) continue
    const photo = pick(slot, 0)
    if (photo) { used.add(photo.id); result[slot.key] = curated(photo, slot) }
  }
  return result
}
