import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

function encryptionKey() {
  const raw = String(process.env.MALIK_SHORTS_TOKEN_ENCRYPTION_KEY || "").trim()
  if (!raw) throw new Error("MALIK_SHORTS_TOKEN_ENCRYPTION_KEY is required")

  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex")
  try {
    const decoded = Buffer.from(raw, "base64")
    if (decoded.length === 32) return decoded
  } catch {}

  // Accept a long deployment secret without silently using it directly as AES material.
  if (raw.length >= 32) return createHash("sha256").update(raw, "utf8").digest()
  throw new Error("MALIK_SHORTS_TOKEN_ENCRYPTION_KEY must be at least 32 chars, 64 hex chars, or 32-byte base64")
}

export function encryptShortsToken(value: string) {
  const plain = String(value || "")
  if (!plain) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptShortsToken(value?: string | null) {
  const encoded = String(value || "")
  if (!encoded) return ""
  const [version, ivPart, tagPart, bodyPart] = encoded.split(".")
  if (version !== "v1" || !ivPart || !tagPart || !bodyPart) throw new Error("Invalid encrypted token")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"))
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()])
  return decrypted.toString("utf8")
}
