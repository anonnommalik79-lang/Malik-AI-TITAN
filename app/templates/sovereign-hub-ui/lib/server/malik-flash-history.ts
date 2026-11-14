import "server-only"

import { randomUUID } from "node:crypto"
import { buildFlashContext, flashTranscript, type FlashTranscriptMessage } from "@/lib/ai/malik-flash-memory"
import { accountChatStateConfigured, readAccountChatState, updateAccountChatState } from "./account-chat-state"
import { durablePostgresConfigured } from "./durable-postgres"
import { FlashBrowserError, isFlashChatId, type FlashBrowserSource } from "./malik-flash-browser-bridge"

type ChatSnapshot = {
  id: string
  title?: string
  timestamp?: string
  kind?: string
  messages?: FlashTranscriptMessage[]
  flashConversationStarted?: boolean
  flashMediaIds?: string[]
}
const MAX_FLASH_MEDIA_PER_CHAT = 64

export type FlashTurnInput = {
  chatId: string
  userMessageId: string
  assistantMessageId: string
  isolatedTurn: boolean
}

function deleted(state: Record<string, unknown> | null, chatId: string) {
  return Array.isArray(state?.deletedChatIds) && state.deletedChatIds.includes(chatId)
}

function chatsIn(state: Record<string, unknown> | null) {
  return (Array.isArray(state?.chats) ? state.chats : []) as ChatSnapshot[]
}

export function flashTurnInput(body: { chatId?: unknown; userMessageId?: unknown; assistantMessageId?: unknown; flashContextEnabled?: unknown }): FlashTurnInput {
  if (!isFlashChatId(body.chatId)) throw new FlashBrowserError("FLASH_CHAT_ID_REQUIRED", "Не удалось определить чат.", 400)
  const userMessageId = isFlashChatId(body.userMessageId) ? body.userMessageId : randomUUID()
  let assistantMessageId = isFlashChatId(body.assistantMessageId) ? body.assistantMessageId : randomUUID()
  if (userMessageId === assistantMessageId) assistantMessageId = randomUUID()
  return { chatId: body.chatId, userMessageId, assistantMessageId, isolatedTurn: body.flashContextEnabled === false }
}

function historyUnavailable() {
  return new FlashBrowserError("FLASH_HISTORY_UNAVAILABLE", "Не удалось открыть защищённое хранилище чата. Попробуйте ещё раз.")
}

function assertChatAvailable(state: Record<string, unknown> | null, chatId: string) {
  if (deleted(state, chatId)) throw new FlashBrowserError("FLASH_CHAT_DELETED", "Этот чат удалён. Откройте другой чат.", 410)
}

export async function loadFlashHistory(userId: string, input: FlashTurnInput, question: string) {
  if (!durablePostgresConfigured() || !accountChatStateConfigured()) throw historyUnavailable()
  const snapshot = await readAccountChatState(userId).catch(() => { throw historyUnavailable() })
  assertChatAvailable(snapshot.state, input.chatId)
  const chat = chatsIn(snapshot.state).find(item => item?.id === input.chatId)
  const messages = flashTranscript((Array.isArray(chat?.messages) ? chat.messages : []).filter(message =>
    message && message.id !== input.userMessageId && message.id !== input.assistantMessageId))
  const verifiedAssets = Array.isArray(chat?.flashMediaIds) ? chat.flashMediaIds : []
  const latestLocalImageId = messages.flatMap(message => {
    const media = message.generatedMedia
    return [
      ...(message.attachments || []).flatMap(attachment => {
        const id = attachment.url?.split("/").at(-1)
        return id && verifiedAssets.includes(id) ? [id] : []
      }),
      ...(media?.kind === "image" && media.status === "ready" && media.id && verifiedAssets.includes(media.id) ? [media.id] : []),
    ]
  }).at(-1)
  return {
    messages,
    context: input.isolatedTurn ? undefined : buildFlashContext(messages, question),
    requireExisting: !input.isolatedTurn && chat?.flashConversationStarted === true,
    mediaCount: verifiedAssets.length,
    latestLocalImageId,
  }
}

export function enforceFlashMediaLimit(existing: number, more: number) {
  if (existing + more > MAX_FLASH_MEDIA_PER_CHAT) {
    throw new FlashBrowserError("FLASH_MEDIA_LIMIT", "В чате достигнут лимит хранения фото. Продолжите в новом чате.", 429)
  }
}

export function flashAttachmentUrl(chatId: string, assetId: string) {
  return `/api/chat/flash-image/${encodeURIComponent(chatId)}/${encodeURIComponent(assetId)}`
}

export function newFlashImageAssetId() {
  return randomUUID().replaceAll("-", "")
}

type StoredAsset = { id: string; mime: string; bytes: Buffer; name?: string }

export type FlashStoredAsset = { id: string; url: string; mime: string; size: number; name: string }

export function flashAttachmentReference(turn: FlashTurnInput, asset: StoredAsset): FlashStoredAsset {
  return {
    id: asset.id, url: flashAttachmentUrl(turn.chatId, asset.id),
    name: typeof asset.name === "string" && asset.name.trim() ? asset.name.slice(0, 240) : "image." + asset.mime.slice(6),
    mime: asset.mime, size: asset.bytes.length,
  }
}

