"use client"

/**
 * Device-side video export. Render only streams the user's completed source
 * on explicit download; the canvas compositor/encoder runs in the browser.
 * The exported file actually contains the official Malik icon on every frame.
 */
function drawOfficialMalikIcon(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.max(35, Math.min(180, Math.round(width * 0.06)))
  const margin = Math.max(8, Math.round(width * 0.012))
  ctx.save()
  ctx.translate(margin, height - margin - size * 0.58)
  ctx.scale(size / 100, size / 100)
  ctx.lineJoin = "round"
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(0, 0, 0, .55)"
  ctx.fillStyle = "rgba(255, 255, 255, .85)"
  // Identical geometry to /brand/malik-mark.svg.
  for (const path of [new Path2D("M4 53 46 11v42H4Z"), new Path2D("M55 11h41L55 53V11Z")]) {
    ctx.stroke(path)
    ctx.fill(path)
  }
  ctx.restore()
}

function supportedMime() {
  if (typeof MediaRecorder === "undefined") return ""
  const choices = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || ""
}

export async function exportBrandedMalikVideo(taskId: string): Promise<{ blob: Blob; extension: "mp4" | "webm" }> {
  if (!taskId) throw new Error("Нет задачи видео для брендированного скачивания.")
  const mime = supportedMime()
  if (!mime) throw new Error("Этот браузер не поддерживает запись видео со встроенным логотипом.")
  const video = document.createElement("video")
  video.preload = "auto"
  video.playsInline = true
  video.muted = true
  video.crossOrigin = "anonymous"
  video.style.display = "none"

  let audioContext: AudioContext | null = null
  let audioDestination: MediaStreamAudioDestinationNode | null = null
  try {
    // Resume as early as possible within the user click for iOS Safari.
    const Ctor = window.AudioContext
    if (Ctor) {
      audioContext = new Ctor()
      const source = audioContext.createMediaElementSource(video)
      audioDestination = audioContext.createMediaStreamDestination()
      source.connect(audioDestination)
      void audioContext.resume().catch(() => {})
    }
  } catch {
    audioContext = null
    audioDestination = null
  }

  let drawing = 0
  let timeout: ReturnType<typeof setTimeout> | null = null
  let mediaStream: MediaStream | null = null
  try {
    const ready = new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("Не удалось получить исходный ролик для обработки."))
    })
    video.src = `/api/media/video/brand-source?taskId=${encodeURIComponent(taskId)}`
    video.load()
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Загрузка видео для экспорта заняла слишком много времени.")), 40_000)
      }),
    ])
    if (timeout) clearTimeout(timeout)
    timeout = null

    const width = video.videoWidth
    const height = video.videoHeight
    const duration = video.duration
    if (!width || !height || !Number.isFinite(duration) || duration <= 0 || duration > 16) {
      throw new Error("Этот ролик невозможно безопасно обработать в браузере.")
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx || !canvas.captureStream) throw new Error("Запись видео недоступна на этом устройстве.")

    function paint() {
      if (!ctx) return
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height)
        drawOfficialMalikIcon(ctx, width, height)
      }
      if (!video.ended) drawing = window.requestAnimationFrame(paint)
    }

    paint()
    const frameStream = canvas.captureStream(30)
    const tracks = [
      ...frameStream.getVideoTracks(),
      ...(audioDestination?.stream.getAudioTracks() || []),
    ]
    mediaStream = new MediaStream(tracks)

    const recorder = new MediaRecorder(mediaStream, {
      mimeType: mime,
      videoBitsPerSecond: Math.min(10_000_000, Math.max(2_000_000, width * height * 3)),
    })
    const chunks: BlobPart[] = []
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => reject(new Error("Не удалось записать готовый ролик."))
      recorder.onstop = () => {
        if (chunks.length) resolve(new Blob(chunks, { type: mime }))
        else reject(new Error("Браузер не создал видеофайл."))
      }
    })

    recorder.start(250)
    video.onended = () => {
      window.cancelAnimationFrame(drawing)
      if (recorder.state !== "inactive") recorder.stop()
    }
    try {
      await video.play()
      // Routing through WebAudio preserves source audio where supported.
      video.muted = false
      if (audioContext?.state === "suspended") await audioContext.resume().catch(() => {})
    } catch {
      if (recorder.state !== "inactive") recorder.stop()
      throw new Error("Браузер запретил воспроизведение для экспорта. Нажмите скачивание ещё раз.")
    }

    const file = await Promise.race([
      finished,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Время обработки ролика истекло.")), 90_000)
      }),
    ])
    return { blob: file, extension: mime.includes("mp4") ? "mp4" : "webm" }
  } finally {
    if (timeout) clearTimeout(timeout)
    window.cancelAnimationFrame(drawing)
    video.pause()
    video.removeAttribute("src")
    try { video.load() } catch {}
    mediaStream?.getTracks().forEach((track) => track.stop())
    if (audioContext) void audioContext.close().catch(() => {})
  }
}
