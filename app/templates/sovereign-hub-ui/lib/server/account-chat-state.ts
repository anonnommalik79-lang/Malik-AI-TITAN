import "server-only"

import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJson, writePrivateJson } from "./private-json-store"

type AccountChatStateEnvelope = {
  version: 1
  savedAt: string
  state: Record<string, unknown>
}

function normalizedUserId(value: string) {
  return String(value || "").trim().toLowerCase()
}

function userHash(userId: string) {
  return createHash("sha256").update(normalizedUserId(userId)).digest("hex").slice(0, 48)
}

function storageKey(userId: string) {
  return `private/account-chat-state/${userHash(userId)}.json`
}

export function accountChatStateConfigured() {
  return privateJsonStoreConfigured()
}

export async function readAccountChatState(userId: string) {
  const id = normalizedUserId(userId)
  if (!id || id === "guest" || !accountChatStateConfigured()) {
    return { configured: accountChatStateConfigured(), savedAt: "", state: null as Record<string, unknown> | null }
  }

  const envelope = await readPrivateJson<AccountChatStateEnvelope>(storageKey(id))
  if (!envelope || envelope.version !== 1 || !envelope.state || typeof envelope.state !== "object" || Array.isArray(envelope.state)) {
    return { configured: true, savedAt: "", state: null as Record<string, unknown> | null }
  }

  return {
    configured: true,
    savedAt: String(envelope.savedAt || ""),
    state: envelope.state,
  }
}

export async function writeAccountChatState(userId: string, state: Record<string, unknown>) {
  const id = normalizedUserId(userId)
  const savedAt = new Date().toISOString()
  if (!id || id === "guest" || !accountChatStateConfigured()) {
    return { configured: accountChatStateConfigured(), stored: false, savedAt }
  }

  const stored = await writePrivateJson(storageKey(id), {
    version: 1,
    savedAt,
    state,
  } satisfies AccountChatStateEnvelope)

  return { configured: true, stored, savedAt }
}
