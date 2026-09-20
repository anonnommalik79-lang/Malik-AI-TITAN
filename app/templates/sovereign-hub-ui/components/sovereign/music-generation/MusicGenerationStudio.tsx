"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react"
import "./music-generation.css"

type GenreId = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
type Mood = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"
type LyricsLanguage = "kk" | "ru" | "en"
type JobStatus = "queued" | "processing" | "ready" | "failed"

type Genre = {
  id: GenreId
  label: string
  /** Square artwork for the desktop tiles. */
  image: string
  /** The phone layout ships its own crops of the same six covers. */
  mobileImage: string
  seed: string
}

type MusicConfig = {
  configured: boolean
  authenticated: boolean
  plan: string
  model: string
  limits: {
    daily: number
    maxDurationSeconds: number
    used: number
    remaining: number
    resetAt?: string
  }
}

type MusicHistoryItem = {
  requestId: string
  title: string
  prompt: string
  lyrics: string
  lyricsEnabled: boolean
  lyricsLanguage: LyricsLanguage
  instrumental: boolean
  duration: number
  genreId: GenreId
  mood: Mood
  status: JobStatus
  progress?: number
  resultUrl?: string
  downloadUrl?: string
  createdAt: string
  error?: string
}

const GENRES: Genre[] = [
  {
    id: "phonk",
    label: "Phonk",
    image: "/music-studio/phonk.jpg",
    mobileImage: "/music-studio/m-phonk.jpg",
    seed: "Ночной агрессивный фонк, плотный 808, cowbell, тёмная атмосфера",
  },
  {
    id: "trap",
    label: "Trap",
    image: "/music-studio/trap.jpg",
    mobileImage: "/music-studio/m-trap.jpg",
    seed: "Современный trap, тяжёлый 808, быстрые hi-hat, атмосферный synth",
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    image: "/music-studio/hiphop.jpg",
    mobileImage: "/music-studio/m-hiphop.jpg",
    seed: "Современный hip-hop бит, плотный groove, чистый бас и уверенный ритм",
  },
  {
    id: "lofi",
    label: "Lo-Fi",
    image: "/music-studio/lofi.jpg",
    mobileImage: "/music-studio/m-lofi.jpg",
    seed: "Спокойный lo-fi, тёплый винил, мягкие барабаны, ночная атмосфера",
  },
  {
    id: "edm",
    label: "EDM",
    image: "/music-studio/edm.jpg",
    mobileImage: "/music-studio/m-edm.jpg",
    seed: "Энергичный EDM, мощный drop, яркие synth и клубная энергия",
  },
  {
    id: "other",
    label: "Другое",
    image: "/music-studio/other.jpg",
    mobileImage: "/music-studio/m-other.jpg",
    seed: "Экспериментальный современный трек с необычной фактурой",
  },
]

const DURATION_OPTIONS = [15, 30, 60, 120, 180] as const
const MOODS: Mood[] = ["Агрессивный", "Спокойный", "Атмосферный", "Энергичный", "Грустный", "Другое"]
const LANGUAGE_LABELS: Record<LyricsLanguage, string> = { kk: "Қазақша", ru: "Русский", en: "English" }
const HISTORY_KEY = "malik-music-history-v2"
const QUALITY_OPTIONS = ["128", "320 kbps", "WAV"] as const
const VARIANT_OPTIONS = [1, 2, 4] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

function variantLabel(value: number) {
  return value === 1 ? "1 трек" : value + " трека"
}

function statusWord(status: JobStatus) {
  if (status === "ready") return "готов"
  if (status === "failed") return "ошибка"
  return status === "queued" ? "в очереди" : "генерация"
}

/** The little bar chart on a history row, stable per row rather than random. */
function miniWave(seed: number) {
  return Array.from({ length: 26 }, (_, index) => 5 + ((seed * 7 + index * 11) % 13))
}

function durationLabel(value: number) {
  if (value < 60) return value + " сек"
  return value / 60 + " мин"
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds || 0))
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0")
}

function historyTitle(prompt: string, genre: Genre) {
  const clean = prompt.split(/[,.!?]/)[0]?.trim()
  if (clean && clean.length <= 42) return clean
  return genre.id === "phonk" ? "Night Drive" : genre.label + " Session"
}

/**
 * The music provider answers in English, to whoever is integrating it. Its
 * two most common refusals are not about the request at all - they are about
 * the account the server pays with - and "Client account is suspended" on a
 * Russian screen tells the person nothing they can act on.
 */
function providerMessage(raw: unknown) {
  const text = String(raw || "").trim()
  if (/suspend/i.test(text)) {
    return "Аккаунт музыкального провайдера приостановлен — генерация не пройдёт, пока он не восстановлен. Ответ сервиса: " + text
  }
  if (/insufficient|balance|credit|quota|payment/i.test(text)) {
    return "У музыкального провайдера закончился баланс или лимит. Ответ сервиса: " + text
  }
  if (/unauthor|forbidden|api key|token/i.test(text)) {
    return "Музыкальный провайдер не принял ключ сервера. Ответ сервиса: " + text
  }
  return text || "Сервис генерации не принял запрос."
}

function safeHistory(value: unknown): MusicHistoryItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === "object" && typeof item.requestId === "string")
    .slice(0, 30) as MusicHistoryItem[]
}

