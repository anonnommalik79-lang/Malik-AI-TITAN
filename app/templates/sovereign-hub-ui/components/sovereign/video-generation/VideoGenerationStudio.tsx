"use client"

import { useMemo, useState } from "react"
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  ImagePlus,
  Info,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"
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

type Ratio = "16:9" | "9:16" | "1:1" | "4:3"
type Duration = 5 | 10
type Quality = "720p" | "1080p"
type GenerationPhase = "idle" | "queued" | "rendering" | "ready" | "failed"
type ShowcaseVideoTemplate = VideoAiTemplate & { mobileSrc?: string }

const ENDPOINT = "/api/media/video"
const DEFAULT_PROMPT = "Ночной Алматы после дождя. Чёрный премиальный автомобиль медленно едет по мокрой улице, отражения городских огней на асфальте, камера низко следует сбоку, реалистичная физика, кинематографичный свет и естественный звук города."

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

const MODELS = [
  { id: "malik", name: "MalikVideo 1.0", subtitle: "Бесплатно", tier: "Free", icon: "/brands/malikvideo.svg", active: true },
  { id: "kling21", name: "Kling 2.1", subtitle: "Лучшее качество", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://klingai.com" },
  { id: "kling16", name: "Kling 1.6", subtitle: "Стабильная", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://klingai.com" },
  { id: "runway", name: "Runway Gen-3", subtitle: "Реалистичные", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://runwayml.com" },
  { id: "luma", name: "Luma Dream Machine", subtitle: "Креативные", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://lumalabs.ai" },
  { id: "pika", name: "Pika 2.0", subtitle: "Быстрые", tier: "Pro", icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://pika.art" },
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

function VideoAsset({ item, className = "", contain = false }: { item: ShowcaseVideoTemplate; className?: string; contain?: boolean }) {
  return (
    <video
      className={className}
      poster={item.poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      style={{ objectFit: contain ? "contain" : "cover" }}
    >
      {item.mobileSrc ? <source media="(max-width: 820px)" src={item.mobileSrc} type="video/mp4" /> : null}
      <source src={item.src} type="video/mp4" />
    </video>
  )
}

export function VideoGenerationStudio({ username, onViewChange }: VideoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const owner = isOwnerUser(operator)
  const [prompt, setPrompt] = useState(() => takePrefillPrompt() || DEFAULT_PROMPT)
  const [ratio, setRatio] = useState<Ratio>("16:9")
  const [duration, setDuration] = useState<Duration>(5)
  const [quality, setQuality] = useState<Quality>("1080p")
  const [phase, setPhase] = useState<GenerationPhase>("idle")
  const [attempt, setAttempt] = useState(0)
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(0)
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("Популярное")
  const [thumbPage, setThumbPage] = useState(0)
  const [modelNotice, setModelNotice] = useState("")
  const busy = phase === "queued" || phase === "rendering"
  const selectedItem = SHOWCASE_TEMPLATES[selected] || SHOWCASE_TEMPLATES[0]
  const cards = useMemo(() => SHOWCASE_TEMPLATES.slice(1), [])
  const thumbSize = 6
  const thumbPages = Math.max(1, Math.ceil(SHOWCASE_TEMPLATES.length / thumbSize))
  const thumbs = SHOWCASE_TEMPLATES.slice(thumbPage * thumbSize, thumbPage * thumbSize + thumbSize)

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
    setError("")
    setVideoUrl("")
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
            resolution: quality,
            ratio: ratio === "4:3" ? "16:9" : ratio,
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

      const taskId = String(data?.taskId || "")
      if (!taskId) throw new Error("Видеомодель не вернула taskId")
      if (!owner) incrementUsage("video")
      setPhase("rendering")

      const statusUrl = String(data?.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(taskId)}`)
      for (let index = 0; index < 96; index += 1) {
        setAttempt(index)
        await sleep(index === 0 ? 1500 : index < 12 ? 2500 : 5000)
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
      if (navigator.share) await navigator.share({ title: "MalikVideo", url: new URL(src, window.location.origin).href })
      else await navigator.clipboard.writeText(new URL(src, window.location.origin).href)
    } catch {}
  }

  return (
    <main className="mv2" data-view="video-generation-v2" data-phase={phase}>
      <section className="mv2__preview-column">
        <div className="mv2__stage">
          <div className="mv2__stage-brand mv2__stage-brand--left"><span>IDEAS TO REALITY</span><small>WITH AI</small></div>
          <div className="mv2__stage-brand mv2__stage-brand--right">MALIK AI</div>
          <div className="mv2__media">
            {videoUrl ? (
              <video src={videoUrl} controls autoPlay playsInline preload="metadata" className="mv2__result" />
            ) : (
              <VideoAsset item={selectedItem} className="mv2__hero-video" contain />
            )}
          </div>
          {busy ? (
            <div className="mv2__rendering">
              <div className="mv2__render-box"><Sparkles size={34} /></div>
              <strong>{statusLabel(phase, attempt)}</strong>
              <small>{quality} · {ratio} · {duration}s · Audio synced</small>
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
                  <VideoAsset item={item} className="mv2__thumb-video" />
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
            <div className="mv2__chips">
              <span>{duration} секунд</span><span>{quality}</span><span>{ratio}</span><span>MalikVideo 1.0</span><span>Audio synced</span>
            </div>
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
          <button className="is-active" type="button">Текст → Видео</button>
          <button type="button" title="Скоро">Изображение → Видео</button>
          <button type="button" title="Скоро">Видео → Видео</button>
        </div>
        <div className="mv2__eyebrow">MALIK VIDEO</div>
        <h1>Создавайте невероятные видео</h1>
        <p className="mv2__lead">Опишите идею — Malik AI подготовит сцену, движение камеры и звук.</p>

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

        <div className="mv2__section-title">Модель <Info /></div>
        <div className="mv2__models">
          {MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`mv2__model${model.active ? " is-active" : " is-pro"}`}
              onClick={() => model.active ? setModelNotice("") : setModelNotice(`${model.name} — Pro модель. MalikVideo 1.0 остаётся бесплатной активной моделью.`)}
            >
              <span className="mv2__model-icon"><img src={model.icon} alt="" draggable={false} /></span>
              <span className="mv2__model-copy"><strong>{model.name}</strong><small>{model.subtitle}</small></span>
              <span className={`mv2__tier ${model.active ? "is-free" : "is-pro"}`}>{model.tier}</span>
            </button>
          ))}
        </div>
        {modelNotice ? <div className="mv2__model-notice">{modelNotice}</div> : null}

        <div className="mv2__settings-grid">
          <div>
            <div className="mv2__section-title">Разрешение <Info /></div>
            <div className="mv2__segments">
              {(["720p", "1080p"] as Quality[]).map((value) => <button key={value} type="button" className={quality === value ? "is-active" : ""} onClick={() => setQuality(value)}>{value}</button>)}
              <button type="button" className="is-disabled" disabled>2K · Pro</button>
            </div>
          </div>
          <div>
            <div className="mv2__section-title">Длительность</div>
            <div className="mv2__segments">
              {([5, 10] as Duration[]).map((value) => <button key={value} type="button" className={duration === value ? "is-active" : ""} onClick={() => setDuration(value)}>{value} сек</button>)}
              <button type="button" className="is-disabled" disabled>16 сек · Pro</button>
            </div>
          </div>
          <div>
            <div className="mv2__section-title">Соотношение сторон</div>
            <div className="mv2__segments">
              {(["16:9", "9:16", "1:1", "4:3"] as Ratio[]).map((value) => <button key={value} type="button" className={ratio === value ? "is-active" : ""} onClick={() => setRatio(value)}>{value}</button>)}
            </div>
          </div>
        </div>

        <div className="mv2__generate-row">
          <button type="button" className="mv2__generate" onClick={generate} disabled={busy || !prompt.trim()}><span>{busy ? statusLabel(phase, attempt) : "Сгенерировать видео"}</span><ArrowUp /></button>
          <div className="mv2__credits">◉ ≈ 10 кредитов</div>
          <button type="button" className="mv2__tune"><SlidersHorizontal /></button>
        </div>
        <div className="mv2__status"><span className={`mv2__status-dot is-${phase}`} />{statusLabel(phase, attempt)}{error ? <b>{error}</b> : null}</div>

        <div className="mv2__gallery-tabs">
          {CATEGORIES.map((item) => <button key={item} type="button" className={activeCategory === item ? "is-active" : ""} onClick={() => setActiveCategory(item)}>{item}</button>)}
        </div>
        <div className="mv2__gallery">
          {cards.map((item, index) => (
            <button key={item.id} type="button" className={`mv2__gallery-card${selected === index + 1 ? " is-active" : ""}`} onClick={() => chooseTemplate(index + 1)}>
              <VideoAsset item={item} className="mv2__gallery-video" />
              <span className="mv2__gallery-shade" />
              <span className="mv2__gallery-copy"><strong>{item.title}</strong><small>{item.theme} · 1080p</small></span>
            </button>
          ))}
        </div>
      </section>

      <style jsx>{`
        .mv2{width:100%;min-height:100%;display:grid;grid-template-columns:minmax(480px,.94fr) minmax(620px,1.06fr);gap:18px;padding:14px 18px 30px;background:#000;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:auto;color-scheme:dark}
        .mv2 *{box-sizing:border-box}.mv2 button,.mv2 textarea{font:inherit}.mv2 button{cursor:pointer}.mv2 button:focus-visible,.mv2 textarea:focus-visible{outline:1px solid rgba(255,255,255,.58);outline-offset:2px}
        .mv2__preview-column,.mv2__controls-column{min-width:0}.mv2__stage,.mv2__prompt-card,.mv2__preview-info{border:1px solid #272a31;background:#0c0f14;border-radius:16px}
        .mv2__stage{position:relative;aspect-ratio:16/10.4;overflow:hidden;background:#06080c}.mv2__media{position:absolute;inset:0;display:grid;place-items:center;background:#050608}.mv2__hero-video,.mv2__result{width:100%;height:100%;display:block;background:#050608;object-position:center}.mv2__result{object-fit:contain}.mv2__stage:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 22%,transparent 70%,rgba(0,0,0,.36))}
        .mv2__stage-brand{position:absolute;z-index:2;top:24px;color:#d9e0eb;letter-spacing:.36em;font-size:11px}.mv2__stage-brand--left{left:28px;display:flex;flex-direction:column;gap:10px}.mv2__stage-brand--left small{font-size:9px}.mv2__stage-brand--right{right:26px}.mv2__rendering{position:absolute;z-index:4;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}.mv2__render-box{width:96px;height:96px;border-radius:24px;border:1px solid rgba(255,255,255,.17);display:grid;place-items:center;background:#0c0e12;animation:mv2pulse 1.7s ease-in-out infinite}.mv2__rendering strong{font-size:14px}.mv2__rendering small{color:#939aa7;font-size:11px}@keyframes mv2pulse{50%{transform:scale(1.035);box-shadow:0 24px 70px rgba(0,0,0,.6)}}
        .mv2__thumb-strip{display:grid;grid-template-columns:28px 1fr 28px;gap:7px;align-items:center;margin-top:12px}.mv2__thumbs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.mv2__arrow{width:28px;height:76px;border:0;background:transparent;color:#b9c2d1;display:grid;place-items:center}.mv2__arrow svg{width:18px;height:18px}.mv2__thumb{position:relative;height:76px;border:1px solid #262a31;border-radius:10px;overflow:hidden;background:#0b0e13;padding:0}.mv2__thumb.is-active{border-color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.mv2__thumb-video{width:100%;height:100%;object-fit:cover;display:block}.mv2__thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.72))}.mv2__thumb span{position:absolute;z-index:2;left:7px;bottom:5px;font-size:9px;color:#dce2ec}
        .mv2__preview-info{margin-top:12px;padding:15px;display:grid;grid-template-columns:1fr 132px;gap:15px}.mv2__preview-copy h3{margin:0 0 8px;font-size:17px}.mv2__preview-copy p{margin:0;color:#9ca4b2;font-size:12px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mv2__chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.mv2__chips span{height:28px;padding:0 9px;border:1px solid #292d34;border-radius:999px;background:#12161d;color:#adb5c2;display:inline-flex;align-items:center;font-size:10px}.mv2__preview-actions{display:flex;flex-direction:column;gap:7px}.mv2__preview-actions button{height:35px;border:1px solid #2c3038;border-radius:9px;background:#12161d;color:#edf1f7;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px}.mv2__preview-actions svg{width:14px;height:14px}
        .mv2__controls-column{position:relative;padding:5px 0 24px}.mv2__mode-tabs{position:absolute;right:0;top:0;display:flex;border:1px solid #1d2027;background:#0b0d11;border-radius:12px;padding:3px;overflow:hidden}.mv2__mode-tabs button{height:34px;border:0;border-radius:9px;background:transparent;color:#8e96a4;padding:0 13px;font-size:10px;white-space:nowrap}.mv2__mode-tabs button.is-active{background:#191d25;color:#fff}.mv2__eyebrow{margin-top:13px;color:#707887;letter-spacing:.28em;font-size:10px}.mv2 h1{margin:14px 0 6px;font-size:clamp(34px,3.2vw,52px);line-height:1;letter-spacing:-.05em}.mv2__lead{margin:0 0 15px;color:#929aa8;font-size:13px}
        .mv2__prompt-card{padding:12px}.mv2__prompt-card textarea{width:100%;height:106px;border:0;outline:0;resize:none;background:transparent;color:#fff;font-size:14px;line-height:1.5;padding:3px}.mv2__prompt-card textarea::placeholder{color:#6f7887}.mv2__prompt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.mv2__helper-row{display:flex;gap:6px;flex-wrap:wrap}.mv2__helper-row button{height:30px;border:1px solid #2a2e36;border-radius:8px;background:#151922;color:#cbd2dd;display:flex;align-items:center;gap:5px;padding:0 9px;font-size:9px}.mv2__helper-row svg{width:12px;height:12px}.mv2__count{font-size:9px;color:#777f8d;white-space:nowrap}
        .mv2__section-title{display:flex;align-items:center;gap:5px;margin:15px 0 8px;font-size:12px;font-weight:750}.mv2__section-title svg{width:13px;height:13px}.mv2__models{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.mv2__model{position:relative;min-width:0;height:66px;padding:8px;border:1px solid #272b33;border-radius:11px;background:#0f131a;color:#fff;display:flex;align-items:center;gap:7px;text-align:left;overflow:hidden}.mv2__model.is-active{border-color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}.mv2__model.is-pro{opacity:.88}.mv2__model-icon{width:31px;height:31px;border-radius:9px;background:#f2f3f5;display:grid;place-items:center;overflow:hidden;flex:0 0 auto}.mv2__model-icon img{width:100%;height:100%;object-fit:contain}.mv2__model-copy{min-width:0;display:flex;flex-direction:column}.mv2__model-copy strong,.mv2__model-copy small{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2__model-copy strong{font-size:10px}.mv2__model-copy small{font-size:8px;color:#9098a5;margin-top:3px}.mv2__tier{position:absolute;right:5px;top:5px;height:16px;padding:0 5px;border-radius:999px;display:flex;align-items:center;font-size:7px;font-weight:800}.mv2__tier.is-free{background:#fff;color:#000}.mv2__tier.is-pro{background:#1a1e27;color:#d6ae57}.mv2__model-notice{margin-top:7px;color:#9ba3b1;font-size:9px}
        .mv2__settings-grid{display:grid;grid-template-columns:.9fr .9fr 1.15fr;gap:15px;margin-top:4px}.mv2__segments{display:flex;gap:6px;flex-wrap:wrap}.mv2__segments button{height:38px;border:1px solid #2b3038;border-radius:9px;background:#0d1118;color:#c7ced9;padding:0 11px;font-size:10px}.mv2__segments button.is-active{border-color:#fff;color:#fff;background:#151922}.mv2__segments button.is-disabled{opacity:.45;cursor:not-allowed}
        .mv2__generate-row{display:grid;grid-template-columns:1fr auto 44px;gap:8px;margin-top:16px}.mv2__generate{height:48px;border:0;border-radius:10px;background:#f3f4f6;color:#080a0d;font-weight:800;display:flex;align-items:center;justify-content:center;gap:12px}.mv2__generate:disabled{opacity:.58;cursor:not-allowed}.mv2__generate svg{width:17px;height:17px}.mv2__credits,.mv2__tune{height:48px;border:1px solid #282d35;border-radius:10px;background:#0f131a;color:#adb5c2}.mv2__credits{display:flex;align-items:center;padding:0 13px;font-size:9px}.mv2__tune{width:44px;display:grid;place-items:center}.mv2__tune svg{width:16px;height:16px}.mv2__status{min-height:20px;margin-top:7px;display:flex;align-items:center;gap:6px;font-size:9px;color:#919aa8}.mv2__status b{color:#ff8f8f;font-weight:500;margin-left:auto;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2__status-dot{width:6px;height:6px;border-radius:50%;background:#8c94a1}.mv2__status-dot.is-ready{background:#39df8a}.mv2__status-dot.is-rendering,.mv2__status-dot.is-queued{background:#fff;box-shadow:0 0 9px rgba(255,255,255,.35)}.mv2__status-dot.is-failed{background:#ff7474}
        .mv2__gallery-tabs{display:flex;gap:6px;overflow-x:auto;margin-top:12px;padding-bottom:8px;scrollbar-width:none}.mv2__gallery-tabs::-webkit-scrollbar{display:none}.mv2__gallery-tabs button{height:30px;border:0;border-radius:8px;background:transparent;color:#818a98;padding:0 9px;font-size:9px;white-space:nowrap}.mv2__gallery-tabs button.is-active{background:#171b22;color:#fff}.mv2__gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mv2__gallery-card{position:relative;aspect-ratio:1.45/1;border:1px solid #232832;border-radius:11px;overflow:hidden;background:#090c11;padding:0;text-align:left}.mv2__gallery-card.is-active{border-color:rgba(255,255,255,.45)}.mv2__gallery-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.mv2__gallery-shade{position:absolute;inset:35% 0 0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.9))}.mv2__gallery-copy{position:absolute;z-index:2;left:8px;right:8px;bottom:7px;display:flex;flex-direction:column;gap:2px}.mv2__gallery-copy strong{font-size:9px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mv2__gallery-copy small{font-size:7px;color:#c1c8d2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @media(max-width:1320px){.mv2{grid-template-columns:1fr}.mv2__stage{aspect-ratio:16/8.7}.mv2__models{grid-template-columns:repeat(3,minmax(0,1fr))}.mv2__gallery-card{aspect-ratio:1.65/1}}
        @media(max-width:820px){.mv2{display:block;padding:9px 8px 90px;overflow:visible}.mv2__preview-column{margin-bottom:13px}.mv2__stage{aspect-ratio:16/10.4;border-radius:13px}.mv2__stage-brand{top:14px;font-size:8px}.mv2__stage-brand--left{left:15px;gap:6px}.mv2__stage-brand--left small{font-size:7px}.mv2__stage-brand--right{right:14px}.mv2__thumb-strip{grid-template-columns:24px 1fr 24px}.mv2__thumbs{grid-template-columns:repeat(3,minmax(0,1fr))}.mv2__thumb:nth-child(n+4){display:none}.mv2__thumb{height:60px}.mv2__preview-info{grid-template-columns:1fr;padding:12px}.mv2__preview-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.mv2__preview-actions button{height:36px;font-size:9px}.mv2__mode-tabs{position:static;width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:10px}.mv2__mode-tabs button{padding:0 5px;font-size:8px}.mv2__eyebrow{margin-top:0}.mv2 h1{font-size:30px;margin-top:7px}.mv2__lead{font-size:10px}.mv2__prompt-card textarea{height:82px;font-size:12px}.mv2__helper-row button{font-size:8px;padding:0 7px}.mv2__models{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mv2__model{height:62px}.mv2__settings-grid{grid-template-columns:1fr;gap:5px}.mv2__generate-row{grid-template-columns:1fr auto}.mv2__tune{display:none}.mv2__gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mv2__gallery-card{aspect-ratio:1.55/1}.mv2__gallery-copy strong{font-size:8px}}
      `}</style>
    </main>
  )
}
