import "server-only"

import { createHash, randomBytes } from "node:crypto"
import {
  deletePrivateJson,
  privateJsonStoreConfigured,
  readPrivateJson,
  readPrivateJsonVersioned,
  writePrivateJsonConditional,
} from "./private-json-store"
import {
  SHARE_LIMITS,
  isShareId,
  isSharedAnswerRecord,
  shareTitle,
  type SharedAnswer,
  type SharedAnswerInput,
} from "@/lib/share/contract"

/**
 * Storage for public answer links, in the same private bucket as account
 * history (objects are never public; the page reads them on the server).
 *
 *   public/answers/<id>.json          one frozen answer
 *   public/answer-owners/<hash>.json  the owner's list: dedupe, limits, cleanup
 *
 * Every list change is a compare-and-swap on the object's ETag, so two tabs
 * or two Render instances sharing at once never lose each other's links.
 */

type OwnerItem = { id: string; messageKey: string; title: string; createdAt: string; discoverable: boolean }
type OwnerIndex = { version: 1; items: OwnerItem[] }

export type ShareActor = { userId: string; moderator?: boolean }

export type ShareStoreError = "STORAGE_UNAVAILABLE" | "ACCOUNT_LIMIT" | "DAILY_LIMIT" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN"

const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_MS = 60_000
const MISSING_CACHE_MS = 15_000
const CACHE_MAX = 500
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
const ID_LENGTH = 12

const recordKey = (id: string) => `public/answers/${id}.json`
const ownerKey = (owner: string) => `public/answer-owners/${owner}.json`

export function sharedAnswersConfigured() {
  return privateJsonStoreConfigured()
}

export function shareOwnerHash(userId: string) {
  return createHash("sha256").update(`malik-share-owner:${String(userId || "").trim().toLowerCase()}`).digest("hex").slice(0, 48)
}

function messageKeyFor(owner: string, input: SharedAnswerInput) {
  return createHash("sha256").update(`${owner}\n${input.messageId}\n${input.answer}`).digest("hex").slice(0, 32)
}

/** 12 characters from 56 unambiguous ones: about 70 bits, unbiased. */
export function newShareId() {
  let id = ""
  while (id.length < ID_LENGTH) {
    for (const byte of randomBytes(24)) {
      // 224 = 4 × 56: bytes above it would favour the first letters.
      if (byte >= 224) continue
      id += ID_ALPHABET[byte % ID_ALPHABET.length]
      if (id.length === ID_LENGTH) break
    }
  }
  return id
}

// A link that goes viral is read many times a second; a short in-process
// cache keeps those reads off the bucket. Removal clears it on this instance
// at once and everywhere else within a minute.
const cache = new Map<string, { value: SharedAnswer | null; until: number }>()

