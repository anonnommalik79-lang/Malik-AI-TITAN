"use client"

import { useLayoutEffect } from "react"

const DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"
const DASHBOARD_ACCOUNT_STORAGE_PREFIX = `${DASHBOARD_STORAGE_KEY}:account:`
const DISPOSABLE_MEDIA_KEYS = [
  "malik_image_history_v2",
  "malik_photo_generation_results_v1",
]

function isDashboardStorageKey(key: string) {
  return key === DASHBOARD_STORAGE_KEY || key.startsWith(DASHBOARD_ACCOUNT_STORAGE_PREFIX)
}

function isQuotaError(error: unknown) {
  const value = error as { name?: string; code?: number; message?: string } | null
  const name = String(value?.name || "")
  const message = String(value?.message || "")
  return name === "QuotaExceededError" || value?.code === 22 || /quota|storage.*full/i.test(message)
}

/**
 * Chat history is user data; disposable media indexes are only caches. Guard
 * both the legacy dashboard key and the account-scoped V7 keys so a full
 * browser quota never silently replaces a complete conversation snapshot with
 * a truncated one.
 */
export function ChatHistoryQuotaGuard() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    const storage = window.localStorage
    const proto = Storage.prototype
    const original = proto.setItem

    const guardedSetItem = function (this: Storage, key: string, value: string): void {
      if (this !== storage || !isDashboardStorageKey(key)) {
        original.call(this, key, value)
        return
      }

      try {
        original.call(this, key, value)
        return
      } catch (error) {
        if (!isQuotaError(error)) throw error
      }

      for (const disposableKey of DISPOSABLE_MEDIA_KEYS) {
        try { storage.removeItem(disposableKey) } catch {}
      }

      try {
        original.call(this, key, value)
      } catch (error) {
        if (!isQuotaError(error)) throw error
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
