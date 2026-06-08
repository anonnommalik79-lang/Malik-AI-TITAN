import { createHash, createHmac } from "node:crypto"
import { bedrockRegion, envPresent, envValue } from "../env"
import { providerTimeoutMs } from "../config"
import { providerFetch } from "./base"

type BedrockAuth = "bearer-primary" | "bearer-backup" | "sigv4"

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest()
}

function resolveAuthOrder(): BedrockAuth[] {
  const order: BedrockAuth[] = []
  if (envPresent("AWS_BEARER_TOKEN_BEDROCK")) order.push("bearer-primary")
  if (envPresent("AWS_ACCESS_KEY_ID") && envPresent("AWS_SECRET_ACCESS_KEY")) order.push("sigv4")
  if (envPresent("AWS_BEARER_TOKEN_BEDROCK_BACKUP")) order.push("bearer-backup")
  return order
}

function bearerToken(kind: BedrockAuth): string {
  if (kind === "bearer-backup") return envValue("AWS_BEARER_TOKEN_BEDROCK_BACKUP")
  return envValue("AWS_BEARER_TOKEN_BEDROCK")
}

function signedHeaders(payload: string, host: string, amzDate: string, sessionToken?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": sha256(payload),
    "x-amz-date": amzDate,
  }
  if (sessionToken) headers["x-amz-security-token"] = sessionToken
  return headers
}

async function sigv4Request(path: string, payload: string, region: string, signal?: AbortSignal) {
  const accessKey = envValue("AWS_ACCESS_KEY_ID")
  const secretKey = envValue("AWS_SECRET_ACCESS_KEY")
  const sessionToken = envValue("AWS_SESSION_TOKEN")
  const host = `bedrock-runtime.${region}.amazonaws.com`
  const compactDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = compactDate.slice(0, 8)
  const headers = signedHeaders(payload, host, compactDate, sessionToken || undefined)
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`).join("")
  const canonicalRequest = ["POST", path, "", canonicalHeaders, "", signedHeaderNames.join(";"), sha256(payload)].join("\n")
  const scope = `${dateStamp}/${region}/bedrock/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", compactDate, scope, sha256(canonicalRequest)].join("\n")
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, "bedrock")
  const signingKey = hmac(serviceKey, "aws4_request")
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex")
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`
  const outgoingHeaders: Record<string, string> = {
    "content-type": headers["content-type"],
    "x-amz-content-sha256": headers["x-amz-content-sha256"],
    "x-amz-date": headers["x-amz-date"],
    authorization,
  }
  if (sessionToken) outgoingHeaders["x-amz-security-token"] = sessionToken
  const response = await providerFetch(`https://${host}${path}`, {
    method: "POST",
    headers: outgoingHeaders,
    body: payload,
    signal,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.message || result?.Message || `Bedrock returned ${response.status}`)
  return result
}

async function bearerRequest(path: string, payload: string, region: string, token: string, signal?: AbortSignal) {
  const host = `bedrock-runtime.${region}.amazonaws.com`
  const response = await providerFetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: payload,
    signal,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.message || result?.Message || `Bedrock returned ${response.status}`)
  return result
}

export async function invokeBedrock(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const region = bedrockRegion()
  const payload = JSON.stringify(body)
  const authOrder = resolveAuthOrder()
  if (!authOrder.length) throw new Error("Bedrock is not configured")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Bedrock request timed out")), providerTimeoutMs())
  const linked = signal
    ? (() => {
        if (signal.aborted) controller.abort(signal.reason)
        else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
      })()
    : null
  void linked

  let lastError: unknown
  try {
    for (const auth of authOrder) {
      try {
        if (auth === "sigv4") return await sigv4Request(path, payload, region, controller.signal)
        return await bearerRequest(path, payload, region, bearerToken(auth), controller.signal)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error("Bedrock request failed")
  } finally {
    clearTimeout(timer)
  }
}

export function bedrockConfigured(): boolean {
  return resolveAuthOrder().length > 0
}
