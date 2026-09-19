"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  Box,
  CheckCircle2,
  Clock3,
  Crown,
  Download,
  FileText,
  Heart,
  ImagePlus,
  Loader2,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from "lucide-react"
import "./music-generation.css"

type GenreId = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
type Mood = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"
type LyricsLanguage = "kk" | "ru" | "en"
type JobStatus = "queued" | "processing" | "ready" | "failed"

type Genre = {
  id: GenreId
  label: string
  image: string
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
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=700&q=86",
    seed: "Ночной агрессивный фонк, плотный 808, cowbell, тёмная атмосфера",
  },
  {
    id: "trap",
    label: "Trap",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=86",
    seed: "Современный trap, тяжёлый 808, быстрые hi-hat, атмосферный synth",
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=86",
    seed: "Современный hip-hop бит, плотный groove, чистый бас и уверенный ритм",
  },
  {
    id: "lofi",
    label: "Lo-Fi",
    image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=700&q=86",
    seed: "Спокойный lo-fi, тёплый винил, мягкие барабаны, ночная атмосфера",
  },
  {
    id: "edm",
    label: "EDM",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=700&q=86",
    seed: "Энергичный EDM, мощный drop, яркие synth и клубная энергия",
  },
  {
    id: "other",
    label: "Другое",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=86",
    seed: "Экспериментальный современный трек с необычной фактурой",
  },
]

const DURATION_OPTIONS = [15, 30, 60, 120, 180] as const
const MOODS: Mood[] = ["Агрессивный", "Спокойный", "Атмосферный", "Энергичный", "Грустный", "Другое"]
const LANGUAGE_LABELS: Record<LyricsLanguage, string> = { kk: "Қазақша", ru: "Русский", en: "English" }
const HISTORY_KEY = "malik-music-history-v2"

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

function safeHistory(value: unknown): MusicHistoryItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === "object" && typeof item.requestId === "string")
    .slice(0, 30) as MusicHistoryItem[]
}