export async function saveFlashTurn(userId: string, turn: FlashTurnInput, result: {
  question: string
  answer: string
  provider: string
  model: string
  sources: FlashBrowserSource[]
  browserConversation: boolean
  startedAt: string
  completedAt: string
  attachments?: FlashStoredAsset[]
  mediaIds?: string[]
  generatedMedia?: Record<string, unknown>
}) {
  try {
    const save = await updateAccountChatState(userId, state => {
      assertChatAvailable(state, turn.chatId)
      const chats = chatsIn(state)
      const current = chats.find(item => item?.id === turn.chatId)
      const messages = Array.isArray(current?.messages) ? [...current.messages] : []
      const previousMedia = Array.isArray(current?.flashMediaIds) ? current.flashMediaIds : []
      const mediaIds = [...new Set([...previousMedia, ...(result.mediaIds || [])])]
      enforceFlashMediaLimit(0, mediaIds.length)
      const upsert = (id: string, value: FlashTranscriptMessage & Record<string, unknown>) => {
        const index = messages.findIndex(item => item?.id === id)
        if (index < 0) messages.push(value)
        else messages[index] = { ...messages[index], ...value }
      }
      // IDs are only a reconciliation hint. A client cannot repurpose a
      // different turn's message as its user or assistant record.
      const existingUser = messages.find(message => message?.id === turn.userMessageId)
      const existingAnswer = messages.find(message => message?.id === turn.assistantMessageId)
      const existingUserIndex = messages.indexOf(existingUser!)
      const existingAnswerIndex = messages.indexOf(existingAnswer!)
      const separateTurn = existingUserIndex >= 0 && existingAnswerIndex !== existingUserIndex + 1
      if ((existingUser && existingUser.role !== "user") ||
          (existingAnswer && (existingAnswer.role !== "assistant" || separateTurn || !existingUser))) {
        throw new FlashBrowserError("FLASH_TURN_CONFLICT", "Этот запрос уже привязан к другому сообщению.", 409)
      }
      upsert(turn.userMessageId, {
        id: turn.userMessageId, role: "user", content: result.question,
        timestamp: existingUser?.timestamp || result.startedAt, modelId: "malik-flash", flashServerSaved: true,
        ...(result.attachments?.length ? { attachments: result.attachments.map(asset => ({ ...asset, kind: "image" })) } : {}),
      })
      upsert(turn.assistantMessageId, {
        id: turn.assistantMessageId, role: "assistant", content: result.answer, timestamp: result.completedAt,
        isStreaming: false, modelId: "malik-flash", answerProvider: result.provider, answerModel: result.model, flashServerSaved: true,
        ...(result.sources.length ? { research: { status: "done", usedWeb: true, sources: result.sources, steps: [], startedAt: Date.parse(result.startedAt), webSourceCount: result.sources.length } } : {}),
        ...(result.generatedMedia ? { generatedMedia: result.generatedMedia } : {}),
      })
      const next = {
        ...current, id: turn.chatId, kind: current?.kind || "chat",
        title: current?.title || result.question.slice(0, 84), timestamp: current?.timestamp || result.startedAt,
        selectedModelId: "malik-flash", messages,
        flashConversationStarted: current?.flashConversationStarted === true || result.browserConversation && !turn.isolatedTurn,
        flashMediaIds: mediaIds,
      }
      const activeChatId = state?.activeChatId || turn.chatId
      return {
        ...state, activeChatId, chats: current ? chats.map(chat => chat?.id === turn.chatId ? next : chat) : [next, ...chats],
        ...(activeChatId === turn.chatId ? { messages } : {}),
      }
    })
    if (!save.stored) throw historyUnavailable()
  } catch (error) {
    if (error instanceof FlashBrowserError) throw error
    throw historyUnavailable()
  }
}

export async function canReadFlashAsset(userId: string, chatId: string, assetId: string) {
  const { state } = await readAccountChatState(userId)
  if (deleted(state, chatId)) return false
  const chat = chatsIn(state).find(item => item?.id === chatId)
  return Array.isArray(chat?.flashMediaIds) && chat.flashMediaIds.includes(assetId)
}

/** Browser sync cannot set server receipts. Keep the previous verified fields. */
export function cleanFlashMetadataForSync(state: Record<string, unknown>) {
  const cleanMessage = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value
    const { flashServerSaved, answerProvider, answerModel, ...message } = value as Record<string, unknown>
    return message
  }
  const cleanMessages = (messages: unknown) => Array.isArray(messages) ? messages.map(cleanMessage) : messages
  const { flashMediaDeletionQueue, ...rest } = state
  return {
    ...rest, messages: cleanMessages(rest.messages),
    chats: Array.isArray(rest.chats) ? rest.chats.map(chat => {
      if (!chat || typeof chat !== "object" || Array.isArray(chat)) return chat
      const { flashMediaIds, flashConversationStarted, ...entry } = chat
      return { ...entry, messages: cleanMessages(entry.messages) }
    }) : rest.chats,
  }
}
