import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export type MalikSchedule =
  | { kind: "once"; runAt: string }
  | { kind: "interval"; everyMinutes: number; startAt?: string }
  | { kind: "daily"; time: string; timeZone: string }
  | { kind: "weekly"; dayOfWeek: number; time: string; timeZone: string }

export type MalikScheduledTask = {
  id: string
  userId: string
  title: string
  prompt: string
  schedule: MalikSchedule
  mode: "task" | "condition"
  enabled: boolean
  createdAt: string
  updatedAt: string
  nextRunAt: string | null
  lastRunAt?: string
  lastStatus?: "complete" | "failed" | "silent"
  lastResult?: string
  lastError?: string
  runCount: number
}

type StoredEnvelope = { v: 1; iv: string; tag: string; data: string }

const PREFIX = "scheduled-tasks/v1"
const MAX_PROMPT_CHARS = 18_000
const MAX_RESULT_CHARS = 100_000

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function storageConfig() {
  const bucket = first(
    process.env.SCHEDULED_TASKS_BUCKET,
    process.env.BACKGROUND_CHAT_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(process.env.SCHEDULED_TASKS_ACCESS_KEY_ID, process.env.BACKGROUND_CHAT_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.SCHEDULED_TASKS_SECRET_ACCESS_KEY, process.env.BACKGROUND_CHAT_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  const encryptionSecret = first(process.env.SCHEDULED_TASKS_SECRET, process.env.BACKGROUND_CHAT_SECRET, process.env.WORKOS_COOKIE_PASSWORD, process.env.FOUNDER_HISTORY_SECRET)
  if (!bucket || !accessKeyId || !secretAccessKey || !encryptionSecret) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    encryptionSecret,
    sessionToken: first(process.env.SCHEDULED_TASKS_SESSION_TOKEN, process.env.BACKGROUND_CHAT_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.SCHEDULED_TASKS_REGION, process.env.BACKGROUND_CHAT_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.SCHEDULED_TASKS_ENDPOINT, process.env.BACKGROUND_CHAT_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function client() {
  const cfg = storageConfig()
  if (!cfg) return null
  return {
    cfg,
    s3: new S3Client({
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

export function scheduledTasksStatus() {
  const storageConfigured = Boolean(storageConfig())
  const runnerConfigured = Boolean(String(process.env.MALIK_SCHEDULER_SECRET || "").trim())
  const active = storageConfigured
    && runnerConfigured
    && String(process.env.MALIK_SCHEDULER_ACTIVE || "").trim().toLowerCase() === "true"
  return {
    configured: active,
    active,
    durable: storageConfigured,
    storageConfigured,
    runnerConfigured,
  }
}

function userHash(userId: string) {
  return createHash("sha256").update(userId).digest("hex")
}

function taskKey(userId: string, taskId: string) {
  return `${PREFIX}/${userHash(userId)}/${taskId}.json`
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest()
}

function encrypt(task: MalikScheduledTask, secret: string): StoredEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(task), "utf8"), cipher.final()])
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") }
}

function decrypt(raw: string, secret: string): MalikScheduledTask | null {
  try {
    const envelope = JSON.parse(raw) as StoredEnvelope
    if (envelope?.v !== 1 || !envelope.iv || !envelope.tag || !envelope.data) return null
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(envelope.iv, "base64"))
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8")) as MalikScheduledTask
  } catch {
    return null
  }
}

async function bodyToString(body: any) {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function normalizeClock(value: unknown) {
  const match = String(value || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) throw new Error("time must use HH:MM")
  return `${match[1]}:${match[2]}`
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { time: `${map.hour}:${map.minute}`, dayOfWeek: dayMap[map.weekday] ?? -1 }
}

function nextClockOccurrence(input: { time: string; timeZone: string; dayOfWeek?: number; afterMs: number }) {
  const targetTime = normalizeClock(input.time)
  if (!validTimeZone(input.timeZone)) throw new Error("invalid IANA time zone")
  const start = Math.floor(input.afterMs / 60_000) * 60_000 + 60_000
  const maxMinutes = input.dayOfWeek === undefined ? 60 * 49 : 60 * 24 * 8
  for (let minute = 0; minute < maxMinutes; minute += 1) {
    const candidate = new Date(start + minute * 60_000)
    const local = zonedParts(candidate, input.timeZone)
    if (local.time === targetTime && (input.dayOfWeek === undefined || local.dayOfWeek === input.dayOfWeek)) return candidate.toISOString()
  }
  throw new Error("could not resolve next schedule occurrence")
}

export function normalizeSchedule(value: any, nowMs = Date.now()): MalikSchedule {
  const kind = String(value?.kind || "").trim().toLowerCase()
  if (kind === "once") {
    const ms = Date.parse(String(value?.runAt || ""))
    if (!Number.isFinite(ms) || ms <= nowMs) throw new Error("runAt must be a future ISO date")
    return { kind: "once", runAt: new Date(ms).toISOString() }
  }
  if (kind === "interval") {
    const everyMinutes = Math.floor(Number(value?.everyMinutes))
    if (!Number.isFinite(everyMinutes) || everyMinutes < 5 || everyMinutes > 43_200) throw new Error("everyMinutes must be between 5 and 43200")
    const startMs = value?.startAt ? Date.parse(String(value.startAt)) : NaN
    return { kind: "interval", everyMinutes, ...(Number.isFinite(startMs) && startMs > nowMs ? { startAt: new Date(startMs).toISOString() } : {}) }
  }
  if (kind === "daily") {
    const time = normalizeClock(value?.time)
    const timeZone = String(value?.timeZone || "UTC").trim()
    if (!validTimeZone(timeZone)) throw new Error("invalid IANA time zone")
    return { kind: "daily", time, timeZone }
  }
  if (kind === "weekly") {
    const dayOfWeek = Math.floor(Number(value?.dayOfWeek))
    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new Error("dayOfWeek must be 0-6")
    const time = normalizeClock(value?.time)
    const timeZone = String(value?.timeZone || "UTC").trim()
    if (!validTimeZone(timeZone)) throw new Error("invalid IANA time zone")
    return { kind: "weekly", dayOfWeek, time, timeZone }
  }
  throw new Error("unsupported schedule kind")
}

export function nextRunAt(schedule: MalikSchedule, afterMs = Date.now()) {
  if (schedule.kind === "once") return schedule.runAt
  if (schedule.kind === "interval") {
    const start = schedule.startAt ? Date.parse(schedule.startAt) : afterMs
    if (Number.isFinite(start) && start > afterMs) return new Date(start).toISOString()
    return new Date(afterMs + schedule.everyMinutes * 60_000).toISOString()
  }
  if (schedule.kind === "daily") return nextClockOccurrence({ time: schedule.time, timeZone: schedule.timeZone, afterMs })
  return nextClockOccurrence({ time: schedule.time, timeZone: schedule.timeZone, dayOfWeek: schedule.dayOfWeek, afterMs })
}

async function saveTask(task: MalikScheduledTask) {
  const storage = client()
  if (!storage) throw new Error("Durable scheduled-task storage is not configured")
  await storage.s3.send(new PutObjectCommand({
    Bucket: storage.cfg.bucket,
    Key: taskKey(task.userId, task.id),
    Body: Buffer.from(JSON.stringify(encrypt(task, storage.cfg.encryptionSecret))),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "no-store",
    Metadata: { kind: "malik-scheduled-task", version: "1" },
  }))
  return task
}

async function readObject(key: string) {
  const storage = client()
  if (!storage) return null
  try {
    const result = await storage.s3.send(new GetObjectCommand({ Bucket: storage.cfg.bucket, Key: key }))
    return decrypt(await bodyToString(result.Body), storage.cfg.encryptionSecret)
  } catch {
    return null
  }
}

export async function createScheduledTask(input: { userId: string; title?: string; prompt: string; schedule: unknown; mode?: "task" | "condition" }) {
  if (!storageConfig()) throw new Error("Durable scheduled-task storage is not configured")
  const prompt = String(input.prompt || "").trim().slice(0, MAX_PROMPT_CHARS)
  if (!prompt) throw new Error("prompt is required")
  const schedule = normalizeSchedule(input.schedule)
  const now = new Date().toISOString()
  const task: MalikScheduledTask = {
    id: randomUUID(),
    userId: String(input.userId || "").trim(),
    title: String(input.title || "Scheduled task").replace(/\s+/g, " ").trim().slice(0, 120) || "Scheduled task",
    prompt,
    schedule,
    mode: input.mode === "condition" ? "condition" : "task",
    enabled: true,
    createdAt: now,
    updatedAt: now,
    nextRunAt: nextRunAt(schedule),
    runCount: 0,
  }
  if (!task.userId) throw new Error("userId is required")
  return saveTask(task)
}

export async function listScheduledTasks(userId: string) {
  const storage = client()
  if (!storage) return []
  const prefix = `${PREFIX}/${userHash(userId)}/`
  const results: MalikScheduledTask[] = []
  let continuationToken: string | undefined
  do {
    const page = await storage.s3.send(new ListObjectsV2Command({ Bucket: storage.cfg.bucket, Prefix: prefix, ContinuationToken: continuationToken, MaxKeys: 100 }))
    const tasks = await Promise.all((page.Contents || []).flatMap((item) => item.Key ? [readObject(item.Key)] : []))
    for (const task of tasks) if (task?.userId === userId) results.push(task)
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken && results.length < 500)
  return results.sort((a, b) => String(a.nextRunAt || "9999").localeCompare(String(b.nextRunAt || "9999")))
}

export async function deleteScheduledTask(userId: string, taskId: string) {
  const storage = client()
  if (!storage) throw new Error("Durable scheduled-task storage is not configured")
  const id = String(taskId || "").trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid task id")
  const task = await readObject(taskKey(userId, id))
  if (!task || task.userId !== userId) return false
  await storage.s3.send(new DeleteObjectCommand({ Bucket: storage.cfg.bucket, Key: taskKey(userId, id) }))
  return true
}

export async function setScheduledTaskEnabled(userId: string, taskId: string, enabled: boolean) {
  const id = String(taskId || "").trim()
  const task = await readObject(taskKey(userId, id))
  if (!task || task.userId !== userId) return null
  return saveTask({
    ...task,
    enabled,
    nextRunAt: enabled ? nextRunAt(task.schedule) : null,
    updatedAt: new Date().toISOString(),
  })
}

export async function listDueScheduledTasks(nowMs = Date.now(), limit = 50) {
  const storage = client()
  if (!storage) return []
  const results: MalikScheduledTask[] = []
  let continuationToken: string | undefined
  do {
    const page = await storage.s3.send(new ListObjectsV2Command({ Bucket: storage.cfg.bucket, Prefix: `${PREFIX}/`, ContinuationToken: continuationToken, MaxKeys: 250 }))
    const tasks = await Promise.all((page.Contents || []).flatMap((item) => item.Key ? [readObject(item.Key)] : []))
    for (const task of tasks) {
      if (!task?.enabled || !task.nextRunAt) continue
      const dueAt = Date.parse(task.nextRunAt)
      if (Number.isFinite(dueAt) && dueAt <= nowMs) results.push(task)
      if (results.length >= limit) return results.sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return results.sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt))).slice(0, limit)
}

export async function recordScheduledTaskRun(task: MalikScheduledTask, input: { status: "complete" | "failed" | "silent"; result?: string; error?: string; ranAt?: number }) {
  const ranAt = input.ranAt || Date.now()
  const oneShot = task.schedule.kind === "once"
  return saveTask({
    ...task,
    enabled: oneShot ? false : task.enabled,
    updatedAt: new Date(ranAt).toISOString(),
    lastRunAt: new Date(ranAt).toISOString(),
    lastStatus: input.status,
    lastResult: String(input.result || "").slice(0, MAX_RESULT_CHARS) || undefined,
    lastError: String(input.error || "").slice(0, 4_000) || undefined,
    runCount: task.runCount + 1,
    nextRunAt: oneShot ? null : nextRunAt(task.schedule, ranAt),
  })
}
