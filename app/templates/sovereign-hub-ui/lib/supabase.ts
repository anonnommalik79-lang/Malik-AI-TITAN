import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ""

export const STORAGE_KEYS = {
  user: "malik_user",
  userName: "malik_user_name",
  userAvatar: "malik_user_avatar",
  authMode: "malik_auth_mode",
  isAdmin: "malik_is_admin",
  lastLoginAt: "malik_last_login_at",
  authSnapshot: "malik_auth_snapshot",
  authError: "malik_auth_error",
  authHealth: "malik_auth_health",
} as const

export const SUPABASE_STORAGE_KEY = "sovereign_v7_auth"

const ADMIN_EMAILS = "amangeldymalik38@gmail.com,anonnommalik79@gmail.com"
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean)

type MalikAccountRole = "creator" | "admin" | "user" | "guest"

let client: SupabaseClient | null = null
let restorePromise: Promise<MalikAuthSnapshot | null> | null = null
let signOutPromise: Promise<void> | null = null

export type MalikAuthSnapshot = {
  email: string
  name: string
  avatar: string
  isAdmin: boolean
  role: MalikAccountRole
  mode: "supabase" | "guest"
  lastLoginAt: string
}

export const isBrowser = () => typeof window !== "undefined"

export const isSupabaseConfigured = () =>
  Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseUrl.startsWith("https://") &&
      supabaseUrl.includes(".supabase.co") &&
      !supabaseUrl.includes("/rest/v1") &&
      supabaseAnonKey.length > 20,
  )

export const getSupabaseDebugInfo = () => ({
  urlPresent: Boolean(supabaseUrl),
  keyPresent: Boolean(supabaseAnonKey),
  urlLooksValid: supabaseUrl.startsWith("https://") && supabaseUrl.includes(".supabase.co"),
  keyLength: supabaseAnonKey.length,
  configured: isSupabaseConfigured(),
})

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isBrowser()) return null
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SUPABASE_STORAGE_KEY,
        flowType: "pkce",
      },
      global: {
        headers: {
          "x-malik-client": "malik-ai-web",
        },
      },
    })
  }
  return client
}

export const safeLocalStorageGet = (key: string): string | null => {
  if (!isBrowser()) return null
  try { return window.localStorage.getItem(key) } catch { return null }
}

export const safeLocalStorageSet = (key: string, value: string): void => {
  if (!isBrowser()) return
  try { window.localStorage.setItem(key, value) } catch {}
}

export const safeLocalStorageRemove = (key: string): void => {
  if (!isBrowser()) return
  try { window.localStorage.removeItem(key) } catch {}
}

const clearStorageByPredicate = (storage: Storage, predicate: (key: string) => boolean) => {
  Object.keys(storage).forEach((key) => {
    if (predicate(key)) {
      try { storage.removeItem(key) } catch {}
    }
  })
}

export const isRefreshTokenReuseError = (error: unknown): boolean => {
  const message = String(
    (error as any)?.message ||
      (error as any)?.error_description ||
      (error as any)?.name ||
      error ||
      "",
  ).toLowerCase()

  return (
    message.includes("refresh token") ||
    message.includes("already used") ||
    message.includes("token has been used") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh_token_not_found") ||
    message.includes("session_not_found")
  )
}

export const clearSupabaseAuthStorage = (): void => {
  if (!isBrowser()) return
  const shouldClear = (key: string) => {
    const clean = key.toLowerCase()
    return (
      clean === SUPABASE_STORAGE_KEY.toLowerCase() ||
      clean.startsWith("sb-") ||
      clean.includes("supabase") ||
      clean.includes("gotrue") ||
      clean.includes("auth-token") ||
      clean.includes("refresh-token") ||
      clean.includes("pkce")
    )
  }

  try { clearStorageByPredicate(window.localStorage, shouldClear) } catch {}
  try { clearStorageByPredicate(window.sessionStorage, shouldClear) } catch {}
}

export const clearMalikAuthCache = (): void => {
  Object.values(STORAGE_KEYS).forEach((k) => safeLocalStorageRemove(k))
  safeLocalStorageRemove("malik_user_role")
  ;["malik_session", "malik_ai_session", "sovereign_session", "auth_session", "malik_is_authenticated", "sovereign_authenticated", "isAuthenticated", "authenticated", "malik_guest_unlocked"].forEach((key) => safeLocalStorageRemove(key))
  clearSupabaseAuthStorage()
  dispatchMalikAuthEvent({})
}