export function MusicGenerationStudio({ username }: { username?: string }) {
  const [genreId, setGenreId] = useState<GenreId>("phonk")
  const [prompt, setPrompt] = useState("")
  const [lyrics, setLyrics] = useState("")
  const [lyricsEnabled, setLyricsEnabled] = useState(false)
  const [lyricsLanguage, setLyricsLanguage] = useState<LyricsLanguage>("ru")
  const [duration, setDuration] = useState<number>(30)
  const [mood, setMood] = useState<Mood>("Агрессивный")
  const [instrumental, setInstrumental] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState("")
  const [trackUrl, setTrackUrl] = useState("")
  const [trackTitle, setTrackTitle] = useState("Night Drive")
  const [liked, setLiked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [coverPreview, setCoverPreview] = useState("")
  const [notice, setNotice] = useState("")
  const [config, setConfig] = useState<MusicConfig | null>(null)
  const [history, setHistory] = useState<MusicHistoryItem[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

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
          return
        }

        if (data?.status === "failed") {
          setHistory((rows) => rows.map((item) =>
            item.requestId === activeRequestId
              ? { ...item, status: "failed", error: String(data?.error || "Генерация не завершилась.") }
              : item,
          ))
          setGenerating(false)
          setNotice(data?.error || "Генерация не завершилась.")
          setActiveRequestId("")
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
    if (!nextInstrumental && nextLyricsEnabled && !nextLyrics.trim()) {
      setNotice("Добавьте свои слова песни.")
      return
    }

    setGenerating(true)
    setNotice("Отправляю запрос в deAPI / AceStep 1.5 XL Turbo…")
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
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok || !data?.requestId) {
        setGenerating(false)
        setNotice(data?.error || "deAPI не принял запрос.")
        await refreshConfig()
        return
      }

      const item: MusicHistoryItem = {
        requestId: String(data.requestId),
        title: historyTitle(nextPrompt, nextGenre),
        prompt: nextPrompt,
        lyrics: nextLyrics,
        lyricsEnabled: nextLyricsEnabled,
        lyricsLanguage: nextLanguage,
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
      setNotice("request_id получен. Ожидаю очередь deAPI…")
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

  const genreCards = (
    <div className="mm-genres">
      {GENRES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={"mm-genre" + (genreId === item.id ? " is-active" : "")}
          style={{ backgroundImage: "url(" + item.image + ")" }}
          onClick={() => chooseGenre(item)}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )

  const promptCard = (
    <div className="mm-prompt">
      <textarea
        value={prompt}
        maxLength={2000}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Опишите, какую музыку вы хотите создать..."
        disabled={generating}
      />
      <div className="mm-prompt-foot">
        <div className="mm-prompt-tools">
          <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCover} />
          <button type="button" onClick={() => coverInputRef.current?.click()} aria-label="Загрузить обложку"><ImagePlus /></button>
          <button type="button" onClick={improvePrompt} aria-label="Улучшить запрос"><Sparkles /></button>
          <button type="button" onClick={() => setNotice("Настройки трека применяются ниже.")} aria-label="Настройки"><SlidersHorizontal /></button>
        </div>
        <div className="mm-count">
          <span>{prompt.length}/2000</span>
          <button type="button" onClick={() => setPrompt("")} aria-label="Очистить"><X /></button>
        </div>
      </div>
    </div>
  )

  const lyricsCard = !instrumental && lyricsEnabled ? (
    <div className="mm-lyrics">
      <div className="mm-lyrics-top">
        <span><FileText />Свои слова песни</span>
        <div className="mm-language">
          {(Object.keys(LANGUAGE_LABELS) as LyricsLanguage[]).map((language) => (
            <button
              key={language}
              type="button"
              className={lyricsLanguage === language ? "is-active" : ""}
              onClick={() => setLyricsLanguage(language)}
            >
              {LANGUAGE_LABELS[language]}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={lyrics}
        maxLength={12000}
        onChange={(event) => setLyrics(event.target.value)}
        placeholder={"[verse]\nНапишите свои слова...\n\n[chorus]\nПрипев..."}
        disabled={generating}
      />
      <small>{lyrics.length}/12000 · Unicode: KZ / RU / EN</small>
    </div>
  ) : null

  const durationControls = (
    <div className="mm-setting">
      <div className="mm-label"><Clock3 />Длительность</div>
      <div className="mm-options">
        {availableDurations.map((value) => (
          <button key={value} type="button" className={duration === value ? "is-active" : ""} onClick={() => setDuration(value)}>
            {durationLabel(value)}
          </button>
        ))}
      </div>
    </div>
  )

  const outputControls = (
    <div className="mm-setting">
      <div className="mm-label"><Volume2 />Результат</div>
      <div className="mm-options"><button type="button" className="is-active">MP3</button></div>
    </div>
  )

  const moodControls = (
    <div className="mm-setting mm-mood">
      <div className="mm-label"><Crown />Настроение</div>
      <div className="mm-options">
        {MOODS.map((value) => (
          <button key={value} type="button" className={mood === value ? "is-active" : ""} onClick={() => setMood(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  )

  const switchControls = (
    <div className="mm-switch-grid">
      <div className="mm-switch-row">
        <span><Music2 />Инструментал</span>
        <button
          type="button"
          className={"mm-switch" + (instrumental ? " is-on" : "")}
          onClick={() => {
            setInstrumental((value) => !value)
            if (!instrumental) setLyricsEnabled(false)
          }}
          aria-pressed={instrumental}
        >
          <i />
        </button>
      </div>

      <div className="mm-switch-row">
        <span><FileText />Текст песни</span>
        <button
          type="button"
          className={"mm-switch" + (lyricsEnabled ? " is-on" : "")}
          onClick={() => {
            const next = !lyricsEnabled
            setLyricsEnabled(next)
            if (next) setInstrumental(false)
          }}
          aria-pressed={lyricsEnabled}
        >
          <i />
        </button>
      </div>
    </div>
  )

  const modelButton = (
    <button className="mm-model" type="button" disabled>
      <Box /><span>{config?.model || "AceStep 1.5 XL Turbo"}</span><small>deAPI</small>
    </button>
  )

  const statusText =
    activeHistoryItem?.status === "queued" ? "В очереди deAPI" :
    activeHistoryItem?.status === "processing" ? "Генерация MP3" :
    "Сгенерировать трек"

  const generateButton = (
    <button className="mm-generate" type="button" onClick={() => submitGeneration()} disabled={generating || config?.limits.remaining === 0}>
      {generating ? <Loader2 className="mm-spin" /> : <Play />}
      <span>{generating ? statusText : "Сгенерировать трек"}</span>
    </button>
  )

  const player = (
    <div className="mm-player">
      <div className="mm-cover" style={{ backgroundImage: "url(" + (coverPreview || genre.image) + ")" }} />
      <div className="mm-player-main">
        <div className="mm-track-head">
          <strong>{trackTitle}</strong>
          <span>{trackUrl ? "MP3 READY" : activeHistoryItem ? activeHistoryItem.status.toUpperCase() : genre.label.toUpperCase()}</span>
        </div>
        <div className="mm-time">
          {formatTime(currentTime)} / {formatTime(trackUrl && audioRef.current?.duration ? audioRef.current.duration : duration)}
        </div>
        <div className={"mm-wave" + (playing ? " is-playing" : "")}>
          {wave.map((height, index) => <i key={index} style={{ height }} />)}
        </div>
        {activeRequestId ? <div className="mm-request">request_id: {activeRequestId}</div> : null}
      </div>

      <button className="mm-round-play" type="button" onClick={togglePlay} aria-label={playing ? "Пауза" : "Воспроизвести"} disabled={!trackUrl}>
        {playing ? <Pause /> : <Play />}
      </button>

      <div className="mm-player-actions">
        <button type="button" onClick={() => setLiked((value) => !value)} aria-label="В избранное">
          <Heart className={liked ? "is-filled" : ""} />
        </button>
        <button type="button" onClick={() => downloadTrack()} aria-label="Скачать" disabled={!trackUrl}><Download /></button>
        <button type="button" onClick={shareTrack} aria-label="Поделиться" disabled={!trackUrl}><Share2 /></button>
        <button type="button" onClick={() => regenerate()} aria-label="Перегенерировать" disabled={generating}><RefreshCw /></button>
      </div>
    </div>
  )

  const historyPanel = history.length ? (
    <section className="mm-history">
      <div className="mm-history-head">
        <div><Music2 /><span>История генераций</span></div>
        <small>{history.length}</small>
      </div>
      <div className="mm-history-list">
        {history.map((item) => {
          const itemGenre = GENRES.find((entry) => entry.id === item.genreId) || GENRES[0]
          return (
            <article key={item.requestId} className="mm-history-item">
              <button
                type="button"
                className="mm-history-cover"
                style={{ backgroundImage: "url(" + itemGenre.image + ")" }}
                onClick={() => {
                  if (!item.resultUrl) return
                  setTrackUrl(item.resultUrl)
                  setTrackTitle(item.title)
                  setCurrentTime(0)
                }}
                aria-label={"Открыть " + item.title}
              />
              <div className="mm-history-copy">
                <strong>{item.title}</strong>
                <span>{itemGenre.label} · {durationLabel(item.duration)} · {item.instrumental ? "instrumental" : LANGUAGE_LABELS[item.lyricsLanguage]}</span>
                <small>{item.requestId}</small>
              </div>
              <div className={"mm-history-status is-" + item.status}>
                {item.status === "ready" ? <CheckCircle2 /> : item.status === "failed" ? <X /> : <Loader2 className="mm-spin" />}
                <span>{item.status === "ready" ? "Готов" : item.status === "failed" ? "Ошибка" : item.status === "queued" ? "Очередь" : "Генерация"}</span>
              </div>
              <div className="mm-history-actions">
                {item.status === "ready" && item.resultUrl ? (
                  <button type="button" onClick={() => { setTrackUrl(item.resultUrl || ""); setTrackTitle(item.title); window.setTimeout(() => audioRef.current?.play().catch(() => undefined), 0) }} aria-label="Воспроизвести"><Play /></button>
                ) : null}
                {item.status === "ready" ? <button type="button" onClick={() => downloadTrack(item)} aria-label="Скачать"><Download /></button> : null}
                <button type="button" onClick={() => regenerate(item)} aria-label="Перегенерировать" disabled={generating}><RefreshCw /></button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  ) : null

  const quotaLabel = config
    ? config.limits.remaining + " / " + config.limits.daily + " сегодня"
    : "Проверяю лимит…"

  return (
    <section className="malik-music" data-malik-music-studio data-user={username || "guest"}>
      <audio
        ref={audioRef}
        src={trackUrl || undefined}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
      />

      <div className="mm-desktop">
        <div className="mm-desktop-grid">
          <div className="mm-desktop-main">
            <div className="mm-hero">
              <div className="mm-hero-copy">
                <span>MALIK MUSIC STUDIO · {quotaLabel}</span>
                <h1>Создавай<br />музыку с <b>AI</b></h1>
                <p>Настоящая генерация через deAPI AceStep 1.5 XL Turbo. Prompt → request_id → polling → MP3.</p>
                <small>FROM IDEAS TO HITS</small>
              </div>
              <div className="mm-hero-mark"><Crown /><span>MUSIC<br />HAS<br />NO LIMITS</span></div>
            </div>

            {genreCards}
            {promptCard}
            {lyricsCard}
            <div className="mm-settings-grid">{durationControls}{outputControls}</div>
            {moodControls}
            <div className="mm-desktop-bottom">
              {switchControls}
              {modelButton}
            </div>
            {generateButton}
            {player}
            {notice ? <div className="mm-notice">{notice}</div> : null}
            {historyPanel}
          </div>

          <aside className="mm-promo">
            <div className="mm-promo-brand"><Crown /><span>PHONK<br />MODE</span></div>
            <div className="mm-promo-bottom">
              <span>БОЛЬШЕ<br />ЧЕМ МУЗЫКА</span>
              <i />
              <strong>ТВОИ ИДЕИ<br />РЕАЛЬНЫ</strong>
            </div>
          </aside>
        </div>
      </div>

      <div className="mm-mobile">
        <header className="mm-mobile-head">
          <div><strong>MALIK AI</strong><small>MUSIC STUDIO · {quotaLabel}</small></div>
          <button type="button" className={genreId === "phonk" ? "is-active" : ""} onClick={() => chooseGenre(GENRES[0])}>
            <Crown />{genreId === "phonk" ? "PHONK MODE" : "PHONK"}
          </button>
        </header>

        <div className="mm-mobile-hero">
          <div>
            <h2>Создавай<br />музыку с <b>AI</b></h2>
            <p>Prompt → deAPI → AceStep → настоящий MP3.</p>
          </div>
          <Crown />
        </div>

        {genreCards}
        {promptCard}
        {lyricsCard}
        <div className="mm-mobile-settings">{durationControls}{outputControls}</div>
        {moodControls}
        <div className="mm-mobile-switches">{switchControls}</div>
        {modelButton}
        {generateButton}
        {player}
        {notice ? <div className="mm-notice">{notice}</div> : null}
        {historyPanel}
        <div className="mm-mobile-brand"><Crown />Превращай идеи в звук с Malik AI</div>
      </div>
    </section>
  )
}

export default MusicGenerationStudio