function remember(id: string, value: SharedAnswer | null, now = Date.now()) {
  cache.delete(id)
  while (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  cache.set(id, { value, until: now + (value ? CACHE_MS : MISSING_CACHE_MS) })
}

export function forgetSharedAnswerCache() {
  cache.clear()
}

export async function readSharedAnswer(id: string): Promise<SharedAnswer | null> {
  if (!isShareId(id) || !sharedAnswersConfigured()) return null
  const hit = cache.get(id)
  if (hit && hit.until > Date.now()) return hit.value
  const value = await readPrivateJson<unknown>(recordKey(id))
  const record = isSharedAnswerRecord(value) && value.id === id ? value : null
  remember(id, record)
  return record
}

/** The bucket's own copy with its ETag, for changes. */
async function readFresh(id: string) {
  const { value, etag } = await readPrivateJsonVersioned<unknown>(recordKey(id))
  return { record: isSharedAnswerRecord(value) && value.id === id ? value : null, etag }
}

function ownerItems(value: unknown): OwnerItem[] {
  if (!value || typeof value !== "object" || (value as OwnerIndex).version !== 1 || !Array.isArray((value as OwnerIndex).items)) return []
  return (value as OwnerIndex).items.filter((item): item is OwnerItem => Boolean(item)
    && isShareId(item.id)
    && typeof item.messageKey === "string"
    && typeof item.createdAt === "string")
}

export function canManageSharedAnswer(record: Pick<SharedAnswer, "owner">, actor: ShareActor | null | undefined) {
  if (!actor) return false
  if (actor.moderator) return true
  const id = String(actor.userId || "").trim()
  return Boolean(id) && !id.startsWith("guest") && record.owner === shareOwnerHash(id)
}

export type CreateShareResult =
  | { ok: true; record: SharedAnswer; existing: boolean }
  | { ok: false; code: ShareStoreError }

export async function createSharedAnswer(userId: string, input: SharedAnswerInput, now = Date.now()): Promise<CreateShareResult> {
  if (!sharedAnswersConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" }
  const owner = shareOwnerHash(userId)
  const messageKey = messageKeyFor(owner, input)
  let written: SharedAnswer | null = null
  const discard = async () => {
    if (!written) return
    await deletePrivateJson(recordKey(written.id))
    remember(written.id, null)
    written = null
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const index = await readPrivateJsonVersioned<OwnerIndex>(ownerKey(owner))
      let items = ownerItems(index.value)

      // The same answer shared again is the same link.
      const same = items.find((item) => item.messageKey === messageKey)
      if (same) {
        const existing = (await readFresh(same.id)).record
        if (existing && existing.owner === owner) {
          await discard()
          remember(existing.id, existing)
          return { ok: true, record: existing, existing: true }
        }
        items = items.filter((item) => item !== same)
      }

      if (items.length >= SHARE_LIMITS.perAccount) { await discard(); return { ok: false, code: "ACCOUNT_LIMIT" } }
      const today = items.filter((item) => {
        const created = Date.parse(item.createdAt)
        return Number.isFinite(created) && now - created < DAY_MS
      }).length
      if (today >= SHARE_LIMITS.perDay) { await discard(); return { ok: false, code: "DAILY_LIMIT" } }

      if (!written) {
        const createdAt = new Date(now).toISOString()
        for (let tries = 0; tries < 3 && !written; tries++) {
          const record: SharedAnswer = { version: 1, id: newShareId(), owner, messageKey, ...input, createdAt, updatedAt: createdAt }
          // If-None-Match: a new link never replaces another one.
          const result = await writePrivateJsonConditional(recordKey(record.id), record, null)
          if (result.stored) written = record
          else if (!result.conflict) return { ok: false, code: "STORAGE_UNAVAILABLE" }
        }
        if (!written) return { ok: false, code: "CONFLICT" }
      }

      const record: SharedAnswer = written
      const next: OwnerIndex = {
        version: 1,
        items: [{ id: record.id, messageKey, title: shareTitle(record.question, 120), createdAt: record.createdAt, discoverable: record.discoverable }, ...items],
      }
      const saved = await writePrivateJsonConditional(ownerKey(owner), next, index.etag)
      if (saved.stored) {
        remember(record.id, record)
        return { ok: true, record, existing: false }
      }
      if (!saved.conflict) { await discard(); return { ok: false, code: "STORAGE_UNAVAILABLE" } }
      // Another tab changed the list: read it again and retry with the same record.
    }
    await discard()
    return { ok: false, code: "CONFLICT" }
  } catch (error) {
    console.warn("[MALIK_SHARE] create failed", error instanceof Error ? error.message : String(error))
    await discard().catch(() => undefined)
    return { ok: false, code: "STORAGE_UNAVAILABLE" }
  }
}

/** Best effort: a stale list entry is dropped the next time the owner shares. */
async function updateOwnerIndex(owner: string, change: (items: OwnerItem[]) => OwnerItem[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const index = await readPrivateJsonVersioned<OwnerIndex>(ownerKey(owner))
    if (!index.value) return
    const saved = await writePrivateJsonConditional(ownerKey(owner), { version: 1, items: change(ownerItems(index.value)) } satisfies OwnerIndex, index.etag)
    if (saved.stored || !saved.conflict) return
  }
}

export type ChangeShareResult = { ok: true; record: SharedAnswer | null } | { ok: false; code: ShareStoreError }

export async function deleteSharedAnswer(id: string, actor: ShareActor): Promise<ChangeShareResult> {
  if (!sharedAnswersConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" }
  if (!isShareId(id)) return { ok: false, code: "NOT_FOUND" }
  try {
    const { record } = await readFresh(id)
    if (!record) { remember(id, null); return { ok: false, code: "NOT_FOUND" } }
    if (!canManageSharedAnswer(record, actor)) return { ok: false, code: "FORBIDDEN" }
    if (!await deletePrivateJson(recordKey(id))) return { ok: false, code: "STORAGE_UNAVAILABLE" }
    remember(id, null)
    await updateOwnerIndex(record.owner, (items) => items.filter((item) => item.id !== id)).catch(() => undefined)
    return { ok: true, record: null }
  } catch (error) {
    console.warn("[MALIK_SHARE] delete failed", error instanceof Error ? error.message : String(error))
    return { ok: false, code: "STORAGE_UNAVAILABLE" }
  }
}

export async function setSharedAnswerDiscoverable(id: string, actor: ShareActor, discoverable: boolean): Promise<ChangeShareResult> {
  if (!sharedAnswersConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" }
  if (!isShareId(id)) return { ok: false, code: "NOT_FOUND" }
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { record, etag } = await readFresh(id)
      if (!record) { remember(id, null); return { ok: false, code: "NOT_FOUND" } }
      if (!canManageSharedAnswer(record, actor)) return { ok: false, code: "FORBIDDEN" }
      if (record.discoverable === discoverable) { remember(id, record); return { ok: true, record } }
      const next: SharedAnswer = { ...record, discoverable, updatedAt: new Date().toISOString() }
      const saved = await writePrivateJsonConditional(recordKey(id), next, etag)
      if (saved.stored) {
        remember(id, next)
        await updateOwnerIndex(record.owner, (items) => items.map((item) => item.id === id ? { ...item, discoverable } : item)).catch(() => undefined)
        return { ok: true, record: next }
      }
      if (!saved.conflict) return { ok: false, code: "STORAGE_UNAVAILABLE" }
    }
    return { ok: false, code: "CONFLICT" }
  } catch (error) {
    console.warn("[MALIK_SHARE] update failed", error instanceof Error ? error.message : String(error))
    return { ok: false, code: "STORAGE_UNAVAILABLE" }
  }
}
