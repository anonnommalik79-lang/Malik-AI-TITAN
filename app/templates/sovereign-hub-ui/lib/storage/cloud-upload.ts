import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const MAX_MEDIA_BYTES = 64 * 1024 * 1024

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function config() {
  const bucket = first(process.env.MEDIA_STORAGE_BUCKET, process.env.R2_BUCKET, process.env.CLOUDFLARE_R2_BUCKET, process.env.S3_BUCKET, process.env.STORAGE_BUCKET)
  const accessKeyId = first(process.env.MEDIA_STORAGE_ACCESS_KEY_ID, process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = first(process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(process.env.MEDIA_STORAGE_SESSION_TOKEN, process.env.AWS_SESSION_TOKEN) || undefined,
    region: first(process.env.MEDIA_STORAGE_REGION, process.env.AWS_REGION) || "auto",
    endpoint: first(process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
    publicBaseUrl: first(process.env.MEDIA_STORAGE_PUBLIC_BASE_URL) || undefined,
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
  const cfg = config()
  const buffer = prepareBuffer(input)
  if (!cfg || !buffer) {
    return { stored: false, reason: !cfg ? "Cloud media storage is not configured." : "Invalid media payload.", publicUrl: "", path: "", bucket: cfg?.bucket || "" }
  }

  const owner = ownerId(input.userId)
  const kind = cleanSegment(input.kind || "asset", "asset")
  const fileName = cleanSegment(input.fileName, "media.bin")
  const key = `users/${owner}/${kind}/${Date.now()}-${randomUUID()}-${fileName}`
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken },
  })

  try {
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: String(input.mime || "application/octet-stream").split(";")[0],
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { owner, kind },
    }))
    const base = cfg.publicBaseUrl?.replace(/\/+$/, "")
    const publicUrl = base ? `${base}/${key.split("/").map(encodeURIComponent).join("/")}` : ""
    if (!publicUrl) return { stored: false, reason: "MEDIA_STORAGE_PUBLIC_BASE_URL is required for stable account media URLs.", publicUrl: "", path: key, bucket: cfg.bucket }
    return { stored: true, reason: "", publicUrl, path: key, bucket: cfg.bucket }
  } catch (error) {
    return { stored: false, reason: error instanceof Error ? error.message : "Cloud upload failed.", publicUrl: "", path: "", bucket: cfg.bucket }
  }
}
