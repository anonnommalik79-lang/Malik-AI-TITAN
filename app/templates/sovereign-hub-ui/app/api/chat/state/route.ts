import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import {
  accountChatStateConfigured,
  readAccountChatState,
  updateAccountChatState,
} from "@/lib/server/account-chat-state"
import { mergeAccountChatStates } from "@/lib/ai/account-chat-state-merge"
import { deleteFlashAssets } from "@/lib/server/malik-flash-assets"
import { isFlashChatId } from "@/lib/server/malik-flash-browser-bridge"
import { cleanFlashMetadataForSync } from "@/lib/server/malik-flash-history"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function unauthorized() {
  return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") return unauthorized()

  try {
    const result = await readAccountChatState(entitlement.userId)
    return NextResponse.json({
      ok: true,
      configured: result.configured,
      savedAt: result.savedAt,
      state: result.state,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    // Never report an empty history when the durable store is unavailable.
    return NextResponse.json({ ok: false, error: "CHAT_HISTORY_CLOUD_READ_FAILED" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    })
  }
}

export async function PUT(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") return unauthorized()

  let body: any
  try {
    body = await readJsonBodyLimited(request, 8 * 1024 * 1024)
  } catch (error) {
    const status = error instanceof RequestSafetyError ? error.status : 400
    return NextResponse.json({ ok: false, error: error instanceof RequestSafetyError ? error.code : "INVALID_JSON" }, { status })
  }

  const state = body?.state
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return NextResponse.json({ ok: false, error: "INVALID_CHAT_STATE" }, { status: 400 })
  }

  if (!accountChatStateConfigured()) {
    return NextResponse.json({ ok: true, configured: false, stored: false, savedAt: "" }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  try {
    // Browser snapshots can request deletion, but the server alone owns media
    // and browser receipts. Use the prior snapshot to identify files to remove.
    const clean = cleanFlashMetadataForSync(state)
    const cleanup = new Map<string, string[]>()
    const result = await updateAccountChatState(entitlement.userId, current => {
      cleanup.clear()
      const pending = current?.flashMediaDeletionQueue
      if (pending && typeof pending === "object" && !Array.isArray(pending)) {
        for (const [id, assets] of Object.entries(pending)) if (isFlashChatId(id) && Array.isArray(assets)) cleanup.set(id, assets)
      }
      const merged = mergeAccountChatStates(current, clean)
      const deleted = new Set((Array.isArray(merged.deletedChatIds) ? merged.deletedChatIds : []).filter(isFlashChatId))
      if (Array.isArray(current?.chats)) {
        for (const chat of current.chats) {
          if (chat && deleted.has(chat.id) && Array.isArray(chat.flashMediaIds)) cleanup.set(chat.id, chat.flashMediaIds)
        }
      }
      return cleanup.size ? { ...merged, flashMediaDeletionQueue: Object.fromEntries(cleanup) } : merged
    })
    if (result.stored && cleanup.size) {
      for (const [chatId, ids] of cleanup) await deleteFlashAssets(entitlement.userId, chatId, ids)
      await updateAccountChatState(entitlement.userId, current => {
        const pending = { ...current?.flashMediaDeletionQueue as Record<string, string[]> | undefined }
        for (const [id, ids] of cleanup) {
          if (JSON.stringify(pending[id]) === JSON.stringify(ids)) delete pending[id]
        }
        return { ...current, flashMediaDeletionQueue: pending }
      })
    }
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "PRIVATE_STATE_TOO_LARGE"
    return NextResponse.json({
      ok: false,
      error: tooLarge ? "CHAT_STATE_TOO_LARGE" : "CHAT_STATE_PERSISTENCE_FAILED",
    }, { status: tooLarge ? 413 : 503 })
  }
}