/**
 * The reference pages draw their own icons inline. They are reproduced here
 * rather than swapped for a library set, because the stroke weight and the
 * exact shapes are part of what was asked for.
 */
const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
const IconPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5 18 12 8 18.5V5.5Z" /></svg>
const IconPause = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
const IconHeart = ({ filled = false }: { filled?: boolean }) => (
  <svg {...stroke} fill={filled ? "currentColor" : "none"} aria-hidden="true">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-7.8Z" />
  </svg>
)
const IconDownload = () => <svg {...stroke} aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
const IconShare = () => (
  <svg {...stroke} aria-hidden="true">
    <circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" />
    <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
  </svg>
)
const IconRefresh = () => <svg {...stroke} aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5" /><path d="M20 4v7h-7" /></svg>
const IconClose = () => <svg {...stroke} aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
const IconImage = () => <svg {...stroke} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 15-5-5L5 20" /></svg>
const IconSparkles = () => (
  <svg {...stroke} aria-hidden="true">
    <path d="m12 3 1.4 4.1 4.1 1.4-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
    <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
  </svg>
)
const IconSliders = () => (
  <svg {...stroke} aria-hidden="true">
    <path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" />
    <path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" />
    <path d="M4 18h7" /><path d="M15 18h5" /><circle cx="13" cy="18" r="2" />
  </svg>
)
const IconMusic = () => <svg {...stroke} aria-hidden="true"><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>
const IconFile = () => <svg {...stroke} aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6" /></svg>
const IconClock = () => <svg {...stroke} aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 3h6" /></svg>
const IconMood = () => <svg {...stroke} aria-hidden="true"><path d="M4 13c1.4-5 4.8-8 8-8s6.6 3 8 8" /><path d="M5 14c1 3 3.2 5 7 5s6-2 7-5" /><path d="M8 8 6 5M16 8l2-3" /></svg>
const IconBox = () => <svg {...stroke} aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.2 7.5-4.2" /><path d="M12 12v9" /></svg>
const IconBolt = () => <svg {...stroke} aria-hidden="true"><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z" /><path d="M5 21h14" /></svg>
const IconBack = () => <svg {...stroke} aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
const IconSpinner = () => <svg {...stroke} className="mm-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>

