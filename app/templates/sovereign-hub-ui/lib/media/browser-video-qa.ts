import { directMediaUrl } from "@/lib/os/media-reference"

export type VerifiedVideo = { url: string; width: number; height: number; durationSeconds: number }

/** Provider job completion is not proof that its URL contains a playable video. */
export async function verifyDirectVideo(url: string, appOrigin: string, timeoutMs = 20_000): Promise<VerifiedVideo> {
  const direct = directMediaUrl(url, appOrigin)
  if (!direct) throw new Error("Видеомодель не вернула безопасную прямую ссылку на файл.")
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
    const timer = window.setTimeout(() => finish(undefined, new Error("Видео создано, но браузер не смог проверить файл за 20 секунд. Попробуйте открыть результат позже.")), timeoutMs)
    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      const durationSeconds = video.duration
      if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        finish(undefined, new Error("Видеомодель вернула пустой или повреждённый файл."))
        return
      }
      finish({ url: direct, width, height, durationSeconds })
    }
    video.onerror = () => finish(undefined, new Error("Видео создано, но файл не воспроизводится в этом браузере."))
    video.src = direct
    video.load()
  })
}
