"use client"

import { useEffect } from "react"

const IMAGE_START_PATH = "/api/ai/image"
const IMAGE_JOB_PREFIX = "/api/ai/job/"
const IMAGE_WAIT_MS = 112_000

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
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    const abort = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      reject(signal?.reason || new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", abort, { once: true })
  })
}

function existingSignal(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal
  return typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined
}

/**
 * Production serves /api/ai/image from Flask as a background job (202). The
 * chat used to treat that 202 as if generation had finished, while the photo
 * card never polled image jobs. Three minutes later the UI showed
 * "Генерация остановлена / Load failed" even when the backend had already
 * created a real file.
 *
 * This runtime turns only the start request into a completion promise: it lets
 * the background worker survive navigation, polls its durable status URL, and
 * hands the dashboard the final image response it already knows how to save.
 * Text-model selection never participates in this path.
 */
export function ImageJobRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const previousFetch = window.fetch.bind(window)

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (pathFromFetchInput(input) !== IMAGE_START_PATH || String(init?.method || "GET").toUpperCase() !== "POST") {
        return previousFetch(input, init)
      }

      const signal = existingSignal(input, init)
      const startedResponse = await previousFetch(input, init)
      const initial = await startedResponse.clone().json().catch(() => null)
      if (!initial || !startedResponse.ok) return startedResponse

      const immediateUrl = imageUrlFrom(initial)
      if (immediateUrl) {
        return jsonResponse(mergedReadyPayload(initial, initial, immediateUrl))
      }

      const statusUrl = statusUrlFrom(initial)
      if (!statusUrl || !isProcessing(initial)) return startedResponse

      const deadline = Date.now() + IMAGE_WAIT_MS
      let lastPayload: any = initial
      let transientErrors = 0

      while (Date.now() < deadline) {
        await sleep(transientErrors ? 1_850 : 1_250, signal)

        try {
          const pollResponse = await previousFetch(statusUrl, {
            method: "GET",
            cache: "no-store",
            signal,
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
          if (signal?.aborted) throw error
          transientErrors += 1
          // A temporary status-request failure must not kill the image job.
          // Keep polling the same durable job instead of painting "Load failed".
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
    }) as typeof window.fetch

    return () => {
      window.fetch = previousFetch
    }
  }, [])

  return null
}

export default ImageJobRuntime
