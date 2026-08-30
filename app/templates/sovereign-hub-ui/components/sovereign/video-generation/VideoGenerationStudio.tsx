"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, Camera, Check, ChevronDown, Play, Plus, Sparkles, Volume2 } from "lucide-react"
import { canUseGeneration, incrementUsage, isOwnerUser } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import type { VideoAiTemplate } from "@/lib/media-library"
import { takePrefillPrompt } from "@/lib/malik-context"

export type VideoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Ratio = "16:9" | "9:16" | "1:1"
type Duration = 5 | 10
type GenerationPhase = "idle" | "queued" | "rendering" | "ready" | "failed"
type ShowcaseVideoTemplate = VideoAiTemplate & { mobileSrc?: string }

const ENDPOINT = "/api/media/video"
const DEFAULT_PROMPT = "Ночной Алматы после дождя. Чёрный премиальный автомобиль медленно едет по мокрой улице, отражения городских огней на асфальте, камера низко следует сбоку, реалистичная физика, кинематографичный свет и естественный звук города."
const CATEGORIES = ["Кино", "Реклама", "Соцсети", "Персонажи", "Эксперимент"] as const
const SHOWCASE_TEMPLATES: ShowcaseVideoTemplate[] = [
  {
    id: "malik-epic-motion",
    title: "Epic Motion",
    provider: "MalikVideo 1.0",
    tag: "Action · 1080p",
    theme: "Сражение",
    src: "/videos/malik-showcase/cinematic-battle.mp4",
    poster: "/videos/malik-showcase/cinematic-battle.jpg",
    prompt: "Эпическая сцена сражения, огонь и дым, стремительное движение камеры, кинематограф.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-ancient-worlds",
    title: "Ancient Worlds",
    provider: "MalikVideo 1.0",
    tag: "Environment · 1080p",
    theme: "Руины",
    src: "/videos/malik-showcase/ancient-ruins.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/ancient-ruins.mp4",
    poster: "/videos/malik-showcase/ancient-ruins.jpg",
    prompt: "Древние руины на рассвете, мягкий солнечный свет, плавный cinematic flythrough.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-animated-city",
    title: "Animated City",
    provider: "MalikVideo 1.0",
    tag: "Restyle · 1080p",
    theme: "Анимация",
    src: "/videos/malik-showcase/restyle-2.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/restyle-2.mp4",
    poster: "/videos/malik-showcase/restyle-2.jpg",
    prompt: "Анимационный герой на скейтборде в фантастическом городе, выразительная перспектива и кинематографичное движение.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-mecha-impact",
    title: "Mecha Impact",
    provider: "MalikVideo 1.0",
    tag: "Mecha · 1080p",
    theme: "Мех",
    src: "/videos/malik-showcase/mecha-impact.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/mecha-impact.mp4",
    poster: "/videos/malik-showcase/mecha-impact.jpg",
    prompt: "Гигантский мех приземляется в городе, искры и пыль, сильный удар камеры.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-alpine-flight",
    title: "Alpine Flight",
    provider: "MalikVideo 1.0",
    tag: "Vertical · 1080p",
    theme: "Экшен",
    src: "/videos/malik-showcase/alpine-flight.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/alpine-flight.mp4",
    poster: "/videos/malik-showcase/alpine-flight.jpg",
    prompt: "Экстремальный полёт над снежными горами, вертикальный кадр, яркий дневной свет.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-transformer-flight",
    title: "Transformer Flight",
    provider: "MalikVideo 1.0",
    tag: "Hero · 1080p",
    theme: "Трансформер",
    src: "/videos/malik-showcase/hero-transformer.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/hero-transformer.mp4",
    poster: "/videos/malik-showcase/hero-transformer.jpg",
    prompt: "Летящий трансформер над улицами мегаполиса, динамичная камера, кинематографичный свет.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-product-serum",
    title: "Product Motion",
    provider: "MalikVideo 1.0",
    tag: "Product · 1080p",
    theme: "Реклама",
    src: "/videos/malik-showcase/product-shot-1.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/product-shot-1.mp4",
    poster: "/videos/malik-showcase/product-shot-1.jpg",
    prompt: "Премиальная предметная съёмка синего флакона сыворотки, яркий студийный фон и плавное рекламное движение.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-storybook-cat",
    title: "Storybook Cat",
    provider: "MalikVideo 1.0",
    tag: "Restyle · 1080p",
    theme: "Персонаж",
    src: "/videos/malik-showcase/restyle-3.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/restyle-3.mp4",
    poster: "/videos/malik-showcase/restyle-3.jpg",
    prompt: "Милый чёрный кот в цветочном поле, рисованная анимация, мягкое естественное движение.",
    tint: "rgba(10,10,12,.3)",
  },
  {
    id: "malik-cloud-road",
    title: "Road Above Clouds",
    provider: "MalikVideo 1.0",
    tag: "Product · 1080p",
    theme: "Автомобиль",
    src: "/videos/malik-showcase/product-shot-2.mp4",
    mobileSrc: "/videos/malik-showcase/mobile/product-shot-2.mp4",
    poster: "/videos/malik-showcase/product-shot-2.jpg",
    prompt: "Синий спортивный автомобиль едет по дороге над облаками, премиальная реклама и плавное движение камеры.",
    tint: "rgba(10,10,12,.3)",
  },
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatStatus(phase: GenerationPhase, attempt: number) {
  if (phase === "queued") return "Ставлю сцену в очередь…"
  if (phase === "rendering") {
    if (attempt < 4) return "Собираю сцену и движение камеры…"
    if (attempt < 12) return "Рендерю движение, свет и детали…"
    if (attempt < 24) return "Финализирую видео и звук…"
    return "Финальный рендер — ещё немного…"
  }
  if (phase === "ready") return "Видео готово"
  if (phase === "failed") return "Генерация остановлена"
  return "Готов к созданию"
}

function AutoLoopVideo({
  src,
  mobileSrc,
  poster,
  className,
  contain = false,
  disableOnMobile = false,
}: {
  src: string
  mobileSrc?: string
  poster?: string
  className?: string
  contain?: boolean
  disableOnMobile?: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    video.defaultMuted = true
    video.loop = true
    video.load()
    const mobileQuery = window.matchMedia("(max-width: 820px)")
    const play = () => {
      if (disableOnMobile && mobileQuery.matches) {
        video.pause()
        return
      }
      video.play().catch(() => {})
    }
    play()
    video.addEventListener("canplay", play)
    video.addEventListener("ended", play)
    mobileQuery.addEventListener("change", play)
    return () => {
      video.removeEventListener("canplay", play)
      video.removeEventListener("ended", play)
      mobileQuery.removeEventListener("change", play)
    }
  }, [disableOnMobile, mobileSrc, src])

  return (
    <video
      ref={ref}
      poster={poster}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      controls={false}
      preload="auto"
      disablePictureInPicture
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: contain ? "contain" : "cover",
        objectPosition: "center",
        background: "#030303",
      }}
    >
      {mobileSrc ? <source src={mobileSrc} media="(max-width: 820px)" type="video/mp4" /> : null}
      <source src={src} type="video/mp4" />
    </video>
  )
}

