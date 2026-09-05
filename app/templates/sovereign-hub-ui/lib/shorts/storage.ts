import "server-only"

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

function env(name: string) {
  return String(process.env[name] || "").trim()
}

export function getShortsStorageConfig() {
  const endpoint = env("MALIK_SHORTS_S3_ENDPOINT")
  const region = env("MALIK_SHORTS_S3_REGION") || "auto"
  const bucket = env("MALIK_SHORTS_S3_BUCKET")
  const accessKeyId = env("MALIK_SHORTS_S3_ACCESS_KEY_ID")
  const secretAccessKey = env("MALIK_SHORTS_S3_SECRET_ACCESS_KEY")
  const publicBaseUrl = env("MALIK_SHORTS_PUBLIC_CDN_URL").replace(/\/$/, "")
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl }
}

function client() {
  const config = getShortsStorageConfig()
  if (!config) throw new Error("SHORTS_STORAGE_NOT_CONFIGURED")
  return {
    config,
    s3: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  }
}

export async function createShortsUploadUrl(args: {
  key: string
  contentType: string
}) {
  const { config, s3 } = client()
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: args.key,
    ContentType: args.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 10 * 60 })
  return {
    uploadUrl,
    publicUrl: `${config.publicBaseUrl}/${args.key.split("/").map(encodeURIComponent).join("/")}`,
  }
}

export function publicShortsObjectUrl(key: string) {
  const config = getShortsStorageConfig()
  if (!config) throw new Error("SHORTS_STORAGE_NOT_CONFIGURED")
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`
}
