"use client"

export type MalikAuthSnapshot = {
  id?: string
  email: string
  name: string
  avatar: string
  isAdmin: boolean
  role: "creator" | "admin" | "user"
  mode: "workos"
  lastLoginAt?: string
}

const SNAPSHOT_KEY = "malik_workos_profile"
let authStatusRefreshInFlight = false
let lastAuthStatusRefreshAt = 0
const AUTH_STATUS_REFRESH_TTL_MS = 15_000

async function refreshAuthSnapshotFromServer(force = false) {
  if (typeof window === "undefined" || authStatusRefreshInFlight) return
  const now = Date.now()
  if (!force && now - lastAuthStatusRefreshAt < AUTH_STATUS_REFRESH_TTL_MS) return

  authStatusRefreshInFlight = true
  lastAuthStatusRefreshAt = now

  try {
    const response = await fetch("/api/auth/status", {
      cache: "no-store",
      credentials: "same-origin",
    })
    const data = await response.json().catch(() => null) as {
      authenticated?: boolean
      user?: {
        id?: string
        email?: string
        name?: string
        avatar?: string
        isAdmin?: boolean
        role?: "creator" | "admin" | "user"
      } | null
    } | null

    if (!response.ok || !data?.authenticated || !data.user?.email) return

    storeWorkOSProfile({
      id: data.user.id,
      email: data.user.email.trim().toLowerCase(),
      name: data.user.name || data.user.email.split("@")[0],
      avatar: data.user.avatar || "",
      isAdmin: data.user.isAdmin === true,
      role: data.user.role || (data.user.isAdmin ? "creator" : "user"),
      mode: "workos",
      lastLoginAt: new Date().toISOString(),
    })
  } catch {
    // Keep the last local snapshot when the auth status endpoint is temporarily unavailable.
  } finally {
    // The old implementation stayed permanently locked after the first request.
    // If that request ran before the WorkOS session cookie existed, founder UI
    // could stay hidden until a full reload. Allow safe server-verified retries.
    authStatusRefreshInFlight = false
  }
}

export function getStoredAuthSnapshot(): MalikAuthSnapshot | null {
  if (typeof window === "undefined") return null

  // Keep the local snapshot fast, but regularly reconcile it with the
  // authoritative server session. This restores founder/admin UI after login
  // without trusting localStorage for privileges.
  void refreshAuthSnapshotFromServer()

  try {
    const value = window.localStorage.getItem(SNAPSHOT_KEY)
    return value ? (JSON.parse(value) as MalikAuthSnapshot) : null
  } catch {
    return null
  }
}

export async function refreshStoredAuthSnapshot() {
  await refreshAuthSnapshotFromServer(true)
  return getStoredAuthSnapshot()
}

export function storeWorkOSProfile(snapshot: MalikAuthSnapshot) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    window.dispatchEvent(new CustomEvent("malik-auth-updated", { detail: snapshot }))
  } catch {}
}

export function clearStoredAuthSnapshot() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY)
    for (const key of [
      "malik_user", "malik_user_name", "malik_user_avatar", "malik_auth_mode",
      "malik_is_admin", "malik_auth_snapshot", "malik_is_authenticated",
      "malik_guest_unlocked", "sovereign_authenticated",
    ]) window.localStorage.removeItem(key)
  } catch {}
}

export async function signOutMalik() {
  clearStoredAuthSnapshot()
  if (typeof window !== "undefined") window.location.assign("/sign-out")
}

export function buildFallbackAvatar(seed?: string | null) {
  const label = String(seed || "M").trim().slice(0, 2).toUpperCase() || "M"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="24" fill="#d5a936"/><text x="48" y="58" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#050505">${label.replace(/[<>&]/g, "")}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
