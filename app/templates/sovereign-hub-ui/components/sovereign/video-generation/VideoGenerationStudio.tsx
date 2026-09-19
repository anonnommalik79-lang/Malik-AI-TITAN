"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ArrowUp,
  Box,
  Clock3,
  Crown,
  Monitor,
  Play,
  RectangleHorizontal,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  ImagePlus,
  Info,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react"
import { canUseGeneration, incrementUsage } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { takePrefillPrompt } from "@/lib/malik-context"

export type VideoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Ratio = "16:9" | "9:16" | "1:1" | "4:3"
type Duration = 5 | 10
type Quality = "fast" | "max"
type VideoMode = "text" | "image" | "video"
type GenerationPhase = "idle" | "queued" | "rendering" | "ready" | "failed"
type ShowcaseVideoTemplate = {
  id: string
  title: string
  theme: string
  src: string
  mobileSrc?: string
  poster: string
  prompt: string
}

const ENDPOINT = "/api/media/video"
const QUALITY_RESOLUTION: Record<Quality, "720p" | "1080p"> = {
  fast: "720p",
  max: "1080p",
}
const DEFAULT_PROMPT = "Ночной Алматы после дождя. Чёрный премиальный автомобиль медленно едет по мокрой улице, отражения городских огней на асфальте, камера низко следует сбоку, реалистичная физика, кинематографичный свет и естественный звук города."

const SHOWCASE_TEMPLATES: ShowcaseVideoTemplate[] = [
  {
    id: "malik-epic-motion",
    title: "Epic Motion",
    theme: "Сражение",
    src: "/videos/malik-showcase/cinematic-battle.mp4",
    poster: "/videos/malik-showcase/cinematic-battle.jpg",
    prompt: "Эпическая сцена сражения, огонь и дым, стремительное движение камеры, кинематограф.",
  },
  {
    id: "malik-ancient-worlds",
    title: "Ancient Worlds",
    theme: "Руины",
    src: "/videos/malik-showcase/ancient-ruins.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/ancient-ruins.mp4",
    poster: "/videos/malik-showcase/ancient-ruins.jpg",
    prompt: "Древние руины на рассвете, мягкий солнечный свет, плавный cinematic flythrough.",
  },
  {
    id: "malik-animated-city",
    title: "Animated City",
    theme: "Анимация",
    src: "/videos/malik-showcase/restyle-2.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/restyle-2.mp4",
    poster: "/videos/malik-showcase/restyle-2.jpg",
    prompt: "Анимационный герой на скейтборде в фантастическом городе, выразительная перспектива и кинематографичное движение.",
  },
  {
    id: "malik-mecha-impact",
    title: "Mecha Impact",
    theme: "Мех",
    src: "/videos/malik-showcase/mecha-impact.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/mecha-impact.mp4",
    poster: "/videos/malik-showcase/mecha-impact.jpg",
    prompt: "Гигантский мех приземляется в городе, искры и пыль, сильный удар камеры.",
  },
  {
    id: "malik-alpine-flight",
    title: "Alpine Flight",
    theme: "Экшен",
    src: "/videos/malik-showcase/alpine-flight.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/alpine-flight.mp4",
    poster: "/videos/malik-showcase/alpine-flight.jpg",
    prompt: "Экстремальный полёт над снежными горами, вертикальный кадр, яркий дневной свет.",
  },
  {
    id: "malik-transformer-flight",
    title: "Transformer Flight",
    theme: "Трансформер",
    src: "/videos/malik-showcase/hero-transformer.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/hero-transformer.mp4",
    poster: "/videos/malik-showcase/hero-transformer.jpg",
    prompt: "Летящий трансформер над улицами мегаполиса, динамичная камера, кинематографичный свет.",
  },
  {
    id: "malik-product-serum",
    title: "Product Motion",
    theme: "Реклама",
    src: "/videos/malik-showcase/product-shot-1.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/product-shot-1.mp4",
    poster: "/videos/malik-showcase/product-shot-1.jpg",
    prompt: "Премиальная предметная съёмка синего флакона сыворотки, яркий студийный фон и плавное рекламное движение.",
  },
  {
    id: "malik-storybook-cat",
    title: "Storybook Cat",
    theme: "Персонаж",
    src: "/videos/malik-showcase/restyle-3.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/restyle-3.mp4",
    poster: "/videos/malik-showcase/restyle-3.jpg",
    prompt: "Милый чёрный кот в цветочном поле, рисованная анимация, мягкое естественное движение.",
  },
  {
    id: "malik-cloud-road",
    title: "Road Above Clouds",
    theme: "Автомобиль",
    src: "/videos/malik-showcase/product-shot-2.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/product-shot-2.mp4",
    poster: "/videos/malik-showcase/product-shot-2.jpg",
    prompt: "Синий спортивный автомобиль едет по дороге над облаками, премиальная реклама и плавное движение камеры.",
  },
]

const MODELS = [
  {
    id: "novai",
    provider: "novai",
    name: "NovAI · CogVideoX Flash",
    subtitle: "720p · основной бесплатный",
    tier: "Free",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://aiapi-pro.com",
    featured: true,
    audio: false,
    note: "CogVideoX Flash — основной бесплатный маршрут MalikVideo.",
  },
  {
    id: "magichour",
    provider: "magichour",
    name: "Magic Hour · LTX",
    subtitle: "480p · free credits",
    tier: "Free",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://magichour.ai",
    featured: false,
    audio: true,
    note: "Magic Hour использует бесплатные кредиты аккаунта; доступ зависит от оставшихся daily claims.",
  },
  {
    id: "pixazo",
    provider: "pixazo",
    name: "Pixazo · LTX Free",
    subtitle: "Free preview · без native audio",
    tier: "Free",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://pixazo.ai",
    featured: false,
    audio: false,
    note: "Pixazo LTX Free работает в preview/fair-use режиме.",
  },
  {
    id: "cliptaps",
    provider: "cliptaps",
    name: "ClipTaps",
    subtitle: "1 проект/день · до 3 сцен",
    tier: "Free",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://cliptaps.com",
    featured: false,
    audio: true,
    note: "ClipTaps — резервный daily-провайдер; результат может содержать watermark и автоматически созданный голос.",
  },
] as const

const CATEGORIES = ["Популярное", "Кинематографичные", "Анимация", "Реалистичные", "Природа", "Технологии", "Люди", "Продукты"] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusLabel(phase: GenerationPhase, attempt: number) {
  if (phase === "queued") return "Ставлю видео в очередь…"
  if (phase === "rendering") return attempt < 5 ? "Собираю сцену и движение…" : attempt < 15 ? "Рендерю свет, движение и звук…" : "Финализирую видео…"
  if (phase === "ready") return "Видео готово"
  if (phase === "failed") return "Генерация остановлена"
  return "Готов к созданию"
}

