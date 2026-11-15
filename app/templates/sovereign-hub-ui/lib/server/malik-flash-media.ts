import "server-only"

import type { RequestEntitlement } from "./request-entitlement"
import { requireFlashAccount } from "./malik-flash-chat"
import { FlashBrowserError, requireMalikFlashBrowser } from "./malik-flash-browser-bridge"
import { canReadFlashAsset, enforceFlashMediaLimit, flashAttachmentReference, flashTurnInput, loadFlashHistory, newFlashImageAssetId, saveFlashTurn } from "./malik-flash-history"
import { deleteFlashAssets, isFlashAssetId, readFlashAsset, requireFlashAssetStorage, writeFlashAsset } from "./malik-flash-assets"
import { runMalikFlashImage, validateFlashImage, type FlashImageBytes } from "./malik-flash-image-worker"
import { imageAttachments } from "../media/image-edit-source"

const provider = "google-ai-mode-browser"
const product = "Google AI Mode"

export async function runFlashMedia(input: {
  account: RequestEntitlement
  body: any
  question: string
  editing: boolean
  signal: AbortSignal
}) {
  const { account, body, question, editing, signal } = input
  requireFlashAccount(account)
  requireMalikFlashBrowser()
  requireFlashAssetStorage()
  const turn = flashTurnInput(body)
  const startedAt = new Date().toISOString()
  const history = await loadFlashHistory(account.userId, turn, question)
  const uploads = imageAttachments(body)
  const attachment = uploads[0]
  enforceFlashMediaLimit(history.mediaCount, editing && attachment?.base64 ? 2 : 1)
  let parentId: string | undefined
  let newUpload: (FlashImageBytes & { id: string }) | undefined
  let source: FlashImageBytes | undefined

  if (editing) {
    if (uploads.length > 1) throw new FlashBrowserError("FLASH_SOURCE_REQUIRED", "Прикрепите одно исходное фото.", 422)
    if (attachment?.base64) {
      source = await validateFlashImage(attachment)
      newUpload = { ...source, id: newFlashImageAssetId() }
      parentId = newUpload.id
    } else {
      const requested = body.flashSourceId || (!turn.isolatedTurn ? history.latestLocalImageId : undefined)
      if (!isFlashAssetId(requested) || !await canReadFlashAsset(account.userId, turn.chatId, requested)) {
        throw new FlashBrowserError("FLASH_SOURCE_REQUIRED", "Прикрепите исходное фото или выберите изображение из этого чата.", 422)
      }
      const receipt = await readFlashAsset(account.userId, turn.chatId, requested)
      if (!receipt) throw new FlashBrowserError("FLASH_SOURCE_REQUIRED", "Исходное изображение недоступно. Загрузите его повторно.", 422)
      parentId = requested
      source = await validateFlashImage({ mime: receipt.mime, base64: receipt.payload })
    }
  }

  const image = await runMalikFlashImage({
    task: editing ? "image_edit" : "image_generate", question, userId: account.userId, chatId: turn.chatId,
    source, requireExisting: history.requireExisting, isolatedTurn: turn.isolatedTurn, signal,
  })
  signal.throwIfAborted()
  if (source?.bytes.equals(image.bytes)) throw new FlashBrowserError("FLASH_IMAGE_UNCHANGED", "Google AI Mode вернул исходное изображение. Повторите редактирование.")

  const id = newFlashImageAssetId()
  const saved: string[] = []
  const attachments = newUpload ? [{
    ...flashAttachmentReference(turn, { ...newUpload, name: attachment.name }),
    id: typeof attachment.id === "string" ? attachment.id.slice(0, 150) : newUpload.id,
  }] : []
  try {
    if (newUpload) {
      await writeFlashAsset({ userId: account.userId, chatId: turn.chatId, assetId: newUpload.id, image: newUpload, operation: "upload" })
      saved.push(newUpload.id)
    }
    await writeFlashAsset({ userId: account.userId, chatId: turn.chatId, assetId: id, image, operation: editing ? "edit" : "generate", parentId })
    saved.push(id)
    signal.throwIfAborted()
    const { url } = flashAttachmentReference(turn, { ...image, id })
    const completedAt = new Date().toISOString()
    const generatedMedia = {
      id, kind: "image", status: "ready", prompt: question, url, provider: product, generatorProvider: provider, indeterminate: true,
      sourceAssetId: parentId, createdAt: completedAt,
    }
    await saveFlashTurn(account.userId, turn, {
      question, answer: editing ? "Изображение отредактировано." : "Изображение готово.",
      provider, model: product, sources: [], browserConversation: true, startedAt, completedAt, mediaIds: saved, generatedMedia,
      attachments,
    })
    return {
      ok: true, status: "ready", kind: "photo", operation: editing ? "edit" : "generate",
      engine: product, provider, generatorProvider: provider, assetId: id, sourceAssetId: parentId, createdAt: completedAt,
      url, imageUrl: url, masterUrl: url, storageUrl: url, durable: true,
      width: image.width, height: image.height, flashTiming: image.flashTiming,
      flashAttachments: attachments.map(item => ({ ...item, kind: "image" })),
    }
  } catch (error) {
    await deleteFlashAssets(account.userId, turn.chatId, saved).catch(() => {})
    throw error
  }
}
