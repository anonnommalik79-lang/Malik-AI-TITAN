"use client"

import { useEffect } from "react"

const SESSION_KEY = "malik-shorts-tiktok-auto-sync-v1"

export function ShortsAutoSync() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return

    let cancelled = false
    ;(async () => {
      try {
        const statusResponse = await fetch("/api/tiktok/status", { cache: "no-store" })
        if (!statusResponse.ok || cancelled) return
        const status = await statusResponse.json().catch(() => null)
        if (!status?.connected || cancelled) return

        // Mark the session only after TikTok is genuinely connected. The old
        // version set this before checking status, so opening Shorts once while
        // disconnected prevented a later same-session connection from syncing.
        window.sessionStorage.setItem(SESSION_KEY, "1")

        const syncResponse = await fetch("/api/tiktok/sync", { method: "POST", cache: "no-store" })
        if (!syncResponse.ok || cancelled) {
          window.sessionStorage.removeItem(SESSION_KEY)
          return
        }
        const payload = await syncResponse.json().catch(() => null)
        if (cancelled) return

        // The sync materializes TikTok posts in Supabase. Reload only when the
        // server actually returned imported rows so the unified feed sees them
        // immediately; the session flag prevents a reload loop.
        if (Number(payload?.imported || 0) > 0) window.location.reload()
      } catch {
        window.sessionStorage.removeItem(SESSION_KEY)
        // TikTok is an optional source. YouTube/Malik feed must keep working if
        // the provider is unavailable or the account has not been connected.
      }
    })()

    return () => { cancelled = true }
  }, [])

  return null
}
