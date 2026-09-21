import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { deletePrivateJson, privateJsonStoreConfigured, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import { InstagramError, refreshLongLived } from "@/lib/instagram/client"

/**
 * Where a person's Instagram token lives.
 *
 * Encrypted with AES-256-GCM, with the owner's id as additional authenticated
 * data — the same pattern the YouTube connection already uses here. That last
 * part matters more than the encryption: a token sealed for one account cannot
 * be unsealed under another, so moving a row between users turns it into
 * noise rather than into access.
 *
 * The key is separate from every other key in the app. One leaked secret
 * should not open every connected service at once.
 */

const KEY_ENV = "INSTAGRAM_TOKEN_ENCRYPTION_KEY"
/** Renew a day before Instagram would stop accepting it. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000

export type InstagramConnection = {
  accountId: string
  username: string
  accountType?: string
  /** Sealed; never leaves this module in plain text except through accessToken(). */
  token: string
  expiresAt: number
  connectedAt: number
}

export type InstagramConnectionStatus = {
  connected: boolean
  username?: string
  accountType?: string
  expiresAt?: number
  storageReady: boolean
}

function tokenKey() {
  const value = process.env[KEY_ENV] || ""
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64")
  if (key.length !== 32) {
    throw new InstagramError(
      `${KEY_ENV} должен быть 32-байтным ключом (64 hex-символа или base64).`,
      503,
      "INSTAGRAM_CONFIGURATION_REQUIRED",
    )
  }
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
  const [version, iv, tag, data, extra] = String(value || "").split(".")
  if (version !== "v1" || !iv || !tag || !data || extra) throw new InstagramError("Сохранённый токен повреждён.", 401, "INSTAGRAM_INVALID_TOKEN")
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(owner))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}

export const nonce = () => randomBytes(32).toString("base64url")
export const hash = (value: string) => createHash("sha256").update(value).digest("base64url")

/** Constant-time, and only for the exact shape `nonce()` produces. */
export function validState(received: string, expected: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(received)
    && /^[A-Za-z0-9_-]{43}$/.test(expected)
    && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

function connectionKey(userId: string) {
  // The user id is hashed rather than written, so the object listing of the
  // bucket is not a list of who has connected an Instagram account.
  return `private/instagram-connection/${createHash("sha256").update(userId).digest("hex").slice(0, 48)}.json`
}

export function instagramStorageReady() {
  return privateJsonStoreConfigured()
}

export async function readConnection(userId: string): Promise<InstagramConnection | null> {
  if (!privateJsonStoreConfigured()) return null
  const stored = await readPrivateJson<InstagramConnection>(connectionKey(userId)).catch(() => null)
  if (!stored || typeof stored !== "object" || !stored.accountId || !stored.token) return null
  return stored
}

export async function writeConnection(userId: string, connection: InstagramConnection) {
  if (!privateJsonStoreConfigured()) {
    throw new InstagramError(
      "Хранилище подключений не настроено на сервере (PRIVATE_STATE_*).",
      503,
      "INSTAGRAM_STORAGE_REQUIRED",
    )
  }
  await writePrivateJson(connectionKey(userId), connection)
}

export async function clearConnection(userId: string) {
  if (!privateJsonStoreConfigured()) return
  await deletePrivateJson(connectionKey(userId)).catch(() => undefined)
}

export async function connectionStatus(userId: string): Promise<InstagramConnectionStatus> {
  const storageReady = privateJsonStoreConfigured()
  const connection = await readConnection(userId)
  if (!connection) return { connected: false, storageReady }
  return {
    connected: true,
    username: connection.username,
    accountType: connection.accountType,
    expiresAt: connection.expiresAt,
    storageReady,
  }
}

/**
 * The plain token, renewed on the way out when it is close to expiring.
 *
 * Instagram's long-lived tokens last sixty days and can only be refreshed
 * while still valid, so a connection left alone for two months is simply gone
 * — and the honest answer then is to ask the person to reconnect rather than
 * to fail in the middle of a publish with a message about permissions.
 */
export async function accessToken(userId: string) {
  const connection = await readConnection(userId)
  if (!connection) throw new InstagramError("Instagram не подключён к этому аккаунту.", 401, "INSTAGRAM_NOT_CONNECTED")

  const token = unseal(connection.token, userId)

  if (connection.expiresAt && connection.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    if (connection.expiresAt <= Date.now()) {
      throw new InstagramError("Срок действия доступа к Instagram истёк — подключите аккаунт заново.", 401, "INSTAGRAM_TOKEN_EXPIRED")
    }
    const renewed = await refreshLongLived(token).catch(() => null)
    if (renewed) {
      await writeConnection(userId, { ...connection, token: seal(renewed.accessToken, userId), expiresAt: renewed.expiresAt })
      return { token: renewed.accessToken, accountId: connection.accountId, username: connection.username }
    }
  }

  return { token, accountId: connection.accountId, username: connection.username }
}
