import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { RequestEntitlement } from "@/lib/server/request-entitlement"
import { evaluateWorkQuota, type WorkUsageEvent, type WorkQuotaWindows } from "@/lib/work/quota-windows"

export type WorkQuotaSnapshot = WorkQuotaWindows & {
  tier: "guest" | "free" | "plus" | "owner"
  unlimited: boolean
  storage: "object-storage" | "not-required"
}
export type WorkQuotaReceipt = { id: string }
export type WorkQuotaAdmission =
  | { ok: true; quota: WorkQuotaSnapshot; receipt: WorkQuotaReceipt | null }
  | { ok: false; status: number; code: string; message: string; quota: WorkQuotaSnapshot }

export class WorkQuotaError extends Error {
  constructor(message = "Учёт лимитов Malik Work временно недоступен.", public readonly code = "WORK_QUOTA_STORAGE_UNAVAILABLE", public readonly status = 503) {
    super(message)
    this.name = "WorkQuotaError"
  }
}

function first(...values: Array<string | undefined>) {
  return values.map((v) => String(v || "").trim()).find(Boolean) || ""
}
function limitFromEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.min(10000, Math.floor(value)) : fallback
}
function tierOf(entitlement: RequestEntitlement): WorkQuotaSnapshot["tier"] {
  if (entitlement.plan === "owner") return "owner"
  if (!entitlement.authenticated) return "guest"
  if (entitlement.plan === "pro" || entitlement.plan === "ultra") return "plus"
  return "free"
}
function limitsFor(entitlement: RequestEntitlement) {
  if (entitlement.plan === "owner") return { fiveHour: null, weekly: null }
  if (!entitlement.authenticated) return { fiveHour: null, weekly: 0 }
  if (entitlement.plan === "ultra") return {
    fiveHour: limitFromEnv("WORK_ULTRA_5H_LIMIT", 40),
    weekly: limitFromEnv("WORK_ULTRA_WEEKLY_LIMIT", 200),
  }
  if (entitlement.plan === "pro") return {
    fiveHour: limitFromEnv("WORK_PLUS_5H_LIMIT", 20),
    weekly: limitFromEnv("WORK_PLUS_WEEKLY_LIMIT", 100),
  }
  return { fiveHour: null, weekly: 6 }
}
function snapshot(entitlement: RequestEntitlement, events: WorkUsageEvent[], now: number): WorkQuotaSnapshot {
  const tier = tierOf(entitlement)
  return {
    tier,
    unlimited: tier === "owner",
    storage: tier === "owner" || tier === "guest" ? "not-required" : "object-storage",
    ...evaluateWorkQuota(events, limitsFor(entitlement), now),
  }
}

function config() {
  const bucket = first(process.env.WORK_QUOTA_BUCKET, process.env.PRIVATE_STATE_BUCKET, process.env.MEDIA_STORAGE_BUCKET, process.env.R2_BUCKET, process.env.CLOUDFLARE_R2_BUCKET, process.env.S3_BUCKET, process.env.STORAGE_BUCKET)
  const accessKeyId = first(process.env.PRIVATE_STATE_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.PRIVATE_STATE_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.PRIVATE_STATE_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    endpoint: first(process.env.PRIVATE_STATE_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT, process.env.R2_ENDPOINT, process.env.CLOUDFLARE_R2_ENDPOINT) || undefined,
    region: first(process.env.PRIVATE_STATE_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
  }
}
let cachedConfig: ReturnType<typeof config> | null = null
let cachedClient: S3Client | null = null
function store() {
  const cfg = config()
  if (!cfg) throw new WorkQuotaError("Хранилище лимитов Malik Work не подключено. Требуется R2/S3.")
  if (!cachedClient || !cachedConfig || JSON.stringify(cfg) !== JSON.stringify(cachedConfig)) {
    cachedClient = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
      maxAttempts: 2,
    })
    cachedConfig = cfg
  }
  return { cfg, client: cachedClient }
}
function objectKey(userId: string) {
  const hash = createHash("sha256").update(userId.trim().toLowerCase()).digest("hex")
  return "private/system/malik-work-quota/v1/" + hash + ".json"
}
type Persisted = { version: 1; events: WorkUsageEvent[] }
type ReadState = { events: WorkUsageEvent[]; etag: string | null }
function codeOf(error: any) { return String(error?.name || error?.Code || error?.code || "") }
function statusOf(error: any) { return Number(error?.$metadata?.httpStatusCode) }
function collision(error: unknown) { return statusOf(error) === 412 || statusOf(error) === 409 || ["PreconditionFailed", "ConditionalRequestConflict"].includes(codeOf(error)) }

