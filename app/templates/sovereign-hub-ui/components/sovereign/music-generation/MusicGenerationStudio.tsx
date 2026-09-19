"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  Box,
  Clock3,
  Crown,
  Download,
  FileText,
  Heart,
  ImagePlus,
  Music2,
  Pause,
  Play,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react"
import "./music-generation.css"

type GenreId = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
type Quality = "128 kbps" | "320 kbps" | "WAV"
type Mood = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"

type Genre = {
  id: GenreId
  label: string
  image: string
  bpm: number
  baseFrequency: number
  seed: string
}

const GENRES: Genre[] = [
  {
    id: "phonk",
    label: "Phonk",
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=700&q=86",
    bpm: 150,
    baseFrequency: 392,
    seed: "Ночной агрессивный фонк, плотный 808, cowbell, тёмная атмосфера",
  },
  {
    id: "trap",
    label: "Trap",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=86",
    bpm: 142,
    baseFrequency: 330,
    seed: "Современный trap, тяжёлый 808, быстрые hi-hat, атмосферный synth",
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=86",
    bpm: 96,
    baseFrequency: 294,
    seed: "Современный hip-hop бит, плотный groove, чистый бас и уверенный ритм",
  },
  {
    id: "lofi",
    label: "Lo-Fi",
    image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=700&q=86",
    bpm: 78,
    baseFrequency: 262,
    seed: "Спокойный lo-fi, тёплый винил, мягкие барабаны, ночная атмосфера",
  },
  {
    id: "edm",
    label: "EDM",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=700&q=86",
    bpm: 128,
    baseFrequency: 440,
    seed: "Энергичный EDM, мощный drop, яркие synth и клубная энергия",
  },
  {
    id: "other",
    label: "Другое",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=86",
    bpm: 118,
    baseFrequency: 349,
    seed: "Экспериментальный современный трек с необычной фактурой",
  },
]

const DURATIONS = [15, 30, 60, 120] as const
const QUALITIES: Quality[] = ["128 kbps", "320 kbps", "WAV"]
const MOODS: Mood[] = ["Агрессивный", "Спокойный", "Атмосферный", "Энергичный", "Грустный", "Другое"]
const MODELS = ["Malik Music v1", "Malik Music Flow", "Malik Music Ultra"]

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  writeAscii(view, 0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, "WAVE")
  writeAscii(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, "data")
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: "audio/wav" })
}

async function synthesizeTrack(input: {
  prompt: string
  genre: Genre
  duration: number
  quality: Quality
  mood: Mood
  instrumental: boolean
}) {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

  const sampleRate = input.quality === "WAV" ? 22050 : input.quality === "320 kbps" ? 18000 : 14000
  const length = Math.max(1, Math.floor(input.duration * sampleRate))
  const samples = new Float32Array(length)
  const seed = hashString([
    input.prompt,
    input.genre.id,
    input.mood,
    input.instrumental ? "instrumental" : "lyrics",
  ].join("|"))
  const random = mulberry32(seed)
  const beat = 60 / input.genre.bpm
  const sixteenth = beat / 4

  const moodGain =
    input.mood === "Агрессивный" ? 1.08 :
    input.mood === "Энергичный" ? 1.0 :
    input.mood === "Спокойный" ? 0.72 :
    input.mood === "Грустный" ? 0.78 :
    input.mood === "Атмосферный" ? 0.82 : 0.9

  const notes =
    input.genre.id === "phonk" ? [0, 3, 7, 10, 7, 3, 12, 10] :
    input.genre.id === "trap" ? [0, 7, 5, 3, 0, 10, 7, 5] :
    input.genre.id === "lofi" ? [0, 4, 7, 11, 7, 4, 2, 7] :
    [0, 5, 7, 12, 7, 5, 10, 7]

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const beatPos = t % beat
    const beatIndex = Math.floor(t / beat)
    const barBeat = beatIndex % 4

    const kickEnv = Math.exp(-beatPos * 18)
    const kickFreq = 48 + 55 * Math.exp(-beatPos * 26)
    const kick = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * (barBeat === 0 || barBeat === 2 ? 0.82 : 0.45)

    const snareHit = barBeat === 1 || barBeat === 3
    const snareEnv = snareHit ? Math.exp(-beatPos * 24) : 0
    const snare = (random() * 2 - 1) * snareEnv * 0.27

    const hatPos = t % sixteenth
    const hatEnv = Math.exp(-hatPos * 70)
    const hat = (random() * 2 - 1) * hatEnv * 0.055

    const step = Math.floor(t / (beat / 2))
    const note = notes[step % notes.length]
    const noteFrequency = input.genre.baseFrequency * Math.pow(2, note / 12)
    const melodyPhase = t % (beat / 2)
    const melodyEnv = Math.exp(-melodyPhase * (input.genre.id === "lofi" ? 5 : 9))
    const melody =
      (Math.sin(2 * Math.PI * noteFrequency * t) +
      0.45 * Math.sin(2 * Math.PI * noteFrequency * 1.48 * t)) *
      melodyEnv *
      (input.genre.id === "phonk" ? 0.18 : 0.1)

    const bassNote = input.genre.baseFrequency / 4 * Math.pow(2, notes[Math.floor(beatIndex / 2) % notes.length] / 12)
    const bass = Math.tanh(Math.sin(2 * Math.PI * bassNote * t) * 2.4) * 0.16

    const pad =
      input.mood === "Атмосферный" || input.mood === "Спокойный"
        ? Math.sin(2 * Math.PI * (input.genre.baseFrequency / 2) * t) * 0.035 +
          Math.sin(2 * Math.PI * (input.genre.baseFrequency / 3) * t) * 0.025
        : 0

    samples[i] = Math.tanh((kick + snare + hat + melody + bass + pad) * moodGain) * 0.82
  }

  return encodeWav(samples, sampleRate)
}

