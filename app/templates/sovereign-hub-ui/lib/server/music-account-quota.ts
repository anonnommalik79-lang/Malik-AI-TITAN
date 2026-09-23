import "server-only"

import { createHash } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { AIPlan } from "@/lib/ai/types"

type MusicQuotaState = {
  day: string
  count: number
  updatedAt: string
}

type MusicQuotaGlobal = typeof globalThis & {
  __malikMusicQuota?: Map<string, MusicQuotaState>
  __malikMusicInFlight?: Set<string>
}

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function storageConfig() {
  const bucket = first(
    process.env.MUSIC_DAILY_GATE_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(
    process.env.MUSIC_DAILY_GATE_ACCESS_KEY_ID,
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
  )
  const secretAccessKey = first(
    process.env.MUSIC_DAILY_GATE_SECRET_ACCESS_KEY,
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
  )
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
  const scope = globalThis as MusicQuotaGlobal
  if (!scope.__malikMusicQuota) scope.__malikMusicQuota = new Map()
  return scope.__malikMusicQuota
}

function inFlight() {
  const scope = globalThis as MusicQuotaGlobal
  if (!scope.__malikMusicInFlight) scope.__malikMusicInFlight = new Set()
  return scope.__malikMusicInFlight
}

function memoryKey(userId: string) {
  return `${utcDay()}:${accountHash(userId)}`
}

function objectKey(userId: string) {
  return `private/system/malik-music-daily/${utcDay()}/${accountHash(userId)}.json`
}

function storage() {
  const cfg = storageConfig()
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

async function readCloudState(userId: string): Promise<MusicQuotaState | null> {
  const target = storage()
  if (!target) return null
  try {
    const result = await target.client.send(new GetObjectCommand({ Bucket: target.cfg.bucket, Key: objectKey(userId) }))
    const parsed = JSON.parse(await bodyToString(result.Body) || "{}") as Partial<MusicQuotaState>
    if (parsed.day !== utcDay()) return null
    return {
      day: parsed.day,
      count: Math.max(0, Number(parsed.count || 0)),
      updatedAt: String(parsed.updatedAt || ""),
    }
  } catch {
    return null
  }
}

async function persistState(userId: string, state: MusicQuotaState) {
  memory().set(memoryKey(userId), state)
  const target = storage()
  if (!target) return "runtime-memory" as const
  try {
    await target.client.send(new PutObjectCommand({
      Bucket: target.cfg.bucket,
      Key: objectKey(userId),
      Body: Buffer.from(JSON.stringify(state), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "private, no-store",
      Metadata: { kind: "malik-music-daily" },
    }))
    return "object-storage" as const
  } catch {
    return "runtime-memory" as const
  }
}

export function getMusicPlanLimits(plan: AIPlan) {
  const owner = plan === "owner"
  const isPro = plan === "pro" || plan === "ultra" || owner
  const dailyLimit = owner
    ? Number.MAX_SAFE_INTEGER
    : isPro
      ? readPositiveInt("MUSIC_PRO_DAILY_LIMIT", 30)
      : readPositiveInt("MUSIC_FREE_DAILY_LIMIT", 3)
  const maxDurationSeconds = isPro
    ? readPositiveInt("MUSIC_PRO_MAX_DURATION_SECONDS", 180)
    : readPositiveInt("MUSIC_FREE_DURATION_SECONDS", 30)
  return {
    dailyLimit,
    maxDurationSeconds,
    unlimited: owner,
    tier: owner ? "owner" as const : isPro ? "pro" as const : "free" as const,
  }
}

export async function getMusicQuota(userId: string, plan: AIPlan) {
  const limits = getMusicPlanLimits(plan)
  if (limits.unlimited) {
    return {
      ...limits,
      used: 0,
      remaining: Number.MAX_SAFE_INTEGER,
      resetAt: nextUtcResetAt(),
      storage: storageConfig() ? "object-storage" as const : "runtime-memory" as const,
    }
  }
  const key = memoryKey(userId)
  let state = memory().get(key)
  if (!state || state.day !== utcDay()) {
    state = await readCloudState(userId) || { day: utcDay(), count: 0, updatedAt: new Date().toISOString() }
    memory().set(key, state)
  }
  return {
    ...limits,
    used: state.count,
    remaining: Math.max(0, limits.dailyLimit - state.count),
    resetAt: nextUtcResetAt(),
    storage: storageConfig() ? "object-storage" as const : "runtime-memory" as const,
  }
}

export function acquireMusicInFlight(userId: string) {
  const key = memoryKey(userId)
  const active = inFlight()
  if (active.has(key)) return false
  active.add(key)
  return true
}

export function releaseMusicInFlight(userId: string) {
  inFlight().delete(memoryKey(userId))
}

export async function recordMusicUsage(userId: string, plan: AIPlan) {
  const quota = await getMusicQuota(userId, plan)
  if (quota.unlimited) return quota
  const next: MusicQuotaState = {
    day: utcDay(),
    count: quota.used + 1,
    updatedAt: new Date().toISOString(),
  }
  const storageKind = await persistState(userId, next)
  return {
    ...quota,
    used: next.count,
    remaining: Math.max(0, quota.dailyLimit - next.count),
    storage: storageKind,
  }
}