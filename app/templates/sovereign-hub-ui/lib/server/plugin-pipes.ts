import { getOptionalWorkOSAuth } from "@/lib/auth/server"

const WORKOS_API = "https://api.workos.com"

type PipesProvider = {
  slug?: string
  name?: string
  connected_account?: {
    id?: string
    state?: string
    scopes?: string[]
  } | null
}

type PipesCredential = {
  active: boolean
  value?: string
  authMethod?: string
  scopes?: string[]
  error?: string
}

function apiKey() {
  return String(process.env.WORKOS_API_KEY || "").trim()
}

async function workosFetch(path: string, init: RequestInit = {}) {
  const key = apiKey()
  if (!key) throw new Error("WORKOS_API_KEY is not configured")

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
  return { provider, configured: Boolean(provider), connected }
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
