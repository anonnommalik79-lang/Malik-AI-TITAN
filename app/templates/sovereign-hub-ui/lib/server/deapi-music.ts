import "server-only"

type DeapiEnvelope = {
  data?: any
  request_id?: string
  requestId?: string
  status?: string
  result_url?: string
  resultUrl?: string
  error?: string
  message?: string
}

type KeySource = { key: string; label: "primary" | "friend-1" | "friend-2" }

type MusicJobGlobal = typeof globalThis & {
  __malikMusicJobKeyLabel?: Map<string, KeySource["label"]>
}

const DEAPI_BASE = "https://api.deapi.ai/api/v2"

function keys(): KeySource[] {
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

function jobMap() {
  const scope = globalThis as MusicJobGlobal
  if (!scope.__malikMusicJobKeyLabel) scope.__malikMusicJobKeyLabel = new Map()
  return scope.__malikMusicJobKeyLabel
}

function orderedKeys(requestId?: string) {
  const all = keys()
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
    let json: DeapiEnvelope = {}
    try { json = text ? JSON.parse(text) as DeapiEnvelope : {} } catch { json = { message: text } }
    return { response, json }
  } finally {
    clearTimeout(timer)
  }
}

function requestIdOf(payload: DeapiEnvelope) {
  const value = payload?.data?.request_id || payload?.data?.requestId || payload?.request_id || payload?.requestId
  return typeof value === "string" ? value.trim() : ""
}

function providerError(payload: DeapiEnvelope, fallback: string) {
  return String(
    payload?.data?.error ||
    payload?.data?.message ||
    payload?.error ||
    payload?.message ||
    fallback
  ).trim()
}

export function musicModel() {
  return String(process.env.DEAPI_MUSIC_MODEL || "").trim() || "AceStep_1_5_XL_Turbo_INT8"
}

export function musicProviderConfigured() {
  return keys().length > 0
}

export async function submitDeapiMusic(input: {
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

  // deAPI's ACE-Step endpoint currently validates the lyrics field even for
  // instrumental requests. Their ACE-Step guide recommends "[Instrumental]"
  // for this case, so always send the field instead of omitting it.
  const lyrics = input.instrumental
    ? "[Instrumental]"
    : (input.lyrics?.trim() || "")

  const body: Record<string, unknown> = {
    model: musicModel(),
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
          model: musicModel(),
          status: "queued" as const,
        }
      }

      lastStatus = response.status || 502
      lastError = providerError(json, `deAPI returned HTTP ${response.status}`)

      // Invalid request payloads will fail identically for every key.
      if (response.status >= 400 && response.status < 500 && ![401, 403, 408, 409, 429].includes(response.status)) break
    } catch (error) {
      lastStatus = 502
      lastError = error instanceof Error ? error.message : "deAPI network error"
    }
  }

  return { ok: false as const, status: lastStatus, error: lastError }
}

export async function getDeapiMusicJob(requestId: string) {
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
        if ([401, 403, 404, 429].includes(response.status) || response.status >= 500) continue
        break
      }

      const data = json?.data && typeof json.data === "object" ? json.data : json
      const rawStatus = String(data?.status || "").trim().toLowerCase()
      const resultUrl = String(data?.result_url || data?.resultUrl || json?.result_url || json?.resultUrl || "").trim()
      const progressRaw = Number(data?.progress)
      const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : undefined

      jobMap().set(requestId, source.label)

      if (rawStatus === "done" && resultUrl) {
        return { ok: true as const, statusCode: 200, status: "done" as const, resultUrl, progress: 100 }
      }
      if (rawStatus === "error" || rawStatus === "failed" || rawStatus === "cancelled") {
        return {
          ok: false as const,
          statusCode: 200,
          status: "failed" as const,
          error: providerError(json, "Music generation failed"),
          progress,
        }
      }
      if (rawStatus === "processing" || rawStatus === "running" || rawStatus === "generating") {
        return { ok: true as const, statusCode: 200, status: "processing" as const, progress }
      }
      return { ok: true as const, statusCode: 200, status: "queued" as const, progress }
    } catch (error) {
      lastStatus = 502
      lastError = error instanceof Error ? error.message : "deAPI network error"
    }
  }

  return { ok: false as const, statusCode: lastStatus, status: "failed" as const, error: lastError }
}