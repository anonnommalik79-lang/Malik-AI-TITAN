import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export type FounderMessageSource = "chat" | "voice"

export type FounderMessageEntry = {
  id: string
  source: FounderMessageSource
  userText: string
  assistantText: string
  createdAt: string
  provider?: string
  model?: string
}

type EncryptedEnvelope = {
  v: 1
  alg: "aes-256-gcm"
  iv: string
  tag: string
  data: string
}

type FounderMessageGlobal = typeof globalThis & {
  __malikFounderMessageMemory?: Map<string, FounderMessageEntry[]>
  __malikFounderMessageQueues?: Map<string, Promise<void>>
}

const MAX_ENTRIES_PER_USER = 500
const MAX_TEXT_CHARS = 16_000
const AAD = Buffer.from("malik-founder-message-log-v1", "utf8")

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function memory() {
  const scope = globalThis as FounderMessageGlobal
  if (!scope.__malikFounderMessageMemory) scope.__malikFounderMessageMemory = new Map<string, FounderMessageEntry[]>()
  return scope.__malikFounderMessageMemory
}

function queues() {
  const scope = globalThis as FounderMessageGlobal
  if (!scope.__malikFounderMessageQueues) scope.__malikFounderMessageQueues = new Map<string, Promise<void>>()
  return scope.__malikFounderMessageQueues
}

function normalizedUserId(userId: string) {
  return String(userId || "").trim().toLowerCase()
}

function ownerHash(userId: string) {
  return createHash("sha256").update(normalizedUserId(userId)).digest("hex").slice(0, 40)
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, MAX_TEXT_CHARS)
}

function storageConfig() {
  const bucket = first(
    process.env.FOUNDER_HISTORY_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(process.env.FOUNDER_HISTORY_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.FOUNDER_HISTORY_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  const encryptionSecret = first(process.env.FOUNDER_HISTORY_SECRET, process.env.WORKOS_COOKIE_PASSWORD)
  if (!bucket || !accessKeyId || !secretAccessKey || !encryptionSecret) return null

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    encryptionSecret,
    sessionToken: first(process.env.FOUNDER_HISTORY_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.FOUNDER_HISTORY_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.FOUNDER_HISTORY_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function storageKey(userId: string) {
  return `private/founder/message-history/${ownerHash(userId)}.enc.json`
}

function cryptoKey(secret: string) {
  return createHash("sha256").update(secret).digest()
}

function encrypt(entries: FounderMessageEntry[], secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(secret), iv)
  cipher.setAAD(AAD)
  const data = Buffer.concat([cipher.update(JSON.stringify(entries), "utf8"), cipher.final()])
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  }
  return JSON.stringify(envelope)
}

function decrypt(raw: string, secret: string): FounderMessageEntry[] {
  try {
    const envelope = JSON.parse(raw) as Partial<EncryptedEnvelope>
    if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm" || !envelope.iv || !envelope.tag || !envelope.data) return []
    const decipher = createDecipheriv("aes-256-gcm", cryptoKey(secret), Buffer.from(envelope.iv, "base64"))
    decipher.setAAD(AAD)
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8")
    const parsed: unknown = JSON.parse(plain)
    if (!Array.isArray(parsed)) return []
    return parsed.map(cleanEntry).filter((entry): entry is FounderMessageEntry => Boolean(entry)).slice(-MAX_ENTRIES_PER_USER)
  } catch {
    return []
  }
}

function cleanEntry(value: unknown): FounderMessageEntry | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<FounderMessageEntry>
  const userText = cleanText(item.userText)
  const assistantText = cleanText(item.assistantText)
  if (!userText && !assistantText) return null
  return {
    id: cleanText(item.id || randomUUID()).slice(0, 120),
    source: item.source === "voice" ? "voice" : "chat",
    userText,
    assistantText,
    createdAt: Number.isFinite(Date.parse(String(item.createdAt || ""))) ? String(item.createdAt) : new Date().toISOString(),
    provider: cleanText(item.provider).slice(0, 100) || undefined,
    model: cleanText(item.model).slice(0, 160) || undefined,
  }
}

async function bodyToString(body: any) {
  if (!body) return ""
  if (typeof body.transformToString === "function") return body.transformToString("utf-8")
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

async function readCloud(userId: string): Promise<FounderMessageEntry[] | null> {
  const cfg = storageConfig()
  if (!cfg) return null
  const s3 = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
  })
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: storageKey(userId) }))
    return decrypt(await bodyToString(result.Body), cfg.encryptionSecret)
  } catch {
    return []
  }
}

async function writeCloud(userId: string, entries: FounderMessageEntry[]) {
  const cfg = storageConfig()
  if (!cfg) return false
  const s3 = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
  })
  await s3.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: storageKey(userId),
    Body: Buffer.from(encrypt(entries, cfg.encryptionSecret), "utf8"),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "private, no-store",
    Metadata: { kind: "founder-message-history", owner: ownerHash(userId) },
  }))
  return true
}

export async function readFounderMessageLog(userId: string): Promise<FounderMessageEntry[]> {
  const id = normalizedUserId(userId)
  if (!id || id === "guest") return []
  const cloud = await readCloud(id)
  if (cloud !== null) {
    memory().set(id, cloud)
    return cloud
  }
  return [...(memory().get(id) || [])]
}

export async function appendFounderMessage(input: {
  userId: string
  source: FounderMessageSource
  userText: string
  assistantText: string
  provider?: string
  model?: string
  createdAt?: string
}) {
  const userId = normalizedUserId(input.userId)
  if (!userId || userId === "guest") return false

  const entry = cleanEntry({
    id: randomUUID(),
    source: input.source,
    userText: input.userText,
    assistantText: input.assistantText,
    createdAt: input.createdAt || new Date().toISOString(),
    provider: input.provider,
    model: input.model,
  })
  if (!entry) return false

  const queueMap = queues()
  const previous = queueMap.get(userId) || Promise.resolve()
  let stored = false
  const next = previous.catch(() => {}).then(async () => {
    const current = await readFounderMessageLog(userId)
    const duplicate = current.some((item) =>
      item.source === entry.source &&
      item.userText === entry.userText &&
      item.assistantText === entry.assistantText &&
      Math.abs(Date.parse(item.createdAt) - Date.parse(entry.createdAt)) < 1500,
    )
    const updated = duplicate ? current : [...current, entry].slice(-MAX_ENTRIES_PER_USER)
    memory().set(userId, updated)
    try {
      stored = await writeCloud(userId, updated)
    } catch (error) {
      console.warn("[FOUNDER MESSAGE LOG] cloud persistence unavailable", error instanceof Error ? error.message : error)
    }
  })
  queueMap.set(userId, next)
  await next
  if (queueMap.get(userId) === next) queueMap.delete(userId)
  return stored || true
}

export function founderMessageStorageMode() {
  return storageConfig() ? "encrypted-object-storage" : "runtime-memory"
}
