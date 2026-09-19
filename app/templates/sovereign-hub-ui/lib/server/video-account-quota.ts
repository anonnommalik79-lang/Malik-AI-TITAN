import "server-only"

import { createHash } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type VideoQuotaState = {
  day: string
  usedAt: string
}

type VideoQuotaStatus = {
  available: boolean
  used: boolean
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

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function nextUtcResetAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
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
  return `${utcDay()}:${accountHash(userId)}`
}

function objectKey(userId: string) {
  return `private/system/malik-video-account-daily/${utcDay()}/${accountHash(userId)}.json`
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

async function cloudState(userId: string): Promise<VideoQuotaState | null> {
  const s = storage()
  if (!s) return null
  try {
    const result = await s.client.send(new GetObjectCommand({ Bucket: s.cfg.bucket, Key: objectKey(userId) }))
    const parsed = JSON.parse(await bodyToString(result.Body) || "{}") as Partial<VideoQuotaState>
    if (parsed.day !== utcDay() || !parsed.usedAt) return null
    return { day: parsed.day, usedAt: parsed.usedAt }
  } catch {
    return null
  }
}

export async function getVideoAccountDailyQuota(userId: string): Promise<VideoQuotaStatus> {
  const key = memoryKey(userId)
  const cached = memory().get(key)
  if (cached?.day === utcDay()) {
    return {
      available: false,
      used: true,
      resetAt: nextUtcResetAt(),
      usedAt: cached.usedAt,
      storage: config() ? "object-storage" : "runtime-memory",
    }
  }

  const persisted = await cloudState(userId)
  if (persisted) {
    memory().set(key, persisted)
    return {
      available: false,
      used: true,
      resetAt: nextUtcResetAt(),
      usedAt: persisted.usedAt,
      storage: "object-storage",
    }
  }

  return {
    available: true,
    used: false,
    resetAt: nextUtcResetAt(),
    storage: config() ? "object-storage" : "runtime-memory",
  }
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

export async function markVideoAccountDailyQuota(userId: string): Promise<VideoQuotaStatus> {
  const state: VideoQuotaState = { day: utcDay(), usedAt: new Date().toISOString() }
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
      return { available: false, used: true, resetAt: nextUtcResetAt(), usedAt: state.usedAt, storage: "object-storage" }
    } catch {
      // Runtime memory still prevents repeat use for this server process.
    }
  }

  return { available: false, used: true, resetAt: nextUtcResetAt(), usedAt: state.usedAt, storage: "runtime-memory" }
}
