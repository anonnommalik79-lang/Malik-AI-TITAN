import "server-only"

import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJson, readPrivateJsonVersioned, writePrivateJsonConditional } from "./private-json-store"
import { mergeAccountChatStates } from "@/lib/ai/account-chat-state-merge"

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

  const envelope = await readPrivateJson<AccountChatStateEnvelope>(storageKey(id), { throwOnReadError: true })
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
  const id=normalizedUserId(userId)
  if (!id || id==="guest" || !accountChatStateConfigured()) {
    return {configured:accountChatStateConfigured(),stored:false,savedAt:""}
  }
  const key=storageKey(id)
  // An optimistic compare-and-swap loop prevents two devices from replacing
  // one another. No in-memory mutex: Render instances may be separate.
  for(let attempt=0;attempt<5;attempt++) {
    const current=await readPrivateJsonVersioned<AccountChatStateEnvelope>(key)
    if (current.value && (
      current.value.version!==1 || !current.value.state ||
      typeof current.value.state!=="object" || Array.isArray(current.value.state)
    )) throw new Error("INVALID_REMOTE_CHAT_STATE")
    const merged=mergeAccountChatStates(current.value?.state ?? null,state)
    const savedAt=new Date().toISOString()
    const result=await writePrivateJsonConditional(key,{
      version:1,savedAt,state:merged,
    } satisfies AccountChatStateEnvelope,current.etag)
    if(result.stored) {
      return { configured:true,stored:true,savedAt, mergedChats:Array.isArray(merged.chats)?merged.chats.length:0 }
    }
    if(!result.conflict) return {configured:true,stored:false,savedAt:""}
    // A new writer won; re-read its ETag and merge again on the next attempt.
  }
  return {configured:true,stored:false,conflict:true,savedAt:""}
}
