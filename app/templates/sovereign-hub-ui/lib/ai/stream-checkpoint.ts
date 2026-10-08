/** Capture the latest streaming assistant text inside its existing history row.
 * Called by the current throttled snapshot, without any new API requests.
 */
export function mergeStreamingAssistantCheckpoints<
  M extends { id: string; role: string; content: string; isStreaming?: boolean; generatedMedia?: unknown },
  C extends { messages: M[] },
>(chats: C[], activeMessages: M[]): C[] {
  const partials = new Map(
    activeMessages.filter((item) => item.role === "assistant" && item.isStreaming === true
      && typeof item.content === "string" && item.content.length > 0 && !item.generatedMedia)
      .map((item) => [item.id, item.content] as const),
  )
  if (!partials.size) return chats
  return chats.map((chat) => {
    let changed = false
    const messages = chat.messages.map((item) => {
      if (item.role !== "assistant" || item.generatedMedia) return item
      const content = partials.get(item.id)
      if (content === undefined || (item.content === content && item.isStreaming)) return item
      changed = true
      return { ...item, content, isStreaming: true }
    })
    return changed ? { ...chat, messages } : chat
  })
}

/** SSE cannot survive a full browser reload; show saved partial plus a retry cue. */
export function restoreInterruptedAssistant(content: string, wasStreaming: boolean): string {
  const text = String(content || "")
  if (!wasStreaming) return text
  if (/Соединение прервалось|Остановлено пользователем|Ответ был прерван/iu.test(text)) return text
  const notice = "Ответ был прерван при обновлении страницы. Полученный текст сохранён. Нажмите «Перегенерировать», чтобы повторить запрос."
  return text.trim() ? text + "\n\n_" + notice + "_" : notice
}
