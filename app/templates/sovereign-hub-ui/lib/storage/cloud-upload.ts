import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const MAX_MEDIA_BYTES = 64 * 1024 * 1024
const MAX_LIBRARY_PROMPT = 1800

export type CloudImageHistoryEntry = {
  id: string
  src: string
  prompt: string
  provider: string
  quality?: string
  createdAt: string
  favorite: boolean
}

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function config() {
  const bucket = first(process.env.MEDIA_STORAGE_BUCKET, process.env.R2_BUCKET, process.env.CLOUDFLARE_R2_BUCKET, process.env.S3_BUCKET, process.env.STORAGE_BUCKET)
  const accessKeyId = first(process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  const publicBaseUrl = first(process.env.MEDIA_STORAGE_PUBLIC_BASE_URL)
  if (!bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
    publicBaseUrl,
  }
}

function ownerId(userId: string) {
  return createHash("sha256").update(String(userId || "guest").trim().toLowerCase()).digest("hex").slice(0, 32)
}

function cleanSegment(value: string, fallback: string) {
  return (String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback).slice(0, 96)
}

function prepareBuffer(input: { buffer?: Buffer; base64?: string }) {
  if (input.buffer?.length) return input.buffer.length <= MAX_MEDIA_BYTES ? input.buffer : null
  if (!input.base64) return null
  try {
    const raw = String(input.base64)
    const payload = /^data:/i.test(raw) ? raw.slice(raw.indexOf(",") + 1) : raw
    const buffer = Buffer.from(payload, "base64")
    return buffer.length && buffer.length <= MAX_MEDIA_BYTES ? buffer : null
  } catch {
    return null
  }
}

function client() {
  const cfg = config()
  if (!cfg) return null
  return {
    cfg,
    s3: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
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

export function isCloudStorageConfigured() {
  return Boolean(config())
}

export async function uploadMediaAsset(input: {
  userId: string
  fileName: string
  mime: string
  base64?: string
  buffer?: Buffer
  kind?: string
  sessionId?: string
}) {
  const storage = client()
  const buffer = prepareBuffer(input)
  if (!storage || !buffer) {
    return { stored: false, reason: !storage ? "Cloud media storage is not configured." : "Invalid media payload.", publicUrl: "", path: "", bucket: storage?.cfg.bucket || "" }
  }

  const owner = ownerId(input.userId)
  const kind = cleanSegment(input.kind || "asset", "asset")
  const fileName = cleanSegment(input.fileName, "media.bin")
  const key = `users/${owner}/${kind}/${Date.now()}-${randomUUID()}-${fileName}`

  try {
    await storage.s3.send(new PutObjectCommand({
      Bucket: storage.cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: String(input.mime || "application/octet-stream").split(";")[0],
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { owner, kind },
    }))
    const publicUrl = `${storage.cfg.publicBaseUrl.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`

    // Generated masters become account-owned library records immediately. The
    // preview is deliberately excluded so one generation never appears twice.
    if (kind === "image" && !/preview/i.test(input.fileName)) {
      await recordCloudImageHistory(input.userId, {
        id: key,
        src: publicUrl,
        prompt: "",
        provider: "MalikImage",
        createdAt: new Date().toISOString(),
        favorite: false,
      })
    }

    return { stored: true, reason: "", publicUrl, path: key, bucket: storage.cfg.bucket }
  } catch (error) {
    return { stored: false, reason: error instanceof Error ? error.message : "Cloud upload failed.", publicUrl: "", path: "", bucket: storage.cfg.bucket }
  }
}

function libraryKey(userId: string) {
  return `users/${ownerId(userId)}/library/images.json`
}

function cleanLibraryEntry(value: unknown): CloudImageHistoryEntry | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<CloudImageHistoryEntry>
  const src = String(item.src || "").trim()
  if (!src || src.length > 4096 || /^(?:data|blob):/i.test(src)) return null
  return {
    id: String(item.id || randomUUID()).slice(0, 160),
    src,
    prompt: String(item.prompt || "").replace(/\s+/g, " ").trim().slice(0, MAX_LIBRARY_PROMPT),
    provider: String(item.provider || "").trim().slice(0, 120),
    quality: String(item.quality || "").trim().slice(0, 32) || undefined,
    createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 64),
    favorite: Boolean(item.favorite),
  }
}

export async function readCloudImageHistory(userId: string): Promise<CloudImageHistoryEntry[]> {
  const storage = client()
  if (!storage || !userId || userId === "guest") return []
  try {
    const result = await storage.s3.send(new GetObjectCommand({ Bucket: storage.cfg.bucket, Key: libraryKey(userId) }))
    const parsed: unknown = JSON.parse(await bodyToString(result.Body) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.map(cleanLibraryEntry).filter((item): item is CloudImageHistoryEntry => Boolean(item))
  } catch {
    return []
  }
}

export async function recordCloudImageHistory(userId: string, entry: CloudImageHistoryEntry) {
  const storage = client()
  const clean = cleanLibraryEntry(entry)
  if (!storage || !clean || !userId || userId === "guest") return false
  try {
    const current = await readCloudImageHistory(userId)
    const next = [clean, ...current.filter((item) => item.id !== clean.id && item.src !== clean.src)]
    await storage.s3.send(new PutObjectCommand({
      Bucket: storage.cfg.bucket,
      Key: libraryKey(userId),
      Body: Buffer.from(JSON.stringify(next)),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
      Metadata: { owner: ownerId(userId), kind: "image-library" },
    }))
    return true
  } catch {
    return false
  }
}
