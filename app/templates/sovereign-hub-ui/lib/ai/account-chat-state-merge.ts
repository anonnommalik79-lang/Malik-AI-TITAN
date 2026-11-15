/** Shared, deterministic conflict resolution for account chat history.
 * A newer snapshot may add chats/messages, while explicit tombstones keep
 * deleted chats deleted. This never invokes a provider or a network request.
 */
type JsonRecord = Record<string, unknown>
const record = (v: unknown): JsonRecord => v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : {}
const rows = (v: unknown): JsonRecord[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object" && !Array.isArray(x)) : []
const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200

export type ChatArchive = { archived: boolean; changedAt: number }

export function readChatArchive(value: unknown): ChatArchive | undefined {
  const { archived, changedAt } = record(value)
  return typeof archived === "boolean" && typeof changedAt === "number" && Number.isSafeInteger(changedAt) && changedAt > 0
    ? { archived, changedAt } : undefined
}

function uniqueMessages(remote: JsonRecord[], incoming: JsonRecord[]): JsonRecord[] {
  const byId = new Map<string, JsonRecord>()
  const order: string[] = []
  for (const item of [...remote, ...incoming]) {
    if (!validId(item.id)) continue
    const id = item.id
    const prior = byId.get(id)
    if (!prior) { order.push(id); byId.set(id,item); continue }
    const oldContent = typeof prior.content === "string" ? prior.content : ""
    const nextContent = typeof item.content === "string" ? item.content : ""
    const oldDone = prior.isStreaming !== true
    const nextDone = item.isStreaming !== true
    if (oldDone && !nextDone) continue
    if (!oldDone && nextDone && oldContent.length > nextContent.length) continue
    if (!oldDone && !nextDone && oldContent.length > nextContent.length && oldContent.startsWith(nextContent)) continue
    // Keep the server's complete Flash result when an older browser snapshot
    // arrives during reload, stop/retry, or a cross-device merge.
    if (prior.flashServerSaved === true && item.flashServerSaved !== true) continue
    // A simultaneously regenerated final answer retains its prior completed
    // variant in versions, rather than silently discarding one device's text.
    // Stable, unique historical variants: repeated sync must not append the
    // same old answer with a fresh timestamp and cause endless reload loops.
    const sourceVariants = [
      ...rows(prior.versions), ...rows(item.versions),
      ...(oldDone && nextDone && oldContent && oldContent !== nextContent
        ? [{
            content: oldContent, at: Number(new Date(String(prior.timestamp || 0))) || 0,
            ...(prior.research ? { research: { ...record(prior.research), steps: [] } } : {}),
            ...(prior.modelId ? { modelId: prior.modelId } : {}),
            ...(prior.responseMetrics ? { responseMetrics: prior.responseMetrics } : {}),
          }] : []),
    ]
    const seen = new Set<string>()
    const revisions = sourceVariants.filter(variant => {
      const value = typeof variant.content === "string" ? variant.content.trim() : ""
      if (!value || value === nextContent.trim() || seen.has(value)) return false
      seen.add(value)
      return true
    }).slice(-8)
    byId.set(id, { ...prior, ...item, ...(revisions.length ? { versions: revisions } : {}) })
  }
  return order.map(id => byId.get(id)!).filter(Boolean)
}
function mergeChat(remote: JsonRecord, incoming: JsonRecord): JsonRecord {
  const earlier = readChatArchive(remote.archive)
  const later = readChatArchive(incoming.archive)
  const archive = later && (!earlier || later.changedAt >= earlier.changedAt) ? later : earlier
  return { ...remote, ...incoming,
    ...(archive ? { archive } : {}),
    ...((remote.flashConversationStarted === true || incoming.flashConversationStarted === true) ? { flashConversationStarted: true } : {}),
    ...((remote.flashMediaIds || incoming.flashMediaIds) ? { flashMediaIds: [...new Set([...rowsDeleted(remote.flashMediaIds), ...rowsDeleted(incoming.flashMediaIds)])] } : {}),
    messages: uniqueMessages(rows(remote.messages), rows(incoming.messages)) }
}
export function mergeAccountChatStates(remoteInput: unknown, incomingInput: unknown): JsonRecord {
  const remote=record(remoteInput),incoming=record(incomingInput)
  const deleted = [...new Set([...rowsDeleted(remote.deletedChatIds), ...rowsDeleted(incoming.deletedChatIds)])].slice(-1000)
  const gone=new Set(deleted)
  const byId=new Map<string,JsonRecord>()
  const order:string[]=[]
  // Keep the writer's preferred ordering, then surviving remote-only chats.
  for (const chat of [...rows(incoming.chats),...rows(remote.chats)]) {
    if (!validId(chat.id) || gone.has(chat.id)) continue
    const id=chat.id
    const prior=byId.get(id)
    if (!prior) { order.push(id); byId.set(id,chat) }
    else byId.set(id,mergeChat(chat,prior))
  }
  const chats=order.map(id=>byId.get(id)!).filter(Boolean)
  const activeChatId=validId(incoming.activeChatId) && !gone.has(incoming.activeChatId)
    ? incoming.activeChatId
    : validId(remote.activeChatId) && !gone.has(remote.activeChatId) ? remote.activeChatId : null
  const activeChat=chats.find(chat=>chat.id===activeChatId)
  const messages=activeChat ? rows(activeChat.messages) : uniqueMessages(rows(remote.messages),rows(incoming.messages))
  return { ...remote, ...incoming, chats, deletedChatIds:deleted, activeChatId, messages }
}
function rowsDeleted(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(validId) : []
}
