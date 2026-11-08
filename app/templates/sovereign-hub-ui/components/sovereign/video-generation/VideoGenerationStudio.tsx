"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ArrowUp,
  Box,
  Camera,
  Clock3,
  Crown,
  Monitor,
  Play,
  RectangleHorizontal,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderPlus,
  History,
  ImagePlus,
  Info,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react"
import { takePrefillPrompt } from "@/lib/malik-context"
import type { VideoProviderId } from "@/lib/media/types"
import { deliverGeneratedVideo, malikVideoStreamUrl, VideoDeliveryError, type VerifiedVideo } from "@/lib/media/browser-video-qa"
import { exportBrandedMalikVideo } from "@/lib/media/browser-video-branding"

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
type GenerationPhase = "idle" | "queued" | "rendering" | "checking" | "ready" | "failed"
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

async function videoFetch(path: string, init: RequestInit = {}, timeoutMs = 120_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "")
    if (controller.signal.aborted) throw new Error("Сервер видео отвечает слишком долго. Попробуйте ещё раз.")
    if (/load failed|failed to fetch|network/i.test(message)) {
      throw new Error("Не удалось связаться с MalikVideo. Проверьте сеть и повторите генерацию.")
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

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
    subtitle: "720p · 1 видео/день",
    tier: "Free",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://aiapi-pro.com",
    featured: true,
    audio: false,
    note: "Бесплатная видеомодель. Доступ зависит от лимитов провайдера.",
  },
  {
    id: "magichour",
    provider: "magichour",
    name: "Magic Hour · LTX",
    subtitle: "480p · Malik PRO",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://magichour.ai",
    featured: false,
    audio: true,
    note: "Magic Hour использует бесплатные кредиты аккаунта; доступ зависит от оставшихся daily claims.",
  },
  {
    id: "pixazo",
    provider: "pixazo",
    name: "Pixazo · LTX",
    subtitle: "Preview · Malik PRO",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://pixazo.ai",
    featured: false,
    audio: false,
    note: "Pixazo LTX Free работает в preview/fair-use режиме.",
  },
  {
    id: "cliptaps",
    provider: "cliptaps",
    name: "ClipTaps",
    subtitle: "До 3 сцен · Malik PRO",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://cliptaps.com",
    featured: false,
    audio: true,
    note: "ClipTaps — резервный daily-провайдер; результат может содержать watermark и автоматически созданный голос.",
  },
  {
    id: "runway",
    provider: "runway",
    name: "Runway · Video Edit",
    subtitle: "Видео → Видео · Gemini Omni Flash",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://runwayml.com",
    featured: false,
    audio: true,
    note: "Runway редактирует исходное видео по тексту и служит резервом, если Magic Hour недоступен.",
  },
] as const

