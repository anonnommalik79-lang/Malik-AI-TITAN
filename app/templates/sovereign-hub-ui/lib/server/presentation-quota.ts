import "server-only"

import { createHash } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { AIPlan } from "@/lib/ai/types"
import { PRESENTATION_COSTS } from "@/lib/presentations/deck"

/**
 * Presentation credits.
 *
 * One credit is one piece of model work: the outline costs one, every slide
 * written costs one, rewriting a slide costs one. A ten-slide deck is eleven.
 * That is the unit people can reason about — "a deck is about ten credits" —
 * and it is also honest about cost, because a slide is roughly one model call.
 *
 * Credits are **reserved before** the model is called and **refunded if it
 * fails**. Charging afterwards, the way a simple counter would, lets three
 * batches running at once each see "25 left", each succeed, and together spend
 * 36. Reserving first closes that; refunding on failure means nobody pays for
 * a slide they did not get.
 *
 * Every limit is an environment variable, so pricing can change on Render
 * without a deploy:
 *
 *   PRESENTATION_GUEST_DAILY_CREDITS   0     (sign-in required)
 *   PRESENTATION_FREE_DAILY_CREDITS    24    (two full decks and a few rewrites)
 *   PRESENTATION_PRO_DAILY_CREDITS     240
 *   PRESENTATION_ULTRA_DAILY_CREDITS   800
 *   owner                               unlimited
 *
 *   PRESENTATION_FREE_MAX_SLIDES       12
 *   PRESENTATION_PRO_MAX_SLIDES        20
 *
 * State survives a restart through the same object storage the music quota
 * already uses, and falls back to memory when no bucket is configured.
 */

export type PresentationTier = "guest" | "free" | "pro" | "ultra" | "owner"

type QuotaState = {
  day: string
  used: number
  updatedAt: string
}

type QuotaGlobal = typeof globalThis & {
  __malikPresentationQuota?: Map<string, QuotaState>
  __malikPresentationLocks?: Map<string, Promise<unknown>>
}

export type PresentationQuota = {
  tier: PresentationTier
  unlimited: boolean
  dailyCredits: number
  used: number
  remaining: number
  maxSlides: number
  resetAt: string
  costs: typeof PRESENTATION_COSTS
  storage: "object-storage" | "runtime-memory"
}

