import "server-only"

const DEAPI_BASE_URL = "https://api.deapi.ai/api/v2"
const DEFAULT_MUSIC_MODEL = "AceStep_1_5_XL_Turbo_INT8"

type DeapiJson = Record<string, any>

function configuredKeys() {
  const keys = [
    process.env.DEAPI_API_KEY_PRIMARY,
    process.env.DEAPI_API_KEY_FRIEND_1,
    process.env.DEAPI_API_KEY_FRIEND_2,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)

  return [...new Set(keys)]
}

export function deapiMusicConfigured() {
  return configuredKeys().length > 0
}

export function deapiMusicModel() {
  return process.env.DEAPI_MUSIC_MODEL?.trim() || DEFAULT_MUSIC_MODEL
}

function requestHeaders(apiKey: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

async function readJson(response: Response): Promise<DeapiJson> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as DeapiJson
  } catch {
    return { message: text.slice(0, 500) }
  }
}

function upstreamMessage(payload: DeapiJson, fallback: string) {
  const value =
    payload?.detail ||
    payload?.message ||
    payload?.error ||
    payload?.data?.message ||
    payload?.data?.error
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function requestIdFrom(payload: DeapiJson) {
  const value = payload?.data?.request_id || payload?.request_id
  return typeof value === "string" ? value.trim() : ""
}

function jobData(payload: DeapiJson) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload
}

function canTryAnotherKey(status: number) {
  return status === 401 || status === 402 || status === 403 || status === 404 || status === 408 || status === 409 || status === 429 || status >= 500
}

export type DeapiMusicSubmitInput = {
  caption: string
  duration: number
  lyrics?: string
  instrumental?: boolean
}

export type DeapiMusicSubmitResult =
  | {
      ok: true
      requestId: string
      model: string
      provider: "deapi"
    }
  | {
      ok: false
      status: number
      code: string
      error: string
    }

export async function submitDeapiMusic(input: DeapiMusicSubmitInput): Promise<DeapiMusicSubmitResult> {
  const keys = configuredKeys()
  if (!keys.length) {
    return { ok: false, status: 503, code: "DEAPI_NOT_CONFIGURED", error: "Music provider is not configured." }
  }

  const model = deapiMusicModel()
  const caption = input.instrumental
    ? `${input.caption}, instrumental, no vocals`
    : input.caption

  const body: Record<string, unknown> = {
    model,
    caption,
    duration: input.duration,
    inference_steps: 8,
    guidance_scale: 1,
    seed: -1,
    format: "mp3",
    vocal_language: "unknown",
  }

  if (!input.instrumental && input.lyrics?.trim()) {
    body.lyrics = input.lyrics.trim()
  }

  let lastFailure: DeapiMusicSubmitResult = {
    ok: false,
    status: 502,
    code: "DEAPI_REQUEST_FAILED",
    error: "deAPI did not accept the music request.",
  }

  for (let index = 0; index < keys.length; index += 1) {
    const apiKey = keys[index]
    try {
      const response = await fetch(`${DEAPI_BASE_URL}/audio/music`, {
        method: "POST",
        headers: {
          ...requestHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      })
      const payload = await readJson(response)

      if (response.ok) {
        const requestId = requestIdFrom(payload)
        if (!requestId) {
          return {
            ok: false,
            status: 502,
            code: "DEAPI_REQUEST_ID_MISSING",
            error: "deAPI accepted the request but did not return request_id.",
          }
        }
        return { ok: true, requestId, model, provider: "deapi" }
      }

      lastFailure = {
        ok: false,
        status: response.status || 502,
        code: "DEAPI_SUBMIT_ERROR",
        error: upstreamMessage(payload, `deAPI request failed with HTTP ${response.status}`),
      }

      if (!canTryAnotherKey(response.status)) return lastFailure
    } catch (error) {
      lastFailure = {
        ok: false,
        status: 502,
        code: "DEAPI_NETWORK_ERROR",
        error: error instanceof Error ? error.message : "Unable to reach deAPI.",
      }
    }
  }

  return lastFailure
}

export type DeapiMusicJobResult = {
  ok: boolean
  requestId: string
  status: string
  progress?: number
  resultUrl?: string
  error?: string
  model?: string
}

export async function getDeapiMusicJob(requestId: string): Promise<DeapiMusicJobResult> {
  const keys = configuredKeys()
  if (!keys.length) {
    return { ok: false, requestId, status: "error", error: "Music provider is not configured." }
  }

  let lastError = "Unable to load deAPI job."

  for (let index = 0; index < keys.length; index += 1) {
    const apiKey = keys[index]
    try {
      const response = await fetch(`${DEAPI_BASE_URL}/jobs/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers: requestHeaders(apiKey),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      })
      const payload = await readJson(response)

      if (response.ok) {
        const data = jobData(payload)
        const status = String(data?.status || payload?.status || "processing").trim().toLowerCase()
        const resultUrlRaw = data?.result_url || data?.resultUrl || payload?.result_url || payload?.resultUrl
        const progressRaw = data?.progress ?? payload?.progress
        const progress = Number(progressRaw)

        return {
          ok: status !== "error" && status !== "failed",
          requestId,
          status,
          progress: Number.isFinite(progress) ? progress : undefined,
          resultUrl: typeof resultUrlRaw === "string" && resultUrlRaw.trim() ? resultUrlRaw.trim() : undefined,
          error: status === "error" || status === "failed"
            ? upstreamMessage(payload, "Music generation failed.")
            : undefined,
          model: typeof data?.model === "string" ? data.model : deapiMusicModel(),
        }
      }

      lastError = upstreamMessage(payload, `deAPI job lookup failed with HTTP ${response.status}`)
      if (!canTryAnotherKey(response.status)) {
        return { ok: false, requestId, status: "error", error: lastError }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unable to reach deAPI."
    }
  }

  return { ok: false, requestId, status: "error", error: lastError }
}
