import "server-only"

type ApiEnvelope = Record<string, any>

type KeySource = { key: string; label: "primary" | "friend-1" | "friend-2" }

type MusicJobGlobal = typeof globalThis & {
  __malikMusicJobKeyLabel?: Map<string, KeySource["label"]>
  __malikFreeAiDirectMusic?: Map<string, string>
}

const DEAPI_BASE = "https://api.deapi.ai/api/v2"
const FREE_AI_BASE = "https://api.free.ai"
const FREE_AI_PREFIX = "freeai:"
const FREE_AI_DIRECT_PREFIX = "freeai-direct:"

function deapiKeys(): KeySource[] {
  const candidates: KeySource[] = [
    { key: String(process.env.DEAPI_API_KEY_PRIMARY || "").trim(), label: "primary" },
    { key: String(process.env.DEAPI_API_KEY_FRIEND_1 || "").trim(), label: "friend-1" },
    { key: String(process.env.DEAPI_API_KEY_FRIEND_2 || "").trim(), label: "friend-2" },
  ]
  const seen = new Set<string>()
  return candidates.filter((item) => {
    if (!item.key || seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

function freeAiKey() {
  return String(
    process.env.FREE_AI_API_KEY ||
    process.env.FREEAI_API_KEY ||
    process.env.FREE_AI_KEY ||
    ""
  ).trim()
}

function jobMap() {
  const scope = globalThis as MusicJobGlobal
  if (!scope.__malikMusicJobKeyLabel) scope.__malikMusicJobKeyLabel = new Map()
  return scope.__malikMusicJobKeyLabel
}

function freeAiDirectMap() {
  const scope = globalThis as MusicJobGlobal
  if (!scope.__malikFreeAiDirectMusic) scope.__malikFreeAiDirectMusic = new Map()
  return scope.__malikFreeAiDirectMusic
}

function orderedKeys(requestId?: string) {
  const all = deapiKeys()
  const preferred = requestId ? jobMap().get(requestId) : undefined
  if (!preferred) return all
  return [...all.filter((item) => item.label === preferred), ...all.filter((item) => item.label !== preferred)]
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
    const text = await response.text()
    let json: ApiEnvelope = {}
    try { json = text ? JSON.parse(text) as ApiEnvelope : {} } catch { json = { message: text } }
    return { response, json }
  } finally {
    clearTimeout(timer)
  }
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function requestIdOf(payload: ApiEnvelope) {
  return stringValue(
    payload?.job_id,
    payload?.jobId,
    payload?.request_id,
    payload?.requestId,
    payload?.id,
    payload?.data?.job_id,
    payload?.data?.jobId,
    payload?.data?.request_id,
    payload?.data?.requestId,
    payload?.data?.id,
    payload?.result?.job_id,
    payload?.result?.id
  )
}

function resultUrlOf(payload: ApiEnvelope) {
  const outputs = Array.isArray(payload?.outputs) ? payload.outputs : []
  const dataOutputs = Array.isArray(payload?.data?.outputs) ? payload.data.outputs : []
  return stringValue(
    payload?.audio_url,
    payload?.audioUrl,
    payload?.result_url,
    payload?.resultUrl,
    payload?.download_url,
    payload?.downloadUrl,
    payload?.file_url,
    payload?.fileUrl,
    payload?.url,
    payload?.data?.audio_url,
    payload?.data?.audioUrl,
    payload?.data?.result_url,
    payload?.data?.resultUrl,
    payload?.data?.download_url,
    payload?.data?.downloadUrl,
    payload?.data?.file_url,
    payload?.data?.fileUrl,
    payload?.data?.url,
    payload?.result?.audio_url,
    payload?.result?.url,
    payload?.output?.audio_url,
    payload?.output?.url,
    outputs?.[0]?.url,
    outputs?.[0]?.audio_url,
    dataOutputs?.[0]?.url,
    dataOutputs?.[0]?.audio_url
  )
}

function providerError(payload: ApiEnvelope, fallback: string) {
  const candidate =
    payload?.data?.error ||
    payload?.data?.message ||
    payload?.detail ||
    payload?.error ||
    payload?.message

  if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  if (candidate && typeof candidate === "object") {
    try {
      const encoded = JSON.stringify(candidate)
      if (encoded && encoded !== "{}") return encoded.slice(0, 1000)
    } catch {}
  }
  return fallback
}

function progressOf(payload: ApiEnvelope) {
  const raw = Number(payload?.data?.progress ?? payload?.progress ?? payload?.result?.progress)
  if (!Number.isFinite(raw)) return undefined
  const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, normalized))
}

function rawStatusOf(payload: ApiEnvelope) {
  return stringValue(
    payload?.data?.status,
    payload?.data?.state,
    payload?.status,
    payload?.state,
    payload?.result?.status,
    payload?.result?.state
  ).toLowerCase()
}

function isFreeAiRequest(requestId?: string) {
  return Boolean(requestId?.startsWith(FREE_AI_PREFIX) || requestId?.startsWith(FREE_AI_DIRECT_PREFIX))
}

function freeAiNativeId(requestId: string) {
  if (requestId.startsWith(FREE_AI_PREFIX)) return requestId.slice(FREE_AI_PREFIX.length)
  return ""
}

export function musicModel(requestId?: string) {
  if (isFreeAiRequest(requestId) || (!requestId && freeAiKey())) return "ACE-Step"
  return String(process.env.DEAPI_MUSIC_MODEL || "").trim() || "AceStep_1_5_XL_Turbo_INT8"
}

export function musicProviderName(requestId?: string) {
  if (isFreeAiRequest(requestId) || (!requestId && freeAiKey())) return "Free.ai"
  return "deAPI"
}

export function musicProviderConfigured() {
  return Boolean(freeAiKey()) || deapiKeys().length > 0
}

async function submitFreeAiMusic(input: {
  prompt: string
  lyrics?: string
  instrumental: boolean
  duration: number
}) {
  const key = freeAiKey()
  if (!key) {
    return { ok: false as const, status: 503, error: "Free.ai music key is not configured" }
  }

  const prompt = input.instrumental
    ? `${input.prompt}. Instrumental only, no vocals.`
    : input.prompt

  const body: Record<string, unknown> = {
    prompt,
    duration: input.duration,
  }

  if (!input.instrumental && input.lyrics?.trim()) {
    body.lyrics = input.lyrics.trim()
  }

  try {
    const { response, json } = await fetchJson(`${FREE_AI_BASE}/v1/music/generate/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, 45000)

    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status || 502,
        error: providerError(json, `Free.ai returned HTTP ${response.status}`),
      }
    }

    const nativeId = requestIdOf(json)
    const resultUrl = resultUrlOf(json)

    if (nativeId) {
      return {
        ok: true as const,
        requestId: `${FREE_AI_PREFIX}${nativeId}`,
        provider: "Free.ai" as const,
        model: "ACE-Step",
        status: resultUrl ? "done" as const : "queued" as const,
        resultUrl: resultUrl || undefined,
      }
    }

    if (resultUrl) {
      const requestId = `${FREE_AI_DIRECT_PREFIX}${crypto.randomUUID()}`
      freeAiDirectMap().set(requestId, resultUrl)
      return {
        ok: true as const,
        requestId,
        provider: "Free.ai" as const,
        model: "ACE-Step",
        status: "done" as const,
        resultUrl,
      }
    }

    return {
      ok: false as const,
      status: 502,
      error: "Free.ai accepted the request but returned neither job_id nor audio URL.",
    }
  } catch (error) {
    return {
      ok: false as const,
      status: 502,
      error: error instanceof Error ? error.message : "Free.ai network error",
    }
  }
}

async function getFreeAiMusicJob(requestId: string) {
  const directUrl = freeAiDirectMap().get(requestId)
  if (directUrl) {
    return {
      ok: true as const,
      statusCode: 200,
      status: "done" as const,
      resultUrl: directUrl,
      progress: 100,
      provider: "Free.ai" as const,
      model: "ACE-Step",
    }
  }

  const key = freeAiKey()
  if (!key) {
    return {
      ok: false as const,
      statusCode: 503,
      status: "failed" as const,
      error: "Free.ai music key is not configured",
      provider: "Free.ai" as const,
      model: "ACE-Step",
    }
  }

  const nativeId = freeAiNativeId(requestId)
  if (!nativeId) {
    return {
      ok: false as const,
      statusCode: 400,
      status: "failed" as const,
      error: "Invalid Free.ai music request id",
      provider: "Free.ai" as const,
      model: "ACE-Step",
    }
  }

  try {
    const { response, json } = await fetchJson(`${FREE_AI_BASE}/v1/status/${encodeURIComponent(nativeId)}/`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
    }, 20000)

    if (!response.ok) {
      return {
        ok: false as const,
        statusCode: response.status || 502,
        status: "failed" as const,
        error: providerError(json, `Free.ai returned HTTP ${response.status}`),
        provider: "Free.ai" as const,
        model: "ACE-Step",
      }
    }

    const rawStatus = rawStatusOf(json)
    const resultUrl = resultUrlOf(json)
    const progress = progressOf(json)

    if (["done", "completed", "complete", "ready", "succeeded", "success"].includes(rawStatus) || resultUrl) {
      if (!resultUrl) {
        return {
          ok: true as const,
          statusCode: 200,
          status: "processing" as const,
          progress: progress ?? 99,
          provider: "Free.ai" as const,
          model: "ACE-Step",
        }
      }
      return {
        ok: true as const,
        statusCode: 200,
        status: "done" as const,
        resultUrl,
        progress: 100,
        provider: "Free.ai" as const,
        model: "ACE-Step",
      }
    }

    if (["error", "failed", "failure", "cancelled", "canceled"].includes(rawStatus)) {
      return {
        ok: false as const,
        statusCode: 200,
        status: "failed" as const,
        error: providerError(json, "Music generation failed"),
        progress,
        provider: "Free.ai" as const,
        model: "ACE-Step",
      }
    }

    if (["processing", "running", "generating", "in_progress", "in-progress"].includes(rawStatus)) {
      return {
        ok: true as const,
        statusCode: 200,
        status: "processing" as const,
        progress,
        provider: "Free.ai" as const,
        model: "ACE-Step",
      }
    }

    return {
      ok: true as const,
      statusCode: 200,
      status: "queued" as const,
      progress,
      provider: "Free.ai" as const,
      model: "ACE-Step",
    }
  } catch (error) {
    return {
      ok: false as const,
      statusCode: 502,
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Free.ai network error",
      provider: "Free.ai" as const,
      model: "ACE-Step",
    }
  }
}

async function submitDeapiFallback(input: {
  prompt: string
  lyrics?: string
  instrumental: boolean
  duration: number
}) {
  const configured = orderedKeys()
  if (!configured.length) {
    return { ok: false as const, status: 503, error: "deAPI music key is not configured" }
  }

  const caption = input.instrumental
    ? `${input.prompt}. Instrumental only, no vocals.`
    : input.prompt

  const lyrics = input.instrumental
    ? "[Instrumental]"
    : (input.lyrics?.trim() || "")

  const body: Record<string, unknown> = {
    model: String(process.env.DEAPI_MUSIC_MODEL || "").trim() || "AceStep_1_5_XL_Turbo_INT8",
    caption,
    duration: input.duration,
    inference_steps: 8,
    guidance_scale: 1,
    seed: -1,
    format: "mp3",
    vocal_language: "unknown",
    lyrics,
  }

  let lastError = "deAPI request failed"
  let lastStatus = 502

  for (const source of configured) {
    try {
      const { response, json } = await fetchJson(`${DEAPI_BASE}/audio/music`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${source.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 45000)

      const requestId = requestIdOf(json)
      if (response.ok && requestId) {
        jobMap().set(requestId, source.label)
        return {
          ok: true as const,
          requestId,
          provider: "deAPI" as const,
          model: String(process.env.DEAPI_MUSIC_MODEL || "").trim() || "AceStep_1_5_XL_Turbo_INT8",
          status: "queued" as const,
        }
      }

      lastStatus = response.status || 502
      lastError = providerError(json, `deAPI returned HTTP ${response.status}`)

      if (response.status >= 400 && response.status < 500 && ![401, 402, 403, 408, 409, 429].includes(response.status)) break
    } catch (error) {
      lastStatus = 502
      lastError = error instanceof Error ? error.message : "deAPI network error"
    }
  }

  return { ok: false as const, status: lastStatus, error: lastError }
}

export async function submitDeapiMusic(input: {
  prompt: string
  lyrics?: string
  instrumental: boolean
  duration: number
}) {
  let freeFailure: { status: number; error: string } | null = null

  if (freeAiKey()) {
    const freeResult = await submitFreeAiMusic(input)
    if (freeResult.ok) return freeResult
    freeFailure = { status: freeResult.status, error: freeResult.error }
  }

  if (deapiKeys().length) {
    const fallback = await submitDeapiFallback(input)
    if (fallback.ok) return fallback

    return {
      ok: false as const,
      status: fallback.status || freeFailure?.status || 502,
      error: freeFailure
        ? `Free.ai: ${freeFailure.error}; deAPI fallback: ${fallback.error}`
        : fallback.error,
    }
  }

  if (freeFailure) {
    return { ok: false as const, status: freeFailure.status, error: freeFailure.error }
  }

  return {
    ok: false as const,
    status: 503,
    error: "No music provider is configured. Add FREE_AI_API_KEY or a deAPI key.",
  }
}

async function getDeapiFallbackJob(requestId: string) {
  const configured = orderedKeys(requestId)
  if (!configured.length) {
    return { ok: false as const, statusCode: 503, status: "failed" as const, error: "deAPI music key is not configured" }
  }

  let lastError = "Unable to read deAPI music job"
  let lastStatus = 502

  for (const source of configured) {
    try {
      const { response, json } = await fetchJson(`${DEAPI_BASE}/jobs/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${source.key}`,
        },
      }, 20000)

      if (!response.ok) {
        lastStatus = response.status || 502
        lastError = providerError(json, `deAPI returned HTTP ${response.status}`)
        if ([401, 402, 403, 404, 429].includes(response.status) || response.status >= 500) continue
        break
      }

      const data = json?.data && typeof json.data === "object" ? json.data : json
      const rawStatus = String(data?.status || "").trim().toLowerCase()
      const resultUrl = resultUrlOf(json)
      const progress = progressOf(json)

      jobMap().set(requestId, source.label)

      if (rawStatus === "done" && resultUrl) {
        return { ok: true as const, statusCode: 200, status: "done" as const, resultUrl, progress: 100, provider: "deAPI" as const, model: musicModel(requestId) }
      }
      if (rawStatus === "error" || rawStatus === "failed" || rawStatus === "cancelled") {
        return {
          ok: false as const,
          statusCode: 200,
          status: "failed" as const,
          error: providerError(json, "Music generation failed"),
          progress,
          provider: "deAPI" as const,
          model: musicModel(requestId),
        }
      }
      if (rawStatus === "processing" || rawStatus === "running" || rawStatus === "generating") {
        return { ok: true as const, statusCode: 200, status: "processing" as const, progress, provider: "deAPI" as const, model: musicModel(requestId) }
      }
      return { ok: true as const, statusCode: 200, status: "queued" as const, progress, provider: "deAPI" as const, model: musicModel(requestId) }
    } catch (error) {
      lastStatus = 502
      lastError = error instanceof Error ? error.message : "deAPI network error"
    }
  }

  return { ok: false as const, statusCode: lastStatus, status: "failed" as const, error: lastError, provider: "deAPI" as const, model: musicModel(requestId) }
}

export async function getDeapiMusicJob(requestId: string) {
  if (isFreeAiRequest(requestId)) return getFreeAiMusicJob(requestId)
  return getDeapiFallbackJob(requestId)
}