export function MusicGenerationStudio({ username }: { username?: string }) {
  const [genreId, setGenreId] = useState<GenreId>("phonk")
  const [prompt, setPrompt] = useState("")
  const [lyrics, setLyrics] = useState("")
  const [lyricsEnabled, setLyricsEnabled] = useState(true)
  const [lyricsLanguage, setLyricsLanguage] = useState<LyricsLanguage>("ru")
  const [duration, setDuration] = useState<number>(30)
  const [mood, setMood] = useState<Mood>("Агрессивный")
  const [instrumental, setInstrumental] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState("")
  const [trackUrl, setTrackUrl] = useState("")
  const [trackTitle, setTrackTitle] = useState("Night Drive")
  const [liked, setLiked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [coverPreview, setCoverPreview] = useState("")
  const [quality, setQuality] = useState<Quality>("320 kbps")
  const [variants, setVariants] = useState<number>(1)
  const [modelChoice, setModelChoice] = useState("")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [mastering, setMastering] = useState(true)
  const [phonkMode, setPhonkMode] = useState(true)
  const [toast, setToast] = useState("")
  /** The real length of the loaded MP3, once the browser has read its header. */
  const [audioDuration, setAudioDuration] = useState(0)
  const [notice, setNotice] = useState("")
  const [config, setConfig] = useState<MusicConfig | null>(null)
  const [history, setHistory] = useState<MusicHistoryItem[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const modelBoxRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<number | undefined>(undefined)
  /** How many more variants of the current request are still to be sent. */
  const pendingVariantsRef = useRef(0)
  /**
   * Hands over the next variant once the current one is finished.
   *
   * The server takes one track per request, so "4 трека" means four requests.
   * They go one at a time rather than all at once: the day's allowance is
   * counted per request, and four in flight would report four different
   * request ids into one player.
   */
  const submitRef = useRef<(() => void) | null>(null)
  const queueNextVariant = () => {
    if (pendingVariantsRef.current <= 0) return
    pendingVariantsRef.current -= 1
    window.setTimeout(() => submitRef.current?.(), 400)
  }

  const genre = GENRES.find((item) => item.id === genreId) || GENRES[0]
  const availableDurations = useMemo(
    () => DURATION_OPTIONS.filter((value) => value <= (config?.limits.maxDurationSeconds || 30)),
    [config?.limits.maxDurationSeconds],
  )
  const activeHistoryItem = history.find((item) => item.requestId === activeRequestId)
  const wave = useMemo(
    () => Array.from({ length: 72 }, (_, index) => 8 + ((index * 13 + genreId.length * 7) % 29)),
    [genreId],
  )

  const refreshConfig = async () => {
    try {
      const response = await fetch("/api/media/music", { method: "GET", cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        setConfig(data as MusicConfig)
        setDuration((value) => Math.min(value, Number(data?.limits?.maxDurationSeconds || 30)))
      }
    } catch {
      // The Generate action will surface a useful server error if needed.
    }
  }

  useEffect(() => {
    refreshConfig()
    try {
      const stored = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]")
      const rows = safeHistory(stored)
      setHistory(rows)
      const pending = rows.find((item) => item.status === "queued" || item.status === "processing")
      if (pending) setActiveRequestId(pending.requestId)
      const ready = rows.find((item) => item.status === "ready" && item.resultUrl)
      if (ready?.resultUrl) {
        setTrackUrl(ready.resultUrl)
        setTrackTitle(ready.title)
      }
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)))
    } catch {
      // History is a convenience layer; generation itself remains server-side.
    }
  }, [history])

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  useEffect(() => {
    if (!activeRequestId) return
    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      try {
        const response = await fetch(
          "/api/media/music/status?requestId=" + encodeURIComponent(activeRequestId),
          { method: "GET", cache: "no-store" },
        )
        const data = await response.json().catch(() => null)
        if (cancelled) return

        if (!response.ok) {
          setNotice(data?.error || "Не удалось проверить статус трека.")
          timer = window.setTimeout(poll, 4500)
          return
        }

        if ((data?.status === "ready" || data?.status === "done") && data?.resultUrl) {
          setHistory((rows) => rows.map((item) =>
            item.requestId === activeRequestId
              ? {
                  ...item,
                  status: "ready",
                  progress: 100,
                  resultUrl: String(data.resultUrl),
                  downloadUrl: String(data.downloadUrl || ""),
                  error: undefined,
                }
              : item,
          ))
          const item = history.find((row) => row.requestId === activeRequestId)
          setTrackTitle(item?.title || trackTitle)
          setTrackUrl(String(data.resultUrl))
          setCurrentTime(0)
          setGenerating(false)
          setNotice("Трек готов.")
          setActiveRequestId("")
          refreshConfig()
          queueNextVariant()
          return
        }

        if (data?.status === "failed") {
          setHistory((rows) => rows.map((item) =>
            item.requestId === activeRequestId
              ? { ...item, status: "failed", error: String(data?.error || "Генерация не завершилась.") }
              : item,
          ))
          setGenerating(false)
          setNotice(providerMessage(data?.error) || "Генерация не завершилась.")
          setActiveRequestId("")
          // A failed variant does not cancel the ones still owed.
          queueNextVariant()
          refreshConfig()
          return
        }

        const nextStatus: JobStatus = data?.status === "queued" ? "queued" : "processing"
        setHistory((rows) => rows.map((item) =>
          item.requestId === activeRequestId
            ? { ...item, status: nextStatus, progress: Number(data?.progress || item.progress || 0) }
            : item,
        ))
        setGenerating(true)
        setNotice(nextStatus === "queued" ? "Задание в очереди deAPI…" : "deAPI генерирует настоящий MP3…")
        timer = window.setTimeout(poll, 3000)
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 5000)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [activeRequestId])

  const chooseGenre = (next: Genre) => {
    setGenreId(next.id)
    if (!prompt.trim()) setPrompt(next.seed)
  }

  const improvePrompt = () => {
    setPrompt((value) => {
      const base = value.trim() || genre.seed
      const addition = "мощный бас, чистый мастеринг, объёмная стереосцена, запоминающийся хук, современная продакшн-обработка"
      return (base + ", " + addition).slice(0, 2000)
    })
  }

  const handleCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !file.type.startsWith("image/")) return
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  const submitGeneration = async (override?: Partial<MusicHistoryItem>) => {
    if (generating) return

    const nextGenreId = override?.genreId || genreId
    const nextGenre = GENRES.find((item) => item.id === nextGenreId) || genre
    const nextPrompt = String(override?.prompt ?? prompt).trim() || nextGenre.seed
    const nextLyrics = String(override?.lyrics ?? lyrics)
    const nextLyricsEnabled = override?.lyricsEnabled ?? lyricsEnabled
    const nextInstrumental = override?.instrumental ?? instrumental
    const nextDuration = Number(override?.duration ?? duration)
    const nextMood = (override?.mood ?? mood) as Mood
    const nextLanguage = (override?.lyricsLanguage ?? lyricsLanguage) as LyricsLanguage

    if (!config?.authenticated) {
      setNotice("Войдите в аккаунт, чтобы создавать музыку.")
      return
    }
    if (!config?.configured) {
      setNotice("deAPI не настроен на сервере.")
      return
    }
    if (config.limits.remaining <= 0) {
      setNotice("Дневной лимит генерации музыки исчерпан.")
      return
    }
    if (nextDuration > config.limits.maxDurationSeconds) {
      setNotice("Максимальная длительность вашего тарифа: " + config.limits.maxDurationSeconds + " сек.")
      return
    }
    setGenerating(true)
    setNotice(
      !nextInstrumental && !nextLyrics.trim()
        ? "Malik AI пишет слова песни по вашему запросу…"
        : "Отправляю запрос в deAPI / AceStep 1.5 XL Turbo…",
    )
    audioRef.current?.pause()
    setPlaying(false)

    try {
      const response = await fetch("/api/media/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          lyrics: nextInstrumental || !nextLyricsEnabled ? "" : nextLyrics,
          lyricsEnabled: !nextInstrumental && nextLyricsEnabled,
          lyricsLanguage: nextLanguage,
          instrumental: nextInstrumental,
          duration: nextDuration,
          genre: nextGenreId,
          mood: nextMood,
          // Preferences the studio collects. The route reads what it knows and
          // ignores the rest, so the player always reports the format that
          // actually came back rather than the one that was asked for.
          quality,
          model: modelName,
          mastering,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok || !data?.requestId) {
        setGenerating(false)
        setNotice(providerMessage(data?.error))
        await refreshConfig()
        return
      }

      const resolvedLyrics = String(data?.lyrics || nextLyrics)
      const resolvedLanguage = (["kk", "ru", "en"].includes(String(data?.lyricsLanguage))
        ? String(data.lyricsLanguage)
        : nextLanguage) as LyricsLanguage

      if (!nextInstrumental && resolvedLyrics) {
        setLyrics(resolvedLyrics)
        setLyricsLanguage(resolvedLanguage)
        setLyricsEnabled(true)
      }

      const item: MusicHistoryItem = {
        requestId: String(data.requestId),
        title: historyTitle(nextPrompt, nextGenre),
        prompt: nextPrompt,
        lyrics: resolvedLyrics,
        lyricsEnabled: !nextInstrumental,
        lyricsLanguage: resolvedLanguage,
        instrumental: nextInstrumental,
        duration: nextDuration,
        genreId: nextGenreId,
        mood: nextMood,
        status: "queued",
        progress: 0,
        downloadUrl: String(data.downloadUrl || ""),
        createdAt: new Date().toISOString(),
      }

      setHistory((rows) => [item, ...rows.filter((row) => row.requestId !== item.requestId)].slice(0, 30))
      setTrackTitle(item.title)
      setActiveRequestId(item.requestId)
      setConfig((current) => current ? {
        ...current,
        limits: {
          ...current.limits,
          used: Number(data.used ?? current.limits.used),
          remaining: Number(data.remaining ?? Math.max(0, current.limits.remaining - 1)),
        },
      } : current)
      setNotice(
        data?.lyricsGenerated
          ? "Malik AI написал слова. request_id получен — AceStep создаёт музыку и вокал…"
          : "request_id получен. Ожидаю очередь deAPI…",
      )
    } catch (error) {
      setGenerating(false)
      setNotice(error instanceof Error ? error.message : "Не удалось отправить запрос.")
    }
  }

  const regenerate = (item?: MusicHistoryItem) => {
    const source = item || history.find((row) => row.status === "ready" && row.resultUrl)
    if (!source) {
      submitGeneration()
      return
    }
    setGenreId(source.genreId)
    setPrompt(source.prompt)
    setLyrics(source.lyrics)
    setLyricsEnabled(source.lyricsEnabled)
    setLyricsLanguage(source.lyricsLanguage)
    setInstrumental(source.instrumental)
    setDuration(source.duration)
    setMood(source.mood)
    submitGeneration(source)
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || !trackUrl) {
      setNotice("Сначала дождитесь настоящего MP3 от deAPI.")
      return
    }
    if (audio.paused) {
      await audio.play().catch(() => undefined)
      setPlaying(!audio.paused)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const currentReady = history.find((item) => item.resultUrl === trackUrl && item.status === "ready")
  const downloadTrack = (item?: MusicHistoryItem) => {
    const source = item || currentReady
    if (!source?.requestId) {
      setNotice("Сначала дождитесь готового MP3.")
      return
    }
    const anchor = document.createElement("a")
    anchor.href = source.downloadUrl || ("/api/media/music/download?requestId=" + encodeURIComponent(source.requestId))
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const shareTrack = async () => {
    if (!trackUrl) {
      setNotice("Сначала дождитесь готового MP3.")
      return
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: "Malik Music", text: trackTitle, url: trackUrl })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(trackUrl)
        setNotice("Ссылка на MP3 скопирована.")
      }
    } catch {
      setNotice("Не удалось открыть системное меню «Поделиться».")
    }
  }


  /* --------------------------------------------------------------- helpers */

  /** The reference design's toast: a short line that fades by itself. */
  const flash = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(""), 1800)
  }

  const modelOptions = useMemo(
    () => ["Auto · Malik Router", config?.model || "AceStep 1.5 XL Turbo", "Malik Music v1"]
      .filter((name, index, all) => all.indexOf(name) === index),
    [config?.model],
  )
  const modelName = modelChoice || config?.model || "AceStep 1.5 XL Turbo"

  const cycleModel = () => {
    const index = Math.max(0, modelOptions.indexOf(modelName))
    const next = modelOptions[(index + 1) % modelOptions.length]
    setModelChoice(next)
    flash("Модель: " + next)
  }

  useEffect(() => {
    if (!modelMenuOpen) return
    const close = (event: PointerEvent) => {
      if (!modelBoxRef.current?.contains(event.target as Node)) setModelMenuOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [modelMenuOpen])

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
  }, [])

  // The two switches are one choice with two faces: a track either has vocals
  // or it does not, and letting both be on at once produced requests that
  // contradicted themselves.
  const toggleInstrumental = () => {
    const next = !instrumental
    setInstrumental(next)
    setLyricsEnabled(!next)
    flash("Инструментал: " + (next ? "включено" : "выключено"))
  }
  const toggleLyrics = () => {
    const next = !lyricsEnabled
    setLyricsEnabled(next)
    setInstrumental(!next)
    flash("Текст песни: " + (next ? "включено" : "выключено"))
  }

  const openTrack = (item: MusicHistoryItem, play = false) => {
    if (!item.resultUrl) {
      flash(item.status === "failed" ? "Этот трек не сгенерировался" : "Трек ещё генерируется")
      return
    }
    setTrackUrl(item.resultUrl)
    setTrackTitle(item.title)
    setGenreId(item.genreId)
    setCurrentTime(0)
    if (play) window.setTimeout(() => audioRef.current?.play().catch(() => undefined), 0)
    flash("Открыт трек: " + item.title)
  }

  const removeTrack = (item: MusicHistoryItem) => {
    setHistory((rows) => rows.filter((row) => row.requestId !== item.requestId))
    if (item.resultUrl && item.resultUrl === trackUrl) {
      audioRef.current?.pause()
      setTrackUrl("")
      setPlaying(false)
      setCurrentTime(0)
    }
    flash("Удалено: " + item.title)
  }

  /**
   * Asks for as many tracks as the person chose.
   *
   * Every variant is a separate job on the server and costs one of the day's
   * generations, so the count is trimmed to what is actually left rather than
   * promising four and delivering one. The rest are sent as each finishes -
   * the queue below hands them over.
   */
  useEffect(() => {
    submitRef.current = () => { void submitGeneration() }
    return () => { submitRef.current = null }
  })

  const startGeneration = () => {
    const allowed = Math.max(1, Math.min(variants, config?.limits.remaining ?? variants))
    pendingVariantsRef.current = allowed - 1
    if (allowed < variants) {
      flash("Осталось генераций: " + allowed)
    } else if (allowed > 1) {
      flash("Ставлю в очередь " + variantLabel(allowed))
    }
    void submitGeneration()
  }

  /* ------------------------------------------------------------------ view */

  const quotaLabel = config
    ? config.limits.remaining + " / " + config.limits.daily + " сегодня"
    : "Проверяю лимит…"

  const statusLabel =
    activeHistoryItem?.status === "queued" ? "В очереди" :
    activeHistoryItem?.status === "processing" ? "Генерация" :
    trackUrl ? "MP3 READY" : genre.label.toUpperCase()

  // The chosen length until the file itself says otherwise, then the truth.
  const totalSeconds = trackUrl && audioDuration > 0 ? Math.round(audioDuration) : duration

  const genreTiles = (mobile: boolean) => GENRES.map((item) => (
    <button
      key={item.id}
      type="button"
      className={"mm-genre" + (item.id === genreId ? " is-active" : "")}
      /**
       * The artwork travels as a custom property, not as background-image.
       * The shell paints every aria-pressed control with the `background`
       * shorthand marked important, and a shorthand resets the image - which
       * left the chosen genre as an empty rectangle. A property the stylesheet
       * re-applies, also important, survives that.
       */
      style={mobile ? ({ "--mm-genre-image": "url(" + item.mobileImage + ")" } as CSSProperties) : undefined}
      onClick={() => { chooseGenre(item); flash("Жанр: " + item.label) }}
      aria-pressed={item.id === genreId}
    >
      {mobile ? null : <img src={item.image} alt="" loading="lazy" />}
      {/*
        One name per card, and it is this one.
        
        The covers arrived with their names drawn into the picture, and the
        markup printed a second over the top - every card said "Phonk" twice,
        once crisp and once as a dim smudge behind it. The artwork was
        trimmed of its baked-in strip, so the only name on a card is this
        label: readable, and the same weight on all six.
      */}
      <span>{item.label}</span>
    </button>
  ))

  const durationOptions = DURATION_OPTIONS.map((value) => (
    <button
      key={value}
      type="button"
      className={"mm-opt" + (value === duration ? " is-active" : "")}
      onClick={() => setDuration(value)}
      disabled={!availableDurations.includes(value)}
      title={availableDurations.includes(value) ? undefined : "Недоступно на вашем тарифе"}
    >
      {durationLabel(value)}
    </button>
  ))

  const qualityOptions = (long: boolean) => QUALITY_OPTIONS.map((value) => (
    <button
      key={value}
      type="button"
      className={"mm-opt" + (value === quality ? " is-active" : "")}
      onClick={() => { setQuality(value); flash("Качество: " + value) }}
    >
      {long && value === "128" ? "128 kbps" : value}
    </button>
  ))

  const moodOptions = MOODS.map((value) => (
    <button
      key={value}
      type="button"
      className={"mm-opt" + (value === mood ? " is-active" : "")}
      onClick={() => setMood(value)}
    >
      {value}
    </button>
  ))

  const trackRows = history.length ? history.map((item, index) => {
    const itemGenre = GENRES.find((entry) => entry.id === item.genreId) || GENRES[0]
    const ready = item.status === "ready" && Boolean(item.resultUrl)
    return (
      <div
        key={item.requestId}
        className={"mm-htrack" + (item.resultUrl && item.resultUrl === trackUrl ? " is-active" : "")}
      >
        <button
          type="button"
          className="mm-hcover"
          style={{ backgroundImage: "url(" + itemGenre.image + ")" }}
          onClick={() => openTrack(item)}
          aria-label={"Открыть " + item.title}
        />
        <button type="button" className="mm-hmeta" onClick={() => openTrack(item)}>
          <strong>{item.title}</strong>
          <small>
            {itemGenre.label} · {durationLabel(item.duration)} · {statusWord(item.status)}
            {item.instrumental ? " · инструментал" : " · " + LANGUAGE_LABELS[item.lyricsLanguage]}
          </small>
          <span className="mm-hwave">
            {miniWave(index).map((height, key) => <i key={key} style={{ height }} />)}
          </span>
        </button>
        <div className="mm-hactions">
          <button type="button" onClick={() => openTrack(item, true)} disabled={!ready} aria-label="Воспроизвести"><IconPlay /></button>
          <button type="button" onClick={() => downloadTrack(item)} disabled={!ready} aria-label="Скачать"><IconDownload /></button>
          <button type="button" onClick={() => removeTrack(item)} aria-label="Удалить"><IconClose /></button>
        </div>
      </div>
    )
  }) : (
    <div className="mm-empty">Здесь будут все сгенерированные треки пользователя.</div>
  )

  const historyPanel = (
    <div className="mm-history">
      <div className="mm-history-head">
        <strong>Все сгенерированные треки</strong>
        <span>{history.length} · {quotaLabel}</span>
      </div>
      <div className="mm-tracklist">{trackRows}</div>
    </div>
  )

  const generateLabel = generating
    ? (activeHistoryItem?.status === "processing" ? "Генерация MP3…" : "Отправляю запрос…")
    : "Сгенерировать трек"

  return (
    <section
      className="malik-music"
      data-malik-music-studio
      data-user={username || "guest"}
      /**
       * The blue-UI guard walks the live DOM and repaints anything it reads as
       * a blue surface. The switch track (#353c45) and its knob (#c8ced4) sit
       * just inside its range, and both were being flattened to the same grey
       * - a toggle you could not see. This screen's palette is black, white
       * and green, so it opts out the way the guard provides for.
       */
      data-preserve-brand-color="true"
    >
      <audio
        ref={audioRef}
        src={trackUrl || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          setAudioDuration(Number.isFinite(value) ? value : 0)
        }}
        onEmptied={() => setAudioDuration(0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
      />
      <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCover} />

      {/* ----------------------------------------------------------- desktop */}
      <div className="mm-desktop">
        <div className="mm-workspace">
          <aside className="mm-side">
            <img src="/music-studio/side-left.jpg" alt="" loading="lazy" />
          </aside>

          <section className="mm-center">
            <div className="mm-section-title">Malik Music Studio</div>
            <div className="mm-hero" role="img" aria-label="Malik Music Studio" />

            <div className="mm-main">
              {/*
                No genre strip on the desktop layout. Six dark crops in a row
                read as clutter at this size and they were eating the height
                the banner needs to be seen whole. The genre still travels
                with the request - it is chosen on the phone, and it is what
                seeds an empty prompt.
              */}
              <div className="mm-card">
                <textarea
                  className="mm-prompt-input"
                  value={prompt}
                  maxLength={2000}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Опишите, какую музыку вы хотите создать..."
                  aria-label="Описание трека"
                />
                <div className="mm-card-tools">
                  <div className="mm-tool-group">
                    <button type="button" className="mm-tool" onClick={() => coverInputRef.current?.click()} title="Обложка"><IconImage /></button>
                    <button type="button" className="mm-tool" onClick={() => { improvePrompt(); flash("Промпт усилен") }} title="Усилить запрос"><IconSparkles /></button>
                    <button type="button" className="mm-tool" onClick={() => setPrompt(genre.seed)} title="Подставить пример жанра"><IconSliders /></button>
                  </div>
                  <div className="mm-tool-group">
                    <div className="mm-counter">{prompt.length}/2000</div>
                    <button type="button" className="mm-tool" onClick={() => { setPrompt(""); flash("Поле запроса очищено") }} title="Очистить"><IconClose /></button>
                  </div>
                </div>
              </div>

              <div className="mm-card">
                <div className="mm-subtitle">
                  <span>Текст песни · Malik AI</span>
                  <div className="mm-langs">
                    {(Object.keys(LANGUAGE_LABELS) as LyricsLanguage[]).map((code) => (
                      <button
                        key={code}
                        type="button"
                        className={code === lyricsLanguage ? "is-active" : ""}
                        onClick={() => setLyricsLanguage(code)}
                      >
                        {LANGUAGE_LABELS[code]}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="mm-lyrics-input"
                  value={lyrics}
                  maxLength={12000}
                  onChange={(event) => setLyrics(event.target.value)}
                  placeholder={"Оставьте пустым — Malik AI сам напишет слова по вашему запросу.\n\nИли вставьте свои слова здесь..."}
                  aria-label="Текст песни"
                />
                <div className="mm-card-tools">
                  <div className="mm-counter">{lyrics.length}/12000 · пусто = Malik AI напишет автоматически</div>
                </div>
              </div>

              <div className="mm-grid2">
                <div className="mm-control">
                  <div className="mm-label">Длительность</div>
                  <div className="mm-opts">{durationOptions}</div>
                </div>

                <div className="mm-control mm-model-select" ref={modelBoxRef}>
                  <div className="mm-label">Модель</div>
                  <button type="button" className="mm-model-trigger" onClick={() => setModelMenuOpen((value) => !value)} aria-expanded={modelMenuOpen}>
                    <span>{modelName}</span><b>⌄</b>
                  </button>
                  {modelMenuOpen ? (
                    <div className="mm-model-menu">
                      {modelOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={"mm-model-option" + (name === modelName ? " is-active" : "")}
                          onClick={() => { setModelChoice(name); setModelMenuOpen(false); flash("Модель: " + name) }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mm-control">
                  <div className="mm-label">Результат</div>
                  <div className="mm-result-grid">
                    <div className="mm-result-sub">
                      <div className="mm-opts"><button type="button" className="mm-opt is-active">MP3</button></div>
                    </div>
                    <div className="mm-result-sub">
                      <div className="mm-opts">{qualityOptions(false)}</div>
                    </div>
                  </div>
                  <div className="mm-label" style={{ marginTop: 7 }}>Варианты</div>
                  <div className="mm-opts">
                    {VARIANT_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={"mm-opt" + (value === variants ? " is-active" : "")}
                        onClick={() => { setVariants(value); flash("Варианты: " + variantLabel(value)) }}
                      >
                        {variantLabel(value)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mm-moods">
                <div className="mm-label">Настроение</div>
                <div className="mm-opts">{moodOptions}</div>
              </div>

              <div className="mm-switchgrid">
                <div className="mm-toggle">
                  <span><IconMusic />Инструментал</span>
                  <button type="button" className={"mm-switch" + (instrumental ? " is-on" : "")} onClick={() => toggleInstrumental()} aria-pressed={instrumental}><i /></button>
                </div>
                <div className="mm-toggle">
                  <span><IconFile />Текст песни (AI)</span>
                  <button type="button" className={"mm-switch" + (lyricsEnabled ? " is-on" : "")} onClick={() => toggleLyrics()} aria-pressed={lyricsEnabled}><i /></button>
                </div>
                <div className="mm-toggle">
                  <span><IconSparkles />Авто-мастеринг</span>
                  <button type="button" className={"mm-switch" + (mastering ? " is-on" : "")} onClick={() => { setMastering((value) => !value); flash("Авто-мастеринг: " + (mastering ? "выключено" : "включено")) }} aria-pressed={mastering}><i /></button>
                </div>
              </div>

              <button className="mm-generate" type="button" onClick={() => startGeneration()} disabled={generating || config?.limits.remaining === 0}>
                {generating ? <IconSpinner /> : <IconPlay />}
                <span>{generateLabel}</span>
              </button>

              <div className="mm-player">
                <div className="mm-cover" style={{ backgroundImage: "url(" + (coverPreview || genre.image) + ")" }} />
                <div>
                  <div>
                    <span className="mm-track-title">{trackTitle}</span>
                    <span className="mm-tag">{statusLabel}</span>
                  </div>
                  <div className="mm-track-time">{formatTime(currentTime)} / {formatTime(totalSeconds)}</div>
                  <div className={"mm-wave" + (playing ? " is-playing" : "")}>
                    {wave.map((height, index) => <i key={index} style={{ height }} />)}
                  </div>
                  {activeRequestId ? <div className="mm-request">request_id: {activeRequestId}</div> : null}
                </div>
                <div className="mm-pactions">
                  <button type="button" className="mm-mini mm-play" onClick={togglePlay} disabled={!trackUrl} title="Воспроизвести / пауза" aria-label="Воспроизвести">
                    {playing ? <IconPause /> : <IconPlay />}
                  </button>
                  <button type="button" className={"mm-mini" + (liked ? " is-active" : "")} onClick={() => { setLiked((value) => !value); flash(liked ? "Убрано из избранного" : "Добавлено в избранное") }} title="Нравится" aria-label="Нравится"><IconHeart /></button>
                  <button type="button" className="mm-mini" onClick={() => downloadTrack()} disabled={!trackUrl} title="Скачать" aria-label="Скачать"><IconDownload /></button>
                  <button type="button" className="mm-mini" onClick={shareTrack} disabled={!trackUrl} title="Поделиться" aria-label="Поделиться"><IconShare /></button>
                  <button type="button" className="mm-mini" onClick={() => regenerate()} disabled={generating} title="Сгенерировать заново" aria-label="Сгенерировать заново"><IconRefresh /></button>
                </div>
              </div>

              {notice ? <div className="mm-notice">{notice}</div> : null}
              {historyPanel}
            </div>
          </section>

          <aside className="mm-side">
            <img src="/music-studio/side-right.jpg" alt="" loading="lazy" />
          </aside>
        </div>
      </div>

      {/* ------------------------------------------------------------ mobile */}
      <div className="mm-mobile">
        {/*
          A div, not a header. Global mobile CSS paints every <header> inside
          #malik-root with rgba(3,7,18,.94) and turns it into a horizontal
          scroller - it is written for the app's own top bar, and it made this
          one navy blue. The role keeps the meaning for assistive technology.
        */}
        <div className="mm-m-head" role="banner">
          <button type="button" className="mm-m-back" onClick={() => setPrompt("")} aria-label="Очистить запрос"><IconBack /></button>
          <div className="mm-m-brand"><strong>MALIK AI</strong><small>MUSIC STUDIO</small></div>
          <button type="button" className="mm-m-mode" onClick={() => { const next = !phonkMode; setPhonkMode(next); if (next) chooseGenre(GENRES[0]); flash(next ? "Phonk Mode включён" : "Обычный режим") }}>
            <IconBolt /><span>{phonkMode ? "PHONK MODE" : "MUSIC MODE"}</span>
          </button>
        </div>

        <section className="mm-m-hero" aria-label="Malik AI Music Studio" />

        <div className="mm-genres">{genreTiles(true)}</div>

        <section className="mm-m-prompt">
          <textarea
            value={prompt}
            maxLength={2000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Опишите, какую музыку вы хотите создать..."
            aria-label="Описание трека"
          />
          <div className="mm-m-prompt-foot">
            <div className="mm-m-tools">
              <button type="button" className="mm-m-smallbtn" onClick={() => coverInputRef.current?.click()} aria-label="Добавить референс"><IconImage /></button>
              <button type="button" className="mm-m-smallbtn" onClick={() => { improvePrompt(); flash("Промпт усилен") }} aria-label="Улучшить запрос"><IconSparkles /></button>
              <button type="button" className="mm-m-smallbtn" onClick={() => setPrompt(genre.seed)} aria-label="Пример жанра"><IconSliders /></button>
            </div>
            <div className="mm-m-counter">
              <span>{prompt.length}/2000</span>
              <button type="button" className="mm-m-clear" onClick={() => setPrompt("")} aria-label="Очистить"><IconClose /></button>
            </div>
          </div>
        </section>

        <div className="mm-m-grid2">
          <section className="mm-m-section">
            <div className="mm-label"><IconClock />Длительность</div>
              {/*
              Four lengths on a phone, as the design draws them - the fifth
              would drop onto a line of its own. Three minutes stays on the
              desktop layout, where the row has the width for it.
            */}
            <div className="mm-opts" data-group="duration">{durationOptions.slice(0, 4)}</div>
          </section>
          <section className="mm-m-section">
            <div className="mm-label"><IconFile />Качество</div>
            <div className="mm-opts" data-group="quality">{qualityOptions(true)}</div>
          </section>
        </div>

        <section className="mm-m-section">
          <div className="mm-label"><IconMood />Настроение</div>
          <div className="mm-opts" data-group="mood">{moodOptions}</div>
        </section>

        <div className="mm-m-switches">
          <div className="mm-m-toggle-row">
            <div className="mm-m-toggle-copy"><IconMusic />Инструментал</div>
            <button type="button" className={"mm-switch" + (instrumental ? " is-on" : "")} onClick={() => toggleInstrumental()} aria-pressed={instrumental}><i /></button>
          </div>
          <div className="mm-m-toggle-row">
            <div className="mm-m-toggle-copy"><IconFile />Текст (AI)</div>
            <button type="button" className={"mm-switch" + (lyricsEnabled ? " is-on" : "")} onClick={() => toggleLyrics()} aria-pressed={lyricsEnabled}><i /></button>
          </div>
        </div>

        <button type="button" className="mm-m-model" onClick={() => cycleModel()}>
          <IconBox /><span>{modelName}</span><small>⌄</small>
        </button>

        <button className="mm-generate" type="button" onClick={() => startGeneration()} disabled={generating || config?.limits.remaining === 0}>
          {generating ? <IconSpinner /> : <IconPlay />}
          <span>{generateLabel}</span>
        </button>

        <section className="mm-m-track">
          <div className="mm-m-cover" style={{ backgroundImage: "url(" + (coverPreview || genre.mobileImage) + ")" }} />
          <div className="mm-m-track-main">
            <div className="mm-m-track-top">
              <div className="mm-m-track-title">{trackTitle}</div>
              <span className="mm-m-tag">{statusLabel}</span>
              <div className="mm-m-track-actions">
                <button type="button" className="mm-m-iconbtn" onClick={() => { setLiked((value) => !value); flash(liked ? "Убрано из избранного" : "Добавлено в избранное") }} aria-label="Лайк">
                  <IconHeart filled={liked} />
                </button>
                <button type="button" className="mm-m-iconbtn" onClick={() => downloadTrack()} disabled={!trackUrl} aria-label="Скачать"><IconDownload /></button>
                <button type="button" className="mm-m-iconbtn" onClick={shareTrack} disabled={!trackUrl} aria-label="Поделиться"><IconShare /></button>
              </div>
            </div>
            <div className="mm-m-player">
              <button type="button" className="mm-m-play" onClick={togglePlay} disabled={!trackUrl} aria-label="Play/Pause">
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <div className="mm-m-timeline">
                <div className="mm-m-time">{formatTime(currentTime)} / {formatTime(totalSeconds)}</div>
                <div className={"mm-wave" + (playing ? " is-playing" : "")}>
                  {wave.slice(0, 33).map((height, index) => <i key={index} style={{ height }} />)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {notice ? <div className="mm-notice">{notice}</div> : null}
        {historyPanel}
      </div>

      <div className={"mm-toast" + (toast ? " is-show" : "")} role="status">{toast}</div>
    </section>
  )
}

export default MusicGenerationStudio
