"use client"

import { useLayoutEffect, type ReactNode } from "react"

const DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"
const ACCOUNT_PREFIX = `${DASHBOARD_STORAGE_KEY}:account:`
const MIGRATION_MARKER = `${DASHBOARD_STORAGE_KEY}:account-migrated-v1`

function cleanAccountId(value: string) {
  return encodeURIComponent(String(value || "guest").trim().toLowerCase() || "guest")
}

/**
 * Gives every WorkOS account its own chat snapshot without changing the huge
 * dashboard state machine. Dashboard still reads/writes its legacy key, but the
 * Storage methods transparently route that key to the active account key.
 *
 * Generated image cards already store durable /api/media/asset/<id> URLs inside
 * the message object, so restoring the account snapshot restores the finished
 * photo in the exact chat after sign-out/sign-in as well.
 */
export function AccountChatPersistence({ accountId, children }: { accountId: string; children: ReactNode }) {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof Storage === "undefined") return

    const storage = window.localStorage
    const proto = Storage.prototype
    const previousGetItem = proto.getItem
    const previousSetItem = proto.setItem
    const previousRemoveItem = proto.removeItem
    const scopedKey = `${ACCOUNT_PREFIX}${cleanAccountId(accountId)}`

    // One-time migration for the account that owns the browser's pre-V7 state.
    // After that, the unscoped key is never allowed to leak into another login.
    try {
      const scoped = previousGetItem.call(storage, scopedKey)
      const legacy = previousGetItem.call(storage, DASHBOARD_STORAGE_KEY)
      const migrated = previousGetItem.call(storage, MIGRATION_MARKER)
      if (!scoped && legacy && !migrated) {
        previousSetItem.call(storage, scopedKey, legacy)
        previousSetItem.call(storage, MIGRATION_MARKER, scopedKey)
      }
      previousRemoveItem.call(storage, DASHBOARD_STORAGE_KEY)
    } catch (error) {
      console.warn("[ACCOUNT CHAT PERSISTENCE] migration skipped", error)
    }

    const routedGetItem = function (this: Storage, key: string): string | null {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        return previousGetItem.call(this, scopedKey)
      }
      return previousGetItem.call(this, key)
    }

    const routedSetItem = function (this: Storage, key: string, value: string): void {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        previousSetItem.call(this, scopedKey, value)
        return
      }
      previousSetItem.call(this, key, value)
    }

    const routedRemoveItem = function (this: Storage, key: string): void {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        previousRemoveItem.call(this, scopedKey)
        return
      }
      previousRemoveItem.call(this, key)
    }

    proto.getItem = routedGetItem
    proto.setItem = routedSetItem
    proto.removeItem = routedRemoveItem

    return () => {
      if (proto.getItem === routedGetItem) proto.getItem = previousGetItem
      if (proto.setItem === routedSetItem) proto.setItem = previousSetItem
      if (proto.removeItem === routedRemoveItem) proto.removeItem = previousRemoveItem
    }
  }, [accountId])

  return children
}

export default AccountChatPersistence