function PosterAsset({ item, className = "" }: { item: ShowcaseVideoTemplate; className?: string }) {
  return <img className={className} src={item.poster} alt={item.title} loading="lazy" decoding="async" draggable={false} />
}

function HeroVideo({ item }: { item: ShowcaseVideoTemplate }) {
  return (
    <video
      key={item.id}
      className="mv2__hero-video"
      poster={item.poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
    >
      {item.mobileSrc ? <source media="(max-width: 820px)" src={item.mobileSrc} type="video/mp4" /> : null}
      <source src={item.src} type="video/mp4" />
    </video>
  )
}

export function VideoGenerationStudio({ username, onViewChange }: VideoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [prompt, setPrompt] = useState(() => takePrefillPrompt() || DEFAULT_PROMPT)
  const [mode, setMode] = useState<VideoMode>("text")
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState("")
  const sourceInputRef = useRef<HTMLInputElement | null>(null)
  const mobileSourceInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceDurationSeconds, setSourceDurationSeconds] = useState(0)
  const [ratio, setRatio] = useState<Ratio>("16:9")
  const [duration, setDuration] = useState<Duration>(5)
  const [quality, setQuality] = useState<Quality>("max")
  const [phase, setPhase] = useState<GenerationPhase>("idle")
  const [attempt, setAttempt] = useState(0)
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(0)
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("Популярное")
  const [thumbPage, setThumbPage] = useState(0)
  const [modelNotice, setModelNotice] = useState("")
  const [selectedModelId, setSelectedModelId] = useState<(typeof MODELS)[number]["id"]>("novai")
  const [mobilePanel, setMobilePanel] = useState<"text" | "image" | "video" | "style">("text")
  const busy = phase === "queued" || phase === "rendering"
  const selectedModel = MODELS.find((model) => model.id === selectedModelId) || MODELS[0]
  const selectedItem = SHOWCASE_TEMPLATES[selected] || SHOWCASE_TEMPLATES[0]
  const cards = useMemo(() => SHOWCASE_TEMPLATES.slice(1), [])
  const thumbSize = 6
  const thumbPages = Math.max(1, Math.ceil(SHOWCASE_TEMPLATES.length / thumbSize))
  const thumbs = SHOWCASE_TEMPLATES.slice(thumbPage * thumbSize, thumbPage * thumbSize + thumbSize)

  useEffect(() => {
    return () => {
      if (sourcePreview) URL.revokeObjectURL(sourcePreview)
    }
  }, [sourcePreview])

  const supportsMode = (modelId: (typeof MODELS)[number]["id"], targetMode: VideoMode) =>
    targetMode === "text" ? true : modelId === "magichour"

  const changeMode = (nextMode: VideoMode) => {
    if (busy || nextMode === mode) return
    setMode(nextMode)
    setSourceFile(null)
    setSourceDurationSeconds(0)
    setSourcePreview("")
    setVideoUrl("")
    setError("")
    setPhase("idle")
    if (nextMode !== "text") {
      setSelectedModelId("magichour")
      setDuration(5)
      setModelNotice(nextMode === "image"
        ? "Image → Video работает через Magic Hour: исходное фото остаётся первым кадром."
        : "Видео → Видео: Google Omni редактирует исходный клип по тексту — можно добавить, убрать, заменить или изменить детали.")
    } else {
      setModelNotice("")
    }
  }

  const readVideoDuration = (file: File) => new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    const cleanup = () => {
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(url)
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("Не удалось прочитать длительность видео."))
    }, 12_000)

    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      window.clearTimeout(timer)
      const value = Number(video.duration)
      cleanup()
      if (!Number.isFinite(value) || value <= 0) reject(new Error("Не удалось определить длительность видео."))
      else resolve(value)
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      cleanup()
      reject(new Error("Не удалось открыть видео. Используйте MP4, MOV, WebM или M4V."))
    }
    video.src = url
  })

  const handleSourceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ""
    if (!file) return
    const imageMode = mode === "image"
    const valid = imageMode ? file.type.startsWith("image/") : file.type.startsWith("video/")
    if (!valid) {
      setError(imageMode ? "Выберите изображение." : "Выберите видео.")
      return
    }

    try {
      let sourceDuration = 0
      if (!imageMode) {
        sourceDuration = await readVideoDuration(file)
        if (sourceDuration > 5.05) {
          setError(`Для Видео → Видео загрузите клип до 5 секунд. Сейчас: ${sourceDuration.toFixed(1)} сек.`)
          return
        }
        if (sourceDuration < 3) {
          setError(`Magic Hour Google Omni сейчас принимает клипы от 3 до 10 секунд. Загрузите фрагмент 3–5 секунд.`)
          return
        }
      }

      if (sourcePreview) URL.revokeObjectURL(sourcePreview)
      setSourceFile(file)
      setSourceDurationSeconds(sourceDuration)
      setSourcePreview(URL.createObjectURL(file))
      setVideoUrl("")
      setError("")
      setPhase("idle")
      if (!imageMode) {
        setDuration(5)
        setModelNotice(`Видео ${sourceDuration.toFixed(1)} сек · Google Omni. Опишите, что добавить, убрать, заменить или изменить.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось прочитать файл.")
    }
  }

  const clearSource = () => {
    setSourceFile(null)
    setSourceDurationSeconds(0)
    setSourcePreview("")
    setVideoUrl("")
    setError("")
    setPhase("idle")
  }

  const chooseDuration = (value: Duration) => {
    if (busy) return
    if (mode === "video") {
      setDuration(5)
      setSelectedModelId("magichour")
      setModelNotice("Видео → Видео обрабатывает загруженный фрагмент до 5 секунд через Magic Hour Google Omni.")
      return
    }
    setDuration(value)
    if (value === 10 && selectedModelId !== "magichour") {
      setSelectedModelId("magichour")
      setModelNotice("10 секунд → Magic Hour LTX, чтобы длительность реально соблюдалась.")
    }
  }

  const uploadSource = async () => {
    if (!sourceFile || mode === "text") return ""
    const form = new FormData()
    form.append("file", sourceFile, sourceFile.name)
    form.append("mode", mode)
    if (mode === "video") form.append("durationSeconds", String(sourceDurationSeconds))
    const response = await clientFetchWithTimeout("/api/media/video/source", { method: "POST", body: form }, 90_000)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.filePath) {
      throw new Error(data?.error || "Не удалось загрузить исходный файл.")
    }
    return String(data.filePath)
  }

  const chooseTemplate = (index: number) => {
    const item = SHOWCASE_TEMPLATES[index]
    if (!item) return
    setSelected(index)
    setPrompt(item.prompt)
    setVideoUrl("")
    setPhase("idle")
    setError("")
  }

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy) return
    if (mode !== "text" && !sourceFile) {
      setPhase("failed")
      setError(mode === "image" ? "Сначала загрузите фото." : "Сначала загрузите видео.")
      return
    }
    setError("")
    setVideoUrl("")
    setAttempt(0)

    if (!canUseGeneration("video", operator)) {
      setPhase("failed")
      setError("Сегодняшняя генерация видео на этом аккаунте уже использована. Лимит обновится завтра.")
      return
    }

    setPhase("queued")
    try {
      const sourcePath = mode === "text" ? "" : await uploadSource()
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: cleanPrompt,
            mode,
            imageUrl: mode === "image" ? sourcePath : undefined,
            sourceVideoUrl: mode === "video" ? sourcePath : undefined,
            sourceDurationSeconds: mode === "video" ? sourceDurationSeconds : undefined,
            length: mode === "video" ? 5 : duration,
            resolution: QUALITY_RESOLUTION[quality],
            ratio: ratio === "4:3" ? "16:9" : ratio,
            generateAudio: selectedModel.audio,
            provider: mode === "text" ? selectedModel.provider : "magichour",
          }),
        },
        60_000,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) throw new Error("Сегодняшняя генерация уже использована. Лимит обновится завтра.")
        throw new Error(data?.error || data?.publicError || data?.message || `Ошибка ${response.status}`)
      }

      const taskId = String(data?.taskId || "")
      if (!taskId) throw new Error("Видеомодель не вернула taskId")
      incrementUsage("video")
      setPhase("rendering")

      const statusUrl = String(data?.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(taskId)}`)
      for (let i = 0; i < 96; i += 1) {
        setAttempt(i)
        await sleep(i === 0 ? 1500 : i < 12 ? 2500 : 5000)
        const statusResponse = await clientFetchWithTimeout(statusUrl, { method: "GET" }, 30_000)
        const statusData = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) throw new Error(statusData?.error || `Status ${statusResponse.status}`)
        if (statusData?.status === "failed") throw new Error(statusData?.error || "Видеомодель не смогла завершить рендер")
        const readyUrl = String(statusData?.videoUrl || statusData?.url || "")
        if (readyUrl) {
          setVideoUrl(readyUrl)
          setPhase("ready")
          return
        }
      }
      throw new Error("Видео всё ещё рендерится. Проверьте задачу позже.")
    } catch (err) {
      setPhase("failed")
      setError(err instanceof Error ? err.message : "Генерация видео недоступна")
    }
  }

  const improvePrompt = () => {
    setPrompt((value) => value.trim()
      ? `${value.trim()} Кинематографичный свет, реалистичная физика движения, плавная работа камеры, высокая детализация и естественная динамика.`
      : DEFAULT_PROMPT)
  }

  const applyMobileStyle = (style: string) => {
    setPrompt((value) => {
      const base = value.trim() || DEFAULT_PROMPT
      return base.includes(style) ? base : `${base} ${style}`
    })
    setMobilePanel("text")
  }

  const cycleMobileDuration = () => chooseDuration(duration === 5 ? 10 : 5)

  const cycleMobileQuality = () => {
    if (busy) return
    setQuality((value) => value === "max" ? "fast" : "max")
  }

  const cycleMobileRatio = () => {
    if (busy) return
    const values: Ratio[] = ["16:9", "9:16", "1:1", "4:3"]
    const index = values.indexOf(ratio)
    setRatio(values[(index + 1) % values.length])
  }

  const cycleMobileModel = () => {
    if (busy) return
    if (mode !== "text") {
      setSelectedModelId("magichour")
      setModelNotice(mode === "video"
        ? "Видео → Видео работает через Magic Hour Google Omni."
        : "Image → Video на мобильном работает через Magic Hour.")
      return
    }
    const available = MODELS.filter((model) => duration !== 10 || model.id === "magichour")
    const index = available.findIndex((model) => model.id === selectedModelId)
    const next = available[(index + 1 + available.length) % available.length] || available[0]
    setSelectedModelId(next.id)
    setModelNotice(next.note)
  }

  const openMobileImagePicker = () => {
    if (busy) return
    if (mode !== "image") changeMode("image")
    setMobilePanel("image")
    window.setTimeout(() => mobileSourceInputRef.current?.click(), 0)
  }

  const openMobileVideoPicker = () => {
    if (busy) return
    if (mode !== "video") changeMode("video")
    setMobilePanel("video")
    window.setTimeout(() => mobileSourceInputRef.current?.click(), 0)
  }

  const downloadCurrent = () => {
    const src = videoUrl || selectedItem.src
    const anchor = document.createElement("a")
    anchor.href = src
    anchor.download = videoUrl ? "malik-video.mp4" : `${selectedItem.id}.mp4`
    anchor.target = "_blank"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const shareCurrent = async () => {
    const src = videoUrl || selectedItem.src
    try {
      const absolute = new URL(src, window.location.origin).href
      if (navigator.share) await navigator.share({ title: "MalikVideo", url: absolute })
      else await navigator.clipboard.writeText(absolute)
    } catch {}
  }

  return (
    <main className="mv2" data-view="video-generation-v2" data-phase={phase}>
      <section className="mv2__mobile-only" aria-label="Мобильная генерация видео">
        <input
          ref={mobileSourceInputRef}
          type="file"
          accept={mode === "video" ? "video/mp4,video/webm,video/quicktime,video/x-m4v" : "image/png,image/jpeg,image/webp,image/avif"}
          onChange={handleSourceChange}
          hidden
        />

        <div className="mv2m__tabs">
          <button
            type="button"
            className={mobilePanel === "text" ? "is-active" : ""}
            onClick={() => {
              if (mode !== "text") changeMode("text")
              setMobilePanel("text")
            }}
            disabled={busy}
          >
            <span className="mv2m__tab-icon">T</span>
            Текст
          </button>
          <button
            type="button"
            className={mobilePanel === "image" ? "is-active" : ""}
            onClick={() => {
              if (mode !== "image") changeMode("image")
              setMobilePanel("image")
            }}
            disabled={busy}
          >
            <ImagePlus />
            Фото
          </button>
          <button
            type="button"
            className={mobilePanel === "video" ? "is-active" : ""}
            onClick={() => {
              if (mode !== "video") changeMode("video")
              setMobilePanel("video")
            }}
            disabled={busy}
          >
            <Video />
            Видео
          </button>
          <button
            type="button"
            className={mobilePanel === "style" ? "is-active" : ""}
            onClick={() => setMobilePanel("style")}
            disabled={busy}
          >
            <SlidersHorizontal />
            Эффекты
          </button>
        </div>

        {mobilePanel === "style" ? (
          <div className="mv2m__styles">
            <button type="button" onClick={() => applyMobileStyle("Кинематографичный стиль, драматичный свет.")}>Cinematic</button>
            <button type="button" onClick={() => applyMobileStyle("Фотореализм, естественный свет и физика.")}>Realistic</button>
            <button type="button" onClick={() => applyMobileStyle("Динамичная камера, быстрый motion и энергичный монтаж.")}>Dynamic</button>
            <button type="button" onClick={() => applyMobileStyle("Мягкая атмосферная цветокоррекция и плавное движение.")}>Soft</button>
          </div>
        ) : null}

        {mobilePanel === "image" ? (
          <div className="mv2m__source">
            <button type="button" className="mv2m__source-preview" onClick={openMobileImagePicker} disabled={busy}>
              {sourcePreview && mode === "image"
                ? <img src={sourcePreview} alt="Загруженное изображение" draggable={false} />
                : <ImagePlus />}
            </button>
            <button type="button" className="mv2m__source-copy" onClick={openMobileImagePicker} disabled={busy}>
              <strong>{sourceFile?.name || "Добавить изображение"}</strong>
              <small>{sourceFile ? "Нажмите, чтобы заменить" : "JPG, PNG, WebP или AVIF"}</small>
            </button>
            {sourceFile ? <button type="button" className="mv2m__source-remove" onClick={clearSource} aria-label="Убрать изображение" disabled={busy}><X /></button> : null}
          </div>
        ) : null}

        {mobilePanel === "video" ? (
          <div className="mv2m__source mv2m__source--video">
            <button type="button" className="mv2m__source-preview" onClick={openMobileVideoPicker} disabled={busy}>
              {sourcePreview && mode === "video"
                ? <video src={sourcePreview} muted playsInline preload="metadata" />
                : <Video />}
            </button>
            <button type="button" className="mv2m__source-copy" onClick={openMobileVideoPicker} disabled={busy}>
              <strong>{sourceFile?.name || "Добавить видео"}</strong>
              <small>
                {sourceFile && mode === "video"
                  ? `${sourceDurationSeconds.toFixed(1)} сек · AI-редактирование`
                  : "MP4, MOV, WebM · фрагмент 3–5 сек"}
              </small>
            </button>
            {sourceFile ? <button type="button" className="mv2m__source-remove" onClick={clearSource} aria-label="Убрать видео" disabled={busy}><X /></button> : null}
          </div>
        ) : null}

        <div className="mv2m__prompt">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value.slice(0, 2000))}
            placeholder="Опишите, какое видео вы хотите создать..."
            disabled={busy}
          />
          <div className="mv2m__prompt-foot">
            <div className="mv2m__prompt-tools">
              <button type="button" onClick={openMobileImagePicker} aria-label="Загрузить изображение" disabled={busy}><ImagePlus /></button>
              <button type="button" onClick={openMobileVideoPicker} aria-label="Загрузить видео до 5 секунд" disabled={busy}><Video /></button>
              <button type="button" onClick={improvePrompt} aria-label="Улучшить промпт" disabled={busy}><Sparkles /></button>
              <button type="button" onClick={() => setMobilePanel((value) => value === "style" ? "text" : "style")} aria-label="Стиль и эффекты" disabled={busy}><SlidersHorizontal /></button>
            </div>
            <div className="mv2m__counter">
              <span>{prompt.length}/2000</span>
              <button type="button" onClick={() => setPrompt("")} aria-label="Очистить запрос" disabled={busy || !prompt}><X /></button>
            </div>
          </div>
        </div>

        <div className="mv2m__controls">
          <button type="button" onClick={cycleMobileDuration} disabled={busy || mode === "video"}><Clock3 /><span>{mode === "video" ? "до 5 сек" : `${duration} секунд`}</span></button>
          <button type="button" onClick={cycleMobileQuality} disabled={busy}><Monitor /><span>{QUALITY_RESOLUTION[quality]}</span></button>
          <button type="button" onClick={cycleMobileRatio} disabled={busy}><RectangleHorizontal /><span>{ratio}</span></button>
          <button type="button" onClick={cycleMobileModel} disabled={busy}><Box /><span>{mode === "video" ? "Google Omni" : selectedModel.name.split(" · ")[0]}</span><small>⌄</small></button>
        </div>

        <button
          type="button"
          className="mv2m__generate"
          onClick={generate}
          disabled={busy || !prompt.trim() || (mode !== "text" && !sourceFile)}
        >
          <Play />
          <span>{busy ? statusLabel(phase, attempt) : mode === "video" ? "Изменить видео" : "Генерировать"}</span>
        </button>

        <div className="mv2m__brand"><Crown />Превращай идеи в реальность с Malik AI</div>
        {(error || phase === "ready") ? (
          <div className={`mv2m__status${error ? " is-error" : ""}`}>
            {error || "Видео готово"}
            {videoUrl ? <button type="button" onClick={() => window.open(videoUrl, "_blank", "noopener,noreferrer")}>Открыть</button> : null}
          </div>
        ) : null}

        <div className="mv2m__examples-head">
          <span>Примеры видео</span>
          <small>{SHOWCASE_TEMPLATES.length}</small>
        </div>
        <div className="mv2m__examples">
          {SHOWCASE_TEMPLATES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={selected === index ? "is-active" : ""}
              onClick={() => {
                chooseTemplate(index)
                if (mode !== "text") changeMode("text")
                setMobilePanel("text")
              }}
              disabled={busy}
            >
              <PosterAsset item={item} className="mv2m__example-poster" />
              <span className="mv2m__example-play"><Play /></span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="mv2__preview-column">
        <div className="mv2__stage">
          <div className="mv2__stage-brand mv2__stage-brand--left"><span>IDEAS TO REALITY</span><small>WITH AI</small></div>
          <div className="mv2__stage-brand mv2__stage-brand--right">MALIK AI</div>
          <div className="mv2__media">
            {videoUrl ? (
              <video src={videoUrl} controls autoPlay playsInline preload="metadata" className="mv2__result" />
            ) : sourcePreview && mode === "image" ? (
              <img src={sourcePreview} alt="Загруженное фото" className="mv2__source-image" draggable={false} />
            ) : sourcePreview && mode === "video" ? (
              <video src={sourcePreview} controls muted playsInline preload="metadata" className="mv2__source-video" />
            ) : (
              <HeroVideo item={selectedItem} />
            )}
          </div>
          {busy ? (
            <div className="mv2__rendering">
              <div className="mv2__render-box"><Sparkles size={34} /></div>
              <strong>{statusLabel(phase, attempt)}</strong>
              <small>{selectedModel.name} · {ratio} · {duration}s · {selectedModel.audio ? "Audio" : "Video"}</small>
            </div>
          ) : null}
        </div>

        <div className="mv2__thumb-strip">
          <button className="mv2__arrow" type="button" onClick={() => setThumbPage((page) => (page - 1 + thumbPages) % thumbPages)} aria-label="Предыдущие видео"><ChevronLeft /></button>
          <div className="mv2__thumbs">
            {thumbs.map((item, index) => {
              const actualIndex = thumbPage * thumbSize + index
              return (
                <button key={item.id} type="button" className={`mv2__thumb${selected === actualIndex ? " is-active" : ""}`} onClick={() => chooseTemplate(actualIndex)}>
                  <PosterAsset item={item} className="mv2__thumb-poster" />
                  <span>{String(actualIndex + 1).padStart(2, "0")}</span>
                </button>
              )
            })}
          </div>
          <button className="mv2__arrow" type="button" onClick={() => setThumbPage((page) => (page + 1) % thumbPages)} aria-label="Следующие видео"><ChevronRight /></button>
        </div>

        <div className="mv2__preview-info">
          <div className="mv2__preview-copy">
            <h3>{videoUrl ? "Готовое видео" : selectedItem.title}</h3>
            <p>{videoUrl ? "Результат MalikVideo без дополнительного перекодирования интерфейсом." : selectedItem.prompt}</p>
            <div className="mv2__chips"><span>{duration} секунд</span><span>{QUALITY_RESOLUTION[quality]}</span><span>{ratio}</span><span>{selectedModel.name}</span><span>{selectedModel.audio ? "Audio" : "Video"}</span></div>
          </div>
          <div className="mv2__preview-actions">
            <button type="button" onClick={downloadCurrent}><Download /><span>Скачать</span></button>
            <button type="button" onClick={shareCurrent}><Share2 /><span>Поделиться</span></button>
            <button type="button" onClick={() => onViewChange("projects")}><FolderPlus /><span>В проект</span></button>
          </div>
        </div>
      </section>

      <section className="mv2__controls-column">
        <div className="mv2__mode-tabs">
          {([
            ["text", "Текст → Видео"],
            ["image", "Изображение → Видео"],
            ["video", "Видео → Видео"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={mode === value ? "is-active" : ""}
              type="button"
              aria-pressed={mode === value}
              onClick={() => changeMode(value)}
              disabled={busy}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mv2__eyebrow">MALIK VIDEO</div>
        <h1>Создавайте невероятные видео</h1>
        <p className="mv2__lead">{mode === "text"
          ? "Опишите идею — Malik AI подготовит сцену, движение камеры и звук."
          : mode === "image"
            ? "Загрузите исходное фото и опишите движение. Malik AI сохранит его как первый кадр и оживит по запросу."
            : "Загрузите исходное видео и опишите изменение. Malik AI сохранит основу и реалистично добавит нужные детали."}</p>

        <div className="mv2__prompt-card">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 2000))} placeholder="Опишите, какое видео вы хотите создать..." disabled={busy} />
          <div className="mv2__prompt-foot">
            <div className="mv2__helper-row">
              <button type="button" onClick={() => setPrompt(DEFAULT_PROMPT)}><Sparkles />Подсказки</button>
              <button type="button" onClick={() => setPrompt((value) => value.trim() ? `${value.trim()} Кинематографичный свет, физически правдоподобное движение камеры, детализированный кадр, естественный звук.` : DEFAULT_PROMPT)}><Sparkles />Улучшить промпт</button>
              <button type="button" onClick={() => chooseTemplate(1)}><ImagePlus />Примеры</button>
            </div>
            <span className="mv2__count">{prompt.length}/2000</span>
          </div>
        </div>

        {mode !== "text" ? (
          <div className="mv2__source-card">
            <input
              ref={sourceInputRef}
              type="file"
              accept={mode === "image" ? "image/png,image/jpeg,image/webp,image/avif" : "video/mp4,video/webm,video/quicktime,video/x-m4v"}
              onChange={handleSourceChange}
              hidden
            />
            <div className="mv2__source-preview">
              {sourcePreview ? (
                mode === "image"
                  ? <img src={sourcePreview} alt="" draggable={false} />
                  : <video src={sourcePreview} muted playsInline preload="metadata" />
              ) : (
                <Upload />
              )}
            </div>
            <div className="mv2__source-copy">
              <strong>{sourceFile?.name || (mode === "image" ? "Исходное фото" : "Исходное видео")}</strong>
              <small>{sourceFile
                ? mode === "image"
                  ? "Фото будет сохранено как исходный первый кадр."
                  : "Оригинальное видео будет основой для AI-редактирования."
                : mode === "image"
                  ? "PNG, JPG, WebP или AVIF"
                  : "MP4, WebM, MOV или M4V · 3–5 секунд"}</small>
            </div>
            <button className="mv2__source-upload" type="button" onClick={() => sourceInputRef.current?.click()} disabled={busy}>
              <Upload />{sourceFile ? "Заменить" : "Загрузить"}
            </button>
            {sourceFile ? <button className="mv2__source-clear" type="button" onClick={clearSource} aria-label="Убрать файл" disabled={busy}><X /></button> : null}
          </div>
        ) : null}

        <div className="mv2__daily-note">1 генерация видео в день на один аккаунт</div>

        <div className="mv2__section-title">Модель <Info /></div>
        <div className="mv2__models">
          {MODELS.map((model) => {
            const active = model.id === selectedModelId
            return (
              <button
                key={model.id}
                type="button"
                className={`mv2__model${active ? " is-active" : ""}${model.featured ? " is-featured" : ""}`}
                onClick={() => {
                  setSelectedModelId(model.id)
                  setModelNotice(model.note)
                }}
                aria-pressed={active}
                disabled={!supportsMode(model.id, mode) || (duration === 10 && model.id !== "magichour")}
                title={!supportsMode(model.id, mode) ? "Этот режим сейчас работает через Magic Hour LTX" : duration === 10 && model.id !== "magichour" ? "10 секунд сейчас гарантируются через Magic Hour LTX" : model.note}
              >
                <span className="mv2__model-icon"><img src={model.icon} alt="" draggable={false} /></span>
                <span className="mv2__model-copy"><strong>{model.name}</strong><small>{model.subtitle}</small></span>
                <span className="mv2__tier is-free">{model.tier}</span>
              </button>
            )
          })}
        </div>
        {modelNotice ? <div className="mv2__model-notice">{modelNotice}</div> : null}

        <div className="mv2__settings-grid">
          <div><div className="mv2__section-title">Качество <Info /></div><div className="mv2__segments"><button type="button" aria-pressed={quality === "fast"} className={quality === "fast" ? "is-active" : ""} onClick={() => setQuality("fast")} disabled={busy}>720p · Быстро</button><button type="button" aria-pressed={quality === "max"} className={quality === "max" ? "is-active" : ""} onClick={() => setQuality("max")} disabled={busy}>1080p · Max</button><button type="button" className="is-disabled" disabled>2K · Pro</button></div></div>
          <div><div className="mv2__section-title">Длительность</div><div className="mv2__segments">{([5, 10] as Duration[]).map((value) => <button key={value} type="button" aria-pressed={duration === value} className={duration === value ? "is-active" : ""} onClick={() => chooseDuration(value)} disabled={busy}>{value} сек</button>)}<button type="button" className="is-disabled" disabled>16 сек · Pro</button></div></div>
          <div><div className="mv2__section-title">Соотношение сторон</div><div className="mv2__segments">{(["16:9", "9:16", "1:1", "4:3"] as Ratio[]).map((value) => <button key={value} type="button" aria-pressed={ratio === value} className={ratio === value ? "is-active" : ""} onClick={() => setRatio(value)} disabled={busy}>{value}</button>)}</div></div>
        </div>

        <div className="mv2__generate-row"><button type="button" className="mv2__generate" onClick={generate} disabled={busy || !prompt.trim() || (mode !== "text" && !sourceFile)}><span>{busy ? statusLabel(phase, attempt) : mode === "image" ? `Оживить фото · ${duration} сек` : mode === "video" ? `Изменить видео · ${duration} сек` : "Сгенерировать видео"}</span><ArrowUp /></button><div className="mv2__credits">◉ 1 видео / день</div><button type="button" className="mv2__tune"><SlidersHorizontal /></button></div>
        <div className="mv2__status"><span className={`mv2__status-dot is-${phase}`} />{statusLabel(phase, attempt)}{error ? <b>{error}</b> : null}</div>

        <div className="mv2__gallery-tabs">{CATEGORIES.map((item) => <button key={item} type="button" className={activeCategory === item ? "is-active" : ""} onClick={() => setActiveCategory(item)}>{item}</button>)}</div>
        <div className="mv2__gallery">
          {cards.map((item, index) => (
            <button key={item.id} type="button" className={`mv2__gallery-card${selected === index + 1 ? " is-active" : ""}`} onClick={() => chooseTemplate(index + 1)}>
              <PosterAsset item={item} className="mv2__gallery-poster" />
              <span className="mv2__gallery-shade" />
              <span className="mv2__gallery-copy"><strong>{item.title}</strong><small>{item.theme} · 1080p</small></span>
            </button>
          ))}
        </div>
      </section>

      <style jsx>{`
        .mv2{width:100%;min-height:100%;display:grid;grid-template-columns:minmax(460px,.94fr) minmax(560px,1.06fr);gap:18px;padding:14px 18px 30px;background:#000;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:auto;color-scheme:dark}
        .mv2 *{box-sizing:border-box}.mv2 button,.mv2 textarea{font:inherit}.mv2 button{cursor:pointer}.mv2 button:focus-visible,.mv2 textarea:focus-visible{outline:1px solid rgba(255,255,255,.58);outline-offset:2px}
        .mv2__mobile-only{display:none}
        .mv2m__tabs,.mv2m__styles,.mv2m__source,.mv2m__prompt,.mv2m__controls,.mv2m__generate,.mv2m__brand,.mv2m__status{box-sizing:border-box}
        .mv2__preview-column,.mv2__controls-column{min-width:0}.mv2__stage,.mv2__prompt-card,.mv2__preview-info{border:1px solid #272a31;background:#0c0f14;border-radius:16px}
        .mv2__stage{position:relative;aspect-ratio:16/10.4;overflow:hidden;background:#06080c}.mv2__media{position:absolute;inset:0;display:grid;place-items:center;background:#050608}.mv2__hero-video,.mv2__result,.mv2__source-image,.mv2__source-video{width:100%;height:100%;display:block;background:#050608;object-fit:contain}.mv2__stage:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 22%,transparent 70%,rgba(0,0,0,.36))}
        .mv2__stage-brand{position:absolute;z-index:2;top:24px;color:#d9e0eb;letter-spacing:.36em;font-size:11px}.mv2__stage-brand--left{left:28px;display:flex;flex-direction:column;gap:10px}.mv2__stage-brand--left small{font-size:9px}.mv2__stage-brand--right{right:26px}.mv2__rendering{position:absolute;z-index:4;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}.mv2__render-box{width:96px;height:96px;border-radius:24px;border:1px solid rgba(255,255,255,.17);display:grid;place-items:center;background:#0c0e12;animation:mv2pulse 1.7s ease-in-out infinite}.mv2__rendering strong{font-size:14px}.mv2__rendering small{color:#939aa7;font-size:11px}@keyframes mv2pulse{50%{transform:scale(1.035);box-shadow:0 24px 70px rgba(0,0,0,.6)}}
        .mv2__thumb-strip{display:grid;grid-template-columns:28px 1fr 28px;gap:7px;align-items:center;margin-top:12px}.mv2__thumbs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.mv2__arrow{width:28px;height:76px;border:0;background:transparent;color:#b9c2d1;display:grid;place-items:center}.mv2__arrow svg{width:18px;height:18px}.mv2__thumb{position:relative;height:76px;border:1px solid #262a31;border-radius:10px;overflow:hidden;background:#0b0e13;padding:0}.mv2__thumb.is-active{border-color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.mv2__thumb-poster{width:100%;height:100%;object-fit:cover;display:block}.mv2__thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.72))}.mv2__thumb span{position:absolute;z-index:2;left:7px;bottom:5px;font-size:9px;color:#dce2ec}
        .mv2__preview-info{margin-top:12px;padding:15px;display:grid;grid-template-columns:1fr 132px;gap:15px}.mv2__preview-copy h3{margin:0 0 8px;font-size:17px}.mv2__preview-copy p{margin:0;color:#9ca4b2;font-size:12px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mv2__chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.mv2__chips span{height:28px;padding:0 9px;border:1px solid #292d34;border-radius:999px;background:#12161d;color:#adb5c2;display:inline-flex;align-items:center;font-size:10px}.mv2__preview-actions{display:flex;flex-direction:column;gap:7px}.mv2__preview-actions button{height:35px;border:1px solid #2c3038;border-radius:9px;background:#12161d;color:#edf1f7;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px}.mv2__preview-actions svg{width:14px;height:14px}
        .mv2__controls-column{position:relative;padding:5px 0 24px}.mv2__mode-tabs{position:absolute;right:0;top:0;display:flex;border:1px solid #1d2027;background:#0b0d11;border-radius:12px;padding:3px;overflow:hidden}.mv2__mode-tabs button{height:34px;border:0;border-radius:9px;background:transparent;color:#8e96a4;padding:0 13px;font-size:10px;white-space:nowrap}.mv2__mode-tabs button.is-active{background:#f4f4f5 !important;color:#050505 !important;box-shadow:inset 0 0 0 1px #fff}.mv2__mode-tabs button:disabled{cursor:not-allowed;opacity:.6}.mv2__eyebrow{margin-top:13px;color:#707887;letter-spacing:.28em;font-size:10px}.mv2 h1{margin:14px 0 6px;font-size:clamp(34px,3.2vw,52px);line-height:1;letter-spacing:-.05em}.mv2__lead{margin:0 0 15px;color:#929aa8;font-size:13px}
        .mv2__prompt-card{padding:12px}.mv2__prompt-card textarea{width:100%;height:106px;border:0;outline:0;resize:none;background:transparent;color:#fff;font-size:14px;line-height:1.5;padding:3px}.mv2__prompt-card textarea::placeholder{color:#6f7887}.mv2__source-card{margin-top:9px;min-height:64px;padding:8px;border:1px solid #272a31;border-radius:12px;background:#0c0f14;display:grid;grid-template-columns:48px minmax(0,1fr) auto auto;align-items:center;gap:9px}.mv2__source-preview{width:48px;height:48px;border-radius:9px;overflow:hidden;border:1px solid #2d323b;background:#12161d;display:grid;place-items:center;color:#aeb6c4}.mv2__source-preview img,.mv2__source-preview video{width:100%;height:100%;object-fit:cover;display:block}.mv2__source-preview svg{width:19px}.mv2__source-copy{min-width:0;display:flex;flex-direction:column;gap:4px}.mv2__source-copy strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2__source-copy small{font-size:8px;color:#858d9b;line-height:1.35}.mv2__source-upload,.mv2__source-clear{height:34px;border:1px solid #303540;border-radius:9px;background:#151922;color:#eef2f8;display:flex;align-items:center;justify-content:center;gap:6px}.mv2__source-upload{padding:0 10px;font-size:9px}.mv2__source-upload svg,.mv2__source-clear svg{width:13px;height:13px}.mv2__source-clear{width:34px;padding:0}.mv2__daily-note{margin-top:8px;color:#7e8795;font-size:9px}.mv2__prompt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.mv2__helper-row{display:flex;gap:6px;flex-wrap:wrap}.mv2__helper-row button{height:30px;border:1px solid #2a2e36;border-radius:8px;background:#151922;color:#cbd2dd;display:flex;align-items:center;gap:5px;padding:0 9px;font-size:9px}.mv2__helper-row svg{width:12px;height:12px}.mv2__count{font-size:9px;color:#777f8d;white-space:nowrap}
        .mv2__section-title{display:flex;align-items:center;gap:5px;margin:15px 0 8px;font-size:12px;font-weight:750}.mv2__section-title svg{width:13px;height:13px}.mv2__models{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.mv2__model{position:relative;min-width:0;height:66px;padding:8px;border:1px solid #272b33;border-radius:11px;background:#0f131a;color:#fff;display:flex;align-items:center;gap:7px;text-align:left;overflow:hidden}.mv2__model.is-active{border-color:#fff !important;background:#171c24 !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32) !important}.mv2__model:disabled{opacity:.38;cursor:not-allowed}.mv2__model.is-featured{grid-column:1/-1;height:72px;background:#121720}.mv2__model-icon{width:34px;height:34px;flex:0 0 34px;border-radius:8px;background:#fff;display:grid;place-items:center;overflow:hidden}.mv2__model-icon img{width:22px;height:22px;object-fit:contain}.mv2__model-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.mv2__model-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}.mv2__model-copy small{color:#858d9b;font-size:8px}.mv2__tier{position:absolute;right:6px;top:5px;padding:2px 5px;border-radius:999px;font-size:7px}.mv2__tier.is-free{background:#fff;color:#000}.mv2__tier.is-pro{background:#252935;color:#c9d0db}.mv2__model-notice{margin-top:8px;color:#aeb6c4;font-size:10px}
        .mv2__settings-grid{display:grid;grid-template-columns:1.1fr 1fr 1.3fr;gap:10px}.mv2__segments{display:flex;flex-wrap:wrap;gap:6px}.mv2__segments button{height:31px;padding:0 10px;border:1px solid #2a2e36;border-radius:8px;background:#11151c;color:#aeb6c4;font-size:9px}.mv2__segments button.is-active{background:#f4f4f5 !important;color:#050505 !important;border-color:#fff !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.45)}.mv2__segments button.is-disabled{opacity:.45;cursor:default}.mv2__generate-row{display:grid;grid-template-columns:1fr auto 38px;gap:8px;align-items:center;margin-top:18px}.mv2__generate{height:46px;border:0;border-radius:12px;background:#fff;color:#050505;font-weight:800;display:flex;align-items:center;justify-content:center;gap:10px}.mv2__generate:disabled{opacity:.5;cursor:not-allowed}.mv2__generate svg{width:17px}.mv2__credits{font-size:9px;color:#8f97a5}.mv2__tune{height:38px;border:1px solid #292d35;border-radius:10px;background:#11151b;color:#ddd;display:grid;place-items:center}.mv2__tune svg{width:16px}.mv2__status{display:flex;align-items:center;gap:7px;min-height:32px;color:#8992a0;font-size:9px}.mv2__status b{color:#f4a6a6;font-weight:600}.mv2__status-dot{width:6px;height:6px;border-radius:50%;background:#666}.mv2__status-dot.is-ready{background:#39d98a}.mv2__status-dot.is-rendering,.mv2__status-dot.is-queued{background:#f5c451}.mv2__status-dot.is-failed{background:#ff6b6b}
        .mv2__gallery-tabs{display:flex;gap:5px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none}.mv2__gallery-tabs::-webkit-scrollbar{display:none}.mv2__gallery-tabs button{height:29px;padding:0 10px;border:1px solid #22262d;border-radius:999px;background:#0d1016;color:#89919f;font-size:8px;white-space:nowrap}.mv2__gallery-tabs button.is-active{background:#fff;color:#000}.mv2__gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.mv2__gallery-card{position:relative;aspect-ratio:16/10;border:1px solid #20242b;border-radius:10px;overflow:hidden;padding:0;background:#080a0d}.mv2__gallery-card.is-active{border-color:#fff}.mv2__gallery-poster{width:100%;height:100%;object-fit:cover;display:block}.mv2__gallery-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,.84))}.mv2__gallery-copy{position:absolute;z-index:2;left:8px;right:8px;bottom:7px;display:flex;flex-direction:column;text-align:left}.mv2__gallery-copy strong{font-size:9px;color:#fff}.mv2__gallery-copy small{font-size:7px;color:#aab2bf;margin-top:2px}
        @media (max-width:1180px){.mv2{grid-template-columns:1fr;padding:14px}.mv2__preview-column{order:2}.mv2__controls-column{order:1}.mv2__models{grid-template-columns:repeat(3,minmax(0,1fr))}.mv2__gallery{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @media (max-width:820px){
          .mv2{display:block;min-height:100%;padding:0;background:#000;overflow:visible}
          .mv2__preview-column,.mv2__controls-column{display:none !important}
          .mv2__mobile-only{display:block;width:100%;max-width:560px;margin:0 auto;padding:8px 10px 22px;background:#000;color:#f7f7f8}
          .mv2m__tabs{height:44px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-bottom:1px solid #24272d}
          .mv2m__tabs button{position:relative;min-width:0;border:0;background:transparent;color:#8b919b;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 3px;font-size:9px;white-space:nowrap}
          .mv2m__tabs button svg{width:12px;height:12px;flex:0 0 12px}.mv2m__tab-icon{font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:14px}
          .mv2m__tabs button.is-active{color:#38ff58}.mv2m__tabs button.is-active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#38ff58;box-shadow:0 0 12px rgba(56,255,88,.55)}
          .mv2m__styles{display:flex;gap:6px;overflow-x:auto;padding:9px 0 0;scrollbar-width:none}.mv2m__styles::-webkit-scrollbar{display:none}
          .mv2m__styles button{height:29px;flex:0 0 auto;padding:0 10px;border:1px solid #2a2e35;border-radius:9px;background:#111318;color:#b8bec8;font-size:9px}
          .mv2m__source{margin-top:9px;min-height:58px;padding:7px;border:1px solid #2b2e35;border-radius:12px;background:#0e1014;display:grid;grid-template-columns:44px minmax(0,1fr) 30px;gap:8px;align-items:center}
          .mv2m__source-preview{width:44px;height:44px;padding:0;border:1px solid #30343b;border-radius:9px;background:#14171c;color:#bfc5cd;display:grid;place-items:center;overflow:hidden}.mv2m__source-preview svg{width:18px;height:18px}.mv2m__source-preview img,.mv2m__source-preview video{width:100%;height:100%;object-fit:cover;display:block}
          .mv2m__source-copy{min-width:0;padding:0;border:0;background:transparent;color:#fff;text-align:left;display:flex;flex-direction:column;gap:3px}.mv2m__source-copy strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2m__source-copy small{font-size:8px;color:#818894}
          .mv2m__source-remove{width:30px;height:30px;border:0;border-radius:50%;background:#2d3036;color:#aeb4bd;display:grid;place-items:center}.mv2m__source-remove svg{width:13px;height:13px}
          .mv2m__prompt{margin-top:8px;padding:11px 10px 9px;border:1px solid #2b2e35;border-radius:14px;background:linear-gradient(180deg,#101216,#0d0f12);box-shadow:inset 0 1px 0 rgba(255,255,255,.018)}
          .mv2m__prompt textarea{width:100%;height:75px;resize:none;border:0;outline:0;background:transparent;color:#f7f7f8;font-size:11px;line-height:1.45;padding:0}.mv2m__prompt textarea::placeholder{color:#717783}
          .mv2m__prompt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.mv2m__prompt-tools{display:flex;gap:7px}.mv2m__prompt-tools button{width:29px;height:29px;padding:0;border:1px solid #2c3037;border-radius:8px;background:#14171c;color:#c1c6ce;display:grid;place-items:center}.mv2m__prompt-tools button svg{width:14px;height:14px}
          .mv2m__counter{display:flex;align-items:center;gap:7px;color:#777e89;font-size:8px}.mv2m__counter button{width:20px;height:20px;padding:0;border:0;border-radius:50%;background:#343840;color:#aeb4bd;display:grid;place-items:center}.mv2m__counter button svg{width:11px;height:11px}
          .mv2m__controls{display:grid;grid-template-columns:1fr 1fr .9fr 1.2fr;gap:6px;margin-top:8px}
          .mv2m__controls button{min-width:0;height:38px;padding:0 7px;border:1px solid #2b2e35;border-radius:10px;background:#111318;color:#bcc2cb;display:flex;align-items:center;justify-content:center;gap:5px;font-size:9px;white-space:nowrap}.mv2m__controls button svg{width:13px;height:13px;flex:0 0 13px}.mv2m__controls button span{overflow:hidden;text-overflow:ellipsis}.mv2m__controls button small{font-size:8px;color:#858c96}
          .mv2m__generate{width:100%;height:48px;margin-top:8px;border:0;border-radius:12px;background:#39f75a;color:#041107;font-weight:850;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 0 22px rgba(57,247,90,.16)}.mv2m__generate svg{width:15px;height:15px;fill:currentColor}.mv2m__generate:disabled{opacity:.48;cursor:not-allowed}
          .mv2m__brand{margin-top:13px;color:#9fa6b0;font-size:8px;display:flex;align-items:center;justify-content:center;gap:6px}.mv2m__brand svg{width:13px;height:13px;color:#39f75a}
          .mv2m__status{margin-top:8px;min-height:28px;padding:7px 9px;border:1px solid #26302a;border-radius:9px;background:#0c130e;color:#8ee89d;font-size:9px;display:flex;align-items:center;justify-content:space-between;gap:8px}.mv2m__status.is-error{border-color:#3c2828;background:#160d0d;color:#f0a0a0}.mv2m__status button{border:0;background:transparent;color:inherit;text-decoration:underline;font-size:9px}
          .mv2m__examples-head{margin-top:16px;display:flex;align-items:center;justify-content:space-between;color:#d8dde4;font-size:10px;font-weight:750}.mv2m__examples-head small{color:#737b86;font-size:8px}
          .mv2m__examples{display:flex;gap:7px;margin-top:8px;overflow-x:auto;padding-bottom:3px;scrollbar-width:none}.mv2m__examples::-webkit-scrollbar{display:none}
          .mv2m__examples>button{position:relative;flex:0 0 112px;height:76px;padding:0;border:1px solid #242830;border-radius:10px;overflow:hidden;background:#090b0e;color:#fff}.mv2m__examples>button.is-active{border-color:#39f75a;box-shadow:0 0 0 1px rgba(57,247,90,.12)}
          .mv2m__example-poster{width:100%;height:100%;display:block;object-fit:cover}.mv2m__examples>button:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.78))}
          .mv2m__example-play{position:absolute;z-index:2;left:8px;top:8px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.62);display:grid;place-items:center}.mv2m__example-play svg{width:10px;height:10px;fill:#fff}
          .mv2m__examples strong{position:absolute;z-index:2;left:7px;right:6px;bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-size:8px}
        }
        @media (max-width:380px){.mv2m__controls{grid-template-columns:1fr 1fr}.mv2m__tabs button{font-size:7.5px;gap:3px}.mv2m__tabs button svg{width:11px;height:11px}.mv2__mobile-only{padding-left:8px;padding-right:8px}}
      `}</style>
    </main>
  )
}
