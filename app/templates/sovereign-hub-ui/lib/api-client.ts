export type ApiStatus = "idle" | "loading" | "success" | "error"

export type ApiResult<T> = {
  ok: boolean
  data?: T
  error?: string
  status: number
  latencyMs: number
}

export type MediaKind = "photo" | "image" | "video"

export type MediaGenerateInput = {
  prompt: string
  kind?: MediaKind
  style?: string
  format?: "1:1" | "16:9" | "9:16"
  aspectRatio?: "1:1" | "16:9" | "9:16"
  duration?: 5 | 8 | 12
  quality?: string
  userEmail?: string
}

export type MediaGenerateResult = {
  ok: boolean
  kind: "photo" | "image" | "video"
  mediaKind?: "image" | "video"
  engine?: string
  prompt?: string
  status?: string
  url?: string
  mediaUrl?: string
  imageUrl?: string
  videoUrl?: string
  assetUrl?: string
  publicError?: string
  message?: string
  storyboard?: unknown
  fallback?: boolean
}

export type HealthPayload = {
  ok: boolean
  status: string
  timestamp: string
  uptimeSeconds?: number
  secretsExposed?: false
  backend?: unknown
}

export type EnvCheckPayload = {
  ok: boolean
  module: string
  secretsExposed: false
  engines: Array<{
    id: string
    title: string
    group: string
    configured: boolean
  }>
  backend?: unknown
}

const DEFAULT_TIMEOUT_MS = 45_000

function isBrowser() {
  return typeof window !== "undefined"
}

export function getApiBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_MALIK_API_BASE_URL ||
    ""
  return raw.trim().replace(/\/$/, "")
}

export function buildApiUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  const base = getApiBaseUrl()
  if (!base) return cleanPath
  return `${base}${cleanPath}`
}

export async function clientFetchWithTimeout(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const parentSignal = init.signal
  const abortFromParent = () => controller.abort(parentSignal?.reason)

  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true })

  try {
    let headers = init.headers
    if (isBrowser() && !new Headers(headers).has("authorization")) {
      try {
        const { getSupabaseClient } = await import("@/lib/supabase")
        const { data } = await getSupabaseClient()?.auth.getSession() || { data: { session: null } }
        if (data.session?.access_token) {
          headers = { ...(headers || {}), authorization: `Bearer ${data.session.access_token}` }
        }
      } catch {}
    }
    return await fetch(buildApiUrl(path), { ...init, headers, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener("abort", abortFromParent)
  }
}

function normalizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Unknown error")
  const value = raw.toLowerCase()

  if (value.includes("failed to fetch") || value.includes("network")) {
    return "Сервер недоступен или сеть отключена."
  }
  if (value.includes("abort") || value.includes("timeout")) {
    return "Запрос занял слишком много времени. Попробуйте ещё раз."
  }
  if (value.includes("401")) return "Secure runtime authorization failed. Try again shortly."
  if (value.includes("402")) return "This feature requires an active plan."
  if (value.includes("429")) return "Слишком много запросов. Подожди немного."
  return "Runtime request failed. Please try again shortly."
}

export function providerErrorToHuman(payload: unknown) {
  const data = payload as any
  const first = data?.publicError || data?.message || data?.error || ""

  const value = String(first).toLowerCase()

  if (value.includes("401") || value.includes("unauthorized") || value.includes("invalid api key")) {
    return "Secure runtime authorization failed. Try again shortly."
  }
  if (value.includes("402") || value.includes("billing") || value.includes("credit") || value.includes("balance")) {
    return "This feature requires an active plan."
  }
  if (value.includes("400") || value.includes("bad request") || value.includes("model")) {
    return "The request format was not accepted. Check duration or aspect ratio."
  }
  if (value.includes("429") || value.includes("rate limit")) {
    return "High demand right now. Please wait and try again."
  }
  if (value.includes("timed out") || value.includes("timeout")) {
    return "Generation took too long. Please try again shortly."
  }

  return String(data?.message || data?.publicError || "Генерация не завершилась. Попробуйте ещё раз немного позже.")
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await clientFetchWithTimeout(path, {
      ...init,
      cache: init.cache || "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    }, timeoutMs)

    let payload: any = null
    const contentType = response.headers.get("content-type") || ""

    if (contentType.includes("application/json")) payload = await response.json()
    else payload = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        latencyMs: Date.now() - started,
        data: payload,
        error: providerErrorToHuman(payload) || `HTTP ${response.status}`,
      }
    }

    return {
      ok: true,
      status: response.status,
      latencyMs: Date.now() - started,
      data: payload as T,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: normalizeErrorMessage(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getHealth() {
  return apiFetch<HealthPayload>("/api/health", { method: "GET" }, 8_000)
}

export async function getEnvCheck() {
  return apiFetch<EnvCheckPayload>("/api/env-check", { method: "GET" }, 10_000)
}

export async function getMediaStatus() {
  return apiFetch<any>("/api/media/status", { method: "GET" }, 10_000)
}

export async function generateMedia(input: MediaGenerateInput) {
  const kind = input.kind === "video" ? "video" : "photo"
  const payload = {
    ...input,
    kind,
    format: input.format || input.aspectRatio || "16:9",
    aspectRatio: input.aspectRatio || input.format || "16:9",
    style: input.style || "cinematic",
    duration: input.duration || 5,
  }

  return apiFetch<MediaGenerateResult>(
    `/api/generate/${kind}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    kind === "video" ? 190_000 : 95_000,
  )
}

export async function saveProject(input: Record<string, unknown>) {
  return apiFetch<any>(
    "/api/projects/save",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    20_000,
  )
}

export function isOffline() {
  return isBrowser() && "navigator" in window && window.navigator.onLine === false
}

export function getPublicRuntimeHint() {
  return {
    apiBaseUrl: getApiBaseUrl() || "same-origin",
    offline: isOffline(),
    browser: isBrowser(),
  }
}