async function readState(userId: string): Promise<ReadState> {
  const { cfg, client } = store()
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey(userId) }))
    if (typeof result.ContentLength === "number" && result.ContentLength > 128 * 1024) throw new Error("WORK_QUOTA_STATE_TOO_LARGE")
    const text = await result.Body?.transformToString("utf-8")
    const parsed = JSON.parse(text || "{}") as Partial<Persisted>
    if (parsed.version !== 1 || !Array.isArray(parsed.events) || parsed.events.length > 10000) throw new Error("INVALID_WORK_QUOTA_STATE")
    return {
      events: parsed.events.filter((e): e is WorkUsageEvent => Boolean(e && typeof e.id === "string" && e.id.length < 100 && Number.isFinite(e.at))),
      etag: result.ETag || null,
    }
  } catch (error) {
    if (statusOf(error) === 404 || ["NoSuchKey", "NotFound", "NoSuchBucketKey"].includes(codeOf(error))) return { events: [], etag: null }
    throw new WorkQuotaError()
  }
}
async function compareAndWrite(userId: string, previous: ReadState, events: WorkUsageEvent[]) {
  const { cfg, client } = store()
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey(userId),
    Body: JSON.stringify({ version: 1, events: events.slice(-10000) } satisfies Persisted),
    ContentType: "application/json",
    CacheControl: "private, no-store",
    ...(previous.etag ? { IfMatch: previous.etag } : { IfNoneMatch: "*" }),
  }))
}
function freshEvents(events: WorkUsageEvent[], now: number) {
  return events.filter((event) => event.at > now - 7 * 24 * 60 * 60 * 1000 && event.at <= now)
}

export async function getWorkQuota(entitlement: RequestEntitlement): Promise<WorkQuotaSnapshot> {
  if (tierOf(entitlement) === "owner" || tierOf(entitlement) === "guest") return snapshot(entitlement, [], Date.now())
  const state = await readState(entitlement.userId)
  return snapshot(entitlement, freshEvents(state.events, Date.now()), Date.now())
}

/** Optimistic S3 ETag CAS makes simultaneous requests safe across Node processes. */
export async function reserveWorkQuota(entitlement: RequestEntitlement): Promise<WorkQuotaAdmission> {
  if (!entitlement.authenticated) {
    return { ok: false, status: 401, code: "WORK_SIGN_IN_REQUIRED", message: "Войдите в аккаунт, чтобы использовать Malik Work.", quota: snapshot(entitlement, [], Date.now()) }
  }
  if (entitlement.plan === "owner") return { ok: true, quota: snapshot(entitlement, [], Date.now()), receipt: null }
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await readState(entitlement.userId)
    const now = Date.now()
    const events = freshEvents(previous.events, now)
    const quota = snapshot(entitlement, events, now)
    if (quota.weekly.remaining === 0 || quota.fiveHour.remaining === 0) {
      const blocked = quota.fiveHour.remaining === 0 ? quota.fiveHour : quota.weekly
      return {
        ok: false, status: 429, code: "WORK_QUOTA_EXHAUSTED",
        message: "Лимит Malik Work исчерпан. Следующее восстановление: " + (blocked.resetAt ? new Date(blocked.resetAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : "позже") + " (Алматы).",
        quota,
      }
    }
    const receipt = { id: randomUUID() }
    const updated = [...events, { id: receipt.id, at: now }]
    try {
      await compareAndWrite(entitlement.userId, previous, updated)
      return { ok: true, receipt, quota: snapshot(entitlement, updated, now) }
    } catch (error) {
      if (collision(error)) continue
      throw new WorkQuotaError()
    }
  }
  throw new WorkQuotaError("Malik Work занят одновременными запросами. Повторите попытку.")
}

/** Refund only a failed execution. Never delete other concurrent reservations. */
export async function refundWorkQuota(userId: string, receipt: WorkQuotaReceipt | null) {
  if (!receipt) return
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await readState(userId)
    if (!previous.events.some((event) => event.id === receipt.id)) return
    const updated = previous.events.filter((event) => event.id !== receipt.id)
    try {
      await compareAndWrite(userId, previous, updated)
      return
    } catch (error) {
      if (collision(error)) continue
      throw new WorkQuotaError()
    }
  }
  throw new WorkQuotaError("Не удалось вернуть квоту после сбоя.")
}
