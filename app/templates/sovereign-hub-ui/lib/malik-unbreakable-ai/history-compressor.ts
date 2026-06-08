export function compressHistory(messages: Array<{ role?: string; content?: string }>, maxChars = 1800) {
  const text = messages.slice(-16).map((m) => `${m.role || "user"}: ${String(m.content || "").slice(0, 240)}`).join("\n")
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...[compressed]`
}

