"use client"

import { useEffect } from "react"

const SESSION_KEY = "malik-shorts-tiktok-auto-sync-v1"

export function ShortsAutoSync() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return
    window.sessionStorage.setItem(SESSION_KEY, "1")

    let cancelled = false
    ;(async () => {
      try {
        const statusResponse = await fetch("/api/tiktok/status", { cache: "no-store" })
        if (!statusResponse.ok || cancelled) return
        const status = await statusResponse.json().catch(() => null)
        if (!status?.connected || cancelled) return

        const syncResponse = await fetch("/api/tiktok/sync", { method: "POST", cache: "no-store" })
        if (!syncResponse.ok || cancelled) return
        const payload = await syncResponse.json().catch(() => null)
        if (cancelled) return

        // The sync materializes TikTok posts in Supabase. Reload only when the
        // server actually returned imported rows so the unified feed sees them
        // immediately; the session flag prevents a reload loop.
        if (Number(payload?.imported || 0) > 0) window.location.reload()
      } catch {
        // TikTok is an optional source. YouTube/Malik feed must keep working if
        // the provider is unavailable or the account has not been connected.
      }
    })()

    return () => { cancelled = true }
  }, [])

  return null
}
