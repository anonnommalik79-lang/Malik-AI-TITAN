/** Providers can interleave indexed candidates across frames. Only the primary candidate belongs in the chat. */
export function primaryProviderChoice<T extends { index?: number | string }>(choices: readonly T[] | undefined): T | undefined {
  if (!Array.isArray(choices)) return
  return choices.find(candidate => candidate?.index === 0 || candidate?.index === "0")
    || (choices.every(candidate => candidate?.index == null) ? choices[0] : undefined)
}

/** The standardized streaming envelope carries one stable ID for the entire completion. */
export function providerCompletionId(event: { object?: unknown; id?: unknown }) {
  return event?.object === "chat.completion.chunk" && typeof event.id === "string" && event.id.length <= 160 ? event.id : undefined
}
