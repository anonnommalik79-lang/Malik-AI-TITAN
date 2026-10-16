"use client"

import { getStoredAuthSnapshot } from "./client-session"

/**
 * One founder-access check per page, shared by every component that shows
 * founder tools. A visitor without a signed-in profile is never asked about:
 * the server would answer 403 anyway, and at scale those requests are waste.
 * Signing in dispatches "malik-auth-updated", which clears the cache.
 */

let cached: { at: number; value: Promise<boolean> } | null = null
const TTL_MS = 60_000

if (typeof window !== "undefined") window.addEventListener("malik-auth-updated", () => { cached = null })

export function founderAccess(): Promise<boolean> {
  if (typeof window === "undefined" || !getStoredAuthSnapshot()) return Promise.resolve(false)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const value = fetch("/api/founder/access", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok)
    .catch(() => false)
  cached = { at: Date.now(), value }
  return value
}

/** Whether this browser has a signed-in Malik profile (guests skip account-only requests). */
export function hasSignedInProfile() {
  return typeof window !== "undefined" && Boolean(getStoredAuthSnapshot())
}
