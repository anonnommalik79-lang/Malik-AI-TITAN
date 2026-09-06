"use client"

import { useEffect } from "react"

const IMAGE_START_PATH = "/api/ai/image"
const IMAGE_JOB_PREFIX = "/api/ai/job/"
const IMAGE_WAIT_MS = 112_000
const IMAGE_REQUEST_HARD_LIMIT_MS = 240_000

function pathFromFetchInput(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
    return new URL(raw, window.location.href).pathname
  } catch {
    return ""
  }
}

function methodFromFetchInput(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return String(init.method).toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function imageUrlFrom(payload: any): string {
  const value =
    payload?.imageUrl ||
    payload?.mediaUrl ||
    payload?.url ||
    payload?.resultUrl ||
    payload?.output?.imageUrl ||
    payload?.output?.mediaUrl ||
    payload?.output?.url ||
    payload?.job?.imageUrl ||
    payload?.job?.mediaUrl ||
    payload?.job?.url ||
    payload?.job?.output?.imageUrl ||
    payload?.job?.output?.mediaUrl ||
    payload?.job?.output?.url ||
    ""
  return typeof value === "string" ? value.trim() : ""
}

function statusFrom(payload: any) {
  return String(payload?.status || payload?.job?.status || "").trim().toLowerCase()
}

function jobIdFrom(payload: any) {
  const value = payload?.jobId || payload?.id || payload?.job?.jobId || payload?.job?.id
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function statusUrlFrom(payload: any) {
  const direct = payload?.statusUrl || payload?.job?.statusUrl
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const jobId = jobIdFrom(payload)
  return jobId ? `${IMAGE_JOB_PREFIX}${encodeURIComponent(jobId)}` : ""
}

function isProcessing(payload: any) {
  return /queued|queue|thinking|processing|generating|rendering|running|submitted|starting/.test(statusFrom(payload))
}

function isFailed(payload: any) {
  return /failed|error|cancelled|canceled/.test(statusFrom(payload)) || payload?.ok === false
}

function mergedReadyPayload(initial: any, latest: any, imageUrl: string) {
  return {
    ...initial,
    ...latest,
    ...(latest?.job && typeof latest.job === "object" ? latest.job : {}),
    ok: true,
    status: "ready",
    progress: 100,
    imageUrl,
    mediaUrl: imageUrl,
    url: imageUrl,
    resultUrl: imageUrl,
    jobId: jobIdFrom(latest) || jobIdFrom(initial) || undefined,
    statusUrl: statusUrlFrom(latest) || statusUrlFrom(initial) || undefined,
  }
}

function jsonResponse(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"))
      return
    }
    const abort = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      reject(signal?.reason || new DOMException("Aborted", "AbortError"))
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

/**
 * The dashboard has a generic 120s client timeout. That is fine for text, but
 * an 8K image can spend that time in model failover + Sharp delivery. Safari
 * reports the abort as the useless "Load failed" shown in the chat. Image jobs
 * therefore get their own hard ceiling and are not killed by the generic text
 * request timer.
 *
 * This also supports deployments that return a 202 background job: after the
 * start response we poll the durable status URL and return the finished image
 * to the existing dashboard persistence path. The selected text LLM is never
 * consulted for this request.
 */
export function ImageJobRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const previousFetch = window.fetch.bind(window)

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (pathFromFetchInput(input) !== IMAGE_START_PATH || methodFromFetchInput(input, init) !== "POST") {
        return previousFetch(input, init)
      }

      const generationController = new AbortController()
      const hardTimer = window.setTimeout(
        () => generationController.abort(new DOMException("Image generation hard timeout", "TimeoutError")),
        IMAGE_REQUEST_HARD_LIMIT_MS,
      )

      // Deliberately replace the generic 120s dashboard signal. On the current
      // Render/Next deployment the route is synchronous; on an async deployment
      // it returns 202 quickly and the polling branch below takes over.
      const generationInit: RequestInit = {
        ...(init || {}),
        signal: generationController.signal,
      }

      try {
        const startedResponse = await previousFetch(input, generationInit)
        const initial = await startedResponse.clone().json().catch(() => null)
        if (!initial || !startedResponse.ok) return startedResponse

        const immediateUrl = imageUrlFrom(initial)
        if (immediateUrl) {
          return jsonResponse(mergedReadyPayload(initial, initial, immediateUrl))
        }

        const statusUrl = statusUrlFrom(initial)
        if (!statusUrl || !isProcessing(initial)) return startedResponse

        const deadline = Math.min(Date.now() + IMAGE_WAIT_MS, Date.now() + IMAGE_REQUEST_HARD_LIMIT_MS - 5_000)
        let lastPayload: any = initial
        let transientErrors = 0

        while (Date.now() < deadline) {
          await sleep(transientErrors ? 1_850 : 1_250, generationController.signal)

          try {
            const pollResponse = await previousFetch(statusUrl, {
              method: "GET",
              cache: "no-store",
              signal: generationController.signal,
              headers: { Accept: "application/json" },
            })
            const latest = await pollResponse.json().catch(() => ({}))
            lastPayload = latest && typeof latest === "object" ? latest : lastPayload

            const imageUrl = imageUrlFrom(lastPayload)
            if (imageUrl) {
              return jsonResponse(mergedReadyPayload(initial, lastPayload, imageUrl))
            }

            if (isFailed(lastPayload)) {
              const publicError = String(
                lastPayload?.publicError ||
                lastPayload?.error ||
                lastPayload?.job?.error ||
                "Не удалось завершить генерацию изображения.",
              )
              return jsonResponse({
                ...initial,
                ...lastPayload,
                ok: false,
                status: "failed",
                progress: 100,
                error: publicError,
                publicError,
              }, 502)
            }

            transientErrors = 0
          } catch (error) {
            if (generationController.signal.aborted) throw error
            transientErrors += 1
            // A temporary status-request failure must not kill the image job.
            // Keep polling the same job instead of painting "Load failed".
          }
        }

        return jsonResponse({
          ...initial,
          ...lastPayload,
          ok: false,
          status: "failed",
          progress: 100,
          error: "IMAGE_JOB_TIMEOUT",
          publicError: "Генератор не успел вернуть файл. Повторите запрос — незавершённый job не будет показан как готовое фото.",
        }, 504)
      } finally {
        window.clearTimeout(hardTimer)
      }
    }) as typeof window.fetch

    return () => {
      window.fetch = previousFetch
    }
  }, [])

  return null
}

export default ImageJobRuntime
