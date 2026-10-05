import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export type FounderMessageSource = "chat" | "voice"
export type FounderMessageStatus = "pending" | "success" | "failed" | "interrupted"
export type FounderMessageEntry = {
  id: string
  source: FounderMessageSource
  userText: string
  assistantText: string
  createdAt: string
  provider?: string
  model?: string
  status?: FounderMessageStatus
  errorCode?: string
  errorMessage?: string
  httpStatus?: number
  durationMs?: number
}

type Envelope = { v: 1; alg: "aes-256-gcm"; iv: string; tag: string; data: string }
type Memory = typeof globalThis & {
  __malikFounderMessageMemory?: Map<string, FounderMessageEntry[]>
  __malikFounderMessageQueues?: Map<string, Promise<void>>
}
const MAX_TEXT_CHARS = 16_000
const AAD = Buffer.from("malik-founder-message-log-v1", "utf8")
const first = (...values: Array<string | undefined>) => values.map(v => String(v || "").trim()).find(Boolean) || ""
const normalize = (value: string) => String(value || "").trim().toLowerCase()
const ownerHash = (value: string) => createHash("sha256").update(normalize(value)).digest("hex").slice(0, 40)
const legacyKey = (value: string) => `private/founder/message-history/${ownerHash(value)}.enc.json`
const entryPrefix = (value: string) => `private/founder/request-audit/v2/${ownerHash(value)}/`
const entryKey = (value: string, id: string) => `${entryPrefix(value)}${id}.enc.json`
const cleanText = (value: unknown) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, MAX_TEXT_CHARS)

