import "server-only"

import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJsonVersioned, writePrivateJsonConditional } from "./private-json-store"

/**
 * 👍/👎 under answers, kept on the server.
 *
 *   feedback/users/<hash>.json    the account's own marks (restored on any device)
 *   feedback/daily/<date>.json    counts per day and per model, for quality review
 *
 * Only the mark, the message id and the model id are stored: no prompt, no
 * answer text, no name or e-mail (the account is a one-way hash). Guests are
 * counted in the daily totals but their marks stay in this process only, so
 * anonymous traffic cannot create objects in the bucket.
 */

export type FeedbackValue = "up" | "down"
export type FeedbackItem = { messageId: string; value: FeedbackValue; modelId?: string; at: string }
type UserFeedback = { version: 1; items: FeedbackItem[] }
export type DailyFeedback = { version: 1; date: string; up: number; down: number; byModel: Record<string, { up: number; down: number }> }

const MAX_ITEMS = 500
const MAX_MODELS = 60
const MEMORY_USERS = 2_000
const MESSAGE_ID = /^[A-Za-z0-9_.:-]{1,128}$/
const MODEL_ID = /^[A-Za-z0-9_.:/@-]{1,80}$/

type Memory = { users: Map<string, UserFeedback>; daily: Map<string, DailyFeedback> }
type GlobalWithFeedback = typeof globalThis & { __malikAnswerFeedbackV1?: Memory }

function memory() {
  const scope = globalThis as GlobalWithFeedback
  if (!scope.__malikAnswerFeedbackV1) scope.__malikAnswerFeedbackV1 = { users: new Map(), daily: new Map() }
  return scope.__malikAnswerFeedbackV1
}

export function feedbackOwnerHash(userId: string) {
  return createHash("sha256").update(`malik-feedback:${String(userId || "").trim().toLowerCase()}`).digest("hex").slice(0, 48)
}

export function isFeedbackMessageId(value: unknown): value is string {
  return typeof value === "string" && MESSAGE_ID.test(value)
}

export function cleanModelId(value: unknown) {
  return typeof value === "string" && MODEL_ID.test(value) ? value : undefined
}

const userKey = (hash: string) => `feedback/users/${hash}.json`
const dailyKey = (date: string) => `feedback/daily/${date}.json`
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

function emptyDaily(date: string): DailyFeedback {
  return { version: 1, date, up: 0, down: 0, byModel: {} }
}

/** Apply a mark change to a day's counts: -1 for the old mark, +1 for the new one. */
export function applyToDaily(daily: DailyFeedback, previous: FeedbackItem | undefined, next: FeedbackItem | null) {
  const bump = (item: FeedbackItem, delta: number) => {
    daily[item.value] = Math.max(0, daily[item.value] + delta)
    const model = item.modelId || "unknown"
    if (!daily.byModel[model] && Object.keys(daily.byModel).length >= MAX_MODELS) return
    const counts = daily.byModel[model] || { up: 0, down: 0 }
    counts[item.value] = Math.max(0, counts[item.value] + delta)
    daily.byModel[model] = counts
  }
  if (previous) bump(previous, -1)
  if (next) bump(next, 1)
  return daily
}

/** The account's marks with one change applied, newest last, bounded. */
export function applyToUser(doc: UserFeedback, messageId: string, next: FeedbackItem | null) {
  const items = doc.items.filter((item) => item.messageId !== messageId)
  if (next) items.push(next)
  return { version: 1 as const, items: items.slice(-MAX_ITEMS) }
}

async function updateCloud<T>(key: string, empty: () => T, change: (current: T) => T) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { value, etag } = await readPrivateJsonVersioned<T>(key)
    const result = await writePrivateJsonConditional(key, change(value || empty()), etag)
    if (result.stored) return true
    if (!result.conflict) return false
  }
  return false
}

export type FeedbackActor = { userId: string; authenticated: boolean }

/**
 * Set (or with null, clear) the mark on one answer. Returns where it is kept:
 * "cloud" for a signed-in account with storage configured, otherwise "memory".
 */
export async function recordAnswerFeedback(actor: FeedbackActor, input: { messageId: string; value: FeedbackValue | null; modelId?: string }, now = Date.now()) {
  const hash = feedbackOwnerHash(actor.userId)
  const next: FeedbackItem | null = input.value ? { messageId: input.messageId, value: input.value, ...(input.modelId ? { modelId: input.modelId } : {}), at: new Date(now).toISOString() } : null
  const date = today(now)
  const store = memory()
  const durable = actor.authenticated && privateJsonStoreConfigured()

  let previous: FeedbackItem | undefined
  if (durable) {
    const saved = await updateCloud<UserFeedback>(userKey(hash), () => ({ version: 1, items: [] }), (current) => {
      previous = current.items.find((item) => item.messageId === input.messageId)
      return applyToUser(current, input.messageId, next)
    })
    if (!saved) return { stored: false as const }
  } else {
    const current = store.users.get(hash) || { version: 1 as const, items: [] }
    previous = current.items.find((item) => item.messageId === input.messageId)
    store.users.delete(hash)
    store.users.set(hash, applyToUser(current, input.messageId, next))
    while (store.users.size > MEMORY_USERS) store.users.delete(store.users.keys().next().value as string)
  }
  if (previous?.value === next?.value && previous?.modelId === next?.modelId) return { stored: true as const, where: durable ? "cloud" as const : "memory" as const }

  // Daily totals: best effort, never a reason to fail the mark itself.
  const daily = store.daily.get(date) || emptyDaily(date)
  store.daily.set(date, applyToDaily({ ...daily, byModel: { ...daily.byModel } }, previous, next))
  while (store.daily.size > 60) store.daily.delete(store.daily.keys().next().value as string)
  if (privateJsonStoreConfigured()) {
    await updateCloud<DailyFeedback>(dailyKey(date), () => emptyDaily(date), (current) => applyToDaily(current, previous, next)).catch(() => false)
  }
  return { stored: true as const, where: durable ? "cloud" as const : "memory" as const }
}

/** The account's own marks, as messageId → mark. */
export async function readAnswerFeedback(actor: FeedbackActor) {
  const hash = feedbackOwnerHash(actor.userId)
  let doc: UserFeedback | null = null
  if (actor.authenticated && privateJsonStoreConfigured()) doc = (await readPrivateJsonVersioned<UserFeedback>(userKey(hash))).value
  else doc = memory().users.get(hash) || null
  const marks: Record<string, FeedbackValue> = {}
  for (const item of doc?.items || []) marks[item.messageId] = item.value
  return marks
}

/** Counts for the last `days` days (owner only; the caller checks). */
export async function readFeedbackSummary(days = 14, now = Date.now()) {
  const result: DailyFeedback[] = []
  for (let offset = 0; offset < Math.min(60, Math.max(1, days)); offset++) {
    const date = today(now - offset * 86_400_000)
    const cloud = privateJsonStoreConfigured() ? (await readPrivateJsonVersioned<DailyFeedback>(dailyKey(date))).value : null
    const day = cloud || memory().daily.get(date)
    if (day) result.push(day)
  }
  return result
}
