import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { normalizeExecutionTrace, type ExecutionTrace } from "@/lib/ai/chat-execution"

export type BackgroundChatTurn = {
  turnId: string
  /** Optional only for records written before owner isolation was introduced. */
  ownerId?: string
  status: "pending" | "complete" | "failed"
  content?: string
  error?: string
  provider?: string
  model?: string
  createdAt: string
  completedAt?: string
  expiresAt: string
  execution?: ExecutionTrace
  responseMetadata?: Record<string, unknown>
}

type StoredEnvelope = {
  v: 1
  iv: string
  tag: string
  data: string
}

type GlobalWithBackgroundTurns = typeof globalThis & {
  __malikBackgroundChatTurnsV1?: Map<string, BackgroundChatTurn>
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RESULT_CHARS = 1_500_000

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

export function normalizeBackgroundTurnId(value: unknown) {
  const id = String(value || "").trim()
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) ? id : ""
}

function memoryStore() {
  const globalStore = globalThis as GlobalWithBackgroundTurns
  if (!globalStore.__malikBackgroundChatTurnsV1) globalStore.__malikBackgroundChatTurnsV1 = new Map()
  return globalStore.__malikBackgroundChatTurnsV1
}

function storageConfig() {
  const bucket = first(
    process.env.BACKGROUND_CHAT_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(process.env.BACKGROUND_CHAT_ACCESS_KEY_ID, process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.BACKGROUND_CHAT_SECRET_ACCESS_KEY, process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  const encryptionSecret = first(process.env.BACKGROUND_CHAT_SECRET, process.env.WORKOS_COOKIE_PASSWORD, process.env.FOUNDER_HISTORY_SECRET)
  if (!bucket || !accessKeyId || !secretAccessKey || !encryptionSecret) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    encryptionSecret,
    sessionToken: first(process.env.BACKGROUND_CHAT_SESSION_TOKEN, process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.BACKGROUND_CHAT_REGION, process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.BACKGROUND_CHAT_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function storageClient() {
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

function objectKey(turnId: string) {
  const digest = createHash("sha256").update(turnId).digest("hex")
  return `background-chat/v1/${digest.slice(0, 2)}/${digest}.json`
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest()
}

function encryptTurn(turn: BackgroundChatTurn, secret: string): StoredEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(turn), "utf8"), cipher.final()])
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  }
}

function decryptTurn(raw: string, secret: string): BackgroundChatTurn | null {
  try {
    const envelope = JSON.parse(raw) as StoredEnvelope
    if (envelope?.v !== 1 || !envelope.iv || !envelope.tag || !envelope.data) return null
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(envelope.iv, "base64"))
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
    const clear = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8")
    return JSON.parse(clear) as BackgroundChatTurn
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

async function writeCloud(turn: BackgroundChatTurn) {
  const storage = storageClient()
  if (!storage) return false
  try {
    const envelope = encryptTurn(turn, storage.cfg.encryptionSecret)
    await storage.s3.send(new PutObjectCommand({
      Bucket: storage.cfg.bucket,
      Key: objectKey(turn.turnId),
      Body: Buffer.from(JSON.stringify(envelope)),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
      Metadata: { kind: "background-chat", version: "1" },
    }), { abortSignal: AbortSignal.timeout(2500) })
    return true
  } catch {
    return false
  }
}

async function readCloud(turnId: string) {
  const storage = storageClient()
  if (!storage) return null
  try {
    const result = await storage.s3.send(new GetObjectCommand({
      Bucket: storage.cfg.bucket,
      Key: objectKey(turnId),
    }), { abortSignal: AbortSignal.timeout(2500) })
    return decryptTurn(await bodyToString(result.Body), storage.cfg.encryptionSecret)
  } catch {
    return null
  }
}

async function save(turn: BackgroundChatTurn) {
  memoryStore().set(turn.turnId, turn)
  await writeCloud(turn)
  return turn
}

export async function startBackgroundChatTurn(turnId: string, ownerId: string) {
  const normalized = normalizeBackgroundTurnId(turnId)
  if (!normalized || !ownerId?.trim() || ownerId.length > 320) return null
  // A caller-chosen ID must never overwrite another account's saved answer.
  if (await readBackgroundChatTurn(normalized)) return null
  const now = Date.now()
  const turn: BackgroundChatTurn = {
    turnId: normalized,
    ownerId,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  // Claim synchronously before the first cloud write, including concurrent POSTs.
  if (memoryStore().has(normalized)) return null
  return save(turn)
}

export async function completeBackgroundChatTurn(turnId: string, input: {
  content: string
  provider?: string
  model?: string
  execution?: ExecutionTrace
  responseMetadata?: Record<string, unknown>
}) {
  const normalized = normalizeBackgroundTurnId(turnId)
  if (!normalized) return null
  const current = await readBackgroundChatTurn(normalized)
  if (!current) return null
  const now = Date.now()
  return save({
    turnId: normalized,
    ownerId: current.ownerId,
    status: "complete",
    content: String(input.content || "").slice(0, MAX_RESULT_CHARS),
    provider: String(input.provider || "").slice(0, 160) || undefined,
    model: String(input.model || "").slice(0, 200) || undefined,
    execution: normalizeExecutionTrace(input.execution, true),
    responseMetadata: input.responseMetadata,
    createdAt: current?.createdAt || new Date(now).toISOString(),
    completedAt: new Date(now).toISOString(),
    expiresAt: current?.expiresAt || new Date(now + TTL_MS).toISOString(),
  })
}

export async function failBackgroundChatTurn(turnId: string, error: unknown, execution?: ExecutionTrace) {
  const normalized = normalizeBackgroundTurnId(turnId)
  if (!normalized) return null
  const current = await readBackgroundChatTurn(normalized)
  if (!current) return null
  const now = Date.now()
  return save({
    turnId: normalized,
    ownerId: current.ownerId,
    status: "failed",
    error: (error instanceof Error ? error.message : String(error || "Background chat failed")).slice(0, 4000),
    execution: normalizeExecutionTrace(execution, true),
    createdAt: current?.createdAt || new Date(now).toISOString(),
    completedAt: new Date(now).toISOString(),
    expiresAt: current?.expiresAt || new Date(now + TTL_MS).toISOString(),
  })
}

export async function readBackgroundChatTurn(turnId: string) {
  const normalized = normalizeBackgroundTurnId(turnId)
  if (!normalized) return null
  const memory = memoryStore().get(normalized)
  const turn = memory || await readCloud(normalized)
  if (!turn) return null
  if (!Number.isFinite(Date.parse(turn.expiresAt)) || Date.parse(turn.expiresAt) <= Date.now()) {
    memoryStore().delete(normalized)
    return null
  }
  if (!memory) memoryStore().set(normalized, turn)
  return turn
}
