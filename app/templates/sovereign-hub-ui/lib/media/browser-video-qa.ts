import { directMediaUrl } from "@/lib/os/media-reference"
import { videoProbeVerdict, type VideoProbe } from "@/lib/media/video-file-check"

export type VerifiedVideo = { url: string; width: number; height: number; durationSeconds: number }

/** Loads only the file's metadata in a detached player: real dimensions and duration, or an error. */
export function verifyPlayableVideo(src: string, timeoutMs = 25_000): Promise<VerifiedVideo> {
  const video = document.createElement("video")
  video.preload = "metadata"
  video.muted = true
  video.playsInline = true
  return new Promise<VerifiedVideo>((resolve, reject) => {
    let settled = false
    const finish = (result?: VerifiedVideo, error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute("src")
      try { video.load() } catch { /* Cleanup must not hide the real result. */ }
      if (result) resolve(result)
      else reject(error || new Error("Браузер не смог проверить видео."))
    }
    const timer = window.setTimeout(() => finish(undefined, new Error("Браузер не смог открыть файл за отведённое время.")), timeoutMs)
    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      const durationSeconds = video.duration
      if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        finish(undefined, new Error("Видеомодель вернула пустой или повреждённый файл."))
        return
      }
      finish({ url: src, width, height, durationSeconds })
    }
    video.onerror = () => finish(undefined, new Error("Видео создано, но файл не воспроизводится в этом браузере."))
    video.src = src
    video.load()
  })
}

/** Provider job completion is not proof that its URL contains a playable video. */
export async function verifyDirectVideo(url: string, appOrigin: string, timeoutMs = 25_000): Promise<VerifiedVideo> {
  const direct = directMediaUrl(url, appOrigin)
  if (!direct) throw new Error("Видеомодель не вернула безопасную прямую ссылку на файл.")
  return verifyPlayableVideo(direct, timeoutMs)
}

export type DeliveredVideo = { video: VerifiedVideo; via: "provider" | "malik"; originalUrl: string }

/** A finished video that could not be shown. It is never thrown away: the person keeps the link. */
export class VideoDeliveryError extends Error {
  readonly originalUrl: string
  readonly retry: boolean
  constructor(message: string, originalUrl: string, retry: boolean) {
    super(message)
    this.name = "VideoDeliveryError"
    this.originalUrl = originalUrl
    this.retry = retry
  }
}

export function malikVideoStreamUrl(taskId: string) {
  return `/api/media/video/brand-source?taskId=${encodeURIComponent(taskId)}`
}

/** ClipTaps marks /uploads/ videos private. The browser must use Malik's
 * authenticated owner-scoped stream rather than retrying an unsigned URL. */
export function isProtectedClipTapsUrl(src: string) {
  try {
    const url = new URL(src)
    return url.protocol === "https:" && url.hostname === "cliptaps.com" && url.pathname.startsWith("/uploads/")
  } catch {
    return false
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * Shows a finished video the way that works in this browser:
 * 1. straight from the provider, retried while its CDN publishes the file;
 * 2. through Malik, when the CDN refuses the browser (referrer rules, ranges);
 * 3. otherwise the file is inspected on the server and the reason is named.
 */
export async function deliverGeneratedVideo(input: {
  url: string
  taskId: string
  origin: string
  waits?: number[]
  verify?: (src: string) => Promise<VerifiedVideo>
  fetcher?: typeof fetch
}): Promise<DeliveredVideo> {
  const verify = input.verify || ((src: string) => verifyPlayableVideo(src))
  const fetcher = input.fetcher || fetch
  const direct = directMediaUrl(input.url, input.origin)
  let lastError: unknown
  // An unsigned ClipTaps /uploads/ URL will always be 403 in the browser.
  // Go straight to the server's owner-authenticated path instead of wasting
  // multiple metadata timeouts on a known private link.
  if (direct && !(input.taskId && isProtectedClipTapsUrl(direct))) {
    for (const delay of input.waits || [0, 4000, 9000]) {
      if (delay) await wait(delay)
      try {
        return { video: await verify(direct), via: "provider", originalUrl: direct }
      } catch (error) {
        lastError = error
        // A file the browser read and found empty will not get better.
        if (error instanceof Error && /пустой или повреждённый/u.test(error.message)) break
      }
    }
  }
  if (input.taskId) {
    try {
      return { video: await verify(malikVideoStreamUrl(input.taskId)), via: "malik", originalUrl: direct || input.url }
    } catch (error) {
      lastError = error
    }
    let probe: VideoProbe | null = null
    try {
      const response = await fetcher(`/api/media/video/probe?taskId=${encodeURIComponent(input.taskId)}`, { credentials: "same-origin", cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      probe = response.ok && payload?.probe ? payload.probe as VideoProbe : null
    } catch {
      probe = null
    }
    const verdict = videoProbeVerdict(probe)
    throw new VideoDeliveryError(
      verdict.playableThroughMalik ? "Файл в порядке, но этот браузер не смог его открыть. Откройте файл по кнопке ниже." : verdict.message,
      direct || input.url,
      verdict.retry,
    )
  }
  throw new VideoDeliveryError(lastError instanceof Error ? lastError.message : "Видео создано, но файл не открывается.", direct || input.url, true)
}