export type ReserveResult =
  | { ok: true; quota: PresentationQuota }
  | { ok: false; status: number; code: "SIGN_IN_REQUIRED" | "PRESENTATION_CREDITS_EXHAUSTED"; error: string; quota: PresentationQuota }

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function readCount(name: string, fallback: number) {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

export function presentationTier(plan: AIPlan | string | undefined, authenticated: boolean): PresentationTier {
  if (plan === "owner") return "owner"
  if (!authenticated) return "guest"
  if (plan === "ultra") return "ultra"
  if (plan === "pro") return "pro"
  return "free"
}

export function presentationPlanLimits(tier: PresentationTier) {
  switch (tier) {
    case "owner":
      return { unlimited: true, dailyCredits: Number.MAX_SAFE_INTEGER, maxSlides: 20 }
    case "ultra":
      return { unlimited: false, dailyCredits: readCount("PRESENTATION_ULTRA_DAILY_CREDITS", 800), maxSlides: readCount("PRESENTATION_PRO_MAX_SLIDES", 20) }
    case "pro":
      return { unlimited: false, dailyCredits: readCount("PRESENTATION_PRO_DAILY_CREDITS", 240), maxSlides: readCount("PRESENTATION_PRO_MAX_SLIDES", 20) }
    case "free":
      return { unlimited: false, dailyCredits: readCount("PRESENTATION_FREE_DAILY_CREDITS", 24), maxSlides: readCount("PRESENTATION_FREE_MAX_SLIDES", 12) }
    case "guest":
      return { unlimited: false, dailyCredits: readCount("PRESENTATION_GUEST_DAILY_CREDITS", 0), maxSlides: readCount("PRESENTATION_FREE_MAX_SLIDES", 12) }
  }
}

/* ---------------------------------------------------------------- storage */

function storageConfig() {
  const bucket = first(
    process.env.PRESENTATION_DAILY_GATE_BUCKET,
    process.env.MUSIC_DAILY_GATE_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(process.env.MUSIC_DAILY_GATE_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.MUSIC_DAILY_GATE_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.MUSIC_DAILY_GATE_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.MUSIC_DAILY_GATE_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.MUSIC_DAILY_GATE_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function storage() {
  const cfg = storageConfig()
  if (!cfg) return null
  return {
    cfg,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
    }),
  }
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function nextUtcResetAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

function accountHash(userId: string) {
  return createHash("sha256").update(String(userId || "").trim().toLowerCase()).digest("hex")
}

function scope() {
  const global = globalThis as QuotaGlobal
  if (!global.__malikPresentationQuota) global.__malikPresentationQuota = new Map()
  if (!global.__malikPresentationLocks) global.__malikPresentationLocks = new Map()
  return { memory: global.__malikPresentationQuota, locks: global.__malikPresentationLocks }
}

const memoryKey = (userId: string) => `${utcDay()}:${accountHash(userId)}`
const objectKey = (userId: string) => `private/system/malik-presentation-daily/${utcDay()}/${accountHash(userId)}.json`

async function bodyToString(body: any) {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

async function readState(userId: string): Promise<QuotaState> {
  const { memory } = scope()
  const cached = memory.get(memoryKey(userId))
  if (cached && cached.day === utcDay()) return cached

  const fresh: QuotaState = { day: utcDay(), used: 0, updatedAt: new Date().toISOString() }
  const target = storage()
  if (target) {
    try {
      const result = await target.client.send(new GetObjectCommand({ Bucket: target.cfg.bucket, Key: objectKey(userId) }))
      const parsed = JSON.parse(await bodyToString(result.Body) || "{}") as Partial<QuotaState>
      if (parsed.day === utcDay()) fresh.used = Math.max(0, Number(parsed.used) || 0)
    } catch {
      /* A missing object is the first use of the day. */
    }
  }
  memory.set(memoryKey(userId), fresh)
  return fresh
}

async function writeState(userId: string, state: QuotaState) {
  scope().memory.set(memoryKey(userId), state)
  const target = storage()
  if (!target) return "runtime-memory" as const
  try {
    await target.client.send(new PutObjectCommand({
      Bucket: target.cfg.bucket,
      Key: objectKey(userId),
      Body: Buffer.from(JSON.stringify(state), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "private, no-store",
      Metadata: { kind: "malik-presentation-daily" },
    }))
    return "object-storage" as const
  } catch {
    return "runtime-memory" as const
  }
}

/**
 * One user's credit operations run one at a time in this process, so a
 * reservation always reads the balance the previous one left behind.
 */
function serialised<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const { locks } = scope()
  const key = accountHash(userId)
  const previous = locks.get(key) || Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  locks.set(key, next)
  void next.finally(() => { if (locks.get(key) === next) locks.delete(key) }).catch(() => undefined)
  return next
}

function describe(tier: PresentationTier, used: number, storageKind: PresentationQuota["storage"]): PresentationQuota {
  const limits = presentationPlanLimits(tier)
  return {
    tier,
    unlimited: limits.unlimited,
    dailyCredits: limits.unlimited ? -1 : limits.dailyCredits,
    used,
    remaining: limits.unlimited ? -1 : Math.max(0, limits.dailyCredits - used),
    maxSlides: limits.maxSlides,
    resetAt: nextUtcResetAt(),
    costs: PRESENTATION_COSTS,
    storage: storageKind,
  }
}

/* ------------------------------------------------------------------ public */

export async function getPresentationQuota(userId: string, plan: AIPlan | string | undefined, authenticated: boolean) {
  const tier = presentationTier(plan, authenticated)
  const state = await readState(userId)
  return describe(tier, state.used, storageConfig() ? "object-storage" : "runtime-memory")
}

export function reservePresentationCredits(
  userId: string,
  plan: AIPlan | string | undefined,
  authenticated: boolean,
  cost: number,
): Promise<ReserveResult> {
  return serialised(userId, async () => {
    const tier = presentationTier(plan, authenticated)
    const limits = presentationPlanLimits(tier)
    const state = await readState(userId)
    const amount = Math.max(0, Math.floor(cost))

    if (tier === "guest" && limits.dailyCredits === 0) {
      return {
        ok: false as const,
        status: 401,
        code: "SIGN_IN_REQUIRED" as const,
        error: "Войдите в аккаунт — на бесплатном тарифе каждый день даются кредиты на презентации.",
        quota: describe(tier, state.used, storageConfig() ? "object-storage" : "runtime-memory"),
      }
    }

    if (!limits.unlimited && state.used + amount > limits.dailyCredits) {
      const remaining = Math.max(0, limits.dailyCredits - state.used)
      return {
        ok: false as const,
        status: 429,
        code: "PRESENTATION_CREDITS_EXHAUSTED" as const,
        error: remaining
          ? `Не хватает кредитов: нужно ${amount}, осталось ${remaining}. Уменьшите число слайдов или дождитесь обновления лимита.`
          : "Кредиты на презентации на сегодня закончились. Лимит обновится в полночь по UTC.",
        quota: describe(tier, state.used, storageConfig() ? "object-storage" : "runtime-memory"),
      }
    }

    const next: QuotaState = { day: utcDay(), used: state.used + amount, updatedAt: new Date().toISOString() }
    const storageKind = await writeState(userId, next)
    return { ok: true as const, quota: describe(tier, next.used, storageKind) }
  })
}

/** Gives back credits for work that was paid for and did not arrive. */
export function refundPresentationCredits(userId: string, plan: AIPlan | string | undefined, authenticated: boolean, cost: number) {
  return serialised(userId, async () => {
    const tier = presentationTier(plan, authenticated)
    const state = await readState(userId)
    const next: QuotaState = { day: utcDay(), used: Math.max(0, state.used - Math.max(0, Math.floor(cost))), updatedAt: new Date().toISOString() }
    const storageKind = await writeState(userId, next)
    return describe(tier, next.used, storageKind)
  })
}
