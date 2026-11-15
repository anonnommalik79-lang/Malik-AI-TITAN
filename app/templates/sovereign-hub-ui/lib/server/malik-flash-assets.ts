import "server-only"

import { createHash } from "node:crypto"
import { durablePostgresConfigured, readPostgresPrivateJson, writePostgresPrivateJson } from "./durable-postgres"
import { FlashBrowserError } from "./malik-flash-browser-bridge"
import type { FlashImageBytes } from "./malik-flash-image-worker"

type FlashAssetReceipt = {
  v: 1
  mime: string
  payload: string
  operation: "upload" | "generate" | "edit"
  provider?: "google-ai-mode-browser"
  parentId?: string
  createdAt: string
}

function key(userId: string, chatId: string, assetId: string) {
  const owner = createHash("sha256").update(userId).digest("hex")
  const chat = createHash("sha256").update(chatId).digest("hex")
  return "private/flash-media/" + owner + "/" + chat + "/" + assetId
}

export function isFlashAssetId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/u.test(value)
}

export function requireFlashAssetStorage() {
  if (!durablePostgresConfigured()) throw new FlashBrowserError(
    "FLASH_MEDIA_STORAGE_UNAVAILABLE", "Защищённое хранилище изображений Flash недоступно. Попробуйте позже.",
  )
}

export async function writeFlashAsset(input: {
  userId: string; chatId: string; assetId: string; image: FlashImageBytes
  operation: FlashAssetReceipt["operation"]; parentId?: string
}) {
  requireFlashAssetStorage()
  if (!isFlashAssetId(input.assetId) || (input.parentId && !isFlashAssetId(input.parentId))) throw new Error("INVALID_FLASH_ASSET_ID")
  const receipt: FlashAssetReceipt = {
    v: 1, mime: input.image.mime, payload: input.image.bytes.toString("base64"),
    operation: input.operation, ...(input.operation === "upload" ? {} : { provider: "google-ai-mode-browser" }),
    parentId: input.parentId, createdAt: new Date().toISOString(),
  }
  try {
    const stored = await writePostgresPrivateJson(key(input.userId, input.chatId, input.assetId), receipt, null)
    if (!stored.stored) throw new Error("FLASH_ASSET_WRITE_CONFLICT")
  } catch {
    throw new FlashBrowserError("FLASH_MEDIA_WRITE_FAILED", "Не удалось надёжно сохранить изображение Flash.")
  }
}

export async function readFlashAsset(userId: string, chatId: string, assetId: string) {
  if (!isFlashAssetId(assetId) || !durablePostgresConfigured()) return null
  const { value } = await readPostgresPrivateJson<FlashAssetReceipt>(key(userId, chatId, assetId))
  if (value?.v !== 1 || !/^image\/(png|jpeg|webp)$/u.test(value.mime)) return null
  return value
}

export async function deleteFlashAssets(userId: string, chatId: string, assetIds: string[]) {
  if (!assetIds.length) return
  requireFlashAssetStorage()
  for (const assetId of new Set(assetIds)) {
    if (isFlashAssetId(assetId)) await writePostgresPrivateJson(key(userId, chatId, assetId), null)
  }
}
