import "server-only"

import { asksWhichModelGeneratedImage, flashHistoryQuery, flashReceiptTarget, retrieveFlashMessages } from "@/lib/ai/malik-flash-memory"
import { isExplicitVideoGenerationRequest } from "@/lib/ai/image-intent"
import { flashImageOperation } from "@/lib/ai/malik-flash-intent"
import { estimateGeneratedTokens } from "./daily-text-token-quota"
import type { RequestEntitlement } from "./request-entitlement"
import { FlashBrowserError, requireMalikFlashBrowser, runMalikFlashBrowser } from "./malik-flash-browser-bridge"
import { validateFlashImage } from "./malik-flash-image-worker"
import { enforceFlashMediaLimit, flashAttachmentReference, flashTurnInput, loadFlashHistory, newFlashImageAssetId, saveFlashTurn } from "./malik-flash-history"
import { deleteFlashAssets, isFlashAssetId, readFlashAsset, requireFlashAssetStorage, writeFlashAsset } from "./malik-flash-assets"

export function requireFlashAccount(account: Pick<RequestEntitlement, "authenticated">) {
  if (!account.authenticated) throw new FlashBrowserError("FLASH_SIGN_IN_REQUIRED", "Войдите в MALIKII для доступа к персональному чату Flash.", 401)
}

export async function runFlashChat(input: {
  question: string
  body: any
  account: RequestEntitlement
  maxOutputTokens?: number
  signal?: AbortSignal
  onText?: (chunk: string) => void
}) {
  const { question, body, account, signal } = input
  requireFlashAccount(account)
  const turn = flashTurnInput(body)
  // History and receipts are MALIKII operations. They remain usable during a Google outage.
  const historyQuery = flashHistoryQuery(question)
  const provenance = asksWhichModelGeneratedImage(question)
  const uploads = Array.isArray(body.attachments) ? body.attachments : []
  if (!provenance && !historyQuery) {
    if (flashImageOperation(question, uploads.length > 0)) {
      throw new FlashBrowserError("FLASH_IMAGE_ROUTE_REQUIRED", "Выполните запрос через создание или редактирование изображения в чате.", 409)
    }
    if (isExplicitVideoGenerationRequest(question)) {
      throw new FlashBrowserError("FLASH_VIDEO_ROUTE_REQUIRED", "Для генерации видео откройте видеостудию MALIKII.", 409)
    }
    requireMalikFlashBrowser()
  }
  const startedAt = new Date().toISOString()
  const history = await loadFlashHistory(account.userId, turn, question)
  const checkBudget = (text: string) => {
    if (input.maxOutputTokens !== undefined && estimateGeneratedTokens(text) > input.maxOutputTokens) {
      throw new FlashBrowserError("FLASH_TEXT_LIMIT", "Дневного лимита текста недостаточно для полного ответа.", 429)
    }
  }

  if (provenance || historyQuery) {
    let content: string
    if (provenance) {
      const results = history.messages.flatMap(message => {
        const media = message.generatedMedia
        return media?.kind === "image" && media.status === "ready" && isFlashAssetId(media.id) ? [media.id] : []
      })
      const assetId = flashReceiptTarget(question, results)
      const receipt = assetId ? await readFlashAsset(account.userId, turn.chatId, assetId) : null
      content = receipt?.provider === "google-ai-mode-browser"
        ? "Сервис изображения — **Google AI Mode (Chrome)**. В квитанции нет названия модели генерации."
        : "У выбранного изображения в этом чате нет сохранённой серверной квитанции Flash."
    } else {
      const hits = retrieveFlashMessages(history.messages, historyQuery || "")
      content = hits.length
        ? "**Найдено в истории этого чата**\n\n" + hits.map(message =>
          (message.role === "user" ? "**Вы**" : "**MALIKII**") + "\n\n" +
          message.content!.slice(0, 1300).replace(/^/gm, "> ") + (message.content!.length > 1300 ? "\n> …" : "")).join("\n\n")
        : "По этой фразе в истории чата ничего не найдено."
    }
    signal?.throwIfAborted()
    checkBudget(content)
    const answer = { content, provider: "malik-chat-history", model: "MALIKII", selectedModelId: "malik-flash" as const, usedWeb: false, sources: [], attempts: [] }
    await saveFlashTurn(account.userId, turn, { question, answer: content, provider: answer.provider, model: answer.model, sources: [], browserConversation: false,
      startedAt, completedAt: new Date().toISOString() })
    return { ...answer, flashAttachments: [] }
  }

  if (uploads.length > 4 || uploads.some((item: any) => !item || item.kind !== "image" && !/^image\//.test(String(item.mime)))) {
    throw new FlashBrowserError("FLASH_UNSUPPORTED_ATTACHMENT", "Flash принимает до четырёх фотографий PNG, JPEG или WebP.", 422)
  }
  if (uploads.length) requireFlashAssetStorage()
  enforceFlashMediaLimit(history.mediaCount, uploads.length)
  const images = await Promise.all(uploads.map(validateFlashImage))
  let streamed = ""
  const answer = await runMalikFlashBrowser({
    question, userId: account.userId, chatId: turn.chatId, images: uploads,
    context: history.context, requireExisting: history.requireExisting, isolatedTurn: turn.isolatedTurn,
    onText: input.onText ? chunk => {
      streamed += chunk
      checkBudget(streamed)
      input.onText?.(chunk)
    } : undefined, signal,
  })
  checkBudget(answer.content)
  signal?.throwIfAborted()

  const attachments = []
  try {
    for (const [index, image] of images.entries()) {
      const id = newFlashImageAssetId()
      await writeFlashAsset({ userId: account.userId, chatId: turn.chatId, assetId: id, image, operation: "upload" })
      const originalId = uploads[index].id
      attachments.push({ ...flashAttachmentReference(turn, { ...image, id, name: uploads[index].name }),
        id: typeof originalId === "string" ? originalId.slice(0, 150) : id, assetId: id })
    }
    signal?.throwIfAborted()
    await saveFlashTurn(account.userId, turn, {
      question, answer: answer.content, provider: answer.provider, model: answer.model, sources: answer.sources,
      browserConversation: true, startedAt, completedAt: new Date().toISOString(),
      attachments, mediaIds: attachments.map(attachment => attachment.assetId),
    })
  } catch (error) {
    await deleteFlashAssets(account.userId, turn.chatId, attachments.map(attachment => attachment.assetId)).catch(() => {})
    throw error
  }
  return { ...answer, flashAttachments: attachments.map(attachment => ({ ...attachment, kind: "image" })) }
}