function durationLabel(value: number) {
  if (value < 60) return value + " сек"
  return value / 60 + " мин"
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds || 0))
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0")
}

export function MusicGenerationStudio({ username }: { username?: string }) {
  const [genreId, setGenreId] = useState<GenreId>("phonk")
  const [prompt, setPrompt] = useState("")
  const [duration, setDuration] = useState<number>(30)
  const [quality, setQuality] = useState<Quality>("320 kbps")
  const [mood, setMood] = useState<Mood>("Агрессивный")
  const [instrumental, setInstrumental] = useState(true)
  const [aiLyrics, setAiLyrics] = useState(false)
  const [modelIndex, setModelIndex] = useState(0)
  const [phonkMode, setPhonkMode] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [trackUrl, setTrackUrl] = useState("")
  const [trackTitle, setTrackTitle] = useState("Night Drive")
  const [liked, setLiked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [coverPreview, setCoverPreview] = useState("")
  const [notice, setNotice] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  const genre = GENRES.find((item) => item.id === genreId) || GENRES[0]
  const wave = useMemo(() => {
    const random = mulberry32(hashString(prompt + genreId + mood))
    return Array.from({ length: 72 }, () => 7 + Math.round(random() * 30))
  }, [prompt, genreId, mood])

  useEffect(() => {
    return () => {
      if (trackUrl) URL.revokeObjectURL(trackUrl)
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [trackUrl, coverPreview])

  const chooseGenre = (next: Genre) => {
    setGenreId(next.id)
    setPhonkMode(next.id === "phonk")
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

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    setNotice("Собираю ритм, бас и музыкальную структуру…")
    setPlaying(false)
    audioRef.current?.pause()

    try {
      const blob = await synthesizeTrack({
        prompt: prompt.trim() || genre.seed,
        genre,
        duration,
        quality,
        mood,
        instrumental,
      })

      if (trackUrl) URL.revokeObjectURL(trackUrl)
      const url = URL.createObjectURL(blob)
      setTrackUrl(url)

      const clean = (prompt.trim() || genre.seed).split(/[,.!?]/)[0]?.trim()
      if (clean && clean.length <= 34) setTrackTitle(clean)
      else setTrackTitle(genre.id === "phonk" ? "Night Drive" : genre.label + " Session")

      setCurrentTime(0)
      setNotice("Трек готов. Сейчас работает локальный preview-engine; внешний AI music API можно подключить без переделки интерфейса.")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось собрать preview-трек")
    } finally {
      setGenerating(false)
    }
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || !trackUrl) {
      setNotice("Сначала сгенерируйте трек.")
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

  const downloadTrack = () => {
    if (!trackUrl) {
      setNotice("Сначала сгенерируйте трек.")
      return
    }
    const anchor = document.createElement("a")
    anchor.href = trackUrl
    anchor.download = "malik-music-" + genre.id + ".wav"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const shareTrack = async () => {
    if (!trackUrl) {
      setNotice("Сначала сгенерируйте трек.")
      return
    }
    try {
      const response = await fetch(trackUrl)
      const blob = await response.blob()
      const file = new File([blob], "malik-music.wav", { type: "audio/wav" })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "Malik Music", text: trackTitle, files: [file] })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(trackTitle + " — Malik Music")
        setNotice("Название трека скопировано.")
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

  const durationControls = (
    <div className="mm-setting">
      <div className="mm-label"><Clock3 />Длительность</div>
      <div className="mm-options">
        {DURATIONS.map((value) => (
          <button key={value} type="button" className={duration === value ? "is-active" : ""} onClick={() => setDuration(value)}>
            {durationLabel(value)}
          </button>
        ))}
      </div>
    </div>
  )

  const qualityControls = (
    <div className="mm-setting">
      <div className="mm-label"><Volume2 />Качество</div>
      <div className="mm-options">
        {QUALITIES.map((value) => (
          <button key={value} type="button" className={quality === value ? "is-active" : ""} onClick={() => setQuality(value)}>
            {value}
          </button>
        ))}
      </div>
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
        <button type="button" className={"mm-switch" + (instrumental ? " is-on" : "")} onClick={() => setInstrumental((value) => !value)} aria-pressed={instrumental}><i /></button>
      </div>
      <div className="mm-switch-row">
        <span><FileText />Текст (AI)</span>
        <button type="button" className={"mm-switch" + (aiLyrics ? " is-on" : "")} onClick={() => setAiLyrics((value) => !value)} aria-pressed={aiLyrics}><i /></button>
      </div>
    </div>
  )

  const modelButton = (
    <button className="mm-model" type="button" onClick={() => setModelIndex((value) => (value + 1) % MODELS.length)}>
      <Box /><span>{MODELS[modelIndex]}</span><small>⌄</small>
    </button>
  )

  const generateButton = (
    <button className="mm-generate" type="button" onClick={generate} disabled={generating}>
      {generating ? <WandSparkles className="mm-spin" /> : <Play />}
      <span>{generating ? "Генерирую трек…" : "Сгенерировать трек"}</span>
    </button>
  )

  const player = (
    <div className="mm-player">
      <div className="mm-cover" style={{ backgroundImage: "url(" + (coverPreview || genre.image) + ")" }} />
      <div className="mm-player-main">
        <div className="mm-track-head">
          <strong>{trackTitle}</strong>
          <span>{genre.label.toUpperCase()}</span>
        </div>
        <div className="mm-time">
          {formatTime(currentTime)} / {formatTime(trackUrl && audioRef.current?.duration ? audioRef.current.duration : duration)}
        </div>
        <div className={"mm-wave" + (playing ? " is-playing" : "")}>
          {wave.map((height, index) => <i key={index} style={{ height }} />)}
        </div>
      </div>

      <button className="mm-round-play" type="button" onClick={togglePlay} aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <Pause /> : <Play />}
      </button>

      <div className="mm-player-actions">
        <button type="button" onClick={() => setLiked((value) => !value)} aria-label="В избранное">
          <Heart className={liked ? "is-filled" : ""} />
        </button>
        <button type="button" onClick={downloadTrack} aria-label="Скачать"><Download /></button>
        <button type="button" onClick={shareTrack} aria-label="Поделиться"><Share2 /></button>
      </div>
    </div>
  )

  return (
    <section className="malik-music" data-malik-music-studio data-user={username || "guest"}>
      <audio
        ref={audioRef}
        src={trackUrl || undefined}
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
                <span>MALIK MUSIC STUDIO</span>
                <h1>Создавай<br />музыку с <b>AI</b></h1>
                <p>Фонк, рэп, трэп, lo-fi и любой стиль. Твоя идея — наш звук.</p>
                <small>FROM IDEAS TO HITS</small>
              </div>
              <div className="mm-hero-mark"><Crown /><span>MUSIC<br />HAS<br />NO LIMITS</span></div>
            </div>

            {genreCards}
            {promptCard}
            <div className="mm-settings-grid">{durationControls}{qualityControls}</div>
            {moodControls}
            <div className="mm-desktop-bottom">
              {switchControls}
              {modelButton}
            </div>
            {generateButton}
            {player}
            {notice ? <div className="mm-notice">{notice}</div> : null}
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
          <div><strong>MALIK AI</strong><small>MUSIC STUDIO</small></div>
          <button type="button" className={phonkMode ? "is-active" : ""} onClick={() => setPhonkMode((value) => !value)}>
            <Crown />{phonkMode ? "PHONK MODE" : "MUSIC MODE"}
          </button>
        </header>

        <div className="mm-mobile-hero">
          <div>
            <h2>Создавай<br />музыку с <b>AI</b></h2>
            <p>Фонк, рэп, трэп, lo-fi — твоя идея, наш звук.</p>
          </div>
          <Crown />
        </div>

        {genreCards}
        {promptCard}
        <div className="mm-mobile-settings">{durationControls}{qualityControls}</div>
        {moodControls}
        <div className="mm-mobile-switches">{switchControls}</div>
        {modelButton}
        {generateButton}
        {player}
        <div className="mm-mobile-brand"><Crown />Превращай идеи в звук с Malik AI</div>
        {notice ? <div className="mm-notice">{notice}</div> : null}
      </div>
    </section>
  )
}

export default MusicGenerationStudio