function memory() {
  const scope = globalThis as Memory
  return scope.__malikFounderMessageMemory ||= new Map()
}
function queues() {
  const scope = globalThis as Memory
  return scope.__malikFounderMessageQueues ||= new Map()
}
function config() {
  const bucket = first(process.env.FOUNDER_HISTORY_BUCKET, process.env.MEDIA_STORAGE_BUCKET, process.env.R2_BUCKET, process.env.CLOUDFLARE_R2_BUCKET, process.env.S3_BUCKET, process.env.STORAGE_BUCKET)
  const accessKeyId = first(process.env.FOUNDER_HISTORY_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.FOUNDER_HISTORY_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  const encryptionSecret = first(process.env.FOUNDER_HISTORY_SECRET, process.env.WORKOS_COOKIE_PASSWORD)
  if (!bucket || !accessKeyId || !secretAccessKey || !encryptionSecret) return null
  return {
    bucket, accessKeyId, secretAccessKey, encryptionSecret,
    sessionToken: first(process.env.FOUNDER_HISTORY_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.FOUNDER_HISTORY_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.FOUNDER_HISTORY_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}
function client(cfg: NonNullable<ReturnType<typeof config>>) {
  return new S3Client({
    region: cfg.region, endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
    maxAttempts: 2,
  })
}
function cleanEntry(value: unknown): FounderMessageEntry | null {
  if (!value || typeof value !== "object") return null
  const e = value as Partial<FounderMessageEntry>
  const userText = cleanText(e.userText), assistantText = cleanText(e.assistantText)
  if (!userText && !assistantText) return null
  const status: FounderMessageStatus = ["pending", "success", "failed", "interrupted"].includes(String(e.status)) ? e.status! : "success"
  return {
    id: String(e.id || randomUUID()).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 90) || randomUUID(),
    source: e.source === "voice" ? "voice" : "chat",
    userText, assistantText,
    createdAt: Number.isFinite(Date.parse(String(e.createdAt || ""))) ? String(e.createdAt) : new Date().toISOString(),
    provider: cleanText(e.provider).slice(0, 100) || undefined, model: cleanText(e.model).slice(0, 160) || undefined,
    status, errorCode: cleanText(e.errorCode).slice(0, 120) || undefined,
    errorMessage: cleanText(e.errorMessage).slice(0, 800) || undefined,
    httpStatus: Number.isFinite(e.httpStatus) ? Number(e.httpStatus) : undefined,
    durationMs: Number.isFinite(e.durationMs) ? Number(e.durationMs) : undefined,
  }
}
function encrypt(entries: FounderMessageEntry[], secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv)
  cipher.setAAD(AAD)
  const data = Buffer.concat([cipher.update(JSON.stringify(entries), "utf8"), cipher.final()])
  return JSON.stringify({ v: 1, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") })
}
function decrypt(raw: string, secret: string): FounderMessageEntry[] {
  const env = JSON.parse(raw) as Envelope
  if (env.v !== 1 || env.alg !== "aes-256-gcm") throw new Error("Unsupported audit envelope")
  const cipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(env.iv, "base64"))
  cipher.setAAD(AAD)
  cipher.setAuthTag(Buffer.from(env.tag, "base64"))
  const plain = Buffer.concat([cipher.update(Buffer.from(env.data, "base64")), cipher.final()]).toString("utf8")
  const parsed: unknown = JSON.parse(plain)
  return Array.isArray(parsed) ? parsed.map(cleanEntry).filter((e): e is FounderMessageEntry => !!e) : []
}
async function bodyText(body: any): Promise<string> {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const parts: Buffer[] = []
  for await (const part of body) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part))
  return Buffer.concat(parts).toString("utf8")
}
async function readCloud(userId: string): Promise<FounderMessageEntry[] | null> {
  const cfg = config()
  if (!cfg) return null
  const s3 = client(cfg)
  const found: FounderMessageEntry[] = []
  let continuationToken: string | undefined
  try {
    // New records are one object per request, so simultaneous users/instances do
    // not overwrite one another. Read the old per-user object for compatibility.
    try {
      const legacy = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: legacyKey(userId) }))
      found.push(...decrypt(await bodyText(legacy.Body), cfg.encryptionSecret))
    } catch (error: any) {
      if (!["NoSuchKey", "NotFound", "404"].includes(String(error?.name || error?.$metadata?.httpStatusCode))) throw error
    }
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: entryPrefix(userId), ContinuationToken: continuationToken, MaxKeys: 1000 }))
      // Bound concurrent reads without dropping old history.
      const keys = (page.Contents || []).map(o => o.Key).filter((k): k is string => Boolean(k))
      for (let i = 0; i < keys.length; i += 12) {
        const wave = await Promise.all(keys.slice(i, i + 12).map(async key => {
          const item = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
          return decrypt(await bodyText(item.Body), cfg.encryptionSecret)
        }))
        wave.forEach(list => found.push(...list))
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      if (page.IsTruncated && !continuationToken) throw new Error("Audit listing was truncated")
    } while (continuationToken)
    return found
  } catch (error) {
    console.error("[FOUNDER AUDIT] Cloud read failed", error instanceof Error ? error.message : "unknown")
    return null
  }
}
async function writeCloud(userId: string, entry: FounderMessageEntry) {
  const cfg = config()
  if (!cfg) return false
  const s3 = client(cfg)
  await s3.send(new PutObjectCommand({
    Bucket: cfg.bucket, Key: entryKey(userId, entry.id), Body: Buffer.from(encrypt([entry], cfg.encryptionSecret), "utf8"),
    ContentType: "application/json", CacheControl: "private, no-store",
    Metadata: { kind: "founder-request-audit", version: "2", owner: ownerHash(userId) },
  }))
  return true
}
export async function readFounderMessageLog(userId: string) {
  const id = normalize(userId)
  if (!id || id === "guest") return []
  const cloud = await readCloud(id)
  const local = memory().get(id) || []
  const merged = new Map<string, FounderMessageEntry>()
  for (const item of [...(cloud || []), ...local]) merged.set(item.id, item)
  return [...merged.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}
export async function appendFounderMessage(input: {
  id?: string; userId: string; source: FounderMessageSource; userText: string; assistantText: string;
  provider?: string; model?: string; createdAt?: string; status?: FounderMessageStatus;
  errorCode?: string; errorMessage?: string; httpStatus?: number; durationMs?: number
}) {
  const userId = normalize(input.userId)
  if (!userId || userId === "guest") return false
  const entry = cleanEntry({ ...input, id: input.id || randomUUID(), createdAt: input.createdAt || new Date().toISOString() })
  if (!entry) return false
  const map = queues()
  const prev = map.get(userId) || Promise.resolve()
  let persisted = false
  const next = prev.catch(() => {}).then(async () => {
    const existing = memory().get(userId) || []
    // Upsert the same request id when it changes from pending to success/error.
    const updated = existing.filter(item => item.id !== entry.id)
    updated.push(entry)
    memory().set(userId, updated)
    try { persisted = await writeCloud(userId, entry) }
    catch (error) { console.error("[FOUNDER AUDIT] Cloud write failed", error instanceof Error ? error.message : "unknown") }
  })
  map.set(userId, next)
  await next
  if (map.get(userId) === next) map.delete(userId)
  return persisted
}
export function founderMessageStorageMode() {
  return config() ? "encrypted-object-storage" : "runtime-memory"
}