export const isAdminEmail = (email?: string | null): boolean => {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

export const getAccountRole = (email?: string | null, mode?: "supabase" | "guest"): MalikAccountRole => {
  const clean = String(email || "").trim().toLowerCase()
  if (!clean || clean === "guest@malik.ai" || mode === "guest" && !isAdminEmail(clean)) return "guest"
  if (clean === "amangeldymalik38@gmail.com") return "creator"
  if (isAdminEmail(clean)) return "admin"
  return "user"
}

export const getUserDisplayName = (user: User): string => {
  const meta = user.user_metadata || {}
  return meta.full_name || meta.name || meta.user_name || meta.preferred_username || user.email?.split("@")[0] || "Пользователь"
}

export const buildFallbackAvatar = (seed: string): string =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "Malik")}&backgroundType=gradientLinear&fontWeight=800`

export const getUserAvatar = (user: User): string => {
  const meta = user.user_metadata || {}
  const identities = Array.isArray(user.identities) ? user.identities : []
  const identityAvatar = identities
    .map((identity: any) => identity?.identity_data?.avatar_url || identity?.identity_data?.picture || identity?.identity_data?.photoURL)
    .find(Boolean)
  const real = meta.avatar_url || meta.picture || meta.image || meta.photoURL || identityAvatar || ""
  return real || buildFallbackAvatar(user.email || getUserDisplayName(user))
}

export const dispatchMalikAuthEvent = (snapshot?: Partial<MalikAuthSnapshot>): void => {
  if (!isBrowser()) return
  try { window.dispatchEvent(new CustomEvent("malik-auth-updated", { detail: snapshot || {} })) } catch {}
}

export const persistAuthSnapshot = (snapshot: MalikAuthSnapshot): MalikAuthSnapshot => {
  const role = snapshot.role || getAccountRole(snapshot.email, snapshot.mode)
  const normalizedSnapshot = { ...snapshot, role, isAdmin: snapshot.isAdmin || role === "creator" || role === "admin" }
  safeLocalStorageSet(STORAGE_KEYS.user, snapshot.email)
  safeLocalStorageSet(STORAGE_KEYS.userName, snapshot.name)
  safeLocalStorageSet(STORAGE_KEYS.userAvatar, snapshot.avatar)
  safeLocalStorageSet(STORAGE_KEYS.authMode, snapshot.mode)
  safeLocalStorageSet(STORAGE_KEYS.lastLoginAt, snapshot.lastLoginAt)
  safeLocalStorageSet(STORAGE_KEYS.authSnapshot, JSON.stringify(normalizedSnapshot))
  safeLocalStorageSet("malik_user_role", role)
  safeLocalStorageSet(STORAGE_KEYS.authHealth, "ready")
  const session = JSON.stringify({ ok: true, user: normalizedSnapshot, mode: snapshot.mode, authenticated: true, lastLoginAt: snapshot.lastLoginAt })
  safeLocalStorageSet("malik_session", session)
  safeLocalStorageSet("malik_ai_session", session)
  safeLocalStorageSet("sovereign_session", session)
  safeLocalStorageSet("auth_session", session)
  safeLocalStorageSet("malik_is_authenticated", "true")
  safeLocalStorageSet("sovereign_authenticated", "true")
  safeLocalStorageSet("isAuthenticated", "true")
  safeLocalStorageSet("authenticated", "true")
  safeLocalStorageSet("malik_guest_unlocked", snapshot.mode === "guest" ? "true" : "false")
  safeLocalStorageRemove(STORAGE_KEYS.authError)
  if (normalizedSnapshot.isAdmin) safeLocalStorageSet(STORAGE_KEYS.isAdmin, "true")
  else safeLocalStorageRemove(STORAGE_KEYS.isAdmin)
  dispatchMalikAuthEvent(normalizedSnapshot)
  return normalizedSnapshot
}

export const persistSupabaseUser = (user: User): MalikAuthSnapshot => {
  const email = (user.email || "").toLowerCase()
  if (!email) throw new Error("Supabase user does not include email")
  return persistAuthSnapshot({
    email,
    name: getUserDisplayName(user),
    avatar: getUserAvatar(user),
    isAdmin: isAdminEmail(email),
    role: getAccountRole(email, "supabase"),
    mode: "supabase",
    lastLoginAt: new Date().toISOString(),
  })
}

export const persistLocalUser = (email: string, name?: string): MalikAuthSnapshot => {
  const cleanEmail = email.trim().toLowerCase()
  const displayName = name?.trim() || cleanEmail.split("@")[0] || "Пользователь"
  const role = getAccountRole(cleanEmail, "supabase")
  return persistAuthSnapshot({
    email: cleanEmail,
    name: displayName,
    avatar: buildFallbackAvatar(cleanEmail || displayName),
    isAdmin: role === "creator" || role === "admin",
    role,
    mode: "guest",
    lastLoginAt: new Date().toISOString(),
  })
}

export const persistGuestUser = (): MalikAuthSnapshot =>
  persistAuthSnapshot({
    email: "guest@malik.ai",
    name: "Гость",
    avatar: buildFallbackAvatar("guest@malik.ai"),
    isAdmin: false,
    role: "guest",
    mode: "guest",
    lastLoginAt: new Date().toISOString(),
  })

export const getStoredAuthSnapshot = (): MalikAuthSnapshot | null => {
  const raw = safeLocalStorageGet(STORAGE_KEYS.authSnapshot)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MalikAuthSnapshot
      if (parsed?.email && parsed?.mode) return parsed
    } catch {
      safeLocalStorageRemove(STORAGE_KEYS.authSnapshot)
    }
  }
  const email = safeLocalStorageGet(STORAGE_KEYS.user) || ""
  const mode = (safeLocalStorageGet(STORAGE_KEYS.authMode) || "") as "supabase" | "guest"
  if (!email || !mode) return null
  const name = safeLocalStorageGet(STORAGE_KEYS.userName) || email.split("@")[0] || "Пользователь"
  const avatar = safeLocalStorageGet(STORAGE_KEYS.userAvatar) || buildFallbackAvatar(email)
  const role = (safeLocalStorageGet("malik_user_role") as MalikAccountRole) || getAccountRole(email, mode)
  return { email, name, avatar, isAdmin: safeLocalStorageGet(STORAGE_KEYS.isAdmin) === "true" || role === "creator" || role === "admin", role, mode, lastLoginAt: safeLocalStorageGet(STORAGE_KEYS.lastLoginAt) || "" }
}

export const signOutMalik = async (): Promise<void> => {
  if (signOutPromise) return signOutPromise
  signOutPromise = (async () => {
    try { await getSupabaseClient()?.auth.signOut() } catch {}
    clearMalikAuthCache()
    signOutPromise = null
  })()
  return signOutPromise
}

export const forceCleanAuthSession = async (): Promise<void> => {
  try { await getSupabaseClient()?.auth.signOut() } catch {}
  clearMalikAuthCache()
}

export const restoreSupabaseSession = async (): Promise<MalikAuthSnapshot | null> => {
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return getStoredAuthSnapshot()
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      const user = data.session?.user
      if (user) return persistSupabaseUser(user)
    } catch (err) {
      if (isRefreshTokenReuseError(err)) {
        safeLocalStorageSet(STORAGE_KEYS.authError, "session_expired")
        await forceCleanAuthSession()
        return null
      }
    } finally {
      restorePromise = null
    }
    const stored = getStoredAuthSnapshot()
    if (stored?.mode === "guest") return stored
    return null
  })()
  return restorePromise
}

export const subscribeToAuthChanges = (callback: (snapshot: MalikAuthSnapshot | null) => void) => {
  const supabase = getSupabaseClient()
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    try {
      callback(session?.user ? persistSupabaseUser(session.user) : null)
    } catch {
      callback(null)
    }
  })
  return () => data.subscription.unsubscribe()
}

export const getAuthProviderStatus = () => ({
  supabase: isSupabaseConfigured(),
  google: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH === "true",
  github: process.env.NEXT_PUBLIC_ENABLE_GITHUB_OAUTH === "true",
  apple: process.env.NEXT_PUBLIC_ENABLE_APPLE_OAUTH === "true",
  microsoft: process.env.NEXT_PUBLIC_ENABLE_MICROSOFT_OAUTH === "true" || process.env.NEXT_PUBLIC_ENABLE_AZURE_OAUTH === "true",
})

export const syncProfile = async (session: Session): Promise<void> => {
  if (!session.access_token) return
  try {
    await fetch("/api/auth/profile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: getUserDisplayName(session.user),
        avatar: getUserAvatar(session.user),
        role: getAccountRole(session.user.email, "supabase"),
      }),
    })
  } catch {}
}

