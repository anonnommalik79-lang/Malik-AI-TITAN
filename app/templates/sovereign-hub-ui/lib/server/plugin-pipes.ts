import { getOptionalWorkOSAuth } from "@/lib/auth/server"

const WORKOS_API = "https://api.workos.com"

export type PipesProvider = {
  slug?: string
  name?: string
  auth_methods?: string[]
  credentials_type?: string
  scopes?: string[]
  connected_account?: {
    id?: string
    state?: string
    scopes?: string[]
    auth_method?: string
    api_key_last_4?: string | null
  } | null
}

type PipesCredential = {
  active: boolean
  value?: string
  authMethod?: string
  scopes?: string[]
  error?: string
}

/**
 * Pipes can use a dedicated WorkOS API key from the SAME WorkOS environment.
 * This keeps plugin traffic isolated from AuthKit traffic while preserving the
 * same WorkOS user IDs. Falling back to WORKOS_API_KEY keeps existing deploys
 * working until WORKOS_PIPES_API_KEY is added in Render.
 */
function apiKey() {
  return String(process.env.WORKOS_PIPES_API_KEY || process.env.WORKOS_API_KEY || "").trim()
}

async function workosFetch(path: string, init: RequestInit = {}) {
  const key = apiKey()
  if (!key) throw new Error("WORKOS_PIPES_API_KEY / WORKOS_API_KEY is not configured")

  const response = await fetch(`${WORKOS_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

export async function getPluginSessionUser() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.id) return null
  return user
}

export async function listPipesProviders(userId: string): Promise<PipesProvider[]> {
  const { response, payload } = await workosFetch(`/user_management/users/${encodeURIComponent(userId)}/data_providers`)
  if (!response.ok) return []
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function getPipesProviderState(userId: string, providerSlug: string) {
  const providers = await listPipesProviders(userId)
  const provider = providers.find((item) => item?.slug === providerSlug) || null
  const connected = provider?.connected_account?.state === "connected"
  const authMethods = Array.isArray(provider?.auth_methods) ? provider.auth_methods : []
  return { provider, configured: Boolean(provider), connected, authMethods }
}

export async function createPipesAuthorization(userId: string, providerSlug: string, returnTo?: string) {
  const { response, payload } = await workosFetch(`/data-integrations/${encodeURIComponent(providerSlug)}/authorize`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      ...(returnTo ? { return_to: returnTo } : {}),
    }),
  })

  const url = String(payload?.authorization_url || payload?.url || "")
  if (!response.ok || !url) {
    const reason = String(payload?.message || payload?.error || `WorkOS Pipes returned ${response.status}`)
    throw new Error(reason)
  }
  return url
}

/**
 * Stores a user-supplied API key in WorkOS Pipes/Vault. The key is accepted by
 * our server route, forwarded once to WorkOS over HTTPS and is never persisted
 * in Malik AI localStorage, cookies, logs, or database.
 */
export async function upsertPipesApiKey(userId: string, providerSlug: string, secret: string) {
  const cleanSecret = String(secret || "").trim()
  if (!cleanSecret) throw new Error("API key is required")
  if (cleanSecret.length > 8192) throw new Error("API key is too long")

  const { response, payload } = await workosFetch(`/data-integrations/${encodeURIComponent(providerSlug)}/api-key`, {
    method: "PUT",
    body: JSON.stringify({ user_id: userId, secret: cleanSecret }),
  })

  if (!response.ok) {
    const reason = String(payload?.message || payload?.error || `WorkOS Pipes returned ${response.status}`)
    throw new Error(reason)
  }
  return payload
}

/**
 * WorkOS Pipes vends a refreshed credential server-side. The generic
 * /credentials endpoint supports both OAuth and API-key providers; OAuth falls
 * back to /token for environments where only the token endpoint is enabled.
 */
export async function getPipesCredential(userId: string, providerSlug: string): Promise<PipesCredential> {
  const body = JSON.stringify({ user_id: userId })
  const first = await workosFetch(`/data-integrations/${encodeURIComponent(providerSlug)}/credentials`, {
    method: "POST",
    body,
  })

  if (first.response.ok) {
    const credential = first.payload?.credential
    return {
      active: Boolean(first.payload?.active && credential?.value),
      value: typeof credential?.value === "string" ? credential.value : undefined,
      authMethod: typeof credential?.auth_method === "string" ? credential.auth_method : undefined,
      scopes: Array.isArray(credential?.scopes) ? credential.scopes : [],
      error: first.payload?.error,
    }
  }

  const fallback = await workosFetch(`/data-integrations/${encodeURIComponent(providerSlug)}/token`, {
    method: "POST",
    body,
  })
  if (!fallback.response.ok) {
    return {
      active: false,
      error: String(fallback.payload?.error || first.payload?.error || "not_installed"),
    }
  }

  const token = fallback.payload?.access_token
  return {
    active: Boolean(fallback.payload?.active && token?.access_token),
    value: typeof token?.access_token === "string" ? token.access_token : undefined,
    authMethod: "oauth",
    scopes: Array.isArray(token?.scopes) ? token.scopes : [],
    error: fallback.payload?.error,
  }
}
