import "server-only"

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const MAX_PRIVATE_JSON_BYTES = 8 * 1024 * 1024

function first(...values: Array<string | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || ""
}

function config() {
  const bucket = first(
    process.env.PRIVATE_STATE_BUCKET,
    process.env.MEDIA_STORAGE_BUCKET,
    process.env.R2_BUCKET,
    process.env.CLOUDFLARE_R2_BUCKET,
    process.env.S3_BUCKET,
    process.env.STORAGE_BUCKET,
  )
  const accessKeyId = first(
    process.env.PRIVATE_STATE_ACCESS_KEY_ID,
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
  )
  const secretAccessKey = first(
    process.env.PRIVATE_STATE_SECRET_ACCESS_KEY,
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
  )

  if (!bucket || !accessKeyId || !secretAccessKey) return null

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: first(
      process.env.PRIVATE_STATE_SESSION_TOKEN,
      process.env.MEDIA_STORAGE_SESSION_TOKEN,
      process.env.AWS_SESSION_TOKEN,
    ) || undefined,
    region: first(
      process.env.PRIVATE_STATE_REGION,
      process.env.MEDIA_STORAGE_REGION,
      process.env.AWS_REGION,
    ) || "auto",
    endpoint: first(process.env.PRIVATE_STATE_ENDPOINT, process.env.MEDIA_STORAGE_ENDPOINT) || undefined,
  }
}

function normalizeKey(value: string) {
  const key = String(value || "").trim().replace(/^\/+/, "")
  if (!key || key.includes("..") || key.includes("\\") || !/^[a-zA-Z0-9/_=.:-]+$/.test(key)) {
    throw new Error("INVALID_PRIVATE_STATE_KEY")
  }
  return key
}

function storage() {
  const cfg = config()
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

async function bodyToBuffer(body: any) {
  if (!body) return Buffer.alloc(0)
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray()
    return Buffer.from(bytes)
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_PRIVATE_JSON_BYTES) throw new Error("PRIVATE_STATE_TOO_LARGE")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export function privateJsonStoreConfigured() {
  return Boolean(config())
}

export async function readPrivateJson<T>(keyValue: string): Promise<T | null> {
  const target = storage()
  if (!target) return null
  const key = normalizeKey(keyValue)

  try {
    const result = await target.client.send(new GetObjectCommand({
      Bucket: target.cfg.bucket,
      Key: key,
    }))

    if (typeof result.ContentLength === "number" && result.ContentLength > MAX_PRIVATE_JSON_BYTES) {
      throw new Error("PRIVATE_STATE_TOO_LARGE")
    }

    const buffer = await bodyToBuffer(result.Body)
    if (!buffer.length || buffer.length > MAX_PRIVATE_JSON_BYTES) return null
    return JSON.parse(buffer.toString("utf8")) as T
  } catch (error: any) {
    const code = String(error?.name || error?.Code || error?.code || "")
    if (code === "NoSuchKey" || code === "NotFound" || Number(error?.$metadata?.httpStatusCode) === 404) return null
    console.warn("[MALIK_PRIVATE_STATE] read failed", key, error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function writePrivateJson(keyValue: string, value: unknown) {
  const target = storage()
  if (!target) return false
  const key = normalizeKey(keyValue)
  const body = Buffer.from(JSON.stringify(value), "utf8")
  if (!body.length || body.length > MAX_PRIVATE_JSON_BYTES) throw new Error("PRIVATE_STATE_TOO_LARGE")

  try {
    await target.client.send(new PutObjectCommand({
      Bucket: target.cfg.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "private, no-store",
      Metadata: { kind: "malik-private-state" },
    }))
    return true
  } catch (error) {
    console.warn("[MALIK_PRIVATE_STATE] write failed", key, error instanceof Error ? error.message : String(error))
    return false
  }
}

export async function deletePrivateJson(keyValue: string) {
  const target = storage()
  if (!target) return false
  const key = normalizeKey(keyValue)

  try {
    await target.client.send(new DeleteObjectCommand({
      Bucket: target.cfg.bucket,
      Key: key,
    }))
    return true
  } catch (error) {
    console.warn("[MALIK_PRIVATE_STATE] delete failed", key, error instanceof Error ? error.message : String(error))
    return false
  }
}
