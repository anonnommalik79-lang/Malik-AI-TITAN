import "server-only"

import { createHash } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

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

function storageConfig() {
  const bucket = first(
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
  )
  const secretAccessKey = first(
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
  )
  if (!bucket || !accessKeyId || !secretAccessKey) return null

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
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

async function cloudState(userId: string): Promise<MusicQuotaState | null> {
  const s = storage()
  if (!s) return null
  try {
    const result = await s.client.send(new GetObjectCommand({ Bucket: s.cfg.bucket, Key: objectKey(userId) }))
    const parsed = JSON.parse(await bodyToString(result.Body) || "{}") as Partial<MusicQuotaState>
    if (parsed.day !== utcDay()) return null
    const count = Number(parsed.count || 0)
    return {
      day: parsed.day,
      count: Number.isFinite(count) && count >= 0 ? count : 0,
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    }
  } catch {
    return null
  }
}

export type MusicQuotaStatus = {
  limit: number
  used: number
  remaining: number
  resetAt: string
  storage: "object-storage" | "runtime-memory"
}

export async function getMusicQuota(userId: string, limit: number): Promise<MusicQuotaStatus> {
  const safeLimit = Math.max(0, Math.floor(limit))
  const key = memoryKey(userId)
  let state = memory().get(key)

  if (!state) {
    state = await cloudState(userId) || undefined
    if (state) memory().set(key, state)
  }

  const used = Math.max(0, Number(state?.count || 0))
  return {
    limit: safeLimit,
    used,
    remaining: Math.max(0, safeLimit - used),
    resetAt: nextUtcResetAt(),
    storage: storageConfig() ? "object-storage" : "runtime-memory",
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

export async function incrementMusicQuota(userId: string, limit: number): Promise<MusicQuotaStatus> {
  const current = await getMusicQuota(userId, limit)
  const state: MusicQuotaState = {
    day: utcDay(),
    count: current.used + 1,
    updatedAt: new Date().toISOString(),
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
        Metadata: { kind: "malik-music-daily" },
      }))
    } catch {
      // Runtime memory remains the fallback for this process.
    }
  }

  return getMusicQuota(userId, limit)
}
