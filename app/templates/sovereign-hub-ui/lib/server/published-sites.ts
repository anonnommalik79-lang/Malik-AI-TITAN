import "server-only"

import { createHash } from "node:crypto"
import { deletePrivateJson, privateJsonStoreConfigured, readPrivateJson, readPrivateJsonVersioned, writePrivateJsonConditional } from "./private-json-store"
import { newShareId, shareOwnerHash, type ShareActor } from "./shared-answers"
import { isShareId } from "@/lib/share/contract"
import { PUBLISH_LIMITS, preparePublishedSite } from "@/lib/sites/forge/publish"

/**
 * Sites published by link, in the same private bucket as answer links (the
 * objects are never public; /site/<id> reads them on the server).
 *
 *   public/sites/<id>.json         one published page
 *   public/site-owners/<hash>.json the owner's list: same site = same link, limits
 *
 * Publishing a site again with the same name updates the page behind the
 * same link, so an edited café site keeps the address its owner shared.
 */

export type PublishedSite = { version: 1; id: string; owner: string; siteKey: string; title: string; html: string; createdAt: string; updatedAt: string }
type OwnerItem = { id: string; siteKey: string; title: string; createdAt: string }
type OwnerIndex = { version: 1; items: OwnerItem[] }

export type PublishError = "STORAGE_UNAVAILABLE" | "ACCOUNT_LIMIT" | "DAILY_LIMIT" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "NOT_A_SITE" | "INVALID_SITE" | "SITE_TOO_LARGE"
export type PublishResult = { ok: true; record: PublishedSite; updated: boolean } | { ok: false; code: PublishError }

const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_MS = 30_000
const recordKey = (id: string) => `public/sites/${id}.json`
const ownerKey = (owner: string) => `public/site-owners/${owner}.json`

export function publishedSitesConfigured() {
  return privateJsonStoreConfigured()
}

const cache = new Map<string, { value: PublishedSite | null; until: number }>()
function remember(id: string, value: PublishedSite | null) {
  if (cache.size > 300) cache.delete(cache.keys().next().value as string)
  cache.set(id, { value, until: Date.now() + CACHE_MS })
}

function isRecord(value: unknown, id: string): value is PublishedSite {
  const record = value as PublishedSite
  return Boolean(record) && record.version === 1 && record.id === id && typeof record.html === "string" && typeof record.owner === "string"
}

function ownerItems(value: unknown): OwnerItem[] {
  const index = value as OwnerIndex
  if (!index || index.version !== 1 || !Array.isArray(index.items)) return []
  return index.items.filter((item) => item && isShareId(item.id) && typeof item.siteKey === "string")
}

export async function readPublishedSite(id: string): Promise<PublishedSite | null> {
  if (!isShareId(id) || !publishedSitesConfigured()) return null
  const hit = cache.get(id)
  if (hit && hit.until > Date.now()) return hit.value
  const value = await readPrivateJson<unknown>(recordKey(id))
  const record = isRecord(value, id) ? value : null
  remember(id, record)
  return record
}

export async function publishSite(userId: string, html: unknown, now = Date.now()): Promise<PublishResult> {
  const prepared = preparePublishedSite(html)
  if (!prepared.ok) return { ok: false, code: prepared.code }
  if (!publishedSitesConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" }
  const owner = shareOwnerHash(userId)
  const siteKey = createHash("sha256").update(`${owner}\n${prepared.key}`).digest("hex").slice(0, 32)
  const stamp = new Date(now).toISOString()
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const index = await readPrivateJsonVersioned<OwnerIndex>(ownerKey(owner))
      const items = ownerItems(index.value)

      // The same site published again: the page behind the existing link is replaced.
      const same = items.find((item) => item.siteKey === siteKey)
      if (same) {
        const fresh = await readPrivateJsonVersioned<unknown>(recordKey(same.id))
        if (isRecord(fresh.value, same.id) && fresh.value.owner === owner) {
          const next: PublishedSite = { ...fresh.value, title: prepared.title, html: prepared.html, updatedAt: stamp }
          const saved = await writePrivateJsonConditional(recordKey(same.id), next, fresh.etag)
          if (saved.stored) { remember(same.id, next); return { ok: true, record: next, updated: true } }
          if (!saved.conflict) return { ok: false, code: "STORAGE_UNAVAILABLE" }
          continue
        }
      }

      const others = items.filter((item) => item.siteKey !== siteKey)
      if (others.length >= PUBLISH_LIMITS.perAccount) return { ok: false, code: "ACCOUNT_LIMIT" }
      const today = others.filter((item) => now - Date.parse(item.createdAt) < DAY_MS).length
      if (today >= PUBLISH_LIMITS.perDay) return { ok: false, code: "DAILY_LIMIT" }

      let record: PublishedSite | null = null
      for (let tries = 0; tries < 3 && !record; tries++) {
        const candidate: PublishedSite = { version: 1, id: newShareId(), owner, siteKey, title: prepared.title, html: prepared.html, createdAt: stamp, updatedAt: stamp }
        const result = await writePrivateJsonConditional(recordKey(candidate.id), candidate, null)
        if (result.stored) record = candidate
        else if (!result.conflict) return { ok: false, code: "STORAGE_UNAVAILABLE" }
      }
      if (!record) return { ok: false, code: "CONFLICT" }
      const saved = await writePrivateJsonConditional(ownerKey(owner), { version: 1, items: [{ id: record.id, siteKey, title: record.title, createdAt: stamp }, ...others] } satisfies OwnerIndex, index.etag)
      if (saved.stored) { remember(record.id, record); return { ok: true, record, updated: false } }
      // The list changed in another tab: drop this page and try again with the fresh list.
      await deletePrivateJson(recordKey(record.id))
      if (!saved.conflict) return { ok: false, code: "STORAGE_UNAVAILABLE" }
    }
    return { ok: false, code: "CONFLICT" }
  } catch (error) {
    console.warn("[MALIK_SITES] publish failed", error instanceof Error ? error.message : String(error))
    return { ok: false, code: "STORAGE_UNAVAILABLE" }
  }
}

export async function unpublishSite(id: string, actor: ShareActor): Promise<{ ok: true } | { ok: false; code: PublishError }> {
  if (!publishedSitesConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" }
  if (!isShareId(id)) return { ok: false, code: "NOT_FOUND" }
  try {
    const value = await readPrivateJson<unknown>(recordKey(id))
    if (!isRecord(value, id)) { remember(id, null); return { ok: false, code: "NOT_FOUND" } }
    const allowed = actor.moderator || (!String(actor.userId || "").startsWith("guest") && value.owner === shareOwnerHash(actor.userId))
    if (!allowed) return { ok: false, code: "FORBIDDEN" }
    if (!await deletePrivateJson(recordKey(id))) return { ok: false, code: "STORAGE_UNAVAILABLE" }
    remember(id, null)
    for (let attempt = 0; attempt < 5; attempt++) {
      const index = await readPrivateJsonVersioned<OwnerIndex>(ownerKey(value.owner))
      if (!index.value) break
      const saved = await writePrivateJsonConditional(ownerKey(value.owner), { version: 1, items: ownerItems(index.value).filter((item) => item.id !== id) } satisfies OwnerIndex, index.etag)
      if (saved.stored || !saved.conflict) break
    }
    return { ok: true }
  } catch (error) {
    console.warn("[MALIK_SITES] unpublish failed", error instanceof Error ? error.message : String(error))
    return { ok: false, code: "STORAGE_UNAVAILABLE" }
  }
}
