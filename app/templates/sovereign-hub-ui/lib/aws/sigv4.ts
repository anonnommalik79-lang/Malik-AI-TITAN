import { createHash, createHmac } from "node:crypto"

/**
 * Generic AWS Signature V4 signer (no aws-sdk dependency).
 * Reused across Bedrock / Translate / Polly so we only maintain one signer.
 */

export type AwsCreds = {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export function getAwsCreds(): AwsCreds | null {
  const region = process.env.AWS_REGION?.trim()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!region || !accessKeyId || !secretAccessKey) return null
  return {
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || undefined,
  }
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest()
}

export type SignedAwsRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

export type SignAwsOptions = {
  service: string
  host: string
  path?: string
  method?: string
  body: string
  contentType?: string
  /** Extra headers that must be included in the signature (e.g. x-amz-target). */
  extraHeaders?: Record<string, string>
}

/** Sign an AWS JSON request and return ready-to-fetch url/headers/body. */
export function signAwsRequest(creds: AwsCreds, options: SignAwsOptions): SignedAwsRequest {
  const { service, host, body } = options
  const path = options.path || "/"
  const method = options.method || "POST"
  const contentType = options.contentType || "application/x-amz-json-1.1"

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)

  const baseHeaders: Record<string, string> = {
    "content-type": contentType,
    host,
    "x-amz-content-sha256": sha256(body),
    "x-amz-date": amzDate,
  }
  if (creds.sessionToken) baseHeaders["x-amz-security-token"] = creds.sessionToken
  for (const [k, v] of Object.entries(options.extraHeaders || {})) {
    baseHeaders[k.toLowerCase()] = v
  }

  const signedHeaderNames = Object.keys(baseHeaders).sort()
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${baseHeaders[name].trim().replace(/\s+/g, " ")}\n`)
    .join("")
  const signedHeadersList = signedHeaderNames.join(";")

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    "",
    signedHeadersList,
    sha256(body),
  ].join("\n")

  const scope = `${dateStamp}/${creds.region}/${service}/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n")
  const dateKey = hmac(`AWS4${creds.secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, creds.region)
  const serviceKey = hmac(regionKey, service)
  const signingKey = hmac(serviceKey, "aws4_request")
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex")

  const authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`

  const outgoing: Record<string, string> = {
    "content-type": contentType,
    "x-amz-content-sha256": baseHeaders["x-amz-content-sha256"],
    "x-amz-date": amzDate,
    authorization,
  }
  if (creds.sessionToken) outgoing["x-amz-security-token"] = creds.sessionToken
  for (const [k, v] of Object.entries(options.extraHeaders || {})) {
    outgoing[k] = v
  }

  return { url: `https://${host}${path}`, headers: outgoing, body }
}
