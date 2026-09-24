import "server-only"

import { createHash } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type VideoQuotaState = {
  day: string
  count: number
  usedAt: string
}

type VideoQuotaStatus = {
  available: boolean
  used: boolean
  count: number
  limit: number
  remaining: number
  resetAt: string
  storage: "object-storage" | "runtime-memory"
  usedAt?: string
}

type VideoQuotaGlobal = typeof globalThis & {
  __malikVideoAccountQuota?: Map<string, VideoQuotaState>
  __malikVideoAccountInFlight?: Set<string>
}

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function config() {
  const bucket = first(
    process.env.VIDEO_DAILY_GATE_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(
    process.env.VIDEO_DAILY_GATE_ACCESS_KEY_ID,
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
  )
  const secretAccessKey = first(
    process.env.VIDEO_DAILY_GATE_SECRET_ACCESS_KEY,
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
  )
  if (!bucket || !accessKeyId || !secretAccessKey) return null

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.VIDEO_DAILY_GATE_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.VIDEO_DAILY_GATE_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.VIDEO_DAILY_GATE_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function resetZone() {
  return process.env.MEDIA_RESET_TIMEZONE?.trim() || process.env.IMAGE_RESET_TIMEZONE?.trim() || "Asia/Almaty"
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  try {
    const p = zonedParts(date, timeZone)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
  } catch {
    return 0
  }
}

function quotaDay(now = new Date()) {
  try {
    const p = zonedParts(now, resetZone())
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

function nextResetAt(now = new Date()) {
  try {
    const zone = resetZone()
    const p = zonedParts(now, zone)
    const nextLocal = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0))
    let guess = nextLocal.getTime() - timeZoneOffsetMs(nextLocal, zone)
    guess = nextLocal.getTime() - timeZoneOffsetMs(new Date(guess), zone)
    return new Date(guess).toISOString()
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  }
}

function accountHash(userId: string) {
  return createHash("sha256").update(String(userId || "").trim().toLowerCase()).digest("hex")
}

function memory() {
  const scope = globalThis as VideoQuotaGlobal
  if (!scope.__malikVideoAccountQuota) scope.__malikVideoAccountQuota = new Map()
  return scope.__malikVideoAccountQuota
}

function inFlight() {
  const scope = globalThis as VideoQuotaGlobal
  if (!scope.__malikVideoAccountInFlight) scope.__malikVideoAccountInFlight = new Set()
  return scope.__malikVideoAccountInFlight
}

function memoryKey(userId: string) {
  return `${quotaDay()}:${accountHash(userId)}`
}

function objectKey(userId: string) {
  return `private/system/malik-video-account-daily/${quotaDay()}/${accountHash(userId)}.json`
}

function storage() {
  const cfg = config()
  if (!cfg) return null
  return {
    cfg,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        sessionToken: cfg.sessionToken,
      },
    }),
  }
}

async function bodyToString(body: any) {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return Number.MAX_SAFE_INTEGER
  return Math.max(0, Math.floor(limit))
}

function statusFor(state: VideoQuotaState | null, dailyLimit: number, storageMode: VideoQuotaStatus["storage"]): VideoQuotaStatus {
  const limit = normalizeLimit(dailyLimit)
  const count = state?.day === quotaDay() ? Math.max(0, Math.floor(Number(state.count) || 0)) : 0
  const remaining = limit === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - count)
  return {
    available: remaining > 0,
    used: count > 0,
    count,
    limit,
    remaining,
    resetAt: nextResetAt(),
    usedAt: state?.usedAt,
    storage: storageMode,
  }
}

async function cloudState(userId: string): Promise<VideoQuotaState | null> {
  const s = storage()
  if (!s) return null
  try {
    const result = await s.client.send(new GetObjectCommand({ Bucket: s.cfg.bucket, Key: objectKey(userId) }))
    const parsed = JSON.parse(await bodyToString(result.Body) || "{}") as Partial<VideoQuotaState> & { usedAt?: string }
    if (parsed.day !== quotaDay() || !parsed.usedAt) return null
    // Backward compatibility with the old boolean one-generation state.
    const count = Number.isFinite(Number(parsed.count)) ? Math.max(0, Math.floor(Number(parsed.count))) : 1
    return { day: parsed.day, count, usedAt: parsed.usedAt }
  } catch {
    return null
  }
}

export async function getVideoAccountDailyQuota(userId: string, dailyLimit = 1): Promise<VideoQuotaStatus> {
  const key = memoryKey(userId)
  const cached = memory().get(key)
  const mode: VideoQuotaStatus["storage"] = config() ? "object-storage" : "runtime-memory"
  if (cached?.day === quotaDay()) return statusFor(cached, dailyLimit, mode)

  const persisted = await cloudState(userId)
  if (persisted) {
    memory().set(key, persisted)
    return statusFor(persisted, dailyLimit, "object-storage")
  }
  return statusFor(null, dailyLimit, mode)
}

export function acquireVideoAccountInFlight(userId: string) {
  const key = memoryKey(userId)
  const active = inFlight()
  if (active.has(key)) return false
  active.add(key)
  return true
}

export function releaseVideoAccountInFlight(userId: string) {
  inFlight().delete(memoryKey(userId))
}

export async function refundVideoAccountDailyQuota(userId: string, dailyLimit = 1): Promise<VideoQuotaStatus> {
  const previous = memory().get(memoryKey(userId)) || await cloudState(userId)
  const state: VideoQuotaState = {
    day: quotaDay(),
    count: Math.max(0, Math.max(0, Number(previous?.count) || 0) - 1),
    usedAt: new Date().toISOString(),
  }
  memory().set(memoryKey(userId), state)

  const s = storage()
  if (s) {
    try {
      await s.client.send(new PutObjectCommand({
        Bucket: s.cfg.bucket,
        Key: objectKey(userId),
        Body: Buffer.from(JSON.stringify(state), "utf8"),
        ContentType: "application/json; charset=utf-8",
        CacheControl: "private, no-store",
        Metadata: { kind: "malik-video-account-daily" },
      }))
      return statusFor(state, dailyLimit, "object-storage")
    } catch {}
  }
  return statusFor(state, dailyLimit, "runtime-memory")
}

export async function markVideoAccountDailyQuota(userId: string, dailyLimit = 1): Promise<VideoQuotaStatus> {
  const previous = memory().get(memoryKey(userId)) || await cloudState(userId)
  const state: VideoQuotaState = {
    day: quotaDay(),
    count: Math.max(0, Number(previous?.count) || 0) + 1,
    usedAt: new Date().toISOString(),
  }
  memory().set(memoryKey(userId), state)

  const s = storage()
  if (s) {
    try {
      await s.client.send(new PutObjectCommand({
        Bucket: s.cfg.bucket,
        Key: objectKey(userId),
        Body: Buffer.from(JSON.stringify(state), "utf8"),
        ContentType: "application/json; charset=utf-8",
        CacheControl: "private, no-store",
        Metadata: { kind: "malik-video-account-daily" },
      }))
      return statusFor(state, dailyLimit, "object-storage")
    } catch {
      // Runtime memory still prevents repeat use for this server process.
    }
  }

  return statusFor(state, dailyLimit, "runtime-memory")
}