// Keep the desktop model cards unchanged; the mobile picker exposes every video
// provider accepted by /api/media/video.
const MOBILE_MODELS = [
  ...MODELS,
  { id: "h3", provider: "h3", name: "MalikVideo 1.0", subtitle: "Malik AI", tier: "Pro", icon: "/brand/malik-mark.svg", featured: false, audio: false, note: "MalikVideo 1.0" },
  { id: "dashscope", provider: "dashscope", name: "Wan · DashScope", subtitle: "Alibaba Cloud", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://alibabacloud.com", featured: false, audio: false, note: "Wan через DashScope" },
  { id: "pollo", provider: "pollo", name: "Pollo AI", subtitle: "Pollo Video", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://pollo.ai", featured: false, audio: false, note: "Pollo AI Video" },
  { id: "fal", provider: "fal", name: "fal.ai", subtitle: "fal Video", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://fal.ai", featured: false, audio: false, note: "fal.ai Video" },
  { id: "luma", provider: "luma", name: "Luma", subtitle: "Luma Video", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://lumalabs.ai", featured: false, audio: false, note: "Luma Video" },
  { id: "veo", provider: "veo", name: "Google Veo", subtitle: "Veo Video", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://deepmind.google", featured: false, audio: true, note: "Google Veo Video" },
] as const

const CATEGORIES = ["Популярное", "Кинематографичные", "Анимация", "Реалистичные", "Природа", "Технологии", "Люди", "Продукты"] as const

// Which examples each gallery tab shows; «Популярное» shows them all.
const CATEGORY_TEMPLATES: Record<(typeof CATEGORIES)[number], readonly string[] | null> = {
  "Популярное": null,
  "Кинематографичные": ["malik-epic-motion", "malik-ancient-worlds", "malik-transformer-flight", "malik-cloud-road"],
  "Анимация": ["malik-animated-city", "malik-storybook-cat"],
  "Реалистичные": ["malik-ancient-worlds", "malik-alpine-flight", "malik-product-serum", "malik-cloud-road"],
  "Природа": ["malik-ancient-worlds", "malik-alpine-flight", "malik-storybook-cat"],
  "Технологии": ["malik-mecha-impact", "malik-transformer-flight", "malik-animated-city"],
  "Люди": ["malik-animated-city", "malik-alpine-flight", "malik-epic-motion"],
  "Продукты": ["malik-product-serum", "malik-cloud-road"],
}

// Camera moves, as in professional video tools: one tap writes the move into
// the prompt, a second tap takes it out.
const CAMERA_MOVES = [
  { id: "dolly-in", label: "Наезд", text: "Камера: плавный наезд (dolly in) к главному объекту." },
  { id: "dolly-out", label: "Отъезд", text: "Камера: отъезд назад (dolly out), раскрывая всё окружение." },
  { id: "orbit", label: "Облёт 360°", text: "Камера: облёт вокруг объекта на 360° (orbit)." },
  { id: "crane", label: "Кран вверх", text: "Камера: подъём на кране вверх (crane up) с раскрытием панорамы." },
  { id: "fpv", label: "FPV-дрон", text: "Камера: стремительный FPV-пролёт дроном сквозь сцену." },
  { id: "tracking", label: "Слежение", text: "Камера: следует за героем сбоку (tracking shot) на одной скорости." },
  { id: "handheld", label: "Ручная", text: "Камера: живая ручная съёмка (handheld) с лёгким естественным покачиванием." },
  { id: "crash-zoom", label: "Зум-удар", text: "Камера: резкий кинематографичный зум (crash zoom) на ключевой момент." },
  { id: "bullet-time", label: "Bullet time", text: "Камера: эффект bullet time, время почти останавливается, камера облетает момент." },
  { id: "static", label: "Статика", text: "Камера: неподвижный штатив, движется только сцена." },
] as const

const ENHANCE_TEXT = "Кинематографичный свет, физически правдоподобное движение, плавная работа камеры, высокая детализация кадра и естественный звук."

type ActiveVideoJob = { taskId: string; statusUrl: string; prompt: string; model: string; startedAt: number }
type SavedVideo = { taskId: string; url: string; prompt: string; model: string; at: number; width?: number; height?: number; durationSeconds?: number; unverified?: boolean }
type DeliveryIssue = { taskId: string; url: string; prompt: string; model: string; retry: boolean }

const ACTIVE_JOB_KEY = "malik.video.active"
const HISTORY_KEY = "malik.video.history"
// How long the studio keeps checking a task before handing the check to a button.
const RENDER_WINDOW_MS = 15 * 60_000

const storageKey = (base: string, owner: string) => `${base}:${owner.trim().toLowerCase()}`

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Private mode: the video still shows; only the memory of it is lost. */
  }
}

/** The server's reason in words a person can act on, never a bare status code. */
function submitErrorMessage(status: number, data: Record<string, unknown>) {
  const server = String(data?.error || data?.publicError || data?.message || "").trim()
  if (status === 401) return "Войдите в аккаунт, чтобы создавать видео."
  if (status === 402) return server || "Эта видеомодель или режим доступны в Malik PRO."
  if (status === 429) return server || "Лимит видео на сегодня исчерпан. Он обновится завтра."
  if (status === 503 && (!server || /not configured|api key|missing|disabled/iu.test(server))) return "Эта видеомодель сейчас не подключена. Выберите другую модель."
  if (server && !/^[A-Z0-9_]+$/u.test(server)) return server
  return `Видеосервис ответил ошибкой ${status}. Попробуйте ещё раз или выберите другую модель.`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusLabel(phase: GenerationPhase, attempt: number) {
  if (phase === "queued") return "Ставлю видео в очередь…"
  if (phase === "rendering") return attempt < 5 ? "Собираю сцену и движение…" : attempt < 15 ? "Рендерю свет, движение и звук…" : "Финализирую видео…"
  if (phase === "checking") return "Проверяю готовый файл…"
  if (phase === "ready") return "Видео готово"
  if (phase === "failed") return "Генерация остановлена"
  return "Готов к созданию"
}

function PosterAsset({ item, className = "" }: { item: ShowcaseVideoTemplate; className?: string }) {
  return <img className={className} src={item.poster} alt={item.title} loading="lazy" decoding="async" draggable={false} />
}

function MalikMediaWatermark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`malik-media-watermark${compact ? " is-compact" : ""}`} aria-label="Malik AI">
      <svg viewBox="0 0 100 58" aria-hidden="true" focusable="false">
        <path d="M4 53 46 11v42H4Z" fill="currentColor" stroke="rgba(0,0,0,.55)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M55 11h41L55 53V11Z" fill="currentColor" stroke="rgba(0,0,0,.55)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function HeroVideo({ item }: { item: ShowcaseVideoTemplate }) {
  const [mobileControls, setMobileControls] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)")
    const update = () => setMobileControls(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return (
    <video
      key={item.id}
      className="mv2__hero-video"
      poster={item.poster}
      autoPlay
      muted
      loop
      controls={mobileControls}
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
  const [projectImage, setProjectImage] = useState<{ id: string; projectId: string; title: string } | null>(null)
  const sourceInputRef = useRef<HTMLInputElement | null>(null)
  const mobileSourceInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceDurationSeconds, setSourceDurationSeconds] = useState(0)
  const [ratio, setRatio] = useState<Ratio>("16:9")
  const [duration, setDuration] = useState<Duration>(5)
  const [quality, setQuality] = useState<Quality>("max")
  const [phase, setPhase] = useState<GenerationPhase>("idle")
  const [attempt, setAttempt] = useState(0)
  const [videoUrl, setVideoUrl] = useState("")
  const [verifiedVideo, setVerifiedVideo] = useState<VerifiedVideo | null>(null)
  const [readyTaskId, setReadyTaskId] = useState("")
  const [extendTaskId, setExtendTaskId] = useState("")
  const [videoExtendAvailable, setVideoExtendAvailable] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(0)
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("Популярное")
  const [thumbPage, setThumbPage] = useState(0)
  const [modelNotice, setModelNotice] = useState("")
  const [exportingVideo, setExportingVideo] = useState(false)
  const [deliveryIssue, setDeliveryIssue] = useState<DeliveryIssue | null>(null)
  const [viaMalik, setViaMalik] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([])
  const [stalledJob, setStalledJob] = useState<ActiveVideoJob | null>(null)
  // Each check loop belongs to one run; leaving the studio or starting another
  // video ends the old loop without touching the new one.
  const runRef = useRef(0)
  const [selectedModelId, setSelectedModelId] = useState<(typeof MOBILE_MODELS)[number]["id"]>("novai")
  const [videoAccess, setVideoAccess] = useState({ pro: false, owner: false })
  const [modelAvailability, setModelAvailability] = useState<Partial<Record<VideoProviderId, boolean>>>({})
  const [mobilePanel, setMobilePanel] = useState<"text" | "image" | "video" | "style">("text")
  const busy = phase === "queued" || phase === "rendering" || phase === "checking"
  const selectedModel = MOBILE_MODELS.find((model) => model.id === selectedModelId) || MOBILE_MODELS[0]
  const selectedItem = SHOWCASE_TEMPLATES[selected] || SHOWCASE_TEMPLATES[0]
  const readyVideo = videoUrl && verifiedVideo?.url === videoUrl ? verifiedVideo : null
  const galleryItems = useMemo(() => {
    const wanted = CATEGORY_TEMPLATES[activeCategory]
    return SHOWCASE_TEMPLATES
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => wanted ? wanted.includes(item.id) : index > 0)
  }, [activeCategory])
  // Desktop shows the core models plus every other model the server has connected.
  const desktopModels = MOBILE_MODELS.filter((model) => MODELS.some((base) => base.id === model.id) || modelAvailability[model.id as VideoProviderId] === true)
  const thumbSize = 3
  const thumbPages = Math.max(1, Math.ceil(SHOWCASE_TEMPLATES.length / thumbSize))
  const thumbs = SHOWCASE_TEMPLATES.slice(thumbPage * thumbSize, thumbPage * thumbSize + thumbSize)

  useEffect(() => {
    return () => {
      if (sourcePreview.startsWith("blob:")) URL.revokeObjectURL(sourcePreview)
    }
  }, [sourcePreview])

  useEffect(() => {
    const artifactId = window.sessionStorage.getItem("malik.video.image-artifact")
    if (!artifactId) return
    window.sessionStorage.removeItem("malik.video.image-artifact")
    let active = true
    videoFetch(`/api/os/artifacts/${encodeURIComponent(artifactId)}`, {}, 30_000)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload?.artifact?.kind !== "image" || !/^https:\/\//i.test(String(payload.artifact.url || ""))) throw new Error("Изображение проекта недоступно.")
        if (!active) return
        setProjectImage({ id: artifactId, projectId: String(payload.artifact.projectId), title: String(payload.artifact.title || "Изображение проекта") })
        setSourcePreview(String(payload.artifact.url))
        setSourceFile(null)
        setMode("image")
        setSelectedModelId("runway")
        setDuration(5)
        setModelNotice("Изображение проекта передано по ссылке без повторной загрузки. Для этого маршрута нужен Runway.")
      })
      .catch((error) => { if (active) setError(error instanceof Error ? error.message : "Не удалось открыть изображение проекта.") })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    fetch("/api/media/video/models")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || !data?.models) return
        setModelAvailability(data.models)
        const isPro = data.access?.pro === true
        setVideoAccess({ pro: isPro, owner: data.access?.owner === true })
        setVideoExtendAvailable(data.capabilities?.videoExtend === true && isPro)
        setSelectedModelId((current) => {
          if (!isPro) return "novai"
          if (current === "magichour" || data.models[current]) return current
          return MOBILE_MODELS.find((model) => data.models[model.id])?.id || current
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setPrompt((current) => current === DEFAULT_PROMPT ? "" : current)
    }
  }, [])

  // A video started earlier keeps rendering at the provider: coming back to the
  // studio picks its check up again instead of losing it.
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  // Only leaving the studio ends a check loop; a late-arriving account name does not.
  useEffect(() => () => { runRef.current += 1 }, [])
  useEffect(() => {
    setSavedVideos(readStored<SavedVideo[]>(storageKey(HISTORY_KEY, operator), []).filter((item) => item?.taskId && item?.url).slice(0, 12))
    const active = readStored<ActiveVideoJob | null>(storageKey(ACTIVE_JOB_KEY, operator), null)
    const working = phaseRef.current === "queued" || phaseRef.current === "rendering" || phaseRef.current === "checking"
    if (active?.taskId && active.statusUrl && !working) {
      if (Date.now() - active.startedAt < RENDER_WINDOW_MS) {
        setPrompt(active.prompt)
        setModelNotice(`Продолжаю проверять видео, запущенное ранее: «${active.prompt.slice(0, 80)}».`)
        void followTask(active)
      } else {
        setStalledJob(active)
        setModelNotice("Есть видео, запущенное ранее. Нажмите «Проверить снова», чтобы получить результат.")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator])

  const supportsMode = (modelId: (typeof MOBILE_MODELS)[number]["id"], targetMode: VideoMode) =>
    targetMode === "text" ? true : modelId === "magichour" || modelId === "runway"

  const changeMode = (nextMode: VideoMode) => {
    if (busy || nextMode === mode) return
    setMode(nextMode)
    setSourceFile(null)
    setProjectImage(null)
    setSourceDurationSeconds(0)
    setSourcePreview("")
    setExtendTaskId("")
    setVideoUrl("")
    setError("")
    setPhase("idle")

    if (nextMode === "text") {
      setModelNotice(
        duration === 10 && selectedModelId !== "magichour" && selectedModelId !== "runway"
          ? `Выбрано: ${selectedModel.name}. Модель сохранена; для 10 секунд выберите Magic Hour или переключите длительность на 5 сек.`
          : `Выбрано: ${selectedModel.name}. ${selectedModel.note}`,
      )
      return
    }

    setDuration(5)
    if (!supportsMode(selectedModelId, nextMode)) {
      const compatibleId = modelAvailability.runway === true ? "runway" : modelAvailability.magichour !== false ? "magichour" : null
      if (!compatibleId) {
        setModelNotice(`${nextMode === "image" ? "Фото → Видео" : "Видео → Видео"} работает через Magic Hour или Runway, а сейчас ни одна из них не подключена.`)
        return
      }
      const compatibleModel = MOBILE_MODELS.find((model) => model.id === compatibleId) || MOBILE_MODELS[0]
      setSelectedModelId(compatibleId)
      setModelNotice(
        `${nextMode === "image" ? "Фото → Видео" : "Видео → Видео"}: автоматически выбрана ${compatibleModel.name}. Можно переключиться между Magic Hour и Runway.`,
      )
      return
    }

    setModelNotice(
      selectedModelId === "runway"
        ? `Выбрано: ${selectedModel.name}. Исходник будет загружен напрямую в Runway для AI-редактирования.`
        : nextMode === "image"
          ? "Image → Video работает через Magic Hour: исходное фото остаётся первым кадром."
          : "Видео → Видео: Magic Hour редактирует исходный клип; при ошибке кредитов Malik AI автоматически попробует Runway.",
    )
  }

  const selectVideoModel = (model: (typeof MOBILE_MODELS)[number]) => {
    if (busy) return
    if (model.tier === "Pro" && !videoAccess.pro) {
      onViewChange("billing")
      return
    }
    if (extendTaskId && model.id !== "runway") {
      setModelNotice("Продление готового ролика доступно через Runway Seedance 2.5. Уберите исходник, чтобы выбрать другую модель.")
      return
    }
    if (modelAvailability[model.id] === false) {
      setModelNotice(`${model.name} сейчас не подключена к серверу.`)
      return
    }

    if (projectImage && model.id !== "runway") {
      setModelNotice("Изображение проекта без повторной загрузки сейчас поддерживает только Runway. Чтобы выбрать Magic Hour, загрузите файл вручную.")
      return
    }
    setSelectedModelId(model.id)
    setVideoUrl("")
    setError("")
    setPhase("idle")

    if (!supportsMode(model.id, mode)) {
      setModelNotice(
        `Выбрано: ${model.name}. Для ${mode === "image" ? "Фото → Видео" : "Видео → Видео"} доступны Magic Hour и Runway; эта модель работает только в Текст → Видео.`,
      )
    } else if (duration === 10 && model.id !== "magichour" && model.id !== "runway") {
      setModelNotice(`Выбрано: ${model.name}. Для этой модели выберите 5 секунд; 10 секунд сейчас доступны через Magic Hour.`)
    } else {
      setModelNotice(`Выбрано: ${model.name}. ${model.note}`)
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
        if (sourceDuration > 10.05) {
          setError(`Для Видео → Видео загрузите клип до 10 секунд. Сейчас: ${sourceDuration.toFixed(1)} сек.`)
          return
        }
        if (sourceDuration < 3) {
          setError(`Magic Hour AI Video Editor принимает клипы от 3 до 10 секунд.`)
          return
        }
      }

      if (sourcePreview.startsWith("blob:")) URL.revokeObjectURL(sourcePreview)
      setProjectImage(null)
      setSourceFile(file)
      setExtendTaskId("")
      setSourceDurationSeconds(sourceDuration)
      setSourcePreview(URL.createObjectURL(file))
      setVideoUrl("")
      setError("")
      setPhase("idle")
      if (!imageMode) {
        setDuration(5)
        setModelNotice(`Исходник ${sourceDuration.toFixed(1)} сек · будет обработано первые ${Math.min(5, sourceDuration).toFixed(1)} сек через Magic Hour AI Video Editor.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось прочитать файл.")
    }
  }

  const clearSource = () => {
    setSourceFile(null)
    setProjectImage(null)
    setExtendTaskId("")
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
      setModelNotice(
        selectedModelId === "magichour"
          ? `Видео → Видео обработает первые ${Math.min(5, sourceDurationSeconds || 5).toFixed(1)} сек через Magic Hour AI Video Editor.`
          : `Выбрано: ${selectedModel.name}. Видео → Видео сейчас рендерится через Magic Hour; выбранная модель не будет самопроизвольно заменена.`,
      )
      return
    }
    setDuration(value)
    if (value === 10 && selectedModelId !== "magichour" && selectedModelId !== "runway") {
      setModelNotice(`Выбрано: ${selectedModel.name}. Выбор сохранён; для 10 секунд выберите Magic Hour или верните 5 секунд.`)
    }
  }

  const uploadSource = async (provider: VideoProviderId = selectedModel.provider as VideoProviderId) => {
    if (projectImage && mode === "image" && provider === "runway") return ""
    if (!sourceFile || mode === "text") return ""
    const form = new FormData()
    form.append("file", sourceFile, sourceFile.name)
    form.append("mode", mode)
    form.append("provider", provider)
    if (mode === "video") form.append("durationSeconds", String(sourceDurationSeconds))
    const response = await videoFetch("/api/media/video/source", { method: "POST", body: form }, 120_000)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.filePath) {
      throw new Error(data?.error || "Не удалось загрузить исходный файл.")
    }
    return String(data.filePath)
  }

  const chooseTemplate = (index: number) => {
    const item = SHOWCASE_TEMPLATES[index]
    if (!item || busy) return
    if (extendTaskId) changeMode("text")
    if (window.matchMedia("(max-width: 820px)").matches && mode !== "text") {
      changeMode("text")
      setMobilePanel("text")
    }
    setSelected(index)
    setExtendTaskId("")
    setPrompt(item.prompt)
    setVideoUrl("")
    setPhase("idle")
    setError("")
  }

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy) return
    if (!videoAccess.pro && (selectedModel.id !== "novai" || mode !== "text")) {
      setPhase("failed")
      setError("Для этой видеомодели или режима требуется Malik PRO.")
      return
    }
    if (mode !== "text" && !sourceFile && !projectImage && !extendTaskId) {
      setPhase("failed")
      setError(mode === "image" ? "Сначала загрузите фото." : "Сначала загрузите видео.")
      return
    }
    if (!supportsMode(selectedModelId, mode)) {
      setPhase("failed")
      setError(`${selectedModel.name} сейчас работает в режиме Текст → Видео. Для ${mode === "image" ? "Фото → Видео" : "Видео → Видео"} выберите Magic Hour или Runway.`)
      return
    }
    if (projectImage && selectedModelId !== "runway") {
      setPhase("failed")
      setError("Для прямой ссылки на изображение проекта выберите Runway или загрузите файл вручную для Magic Hour.")
      return
    }
    if (projectImage && modelAvailability.runway === false) {
      setPhase("failed")
      setError("Runway сейчас не подключён. Ссылка на изображение проекта не может быть использована без него.")
      return
    }
    if (extendTaskId && (!videoExtendAvailable || selectedModelId !== "runway")) {
      setPhase("failed")
      setError("Продление через Runway Seedance 2.5 сейчас недоступно.")
      return
    }
    if (duration === 10 && selectedModelId !== "magichour" && selectedModelId !== "runway") {
      setPhase("failed")
      setError(`${selectedModel.name}: выберите 5 секунд. 10 секунд доступны через Magic Hour или Runway.`)
      return
    }

    // The daily limit lives on the server, per account; the browser does not guess it.
    setError("")
    setVideoUrl("")
    setVerifiedVideo(null)
    setReadyTaskId("")
    setDeliveryIssue(null)
    setStalledJob(null)
    setViaMalik(false)
    setShareUrl("")
    setAttempt(0)

    const submit = async (provider: VideoProviderId, sourcePath: string) => {
      const response = await videoFetch(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: cleanPrompt,
            mode,
            imageArtifactId: mode === "image" ? projectImage?.id : undefined,
            imageUrl: mode === "image" ? sourcePath : undefined,
            sourceVideoUrl: mode === "video" ? sourcePath : undefined,
            sourceDurationSeconds: mode === "video" ? sourceDurationSeconds : undefined,
            editOperation: extendTaskId ? "extend" : "edit",
            sourceTaskId: extendTaskId || undefined,
            length: mode === "video" ? 5 : duration,
            resolution: QUALITY_RESOLUTION[quality],
            ratio: ratio === "4:3" ? "16:9" : ratio,
            generateAudio: selectedModel.audio,
            provider,
          }),
        },
        120_000,
      )
      const data = await response.json().catch(() => ({}))
      return { response, data }
    }

    setPhase("queued")
    const run = ++runRef.current
    try {
      let provider = selectedModel.provider as VideoProviderId
      let sourcePath = extendTaskId ? sourcePreview : mode === "text" ? "" : await uploadSource(provider)
      let { response, data } = await submit(provider, sourcePath)

      const providerMessage = String(data?.error || data?.publicError || data?.message || "")
      const canFallbackToRunway =
        mode !== "text" &&
        !projectImage &&
        provider === "magichour" &&
        modelAvailability.runway === true &&
        !response.ok &&
        /credit|quota|limit|payment|balance|unavailable|temporar|429|402|503/i.test(providerMessage + " " + response.status)

      if (canFallbackToRunway) {
        setModelNotice("Magic Hour сейчас недоступен — автоматически переключаю эту генерацию на Runway.")
        provider = "runway"
        sourcePath = await uploadSource("runway")
        ;({ response, data } = await submit(provider, sourcePath))
      }

      if (!response.ok) throw new Error(submitErrorMessage(response.status, data))

      const taskId = String(data?.taskId || "")
      if (!taskId) throw new Error("Видеомодель не вернула номер задачи. Попробуйте ещё раз.")
      if (run !== runRef.current) return
      await followTask({
        taskId,
        statusUrl: String(data?.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(taskId)}`),
        prompt: cleanPrompt,
        model: selectedModel.name,
        startedAt: Date.now(),
      }, projectImage)
    } catch (err) {
      if (run !== runRef.current) return
      setPhase("failed")
      setError(err instanceof Error ? err.message : "Генерация видео недоступна")
    }
  }

  const rememberVideo = (entry: SavedVideo) => {
    setSavedVideos((current) => {
      const next = [entry, ...current.filter((item) => item.taskId !== entry.taskId)].slice(0, 12)
      writeStored(storageKey(HISTORY_KEY, operator), next)
      return next
    })
  }

  /** A finished file is shown the way that works here, and never thrown away. */
  const finishVideo = async (job: ActiveVideoJob, url: string, run: number, sourceImage: typeof projectImage = null) => {
    setPhase("checking")
    try {
      const delivered = await deliverGeneratedVideo({ url, taskId: job.taskId, origin: window.location.origin })
      if (run !== runRef.current) return
      setVerifiedVideo(delivered.video)
      setVideoUrl(delivered.video.url)
      setViaMalik(delivered.via === "malik")
      setShareUrl(delivered.originalUrl)
      setReadyTaskId(job.taskId)
      setDeliveryIssue(null)
      setError("")
      setPhase("ready")
      if (delivered.via === "malik") setModelNotice("Провайдер не отдал файл браузеру напрямую, поэтому видео показано через Malik AI.")
      rememberVideo({
        taskId: job.taskId, url: delivered.originalUrl, prompt: job.prompt, model: job.model, at: Date.now(),
        width: delivered.video.width, height: delivered.video.height, durationSeconds: delivered.video.durationSeconds,
      })
      if (sourceImage) {
        void videoFetch(`/api/os/projects/${encodeURIComponent(sourceImage.projectId)}/video-artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: job.taskId, sourceImageId: sourceImage.id }),
        }, 45_000).then(async (saved) => {
          if (!saved.ok) {
            const failure = await saved.json().catch(() => ({}))
            setModelNotice(`Видео готово, но не сохранено в проекте: ${String(failure.error || "повторите позже")}`)
          }
        }).catch(() => setModelNotice("Видео готово, но связь с проектом пока не подтверждена."))
      }
    } catch (cause) {
      if (run !== runRef.current) return
      const original = cause instanceof VideoDeliveryError ? cause.originalUrl : url
      setDeliveryIssue({ taskId: job.taskId, url: original, prompt: job.prompt, model: job.model, retry: cause instanceof VideoDeliveryError ? cause.retry : true })
      setReadyTaskId(job.taskId)
      setShareUrl(original)
      setError(cause instanceof Error ? cause.message : "Видео создано, но файл не открывается.")
      setPhase("failed")
      rememberVideo({ taskId: job.taskId, url: original, prompt: job.prompt, model: job.model, at: Date.now(), unverified: true })
    }
  }

  /** Waits for the provider. The task is saved, so leaving the page loses nothing. */
  const followTask = async (job: ActiveVideoJob, sourceImage: typeof projectImage = null) => {
    const run = ++runRef.current
    const activeKey = storageKey(ACTIVE_JOB_KEY, operator)
    writeStored(activeKey, job)
    setStalledJob(null)
    setDeliveryIssue(null)
    setError("")
    setPhase("rendering")
    let networkMisses = 0
    try {
      for (let i = 0; ; i += 1) {
        if (run !== runRef.current) return
        if (Date.now() - job.startedAt > RENDER_WINDOW_MS) {
          setStalledJob(job)
          throw new Error("Видео рендерится дольше обычного. Задача сохранена: нажмите «Проверить снова» чуть позже.")
        }
        setAttempt(i)
        await sleep(i === 0 ? 1500 : i < 12 ? 2500 : 5000)
        if (run !== runRef.current) return
        let statusResponse: Response
        try {
          statusResponse = await videoFetch(job.statusUrl, { method: "GET" }, 45_000)
        } catch (cause) {
          // A dropped connection on a phone is not a failed video: keep waiting.
          if (++networkMisses < 6) continue
          setStalledJob(job)
          throw cause
        }
        networkMisses = 0
        const statusData = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) {
          if (statusResponse.status >= 500 && i < 240) continue
          writeStored(activeKey, null)
          throw new Error(String(statusData?.error || `Не удалось проверить видео (HTTP ${statusResponse.status}).`))
        }
        if (statusData?.status === "failed") {
          writeStored(activeKey, null)
          const reason = String(statusData?.error || "Видеомодель не смогла завершить рендер.")
          throw new Error(`${reason}${statusData?.quotaRefunded ? " Дневная попытка возвращена." : ""}`)
        }
        const readyUrl = String(statusData?.videoUrl || statusData?.url || "")
        if (readyUrl) {
          writeStored(activeKey, null)
          await finishVideo(job, readyUrl, run, sourceImage)
          return
        }
      }
    } catch (err) {
      if (run !== runRef.current) return
      setPhase("failed")
      setError(err instanceof Error ? err.message : "Генерация видео недоступна")
    }
  }

  const retryDelivery = () => {
    if (!deliveryIssue || busy) return
    const run = ++runRef.current
    setError("")
    void finishVideo({ taskId: deliveryIssue.taskId, statusUrl: "", prompt: deliveryIssue.prompt, model: deliveryIssue.model, startedAt: Date.now() }, deliveryIssue.url, run)
  }

  const resumeStalled = () => {
    if (!stalledJob || busy) return
    void followTask({ ...stalledJob, startedAt: Date.now() })
  }

  // The provider's link can expire after the check; the same file then plays through Malik.
  const playerFailed = () => {
    if (viaMalik || !readyTaskId) return
    const proxy = malikVideoStreamUrl(readyTaskId)
    setViaMalik(true)
    setVerifiedVideo((current) => current ? { ...current, url: proxy } : current)
    setVideoUrl(proxy)
    setModelNotice("Прямая ссылка провайдера не открылась, поэтому видео показано через Malik AI.")
  }

  const openSavedVideo = (item: SavedVideo) => {
    if (busy) return
    runRef.current += 1
    setDeliveryIssue(null)
    setStalledJob(null)
    setError("")
    setViaMalik(false)
    setShareUrl(item.url)
    setReadyTaskId(item.taskId)
    setVerifiedVideo(item.width && item.height && item.durationSeconds ? { url: item.url, width: item.width, height: item.height, durationSeconds: item.durationSeconds } : null)
    setVideoUrl(item.url)
    setPrompt(item.prompt)
    setPhase("ready")
    setModelNotice(`Открыто из «Мои видео»: ${item.model}.`)
  }

  const forgetSavedVideos = () => {
    setSavedVideos([])
    writeStored(storageKey(HISTORY_KEY, operator), null)
  }

  const toggleCameraMove = (text: string) => {
    if (busy) return
    setPrompt((value) => value.includes(text)
      ? value.replace(text, "").replace(/\s{2,}/gu, " ").trim()
      : `${value.trim() || DEFAULT_PROMPT} ${text}`.trim().slice(0, 2000))
  }

  const extendReadyVideo = () => {
    if (!readyVideo || !readyTaskId || !videoExtendAvailable || busy || readyVideo.durationSeconds < 3 || readyVideo.durationSeconds > 10.05) return
    setMode("video")
    setMobilePanel("video")
    setSourceFile(null)
    setProjectImage(null)
    setSourcePreview(shareUrl || readyVideo.url)
    setSourceDurationSeconds(readyVideo.durationSeconds)
    setExtendTaskId(readyTaskId)
    setSelectedModelId("runway")
    setDuration(5)
    setRatio(readyVideo.width > readyVideo.height ? "16:9" : readyVideo.width < readyVideo.height ? "9:16" : "1:1")
    setPrompt("Продолжи предыдущую сцену естественно, сохрани героя, окружение, освещение и движение камеры.")
    setVideoUrl("")
    setVerifiedVideo(null)
    setError("")
    setPhase("idle")
    setModelNotice("Готовое видео выбрано как исходник. Опишите продолжение и нажмите «Изменить видео». Runway добавит новую сцену без повторной загрузки файла.")
  }

  const improvePrompt = () => {
    if (busy) return
    setPrompt((value) => !value.trim() ? DEFAULT_PROMPT : value.includes(ENHANCE_TEXT) ? value : `${value.trim()} ${ENHANCE_TEXT}`.slice(0, 2000))
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

  const downloadCurrent = async () => {
    if (exportingVideo) return
    if (!videoUrl) {
      const anchor = document.createElement("a")
      anchor.href = selectedItem.src
      anchor.download = `${selectedItem.id}.mp4`
      anchor.click()
      return
    }
    if (!readyTaskId) {
      setModelNotice("Не удалось подтвердить задачу готового видео для скачивания с логотипом.")
      return
    }
    setExportingVideo(true)
    setModelNotice("Встраиваю официальную иконку Malik AI в видео на вашем устройстве. Это не тратит ресурсы рендера.")
    try {
      const result = await exportBrandedMalikVideo(readyTaskId)
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `malik-ai-branded.${result.extension}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setModelNotice("Готово: скачанный файл содержит официальную иконку Malik AI внутри кадров.")
    } catch (cause) {
      // Never silently download an unwatermarked original when branding fails.
      setModelNotice(cause instanceof Error ? cause.message : "Не удалось встроить значок в видео. Попробуйте другой браузер.")
    } finally {
      setExportingVideo(false)
    }
  }

  const shareCurrent = async () => {
    // The Malik stream needs this account's sign-in; others get the provider's link.
    const src = shareUrl || (viaMalik ? "" : videoUrl) || selectedItem.src
    try {
      const absolute = new URL(src, window.location.origin).href
      if (navigator.share) await navigator.share({ title: "MalikVideo", url: absolute })
      else await navigator.clipboard.writeText(absolute)
    } catch {}
  }

  const recoverRow = deliveryIssue || stalledJob ? (
    <div className="mv2__recover" role="group" aria-label="Что сделать с видео">
      {deliveryIssue ? <button type="button" onClick={retryDelivery} disabled={busy}><RotateCw />Проверить ещё раз</button> : null}
      {deliveryIssue ? <a href={deliveryIssue.url} target="_blank" rel="noreferrer noopener"><ExternalLink />Открыть файл</a> : null}
      {stalledJob && !deliveryIssue ? <button type="button" onClick={resumeStalled} disabled={busy}><RotateCw />Проверить снова</button> : null}
    </div>
  ) : null

  const cameraRow = (
    <div className="mv2__camera" role="group" aria-label="Движение камеры">
      <span className="mv2__camera-label"><Camera />Камера</span>
      {CAMERA_MOVES.map((move) => {
        const active = prompt.includes(move.text)
        return (
          <button key={move.id} type="button" className={active ? "is-active" : ""} aria-pressed={active} onClick={() => toggleCameraMove(move.text)} disabled={busy} title={move.text}>
            {move.label}
          </button>
        )
      })}
    </div>
  )

  const historyStrip = savedVideos.length ? (
    <div className="mv2__history" aria-label="Мои видео">
      <div className="mv2__history-head">
        <span><History />Мои видео</span>
        <small>{savedVideos.length}</small>
        <button type="button" onClick={forgetSavedVideos} disabled={busy}>Очистить</button>
      </div>
      <div className="mv2__history-list">
        {savedVideos.map((item) => (
          <button key={item.taskId} type="button" className={readyTaskId === item.taskId ? "is-active" : ""} onClick={() => openSavedVideo(item)} disabled={busy} title={item.prompt}>
            <Play />
            <span>{item.prompt}</span>
            <small>
              {new Date(item.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)} сек` : ""}
              {item.unverified ? " · не проверено" : ""}
            </small>
          </button>
        ))}
      </div>
    </div>
  ) : null

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
            Текст → видео
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
            Фото → видео
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
            Видео → видео
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
        {mobilePanel === "style" ? cameraRow : null}

        {mobilePanel === "image" ? (
          <div className="mv2m__source">
            <button type="button" className="mv2m__source-preview" onClick={openMobileImagePicker} disabled={busy}>
              {sourcePreview && mode === "image"
                ? <img src={sourcePreview} alt="Загруженное изображение" draggable={false} />
                : <ImagePlus />}
            </button>
            <button type="button" className="mv2m__source-copy" onClick={openMobileImagePicker} disabled={busy}>
              <strong>{sourceFile?.name || projectImage?.title || "Добавить изображение"}</strong>
              <small>{sourceFile || projectImage ? "Нажмите, чтобы заменить" : "JPG, PNG, WebP или AVIF"}</small>
            </button>
            {sourceFile || projectImage ? <button type="button" className="mv2m__source-remove" onClick={clearSource} aria-label="Убрать изображение" disabled={busy}><X /></button> : null}
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
              <strong>{sourceFile?.name || (extendTaskId ? "Готовое видео" : "Добавить видео")}</strong>
              <small>
                {(sourceFile || extendTaskId) && mode === "video"
                  ? `${sourceDurationSeconds.toFixed(1)} сек · AI-редактирование`
                  : "MP4, MOV, WebM · фрагмент 3–10 сек"}
              </small>
            </button>
            {sourceFile || extendTaskId ? <button type="button" className="mv2m__source-remove" onClick={clearSource} aria-label="Убрать видео" disabled={busy}><X /></button> : null}
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
              <button type="button" onClick={openMobileVideoPicker} aria-label="Загрузить видео до 10 секунд" disabled={busy}><Video /></button>
              <button type="button" onClick={improvePrompt} aria-label="Улучшить промпт" disabled={busy}><Sparkles /></button>
              <button type="button" onClick={() => setMobilePanel((value) => value === "style" ? "text" : "style")} aria-label="Стиль и эффекты" disabled={busy}><SlidersHorizontal /></button>
            </div>
            <div className="mv2m__counter">
              <span>{prompt.length}/2000</span>
              <button type="button" onClick={() => setPrompt("")} aria-label="Очистить запрос" disabled={busy || !prompt}><X /></button>
            </div>
          </div>
        </div>

        <div className="mv2m__model-head" aria-label="Текущая видеомодель">
          <span><Box /> Модели видео</span>
          <strong>{selectedModel.name}</strong>
        </div>

        <div id="mv2-mobile-models" className="mv2m__model-picker is-always-open" role="group" aria-label="Выбор видеомодели">
          {MOBILE_MODELS.map((model) => {
            const available = modelAvailability[model.id] !== false
            const supported = supportsMode(model.id, mode) && (duration !== 10 || model.id === "magichour" || model.id === "runway")
            const active = selectedModelId === model.id
            return (
              <button
                key={model.id}
                type="button"
                className={active ? "is-active" : ""}
                disabled={busy || (videoAccess.pro || model.tier === "Free") && (!available || !supported)}
                onClick={() => selectVideoModel(model)}
                aria-pressed={active}
                aria-label={`${model.name}, ${model.tier === "Pro" ? "Malik PRO" : "бесплатно"}`}
                data-provider={model.provider}
                data-tier={model.tier.toLowerCase()}
              >
                <span className="mv2m__model-top">
                  <span className="mv2m__model-icon">{model.icon ? <img src={model.icon} alt="" loading="lazy" /> : <Video aria-hidden="true" />}</span>
                  <span className="mv2m__model-tier">{model.tier === "Pro" ? (videoAccess.pro ? "PRO" : "🔒 PRO") : "FREE"}</span>
                </span>
                <span className="mv2m__model-title">{model.name}</span>
                <small>{!available ? "Не подключена" : !supported ? "Недоступна в этом режиме" : model.subtitle}</small>
              </button>
            )
          })}
        </div>
        {modelNotice ? <div className="mv2__model-notice" role="status">{modelNotice}</div> : null}

        <div className="mv2m__controls">
          <button type="button" onClick={cycleMobileDuration} disabled={busy || mode === "video"}><Clock3 /><span>{mode === "video" ? "до 10 сек" : `${duration} секунд`}</span></button>
          <button type="button" onClick={cycleMobileQuality} disabled={busy}><Monitor /><span>{QUALITY_RESOLUTION[quality]}</span></button>
          <button type="button" onClick={cycleMobileRatio} disabled={busy}><RectangleHorizontal /><span>{ratio}</span></button>
        </div>
        <button
          type="button"
          className="mv2m__generate"
          onClick={generate}
          disabled={busy || !prompt.trim() || (mode !== "text" && !sourceFile && !projectImage && !extendTaskId)}
        >
          <Play />
          <span>{busy ? statusLabel(phase, attempt) : mode === "video" ? "Изменить видео" : "Генерировать"}</span>
        </button>

        <div className="mv2m__brand"><Crown />Превращай идеи в реальность с Malik AI</div>
        {busy ? <div className="mv2m__status is-busy" role="status">{statusLabel(phase, attempt)}</div> : null}
        {(error || phase === "ready") ? (
          <div className={`mv2m__status${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
            {error || (viaMalik ? "Видео готово · показано через Malik AI" : "Видео готово")}
          </div>
        ) : null}
        {recoverRow}
        {videoUrl ? (
          <div className="mv2m__result-video">
            <div className="mv2m__result-media">
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                onError={playerFailed}
              />
              <MalikMediaWatermark compact />
            </div>
            <button type="button" onClick={downloadCurrent} disabled={exportingVideo}>{exportingVideo ? "Встраиваю логотип…" : "Скачать с логотипом"}</button>
            {readyVideo && readyTaskId && videoExtendAvailable && readyVideo.durationSeconds >= 3 && readyVideo.durationSeconds <= 10.05 ? (
              <button type="button" onClick={extendReadyVideo}>Продлить через Runway</button>
            ) : null}
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
              <div
                className="mv2__result-frame"
                style={
                  ratio === "9:16"
                    ? { height: "100%", aspectRatio: "9 / 16" }
                    : ratio === "1:1"
                      ? { height: "100%", aspectRatio: "1 / 1" }
                      : { width: "100%", aspectRatio: "16 / 9" }
                }
              >
                <video key={videoUrl} src={videoUrl} controls autoPlay playsInline preload="metadata" className="mv2__result" onError={playerFailed} />
                <MalikMediaWatermark />
              </div>
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
          <button className="mv2__arrow" type="button" disabled={thumbPage === 0} onClick={() => setThumbPage((page) => Math.max(0, page - 1))} aria-label="Предыдущие видео"><ChevronLeft /></button>
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
          <button className="mv2__arrow" type="button" disabled={thumbPage >= thumbPages - 1} onClick={() => setThumbPage((page) => Math.min(thumbPages - 1, page + 1))} aria-label="Следующие видео"><ChevronRight /></button>
        </div>

        <div className="mv2__preview-info">
          <div className="mv2__preview-copy">
            <div className="mv2__mobile-badges"><span>{readyVideo ? `${readyVideo.width}×${readyVideo.height}` : "MALIK VIDEO"}</span><span>CINEMATIC</span></div>
            <h3>{videoUrl ? "Готовое видео" : selectedItem.title}</h3>
            <p>{videoUrl ? (readyVideo ? `Видео проверено и готово${viaMalik ? ", показано через Malik AI" : ""}. Скачивание встраивает значок Malik AI в кадр.` : "Видео открыто из истории. Если прямая ссылка устарела, плеер переключится на Malik AI.") : selectedItem.prompt}</p>
            <div className="mv2__chips"><span>{readyVideo ? `${Math.round(readyVideo.durationSeconds)} секунд` : `${duration} секунд`}</span><span>{readyVideo ? `${readyVideo.width}×${readyVideo.height}` : QUALITY_RESOLUTION[quality]}</span><span>{ratio}</span><span>{videoUrl ? "Malik Video" : selectedModel.name}</span><span>{selectedModel.audio ? "Audio" : "Video"}</span></div>
          </div>
          <div className="mv2__preview-actions">
            <button type="button" onClick={downloadCurrent} disabled={exportingVideo}><Download /><span>{exportingVideo ? "Встраиваю…" : "Скачать с логотипом"}</span></button>
            {readyVideo && readyTaskId && videoExtendAvailable && readyVideo.durationSeconds >= 3 && readyVideo.durationSeconds <= 10.05 ? (
              <button type="button" onClick={extendReadyVideo}><Video /><span>Продлить</span></button>
            ) : null}
            <button type="button" onClick={shareCurrent}><Share2 /><span>Поделиться</span></button>
            <button type="button" onClick={() => onViewChange("projects")}><FolderPlus /><span>В проект</span></button>
          </div>
        </div>
        {historyStrip}
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
              <button type="button" onClick={() => setPrompt(DEFAULT_PROMPT)} disabled={busy}><Sparkles />Подсказки</button>
              <button type="button" onClick={improvePrompt} disabled={busy}><Sparkles />Улучшить промпт</button>
              <button type="button" onClick={() => document.querySelector(".mv2__gallery")?.scrollIntoView({ behavior: "smooth", block: "center" })} disabled={busy}><ImagePlus />Примеры</button>
            </div>
            <span className="mv2__count">{prompt.length}/2000</span>
          </div>
        </div>
        {cameraRow}

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
              <strong>{sourceFile?.name || projectImage?.title || (extendTaskId ? "Готовое видео" : mode === "image" ? "Исходное фото" : "Исходное видео")}</strong>
              <small>{sourceFile || projectImage || extendTaskId
                ? mode === "image"
                  ? "Фото будет сохранено как исходный первый кадр."
                  : "Оригинальное видео будет основой для AI-редактирования."
                : mode === "image"
                  ? "PNG, JPG, WebP или AVIF"
                  : "MP4, WebM, MOV или M4V · 3–10 секунд"}</small>
            </div>
            <button className="mv2__source-upload" type="button" onClick={() => sourceInputRef.current?.click()} disabled={busy}>
              <Upload />{sourceFile || projectImage || extendTaskId ? "Заменить" : "Загрузить"}
            </button>
            {sourceFile || projectImage || extendTaskId ? <button className="mv2__source-clear" type="button" onClick={clearSource} aria-label="Убрать файл" disabled={busy}><X /></button> : null}
          </div>
        ) : null}

        <div className="mv2__daily-note">1 видео в день · PRO открывает модели · владельцу без лимита Malik AI</div>

        <div className="mv2__section-title"><span>Модель</span><Info /><span className="mv2__selected-model">Выбрано: {selectedModel.name}</span></div>
        <div className="mv2__models">
          {desktopModels.map((model) => {
            const active = model.id === selectedModelId
            return (
              <button
                key={model.id}
                type="button"
                className={`mv2__model${active ? " is-active" : ""}${model.featured ? " is-featured" : ""}`}
                data-model-id={model.id}
                onClick={() => selectVideoModel(model)}
                aria-pressed={active}
                disabled={busy || ((videoAccess.pro || model.tier === "Free") && (modelAvailability[model.id] === false || !supportsMode(model.id, mode)))}
                title={modelAvailability[model.id] === false
                  ? "Модель сейчас не подключена к серверу"
                  : model.tier === "Pro" && !videoAccess.pro
                    ? "Оформите Malik PRO, чтобы использовать эту модель."
                  : !supportsMode(model.id, mode)
                    ? "Эта модель работает только в Текст → Видео. Для текущего режима доступны Magic Hour и Runway."
                    : duration === 10 && model.id !== "magichour" && model.id !== "runway"
                      ? "Для генерации выберите 5 секунд или Magic Hour/Runway для 10 секунд."
                      : model.note}
              >
                <span className="mv2__model-icon"><img src={model.icon} alt="" draggable={false} /></span>
                <span className="mv2__model-copy"><strong>{model.name}</strong><small>{model.subtitle}</small></span>
                <span className={`mv2__tier ${model.tier === "Free" ? "is-free" : "is-pro"}`}>{model.tier}</span>
              </button>
            )
          })}
        </div>
        {modelNotice ? <div className="mv2__model-notice">{modelNotice}</div> : null}

        <div className="mv2__settings-grid">
          <div><div className="mv2__section-title">Качество <Info /></div><div className="mv2__segments"><button type="button" aria-pressed={quality === "fast"} className={quality === "fast" ? "is-active" : ""} onClick={() => setQuality("fast")} disabled={busy}>720p · Быстро</button><button type="button" aria-pressed={quality === "max"} className={quality === "max" ? "is-active" : ""} onClick={() => setQuality("max")} disabled={busy}>1080p · Max</button></div></div>
          <div><div className="mv2__section-title">Длительность</div><div className="mv2__segments">{([5, 10] as Duration[]).map((value) => <button key={value} type="button" aria-pressed={duration === value} className={duration === value ? "is-active" : ""} onClick={() => chooseDuration(value)} disabled={busy}>{value} сек</button>)}</div></div>
          <div><div className="mv2__section-title">Соотношение сторон</div><div className="mv2__segments">{(["16:9", "9:16", "1:1", "4:3"] as Ratio[]).map((value) => <button key={value} type="button" aria-pressed={ratio === value} className={ratio === value ? "is-active" : ""} onClick={() => setRatio(value)} disabled={busy}>{value}</button>)}</div></div>
        </div>

        <div className="mv2__generate-row"><button type="button" className="mv2__generate" onClick={generate} disabled={busy || !prompt.trim() || (mode !== "text" && !sourceFile && !projectImage && !extendTaskId)}><span>{busy ? statusLabel(phase, attempt) : mode === "image" ? `Оживить фото · ${duration} сек` : mode === "video" ? `Изменить видео · ${duration} сек` : "Сгенерировать видео"}</span><ArrowUp /></button><div className="mv2__credits">◉ {videoAccess.owner ? "Без лимита" : "1 видео / день"}</div></div>
        <div className="mv2__status" role="status"><span className={`mv2__status-dot is-${phase}`} />{phase === "ready" && viaMalik ? "Видео готово · через Malik AI" : statusLabel(phase, attempt)}{error ? <b role="alert">{error}</b> : null}</div>
        {recoverRow}

        <div className="mv2__gallery-tabs">{CATEGORIES.map((item) => <button key={item} type="button" className={activeCategory === item ? "is-active" : ""} aria-pressed={activeCategory === item} onClick={() => setActiveCategory(item)}>{item}</button>)}</div>
        <div className="mv2__gallery">
          {galleryItems.map(({ item, index }) => (
            <button key={item.id} type="button" className={`mv2__gallery-card${selected === index ? " is-active" : ""}`} onClick={() => chooseTemplate(index)} disabled={busy}>
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
        .mv2__stage{position:relative;aspect-ratio:16/10.4;overflow:hidden;background:#06080c}.mv2__media{position:absolute;inset:0;display:grid;place-items:center;background:#050608}.mv2__result-frame{position:relative;max-width:100%;max-height:100%;overflow:hidden;background:#050608}.mv2__hero-video,.mv2__result,.mv2__source-image,.mv2__source-video{width:100%;height:100%;display:block;background:#050608}.malik-media-watermark{position:absolute;z-index:8;left:18px;right:auto;bottom:16px;width:54px;display:flex;align-items:center;justify-content:center;pointer-events:none;user-select:none;opacity:.85;color:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.82))}.malik-media-watermark svg{display:block;width:46px;height:auto;color:#fff}.malik-media-watermark span{color:#fff;font-size:13px;font-weight:650;line-height:1;letter-spacing:.01em;text-shadow:0 1px 3px rgba(0,0,0,.92)}.malik-media-watermark.is-compact{left:10px;right:auto;bottom:10px;width:44px;gap:0;opacity:.86}.malik-media-watermark.is-compact svg{width:38px}.malik-media-watermark.is-compact span{font-size:10px}.mv2__source-image,.mv2__source-video{object-fit:contain!important;object-position:center center!important;transform:none!important;max-width:100%!important;max-height:100%!important}.mv2__hero-video,.mv2__result{object-fit:contain}.mv2__stage:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 22%,transparent 70%,rgba(0,0,0,.36))}
        .mv2__stage-brand{position:absolute;z-index:2;top:24px;color:#d9e0eb;letter-spacing:.36em;font-size:11px}.mv2__stage-brand--left{left:28px;display:flex;flex-direction:column;gap:10px}.mv2__stage-brand--left small{font-size:9px}.mv2__stage-brand--right{right:26px}.mv2__rendering{position:absolute;z-index:4;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}.mv2__render-box{width:96px;height:96px;border-radius:24px;border:1px solid rgba(255,255,255,.17);display:grid;place-items:center;background:#0c0e12;animation:mv2pulse 1.7s ease-in-out infinite}.mv2__rendering strong{font-size:14px}.mv2__rendering small{color:#939aa7;font-size:11px}@keyframes mv2pulse{50%{transform:scale(1.035);box-shadow:0 24px 70px rgba(0,0,0,.6)}}
        .mv2__thumb-strip{display:grid;grid-template-columns:28px 1fr 28px;gap:7px;align-items:center;margin-top:12px}.mv2__thumbs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.mv2__arrow{width:28px;height:76px;border:0;background:transparent;color:#b9c2d1;display:grid;place-items:center}.mv2__arrow svg{width:18px;height:18px}.mv2__thumb{position:relative;height:76px;border:1px solid #262a31;border-radius:10px;overflow:hidden;background:#0b0e13;padding:0}.mv2__thumb.is-active{border-color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.mv2__thumb-poster{width:100%;height:100%;object-fit:cover;display:block}.mv2__thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.72))}.mv2__thumb span{position:absolute;z-index:2;left:7px;bottom:5px;font-size:9px;color:#dce2ec}
        .mv2__preview-info{margin-top:12px;padding:15px;display:grid;grid-template-columns:1fr 132px;gap:15px}.mv2__mobile-badges{display:none}.mv2__preview-copy h3{margin:0 0 8px;font-size:17px}.mv2__preview-copy p{margin:0;color:#9ca4b2;font-size:12px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mv2__chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.mv2__chips span{height:28px;padding:0 9px;border:1px solid #292d34;border-radius:999px;background:#12161d;color:#adb5c2;display:inline-flex;align-items:center;font-size:10px}.mv2__preview-actions{display:flex;flex-direction:column;gap:7px}.mv2__preview-actions button{height:35px;border:1px solid #2c3038;border-radius:9px;background:#12161d;color:#edf1f7;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px}.mv2__preview-actions svg{width:14px;height:14px}
        .mv2__controls-column{position:relative;padding:5px 0 24px}.mv2__mode-tabs{position:absolute;right:0;top:0;display:flex;border:1px solid #1d2027;background:#0b0d11;border-radius:12px;padding:3px;overflow:hidden}.mv2__mode-tabs button{height:34px;border:0;border-radius:9px;background:transparent;color:#8e96a4;padding:0 13px;font-size:10px;white-space:nowrap}.mv2__mode-tabs button.is-active{background:#f4f4f5 !important;color:#050505 !important;box-shadow:inset 0 0 0 1px #fff}.mv2__mode-tabs button:disabled{cursor:not-allowed;opacity:.6}.mv2__eyebrow{margin-top:13px;color:#707887;letter-spacing:.28em;font-size:10px}.mv2 h1{margin:14px 0 6px;font-size:clamp(34px,3.2vw,52px);line-height:1;letter-spacing:-.05em}.mv2__lead{margin:0 0 15px;color:#929aa8;font-size:13px}
        .mv2__prompt-card{padding:12px}.mv2__prompt-card textarea{width:100%;height:106px;border:0;outline:0;resize:none;background:transparent;color:#fff;font-size:14px;line-height:1.5;padding:3px}.mv2__prompt-card textarea::placeholder{color:#6f7887}.mv2__source-card{margin-top:9px;min-height:64px;padding:8px;border:1px solid #272a31;border-radius:12px;background:#0c0f14;display:grid;grid-template-columns:48px minmax(0,1fr) auto auto;align-items:center;gap:9px}.mv2__source-preview{width:48px;height:48px;border-radius:9px;overflow:hidden;border:1px solid #2d323b;background:#12161d;display:grid;place-items:center;color:#aeb6c4}.mv2__source-preview img,.mv2__source-preview video{width:100%;height:100%;object-fit:contain!important;object-position:center center!important;display:block;background:#050608;transform:none!important}.mv2__source-preview svg{width:19px}.mv2__source-copy{min-width:0;display:flex;flex-direction:column;gap:4px}.mv2__source-copy strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2__source-copy small{font-size:8px;color:#858d9b;line-height:1.35}.mv2__source-upload,.mv2__source-clear{height:34px;border:1px solid #303540;border-radius:9px;background:#151922;color:#eef2f8;display:flex;align-items:center;justify-content:center;gap:6px}.mv2__source-upload{padding:0 10px;font-size:9px}.mv2__source-upload svg,.mv2__source-clear svg{width:13px;height:13px}.mv2__source-clear{width:34px;padding:0}.mv2__daily-note{margin-top:8px;color:#7e8795;font-size:9px}.mv2__prompt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.mv2__helper-row{display:flex;gap:6px;flex-wrap:wrap}.mv2__helper-row button{height:30px;border:1px solid #2a2e36;border-radius:8px;background:#151922;color:#cbd2dd;display:flex;align-items:center;gap:5px;padding:0 9px;font-size:9px}.mv2__helper-row svg{width:12px;height:12px}.mv2__count{font-size:9px;color:#777f8d;white-space:nowrap}
        .mv2__section-title{display:flex;align-items:center;gap:5px;margin:15px 0 8px;font-size:12px;font-weight:750}.mv2__section-title svg{width:13px;height:13px}.mv2__selected-model{margin-left:auto;max-width:56%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:9px;font-weight:750}.mv2__models{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.mv2__model{position:relative;min-width:0;height:66px;padding:8px;border:1px solid #272b33;border-radius:11px;background:#0f131a;color:#fff;display:flex;align-items:center;gap:7px;text-align:left;overflow:hidden;transition:border-color .14s ease,background .14s ease,box-shadow .14s ease,transform .14s ease}.mv2__model.is-active{z-index:1;border-color:#fff !important;background:#1d222b !important;outline:2px solid #fff !important;outline-offset:-2px !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.72),0 0 0 1px rgba(255,255,255,.18) !important;transform:translateY(-1px)}.mv2__model.is-active .mv2__model-copy strong{color:#fff}.mv2__model:disabled{opacity:.28;cursor:not-allowed}.mv2__model.is-featured{grid-column:1/-1;height:72px;background:#121720}.mv2__model-icon{width:34px;height:34px;flex:0 0 34px;border-radius:8px;background:#fff;display:grid;place-items:center;overflow:hidden}.mv2__model-icon img{width:22px;height:22px;object-fit:contain}.mv2__model-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.mv2__model-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}.mv2__model-copy small{color:#858d9b;font-size:8px}.mv2__tier{position:absolute;right:6px;top:5px;padding:2px 5px;border-radius:999px;font-size:7px}.mv2__tier.is-free{background:#fff;color:#000}.mv2__tier.is-pro{background:#252935;color:#c9d0db}.mv2__model-notice{margin-top:8px;min-height:26px;padding:7px 9px;border:1px solid #2b3038;border-radius:8px;background:#0f1217;color:#c3cad4;font-size:10px}
        .mv2__settings-grid{display:grid;grid-template-columns:1.1fr 1fr 1.3fr;gap:10px}.mv2__segments{display:flex;flex-wrap:wrap;gap:6px}.mv2__segments button{height:31px;padding:0 10px;border:1px solid #2a2e36;border-radius:8px;background:#11151c;color:#aeb6c4;font-size:9px}.mv2__segments button.is-active{background:#f4f4f5 !important;color:#050505 !important;border-color:#fff !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.45)}.mv2__segments button.is-disabled{opacity:.45;cursor:default}.mv2__generate-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:18px}.mv2__generate{height:46px;border:0;border-radius:12px;background:#fff;color:#050505;font-weight:800;display:flex;align-items:center;justify-content:center;gap:10px}.mv2__generate:disabled{opacity:.5;cursor:not-allowed}.mv2__generate svg{width:17px}.mv2__credits{font-size:9px;color:#8f97a5}.mv2__status{display:flex;align-items:center;gap:7px;min-height:32px;color:#8992a0;font-size:9px}.mv2__status b{color:#f4a6a6;font-weight:600}.mv2__status-dot{width:6px;height:6px;border-radius:50%;background:#666}.mv2__status-dot.is-ready{background:#39d98a}.mv2__status-dot.is-rendering,.mv2__status-dot.is-queued,.mv2__status-dot.is-checking{background:#f5c451}.mv2__status-dot.is-failed{background:#ff6b6b}
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
          .mv2m__source-preview{width:44px;height:44px;padding:0;border:1px solid #30343b;border-radius:9px;background:#14171c;color:#bfc5cd;display:grid;place-items:center;overflow:hidden}.mv2m__source-preview svg{width:18px;height:18px}.mv2m__source-preview img,.mv2m__source-preview video{width:100%;height:100%;object-fit:contain!important;object-position:center center!important;display:block;background:#050608;transform:none!important}
          .mv2m__source-copy{min-width:0;padding:0;border:0;background:transparent;color:#fff;text-align:left;display:flex;flex-direction:column;gap:3px}.mv2m__source-copy strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2m__source-copy small{font-size:8px;color:#818894}
          .mv2m__source-remove{width:30px;height:30px;border:0;border-radius:50%;background:#2d3036;color:#aeb4bd;display:grid;place-items:center}.mv2m__source-remove svg{width:13px;height:13px}
          .mv2m__result-video{margin-top:10px;border:1px solid #292d35;border-radius:14px;overflow:hidden;background:#090b0e}.mv2m__result-media{position:relative;background:#000}.mv2m__result-video video{display:block;width:100%;max-height:52vh;background:#000;object-fit:contain}.mv2m__result-video button{width:100%;height:40px;border:0;border-top:1px solid #292d35;background:#14171c;color:#fff;font-size:10px;font-weight:700}
          .mv2m__prompt{margin-top:8px;padding:11px 10px 9px;border:1px solid #2b2e35;border-radius:14px;background:linear-gradient(180deg,#101216,#0d0f12);box-shadow:inset 0 1px 0 rgba(255,255,255,.018)}
          .mv2m__prompt textarea{width:100%;height:75px;resize:none;border:0;outline:0;background:transparent;color:#f7f7f8;font-size:11px;line-height:1.45;padding:0}.mv2m__prompt textarea::placeholder{color:#717783}
          .mv2m__prompt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.mv2m__prompt-tools{display:flex;gap:7px}.mv2m__prompt-tools button{width:29px;height:29px;padding:0;border:1px solid #2c3037;border-radius:8px;background:#14171c;color:#c1c6ce;display:grid;place-items:center}.mv2m__prompt-tools button svg{width:14px;height:14px}
          .mv2m__counter{display:flex;align-items:center;gap:7px;color:#777e89;font-size:8px}.mv2m__counter button{width:20px;height:20px;padding:0;border:0;border-radius:50%;background:#343840;color:#aeb4bd;display:grid;place-items:center}.mv2m__counter button svg{width:11px;height:11px}
          .mv2m__model-select{width:100%;min-height:48px;margin-top:8px;padding:7px 10px;border:1px solid #343941;border-radius:12px;background:#12151a;color:#fff;display:grid;grid-template-columns:28px minmax(0,1fr) 22px;align-items:center;gap:8px;text-align:left}.mv2m__model-select>svg{width:18px;height:18px}.mv2m__model-select-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.mv2m__model-select-copy small{font-size:8px;color:#7f8792}.mv2m__model-select-copy strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2m__model-chevron{text-align:right;color:#aeb5bf;font-size:13px}
          .mv2m__model-head{width:100%;margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#fff}.mv2m__model-head>span{display:flex;align-items:center;gap:6px;color:#b9c0ca;font-size:10px;font-weight:700}.mv2m__model-head>span svg{width:14px;height:14px}.mv2m__model-head>strong{min-width:0;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:#fff}
          .mv2m__model-picker.is-always-open{display:grid!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:2!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;max-height:none!important;overflow:visible!important}
          .mv2m__model-picker .mv2m__model-title{padding-right:16px}
          .mv2m__controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}
          .mv2m__controls button{min-width:0;height:38px;padding:0 7px;border:1px solid #2b2e35;border-radius:10px;background:#111318;color:#bcc2cb;display:flex;align-items:center;justify-content:center;gap:5px;font-size:9px;white-space:nowrap}.mv2m__controls button svg{width:13px;height:13px;flex:0 0 13px}.mv2m__controls button span{overflow:hidden;text-overflow:ellipsis}.mv2m__controls button small{font-size:8px;color:#858c96}
          .mv2m__model-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:9px;padding:0;border:0;background:transparent;max-height:none;overflow:visible}
          .mv2m__model-picker button{position:relative;min-width:0;min-height:106px;padding:11px;border:1px solid #32353c;border-radius:14px;background:#121418;color:#fff;text-align:left;display:flex;flex-direction:column;justify-content:flex-start;gap:6px}
          .mv2m__model-picker button .mv2m__model-title{font-size:11px;font-weight:790;line-height:1.3;white-space:normal;overflow:visible;overflow-wrap:anywhere;width:100%}.mv2m__model-picker button small{font-size:9px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}.mv2m__model-top{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px}.mv2m__model-picker button .mv2m__model-icon{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;border-radius:9px;background:#fff;overflow:hidden}.mv2m__model-icon img{display:block;width:24px;height:24px;object-fit:contain}.mv2m__model-icon svg{color:#111;width:22px;height:22px}.mv2m__model-picker button .mv2m__model-tier{width:auto;font-size:9px;color:#ddd;font-weight:780;white-space:nowrap}.mv2m__model-picker button[data-tier="free"] .mv2m__model-tier{color:#fff}
          .mv2m__model-picker button.is-active{border-color:#fff;background:#1c2129;box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 0 0 1px #fff}.mv2m__model-picker button.is-active:after{content:"✓";position:absolute;right:10px;bottom:9px;font-size:12px;color:#fff}.mv2m__model-picker button:disabled{opacity:.45;cursor:not-allowed}.mv2m__model-picker button[data-tier="pro"]:not(.is-active){background:#101115}
          .mv2m__generate{width:100%;height:48px;margin-top:8px;border:0;border-radius:12px;background:#39f75a;color:#041107;font-weight:850;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 0 22px rgba(57,247,90,.16)}.mv2m__generate svg{width:15px;height:15px;fill:currentColor}.mv2m__generate:disabled{opacity:.48;cursor:not-allowed}
          .mv2m__brand{margin-top:13px;color:#9fa6b0;font-size:8px;display:flex;align-items:center;justify-content:center;gap:6px}.mv2m__brand svg{width:13px;height:13px;color:#39f75a}
          .mv2m__status.is-busy{border-color:#3a3420;background:#141108;color:#f5d27a}
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
      {/* Shared rows (camera, «Мои видео», recovery) are rendered from variables, which
          scoped styles do not reach; these rules are global but tied to this studio. */}
      <style jsx global>{`
        .mv2[data-view="video-generation-v2"] .mv2__recover{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 8px}.mv2[data-view="video-generation-v2"] .mv2__recover button,.mv2[data-view="video-generation-v2"] .mv2__recover a{height:34px;padding:0 12px;border:1px solid #343a45;border-radius:9px;background:#151922;color:#f2f5fa;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:650;text-decoration:none}.mv2[data-view="video-generation-v2"] .mv2__recover svg{width:14px;height:14px}.mv2[data-view="video-generation-v2"] .mv2__recover button:disabled{opacity:.5;cursor:not-allowed}
        .mv2[data-view="video-generation-v2"] .mv2__camera{display:flex;flex-wrap:nowrap;align-items:center;gap:6px;margin-top:9px;overflow-x:auto;scrollbar-width:none;flex:0 0 auto}.mv2[data-view="video-generation-v2"] .mv2__camera::-webkit-scrollbar{display:none}.mv2[data-view="video-generation-v2"] .mv2__camera>*{flex:0 0 auto}.mv2[data-view="video-generation-v2"] .mv2__camera-label{display:inline-flex;align-items:center;gap:5px;margin-right:2px;color:#aab2bf;font-size:10px;font-weight:700}.mv2[data-view="video-generation-v2"] .mv2__camera-label svg{width:13px;height:13px}.mv2[data-view="video-generation-v2"] .mv2__camera button{height:28px;padding:0 10px;border:1px solid #2a2e36;border-radius:999px;background:#11151c;color:#c2c9d4;font-size:10px}.mv2[data-view="video-generation-v2"] .mv2__camera button.is-active{background:#f4f4f5;color:#050505;border-color:#fff}.mv2[data-view="video-generation-v2"] .mv2__camera button:disabled{opacity:.5;cursor:not-allowed}
        .mv2[data-view="video-generation-v2"] .mv2__history{margin-top:12px;border:1px solid #272a31;border-radius:14px;background:#0c0f14;padding:10px}.mv2[data-view="video-generation-v2"] .mv2__history-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.mv2[data-view="video-generation-v2"] .mv2__history-head span{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:750}.mv2[data-view="video-generation-v2"] .mv2__history-head svg{width:14px;height:14px}.mv2[data-view="video-generation-v2"] .mv2__history-head small{color:#7e8795;font-size:10px}.mv2[data-view="video-generation-v2"] .mv2__history-head button{margin-left:auto;height:26px;padding:0 9px;border:1px solid #2a2e36;border-radius:8px;background:transparent;color:#9aa3b1;font-size:10px}.mv2[data-view="video-generation-v2"] .mv2__history-list{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}.mv2[data-view="video-generation-v2"] .mv2__history-list>button{position:relative;flex:0 0 190px;min-height:64px;padding:9px 10px 9px 34px;border:1px solid #262a31;border-radius:10px;background:#11151c;color:#eef2f8;text-align:left;display:flex;flex-direction:column;gap:4px}.mv2[data-view="video-generation-v2"] .mv2__history-list>button.is-active{border-color:#fff}.mv2[data-view="video-generation-v2"] .mv2__history-list>button svg{position:absolute;left:10px;top:11px;width:14px;height:14px}.mv2[data-view="video-generation-v2"] .mv2__history-list>button span{font-size:11px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mv2[data-view="video-generation-v2"] .mv2__history-list>button small{color:#8a93a1;font-size:9px}.mv2[data-view="video-generation-v2"] .mv2__history-list>button:disabled{opacity:.5;cursor:not-allowed}
        @media (max-width:820px){
          .mv2[data-view="video-generation-v2"] .mv2__recover{margin-top:8px}.mv2[data-view="video-generation-v2"] .mv2__recover button,.mv2[data-view="video-generation-v2"] .mv2__recover a{flex:1 1 auto;justify-content:center;height:40px;font-size:11px}
          .mv2[data-view="video-generation-v2"] .mv2__camera{padding-top:8px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.mv2[data-view="video-generation-v2"] .mv2__camera::-webkit-scrollbar{display:none}.mv2[data-view="video-generation-v2"] .mv2__camera button{flex:0 0 auto;height:30px}
          .mv2[data-view="video-generation-v2"] .mv2__history{margin-top:12px;padding:9px}.mv2[data-view="video-generation-v2"] .mv2__history-list>button{flex-basis:160px}
        }
      `}</style>
    </main>
  )
}
