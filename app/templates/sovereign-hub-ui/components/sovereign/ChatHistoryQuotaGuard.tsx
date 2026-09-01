"use client"

import { useLayoutEffect } from "react"

const DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"
const DISPOSABLE_MEDIA_KEYS = [
  "malik_image_history_v2",
  "malik_photo_generation_results_v1",
]

function isQuotaError(error: unknown) {
  const value = error as { name?: string; code?: number; message?: string } | null
  const name = String(value?.name || "")
  const message = String(value?.message || "")
  return name === "QuotaExceededError" || value?.code === 22 || /quota|storage.*full/i.test(message)
}

/**
 * The dashboard's legacy quota fallback deletes old chats until a snapshot fits.
 * That is the wrong tradeoff when the quota was consumed by generated image
 * bytes. Intercept only the dashboard key: first reclaim disposable media cache,
 * retry the complete snapshot, and if the origin is genuinely full keep the
 * previous complete snapshot instead of allowing the writer to replace it with
 * a version that silently dropped conversations.
 */
export function ChatHistoryQuotaGuard() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    const storage = window.localStorage
    const proto = Storage.prototype
    const original = proto.setItem

    const guardedSetItem = function (this: Storage, key: string, value: string): void {
      if (this !== storage || key !== DASHBOARD_STORAGE_KEY) {
        original.call(this, key, value)
        return
      }

      try {
        original.call(this, key, value)
        return
      } catch (error) {
        if (!isQuotaError(error)) throw error
      }

      // Media history is a convenience cache; chat history is user data.
      for (const disposableKey of DISPOSABLE_MEDIA_KEYS) {
        try { storage.removeItem(disposableKey) } catch {}
      }

      try {
        original.call(this, key, value)
      } catch (error) {
        if (!isQuotaError(error)) throw error
        // Intentionally do not throw. The old complete snapshot is still valid.
        // Throwing would activate dashboard.tsx's legacy "drop oldest chats"
        // loop. A later smaller write can succeed without destroying history.
        console.warn("[CHAT HISTORY GUARD] quota is full; preserved previous complete snapshot")
      }
    }

    proto.setItem = guardedSetItem
    return () => {
      if (proto.setItem === guardedSetItem) proto.setItem = original
    }
  }, [])

  return null
}

export default ChatHistoryQuotaGuard
