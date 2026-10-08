import { createHash } from "node:crypto"

export const MAX_SHARED_ANSWER_CACHE_ENTRIES = 48

/** Hash the entire normalized prompt; never key on its first N characters. */
export function sharedAnswerCacheKey(version: string, prompt: string): string {
  const normalized = String(prompt || "").normalize("NFC").toLowerCase().trim().replace(/\s+/gu, " ")
  return version + ":" + createHash("sha256").update(normalized, "utf8").digest("hex")
}

/** Shared answers are safe only for self-contained public research prompts. */
export function mayShareAnswerCache(body: unknown, prompt: string): boolean {
  const request = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const query = String(prompt || "").trim()
  if (query.length < 10 || query.length > 3_000) return false
  for (const field of ["history", "messages", "attachments"]) {
    const value = request[field]
    if (Array.isArray(value) && value.length) return false
    if (value && !Array.isArray(value)) return false
  }
  for (const field of ["metadata", "client", "context", "userContext", "memoryContext", "projectContext", "connectedContext", "systemPrompt", "instructions", "projectId", "userId", "sessionId", "chatId", "threadId"]) {
    const value = request[field]
    if (value != null && value !== "" && !(Array.isArray(value) && !value.length)) return false
  }
  const original = typeof request.originalQuestion === "string" ? request.originalQuestion.trim() : ""
  const expanded = typeof request.question === "string" ? request.question.trim() : ""
  if (original && expanded && original !== expanded) return false
  return true
}

/** Bound process memory and retire expired entries without a background timer. */
export function trimSharedAnswerCache<T>(entries: Map<string, { expiresAt: number; value: T }>, now = Date.now(), limit = MAX_SHARED_ANSWER_CACHE_ENTRIES): void {
  for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key)
  const cap = Math.max(0, Math.floor(limit))
  while (entries.size > cap) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}