export function VideoGenerationStudio({ username, onViewChange }: VideoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const owner = isOwnerUser(operator)
  const ownerTenSecond = operator.trim().toLowerCase() === "amangeldymalik38@gmail.com"

  const hero = useMemo<ShowcaseVideoTemplate>(() => {
    return SHOWCASE_TEMPLATES[0]
  }, [])

  const cards = useMemo<ShowcaseVideoTemplate[]>(() => {
    return SHOWCASE_TEMPLATES.slice(1)
  }, [])

  const [prompt, setPrompt] = useState(() => takePrefillPrompt() || DEFAULT_PROMPT)
  const [ratio, setRatio] = useState<Ratio>("16:9")
  const [duration, setDuration] = useState<Duration>(() => ownerTenSecond ? 10 : 5)
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("Кино")
  const [activeTemplate, setActiveTemplate] = useState(0)
  const [phase, setPhase] = useState<GenerationPhase>("idle")
  const [attempt, setAttempt] = useState(0)
  const [taskId, setTaskId] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState("")
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null)
  const [providerLabel, setProviderLabel] = useState("Wan 2.7")
  const [showControls, setShowControls] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const finishSoundPlayedRef = useRef(false)
  const busy = phase === "queued" || phase === "rendering"
  const statusText = formatStatus(phase, attempt)

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setPrompt((current) => current === DEFAULT_PROMPT ? "" : current)
    }
  }, [])

  useEffect(() => () => {
    audioContextRef.current?.close().catch(() => {})
  }, [])

  useEffect(() => {
    if (ownerTenSecond) setDuration(10)
  }, [ownerTenSecond])

  const armAudio = () => {
    if (typeof window === "undefined") return
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    if (!audioContextRef.current) audioContextRef.current = new AudioCtx()
    if (audioContextRef.current.state === "suspended") audioContextRef.current.resume().catch(() => {})
  }

  const playFinishSoundOnce = () => {
    if (finishSoundPlayedRef.current) return
    finishSoundPlayedRef.current = true
    const ctx = audioContextRef.current
    if (!ctx) return
    const now = ctx.currentTime
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      const fade = 1 - i / data.length
      data[i] = (Math.random() * 2 - 1) * fade * fade
    }
    const noise = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    noise.buffer = buffer
    filter.type = "highpass"
    filter.frequency.value = 1100
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.16)

    const click = ctx.createOscillator()
    const clickGain = ctx.createGain()
    click.type = "triangle"
    click.frequency.setValueAtTime(380, now)
    click.frequency.exponentialRampToValueAtTime(120, now + 0.11)
    clickGain.gain.setValueAtTime(0.0001, now)
    clickGain.gain.exponentialRampToValueAtTime(0.13, now + 0.006)
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    click.connect(clickGain)
    clickGain.connect(ctx.destination)
    click.start(now)
    click.stop(now + 0.13)
  }

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy) return

    armAudio()
    finishSoundPlayedRef.current = false
    setError("")
    setVideoUrl("")
    setTaskId("")
    setAttempt(0)

    if (!canUseGeneration("video", operator)) {
      setPhase("failed")
      setError("Сегодняшняя бесплатная генерация уже использована. Лимит обновится завтра.")
      return
    }

    setPhase("queued")
    try {
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: cleanPrompt,
            length: duration,
            resolution: "1080p",
            ratio,
            generateAudio: true,
            userEmail: operator,
          }),
        },
        60_000,
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) throw new Error("Сегодняшняя генерация уже использована. Лимит обновится завтра.")
        throw new Error(data?.error || data?.publicError || data?.message || `Ошибка ${response.status}`)
      }

      const id = String(data?.taskId || "")
      if (!id) throw new Error("Видеомодель не вернула taskId")
      setTaskId(id)
      setProviderLabel(String(data?.model || "Wan 2.7").replace("wan2.7-t2v-2026-06-12", "Wan 2.7"))
      setRemainingDaily(typeof data?.remainingDailyVideos === "number" ? data.remainingDailyVideos : null)
      if (!owner) incrementUsage("video")
      setPhase("rendering")

      const statusUrl = String(data?.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(id)}`)
      for (let i = 0; i < 72; i += 1) {
        setAttempt(i)
        await sleep(i === 0 ? 2500 : 5000)
        const statusResponse = await clientFetchWithTimeout(statusUrl, { method: "GET" }, 30_000)
        const statusData = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) throw new Error(statusData?.error || `Status ${statusResponse.status}`)
        if (statusData?.status === "failed") throw new Error(statusData?.error || "Видеомодель не смогла завершить рендер")
        const readyUrl = String(statusData?.videoUrl || statusData?.url || "")
        if (readyUrl) {
          setVideoUrl(readyUrl)
          setPhase("ready")
          playFinishSoundOnce()
          return
        }
      }
      throw new Error("Видео всё ещё рендерится. Попробуйте проверить задачу позже.")
    } catch (err) {
      setPhase("failed")
      setError(err instanceof Error ? err.message : "Генерация видео недоступна")
    }
  }

  const chooseTemplate = (index: number) => {
    const item = cards[index]
    if (!item) return
    setActiveTemplate(index)
    setPrompt(item.prompt)
    setError("")
  }

  return (
    <main className="mv" data-view="video-generation" data-result={videoUrl ? "1" : "0"}>
      <section className="mv__showcase" aria-label="MalikVideo showcase" data-phase={phase}>
        <div className="mv__showcase-media">
          {videoUrl ? (
            <video src={videoUrl} controls playsInline autoPlay className="mv__showcase-video mv__showcase-video--result" />
          ) : (
            <AutoLoopVideo src={hero.src} poster={hero.poster} className="mv__showcase-video" disableOnMobile />
          )}
          <div className="mv__showcase-vignette" />

          {busy ? (
            <div className="mv__render-state" aria-live="polite">
              <div className="mv__render-square">
                <div className="mv__grid" />
                <div className="mv__scan" />
                <div className="mv__focus mv__focus--tl" />
                <div className="mv__focus mv__focus--tr" />
                <div className="mv__focus mv__focus--bl" />
                <div className="mv__focus mv__focus--br" />
                <Camera size={48} strokeWidth={1.2} />
              </div>
              <div className="mv__render-copy">
                <span className="mv__render-dot" />
                <strong>{statusText}</strong>
                <small>1080p · {ratio} · {duration}s · sound</small>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mv__workspace">
        <header className="mv__header" data-preserve-brand-color="true">
          <div>
            <span className="mv__eyebrow">MALIK VIDEO · WAN 2.7</span>
            <h1>Что вы хотите создать?</h1>
          </div>
          <button type="button" className="mv__library-btn" onClick={() => onViewChange("templates")}>Библиотека</button>
        </header>

        <section className="mv__composer-shell">
          <div className="mv__notice">
            <span>New</span>
            <strong>MalikVideo 1.0</strong>
            <p>Русский · Қазақша · English → cinematic prompt → 1080p video</p>
          </div>
          <div className="mv__composer">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Опишите сцену, камеру, движение и звук…"
              disabled={busy}
            />
            <div className="mv__composer-bottom">
              <button type="button" className="mv__plus" aria-label="Добавить референс" title="Image-to-video скоро"><Plus size={18} /></button>
              <div className="mv__composer-actions">
                <button type="button" className="mv__quality" onClick={() => setShowControls((value) => !value)}><Sparkles size={14} /> 1080p · Quality <ChevronDown size={14} /></button>
                <button type="button" className="mv__send" onClick={generate} disabled={busy || !prompt.trim()} aria-label="Сгенерировать видео">{busy ? <Camera size={17} /> : <ArrowUp size={18} />}</button>
              </div>
            </div>
          </div>

          {showControls ? (
            <div className="mv__settings-popover">
              <div><span>Формат</span><div className="mv__segmented">{(["16:9", "9:16", "1:1"] as Ratio[]).map((value) => <button key={value} type="button" data-active={ratio === value ? "1" : "0"} onClick={() => setRatio(value)}>{value}</button>)}</div></div>
              <div><span>Длительность</span><div className="mv__segmented">{([5, 10] as Duration[]).map((value) => <button key={value} type="button" data-active={duration === value ? "1" : "0"} onClick={() => setDuration(value)}>{value}s</button>)}</div></div>
              <div className="mv__fixed-setting"><Check size={14} /> 1080p</div>
              <div className="mv__fixed-setting"><Volume2 size={14} /> Sound</div>
            </div>
          ) : null}

          <div className="mv__model-row">
            <button type="button" className="is-active"><Play size={13} fill="currentColor" /><span><strong>MalikVideo 1.0</strong><small>Текущая модель</small></span></button>
            <button type="button"><Volume2 size={15} /><span><strong>Audio synced</strong><small>Видео + Звук</small></span></button>
            <button type="button"><Sparkles size={15} /><span><strong>RU · KZ · EN</strong><small>Авто перевод</small></span></button>
          </div>
        </section>

        <div className="mv__statusbar" data-phase={phase}>
          <span className="mv__status-dot" />
          <strong>{statusText}</strong>
          {taskId ? <span>Task {taskId.slice(0, 8)}</span> : null}
          {owner ? <span>Owner · unlimited</span> : remainingDaily !== null ? <span>Осталось сегодня: {remainingDaily}</span> : <span>1 видео в день</span>}
          {error ? <span className="mv__error">{error}</span> : null}
        </div>

        <section className="mv__discover">
          <div className="mv__tabs" role="tablist" aria-label="Категории видео">
            {CATEGORIES.map((category) => (
              <button key={category} type="button" data-active={activeCategory === category ? "1" : "0"} onClick={() => setActiveCategory(category)}>{category}</button>
            ))}
          </div>

          <div className="mv__cards">
            {cards.map((item, index) => (
              <button key={item.id} type="button" className="mv__card" data-active={activeTemplate === index ? "1" : "0"} onClick={() => chooseTemplate(index)} aria-label={`Использовать шаблон ${item.title}`}>
                <AutoLoopVideo src={item.src} mobileSrc={item.mobileSrc} poster={item.poster} className="mv__card-video" />
                <span className="mv__card-shade" />
                <span className="mv__card-copy"><strong>{item.title}</strong><small>{item.theme} · 1080p</small></span>
              </button>
            ))}
          </div>
        </section>
      </section>

      <style jsx>{`
        .mv{min-height:100%;width:100%;display:grid;grid-template-columns:minmax(360px,39vw) minmax(0,1fr);background:#000;color:#f7f7f8;overflow:hidden;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .mv[data-result="1"]{grid-template-columns:minmax(520px,52vw) minmax(0,1fr)}
        .mv button,.mv textarea{font:inherit;-webkit-tap-highlight-color:transparent}
        .mv button:focus-visible,.mv textarea:focus-visible{outline:1px solid rgba(255,255,255,.52);outline-offset:2px}
        .mv__showcase{position:relative;min-height:100dvh;background:#030303;border-right:1px solid rgba(255,255,255,.08);overflow:hidden}
        .mv__showcase-media{position:sticky;top:0;height:100dvh;min-height:680px;overflow:hidden;background:#030303;display:grid;place-items:center}
        :global(.mv__showcase-video){width:100%;height:100%;display:block;background:#030303;object-position:center center}
        .mv__showcase-video--result{width:100%;height:100%;display:block;background:#030303;object-fit:cover;object-position:center}
        .mv__showcase-vignette{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.12),transparent 24%,transparent 62%,rgba(0,0,0,.78)),linear-gradient(90deg,rgba(0,0,0,.14),transparent 36%)}
        .mv[data-result="1"] .mv__showcase-vignette{background:linear-gradient(180deg,rgba(0,0,0,.08),transparent 18%,transparent 78%,rgba(0,0,0,.2))}
        .mv__workspace{min-width:0;height:100dvh;overflow-y:auto;padding:34px clamp(28px,4vw,64px) 48px;background:#000;scrollbar-width:none;-ms-overflow-style:none}
        .mv__workspace::-webkit-scrollbar{display:none}
        .mv__header{max-width:1000px;margin:0 auto 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
        .mv__eyebrow{color:#656770;font-size:10px;font-weight:750;letter-spacing:.16em}
        .mv__header h1{margin:10px 0 0;font-size:clamp(38px,4.4vw,64px);line-height:.96;letter-spacing:-.065em;font-weight:660}
        .mv__library-btn{height:40px;padding:0 15px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:#111215;color:#d7d7dc;cursor:pointer}
        .mv__composer-shell{position:relative;max-width:1000px;margin:0 auto}
        .mv__notice{min-height:46px;display:flex;align-items:center;gap:10px;padding:0 16px;border:1px solid rgba(255,255,255,.09);border-bottom:0;border-radius:22px 22px 0 0;background:#111216;color:#dddde1;font-size:12px}
        .mv__notice>span{font-size:10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:3px 8px}
        .mv__notice p{margin:0;color:#7c7e87;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mv__composer{border:1px solid rgba(255,255,255,.1);border-radius:0 0 22px 22px;background:#191a1e;padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.32)}
        .mv__composer textarea{width:100%;min-height:126px;resize:none;border:0;outline:0;background:transparent;color:#f5f5f6;font-size:17px;line-height:1.55}
        .mv__composer textarea::placeholder{color:#72747d}
        .mv__composer-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}
        .mv__plus{width:36px;height:36px;border:0;background:transparent;color:#9da0a8;display:grid;place-items:center;cursor:pointer}
        .mv__composer-actions{display:flex;align-items:center;gap:8px}
        .mv__quality{height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#24252b;color:#ececf0;padding:0 12px;display:flex;align-items:center;gap:6px;cursor:pointer}
        .mv__send{width:38px;height:38px;border:0;border-radius:12px;background:#fff;color:#070707;display:grid;place-items:center;cursor:pointer;transition:transform .16s ease,opacity .16s ease}
        .mv__send:hover:not(:disabled){transform:translateY(-1px) scale(1.02)}
        .mv__send:disabled{opacity:.45;cursor:not-allowed}
        .mv__settings-popover{position:absolute;right:12px;top:214px;z-index:12;width:320px;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:#16171b;box-shadow:0 24px 70px rgba(0,0,0,.55);display:grid;gap:12px}
        .mv__settings-popover>div>span{display:block;margin-bottom:7px;color:#858790;font-size:11px}
        .mv__segmented{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:5px}
        .mv__segmented button{height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.07);background:#101115;color:#9c9ea6;cursor:pointer}
        .mv__segmented button[data-active="1"]{background:#fff;color:#080808;border-color:#fff}
        .mv__fixed-setting{height:34px;border-radius:10px;background:#101115;display:flex;align-items:center;gap:8px;padding:0 10px;color:#c8c9ce;font-size:12px}
        .mv__model-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
        .mv__model-row button{height:40px;padding:0 15px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#101115;color:#d5d6db;display:flex;align-items:center;gap:8px}
        .mv__model-row .is-active{background:#18191d;color:#fff;font-weight:700}
        .mv__model-row button span{display:flex;align-items:center;gap:0}.mv__model-row button strong{font:inherit}.mv__model-row button small{display:none}
        .mv__statusbar{max-width:1000px;margin:14px auto 22px;display:flex;align-items:center;gap:9px;min-height:20px;color:#747680;font-size:11px}
        .mv__statusbar strong{color:#bfc0c5;font-weight:620}
        .mv__status-dot{width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.28)}
        .mv__statusbar>span:nth-last-child(1):not(.mv__error){margin-left:auto}
        .mv__error{color:#ff8b8b;margin-left:auto;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .mv__discover{max-width:1000px;margin:0 auto}
        .mv__tabs{display:flex;align-items:center;gap:12px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none}
        .mv__tabs::-webkit-scrollbar{display:none}
        .mv__tabs button{height:34px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:#656771;cursor:pointer;white-space:nowrap}
        .mv__tabs button[data-active="1"]{background:#1d1e22;color:#fff}
        .mv__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .mv__card{position:relative;min-width:0;aspect-ratio:.82/1;overflow:hidden;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:#0b0b0d;padding:0;cursor:pointer;text-align:left;transform:translateZ(0);box-shadow:0 12px 30px rgba(0,0,0,.22);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
        .mv__card:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.18);box-shadow:0 20px 42px rgba(0,0,0,.4)}
        .mv__card[data-active="1"]{border-color:rgba(255,255,255,.24)}
        :global(.mv__card-video){position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
        .mv__card:hover :global(.mv__card-video){transform:scale(1.035)}
        .mv__card-shade{position:absolute;inset:34% 0 0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.9));pointer-events:none}
        .mv__card-copy{position:absolute;left:12px;right:12px;bottom:12px;z-index:2;display:flex;flex-direction:column;gap:3px}
        .mv__card-copy strong{font-size:13px;color:#fff;line-height:1.15;text-shadow:0 2px 12px #000}
        .mv__card-copy small{font-size:10px;color:#c8c9cf}
        .mv__render-state{position:absolute;inset:0;z-index:5;display:grid;place-items:center;align-content:center;gap:20px;background:rgba(0,0,0,.74);backdrop-filter:blur(16px)}
        .mv__render-square{position:relative;width:min(54%,300px);aspect-ratio:1;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:radial-gradient(circle at 50% 28%,rgba(255,255,255,.09),transparent 31%),#09090a;overflow:hidden;display:grid;place-items:center;color:#fff;animation:mv-breathe 2.7s ease-in-out infinite}
        .mv__grid{position:absolute;inset:0;opacity:.28;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:28px 28px;animation:mv-grid 12s linear infinite}
        .mv__scan{position:absolute;top:-20%;bottom:-20%;left:-32%;width:26%;transform:skewX(-12deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent);filter:blur(5px);animation:mv-scan 2.1s linear infinite}
        .mv__focus{position:absolute;width:28px;height:28px;border-color:rgba(255,255,255,.46)}
        .mv__focus--tl{top:20px;left:20px;border-top:1px solid;border-left:1px solid}.mv__focus--tr{top:20px;right:20px;border-top:1px solid;border-right:1px solid}.mv__focus--bl{bottom:20px;left:20px;border-bottom:1px solid;border-left:1px solid}.mv__focus--br{bottom:20px;right:20px;border-bottom:1px solid;border-right:1px solid}
        .mv__render-copy{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}.mv__render-copy strong{font-size:14px}.mv__render-copy small{font-size:11px;color:#858790}.mv__render-dot{width:7px;height:7px;border-radius:50%;background:#fff;animation:mv-dot 1.2s ease-in-out infinite}
        @keyframes mv-breathe{50%{transform:scale(1.025);box-shadow:0 32px 80px rgba(0,0,0,.65)}}@keyframes mv-grid{to{background-position:28px 28px}}@keyframes mv-scan{to{left:108%}}@keyframes mv-dot{50%{opacity:.35;transform:scale(.75)}}
        @media(max-width:1120px){.mv{grid-template-columns:minmax(300px,34vw) minmax(0,1fr)}.mv[data-result="1"]{grid-template-columns:minmax(420px,46vw) minmax(0,1fr)}.mv__workspace{padding-left:24px;padding-right:24px}.mv__cards{grid-template-columns:repeat(2,minmax(0,1fr))}.mv__card{aspect-ratio:1.25/1}}
        @media(max-width:820px){
          .mv{display:block;min-height:100svh;overflow:visible;background:#000}
          .mv__showcase{display:none}
          .mv__showcase[data-phase="queued"],.mv__showcase[data-phase="rendering"],.mv__showcase[data-phase="ready"]{display:block;min-height:clamp(320px,48svh,520px);border-right:0;border-bottom:1px solid rgba(255,255,255,.08);background:#000}
          .mv__showcase[data-phase="queued"] .mv__showcase-media,.mv__showcase[data-phase="rendering"] .mv__showcase-media,.mv__showcase[data-phase="ready"] .mv__showcase-media{position:relative;top:auto;height:clamp(320px,48svh,520px);min-height:0;background:#000}
          :global(.mv__showcase-video){object-position:center center}
          .mv__showcase-vignette{background:linear-gradient(180deg,rgba(0,0,0,.08),transparent 56%,rgba(0,0,0,.38))}
          .mv__workspace{height:auto;min-height:100svh;overflow:visible;padding:12px 10px max(34px,env(safe-area-inset-bottom));background:#000}
          .mv__header{position:relative;margin-bottom:11px;display:block;padding-right:96px}
          .mv__eyebrow{font-size:9px;letter-spacing:.14em}
          .mv__header h1{max-width:none;margin-top:4px;font-size:clamp(25px,7vw,31px);line-height:1;letter-spacing:-.055em;white-space:nowrap}
          .mv__library-btn{display:flex;position:absolute;right:0;top:4px;height:33px;align-items:center;padding:0 11px;border-radius:11px;background:#15161a;color:#eee;font-size:11px}
          .mv__composer-shell,.mv__discover{width:100%;max-width:none}
          .mv__notice{min-height:34px;padding:0 10px;border-color:rgba(255,255,255,.1);border-radius:15px 15px 0 0;background:#111214;gap:7px;font-size:9px}
          .mv__notice>span{padding:2px 6px;font-size:8px}
          .mv__notice>strong{font-size:9px;white-space:nowrap}
          .mv__notice p{display:block;font-size:8px;color:#767983;white-space:nowrap}
          .mv__composer{padding:9px 10px 8px;border-color:rgba(255,255,255,.1);border-radius:0 0 15px 15px;background:#111214;box-shadow:none}
          .mv__composer textarea{min-height:52px;border:0;background:transparent;color:#f5f5f6;font-size:14px;line-height:1.35;caret-color:#fff;box-shadow:none}
          .mv__composer textarea:focus{outline:0;box-shadow:none}
          .mv__composer-bottom{margin-top:2px}
          .mv__plus{width:34px;height:34px;border-radius:10px;background:#18191d;color:#c4c5ca}
          .mv__composer-actions{min-width:0}
          .mv__quality{height:34px;max-width:150px;border-color:rgba(255,255,255,.1);background:#1a1b20;color:#f1f1f3;white-space:nowrap;font-size:11px}
          .mv__send{width:auto;min-width:76px;height:34px;flex:0 0 auto;border-radius:10px;background:#f2f2f3;color:#070707;font-size:11px}
          .mv__send::after{content:"Создать";margin-left:6px;font-weight:650}
          .mv__settings-popover{left:0;right:0;top:142px;width:auto;border-color:rgba(255,255,255,.12);background:#151517}
          .mv__model-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px;padding:0;overflow:visible}
          .mv__model-row button{height:42px;min-width:0;padding:0 8px;justify-content:flex-start;background:#111214;border-color:rgba(255,255,255,.09);gap:7px;border-radius:11px}
          .mv__model-row .is-active{background:#191a1d}
          .mv__model-row button>svg{flex:0 0 auto}.mv__model-row button span{min-width:0;display:flex;align-items:flex-start;flex-direction:column;gap:1px;text-align:left}.mv__model-row button strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}.mv__model-row button small{display:block;color:#777a83;font-size:7px;white-space:nowrap}
          .mv__statusbar{margin:8px 1px 9px;min-height:14px;flex-wrap:nowrap;gap:6px;font-size:8px}
          .mv__statusbar>span:nth-last-child(1):not(.mv__error){margin-left:auto}
          .mv__status-dot{width:7px;height:7px;background:#19dc78;box-shadow:0 0 10px rgba(25,220,120,.35)}
          .mv__error{width:100%;max-width:100%;margin-left:0;white-space:normal}
          .mv__tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:8px;gap:5px;overflow:visible}
          .mv__tabs button{height:29px;min-width:0;padding:0 5px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#111214;color:#a5a7ae;font-size:8px;overflow:hidden;text-overflow:ellipsis}
          .mv__tabs button[data-active="1"]{background:#1c1d20;color:#fff}
          .mv__cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
          .mv__card{aspect-ratio:.64/1;border-radius:10px;border-color:rgba(255,255,255,.1);background:#0a0a0b;box-shadow:none;pointer-events:auto}
          .mv__card:hover{transform:none;box-shadow:none}
          :global(.mv__card-video){transform:none!important}
          .mv__card-shade{inset:44% 0 0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.94))}
          .mv__card-copy{left:6px;right:5px;bottom:6px;gap:1px}
          .mv__card-copy strong{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .mv__card-copy small{font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .mv__render-state{gap:16px;background:rgba(0,0,0,.8);backdrop-filter:blur(12px)}
          .mv__render-square{width:min(48vw,210px);border-radius:22px}
          .mv__render-copy strong{font-size:13px}
        }
        @media(max-width:440px){
          .mv__workspace{padding-left:8px;padding-right:8px}
          .mv__header h1{font-size:clamp(24px,6.8vw,29px)}
          .mv__notice{padding:0 9px}
          .mv__notice p{max-width:170px;overflow:hidden;text-overflow:ellipsis}
          .mv__quality{max-width:142px;padding:0 9px;font-size:10px}
          .mv__model-row{gap:5px}
          .mv__model-row button{padding:0 6px}
          .mv__cards{gap:4px}
        }
        @media(max-width:350px){
          .mv__header{padding-right:0}.mv__library-btn{display:none}.mv__header h1{white-space:normal}
          .mv__notice p{display:none}.mv__send{min-width:38px}.mv__send::after{display:none}
          .mv__cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.mv__card{aspect-ratio:.72/1}
          .mv__card-copy strong{font-size:10px}.mv__card-copy small{font-size:8px}
        }
      `}</style>
    </main>
  )
}
