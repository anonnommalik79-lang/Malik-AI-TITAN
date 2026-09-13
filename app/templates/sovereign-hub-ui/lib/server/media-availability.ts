import "server-only"

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const PHOTO_MAINTENANCE_MESSAGE =
  "Генерация изображений временно приостановлена — модуль находится в доработке. Мы готовим обновлённую версию, и скоро генерация фото снова будет доступна."

const VIDEO_LIMIT_MESSAGE =
  "Бесплатный дневной лимит MalikVideo уже использован. Модель временно доступна как Pro и снова откроется для всех после обновления дневного лимита."

const VIDEO_GATE_KEY = "private/system/malik-video-global-daily-gate.json"

type GateState = {
  day: string
  usedAt: string
  usedBy?: string
}

type MalikMediaAvailabilityGlobal = typeof globalThis & {
  __malikVideoDailyGate?: GateState | null
  __malikVideoDailyGateQueue?: Promise<void>
}

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function storageConfig() {
  const bucket = first(
    process.env.VIDEO_DAILY_GATE_BUCKET,
    process.env.FOUNDER_HISTORY_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(
    process.env.VIDEO_DAILY_GATE_ACCESS_KEY_ID,
    process.env.FOUNDER_HISTORY_ACCESS_KEY_ID,
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
  )
  const secretAccessKey = first(
    process.env.VIDEO_DAILY_GATE_SECRET_ACCESS_KEY,
    process.env.FOUNDER_HISTORY_SECRET_ACCESS_KEY,
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
  )
  if (!bucket || !accessKeyId || !secretAccessKey) return null

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(
      process.env.VIDEO_DAILY_GATE_SESSION_TOKEN,
      process.env.FOUNDER_HISTORY_SESSION_TOKEN,
      process.env.MEDIA_STORAGE_SESSION_TOKEN,
      process.env.AWS_SESSION_TOKEN,
    ) || undefined,
    region: first(
      process.env.VIDEO_DAILY_GATE_REGION,
      process.env.FOUNDER_HISTORY_REGION,
      process.env.MEDIA_STORAGE_REGION,
      process.env.AWS_REGION,
    ) || "auto",
    endpoint: first(
      process.env.VIDEO_DAILY_GATE_ENDPOINT,
      process.env.FOUNDER_HISTORY_ENDPOINT,
      process.env.MEDIA_STORAGE_ENDPOINT,
    ) || undefined,
  }
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function nextUtcResetAt(now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )).toISOString()
}

function memoryState() {
  const scope = globalThis as MalikMediaAvailabilityGlobal
  const state = scope.__malikVideoDailyGate || null
  if (!state || state.day !== utcDay()) {
    scope.__malikVideoDailyGate = null
    return null
  }
  return state
}

function setMemoryState(state: GateState | null) {
  const scope = globalThis as MalikMediaAvailabilityGlobal
  scope.__malikVideoDailyGate = state
}

async function bodyToString(body: any) {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function clientForStorage() {
  const cfg = storageConfig()
  if (!cfg) return null
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      sessionToken: cfg.sessionToken,
    },
  })
  return { client, cfg }
}

async function readCloudState(): Promise<GateState | null> {
  const storage = clientForStorage()
  if (!storage) return null
  try {
    const result = await storage.client.send(new GetObjectCommand({
      Bucket: storage.cfg.bucket,
      Key: VIDEO_GATE_KEY,
    }))
    const raw = await bodyToString(result.Body)
    const parsed = JSON.parse(raw || "{}") as Partial<GateState>
    if (!parsed.day || !parsed.usedAt) return null
    if (parsed.day !== utcDay()) return null
    return {
      day: parsed.day,
      usedAt: parsed.usedAt,
      usedBy: parsed.usedBy,
    }
  } catch {
    return null
  }
}

async function writeCloudState(state: GateState) {
  const storage = clientForStorage()
  if (!storage) return false
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.cfg.bucket,
    Key: VIDEO_GATE_KEY,
    Body: Buffer.from(JSON.stringify(state), "utf8"),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "private, no-store",
    Metadata: { kind: "malik-video-global-daily-gate" },
  }))
  return true
}

async function withGateLock<T>(task: () => Promise<T>): Promise<T> {
  const scope = globalThis as MalikMediaAvailabilityGlobal
  const previous = scope.__malikVideoDailyGateQueue || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  scope.__malikVideoDailyGateQueue = previous.then(() => current)
  await previous.catch(() => {})
  try {
    return await task()
  } finally {
    release()
  }
}

export type VideoDailyGateStatus = {
  available: boolean
  used: boolean
  resetAt: string
  usedAt?: string
  storage: "object-storage" | "runtime-memory"
  tier: "Free" | "Pro"
}

export async function getVideoDailyGateStatus(): Promise<VideoDailyGateStatus> {
  const memory = memoryState()
  if (memory) {
    return {
      available: false,
      used: true,
      resetAt: nextUtcResetAt(),
      usedAt: memory.usedAt,
      storage: storageConfig() ? "object-storage" : "runtime-memory",
      tier: "Pro",
    }
  }

  const cloud = await readCloudState()
  if (cloud) {
    setMemoryState(cloud)
    return {
      available: false,
      used: true,
      resetAt: nextUtcResetAt(),
      usedAt: cloud.usedAt,
      storage: "object-storage",
      tier: "Pro",
    }
  }

  return {
    available: true,
    used: false,
    resetAt: nextUtcResetAt(),
    storage: storageConfig() ? "object-storage" : "runtime-memory",
    tier: "Free",
  }
}

export async function acquireVideoDailySlot(userId = "anonymous"): Promise<VideoDailyGateStatus> {
  return withGateLock(async () => {
    const status = await getVideoDailyGateStatus()
    if (!status.available) return status

    const state: GateState = {
      day: utcDay(),
      usedAt: new Date().toISOString(),
      usedBy: String(userId || "anonymous").slice(0, 240),
    }

    setMemoryState(state)
    let durable = false
    try {
      durable = await writeCloudState(state)
    } catch {
      durable = false
    }

    return {
      available: true,
      used: true,
      resetAt: nextUtcResetAt(),
      usedAt: state.usedAt,
      storage: durable ? "object-storage" : "runtime-memory",
      tier: "Free",
    }
  })
}

export function photoMaintenanceResponse(route = "image") {
  return Response.json({
    ok: false,
    kind: "photo",
    status: "paused",
    code: "IMAGE_GENERATION_TEMPORARILY_PAUSED",
    error: PHOTO_MAINTENANCE_MESSAGE,
    maintenance: true,
    temporary: true,
    retryable: false,
    message: PHOTO_MAINTENANCE_MESSAGE,
    publicError: PHOTO_MAINTENANCE_MESSAGE,
    displayMessage: PHOTO_MAINTENANCE_MESSAGE,
    route,
  }, {
    status: 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": "3600",
    },
  })
}

export function videoDailyLimitResponse(status: VideoDailyGateStatus, route = "video") {
  return Response.json({
    ok: false,
    kind: "video",
    status: "limited",
    code: "VIDEO_GLOBAL_DAILY_LIMIT_REACHED",
    error: VIDEO_LIMIT_MESSAGE,
    locked: true,
    pro: true,
    tier: "Pro",
    remainingDailyVideos: 0,
    resetAt: status.resetAt,
    retryAt: status.resetAt,
    message: VIDEO_LIMIT_MESSAGE,
    publicError: VIDEO_LIMIT_MESSAGE,
    displayMessage: VIDEO_LIMIT_MESSAGE,
    route,
  }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Malik-Video-Limit": "global-daily-1",
    },
  })
}
