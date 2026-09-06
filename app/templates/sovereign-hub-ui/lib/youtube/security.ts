import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
export function tokenKey() {
  const value = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY || ""
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64")
  if (key.length !== 32) throw new Error("YOUTUBE_CONFIGURATION_REQUIRED")
  return key
}
export function seal(value: string, owner: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv)
  cipher.setAAD(Buffer.from(owner))
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
}
export function unseal(value: string, owner: string) {
  const [version, iv, tag, data, extra] = value.split(".")
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("INVALID_TOKEN")
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(owner)); decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}
export const nonce = () => randomBytes(32).toString("base64url")
export const hash = (value: string) => createHash("sha256").update(value).digest("base64url")
export function validState(received: string, expected: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(received) && /^[A-Za-z0-9_-]{43}$/.test(expected) && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}
