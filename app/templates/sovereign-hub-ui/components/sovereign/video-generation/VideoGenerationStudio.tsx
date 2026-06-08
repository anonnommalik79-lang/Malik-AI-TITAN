"use client"

import { useMemo, useState } from "react"
import {
  Clapperboard,
  Film,
  Layers,
  Maximize2,
  RefreshCw,
  Sparkles,
  Timer,
  Cpu,
  ChevronRight,
  Video,
} from "lucide-react"
import { canUseGeneration, incrementUsage } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { VIDEO_AI_TEMPLATES } from "@/lib/media-library"
import { VideoLoop } from "./VideoLoop"

export type VideoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type StylePreset = {
  id: string
  title: string
  body: string
  tag: string
  src: string
  poster: string
  tint: string
}

type SceneCard = {
  title: string
  body: string
  duration: string
  src: string
  poster: string
}

const ENDPOINT = "/api/media/video"
const DEFAULT_PROMPT =
  "Кинематографичный продуктовый ролик для MALIK AI: запуск на Digital Bridge 2026, тёмная студия, неоновый свет, плавные переходы между сценами."

const STYLE_PRESETS: StylePreset[] = VIDEO_AI_TEMPLATES.map((t) => ({
  id: t.id,
  title: t.title,
  body: `${t.theme} · ${t.provider} — ${t.prompt.slice(0, 72)}…`,
  tag: t.tag,
  src: t.src,
  poster: t.poster,
  tint: t.tint,
}))

const PROMPT_CHIPS = [
  "Кинематографичный запуск AI-продукта: hero reveal, интерфейс, финальный CTA",
  "Тёмная студия с неоновым светом, плавный flythrough по дашборду Malik AI",
  "Sci-Fi ролик: орбита, посадка, исследование, возвращение — 30 секунд",
  "Investor demo video: премиальный SaaS, glass UI, драматичный свет",
]

const STORYBOARD_SCENES: SceneCard[] = VIDEO_AI_TEMPLATES.slice(0, 8).map((t, i) => ({
  title: t.title,
  body: t.prompt.slice(0, 90),
  duration: `00:0${5 + (i % 4)}`,
  src: t.src,
  poster: t.poster,
}))

const RATIOS = ["16:9", "9:16", "1:1", "21:9"] as const

function escapeHtml(value: string) {
  return value.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)
}

function fallbackStoryboard(prompt: string, scenes: SceneCard[]) {
  const cards = scenes
    .map(
      (s) =>
        `<article style="border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:20px;background:rgba(255,255,255,.03)"><span style="font-size:11px;color:#94a3b8">${s.duration}</span><h3 style="margin:8px 0 6px;font-size:18px">${escapeHtml(s.title)}</h3><p style="margin:0;color:#94a3b8;line-height:1.6">${escapeHtml(s.body)}</p></article>`,
    )
    .join("")
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Video Generation · Malik Cinema</title>
<style>:root{color-scheme:dark}body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#030303;color:#e8eae9;padding:40px 20px}.wrap{max-width:900px;margin:0 auto}h1{font-size:28px}p{color:#94a3b8;line-height:1.6}.grid{display:grid;gap:14px;margin-top:24px}</style></head>
<body><div class="wrap"><h1>Malik Cinema · Storyboard</h1><p>${escapeHtml(prompt)}</p><div class="grid">${cards}</div></div></body></html>`
}

export function VideoGenerationStudio({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: VideoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [activeStyle, setActiveStyle] = useState(STYLE_PRESETS[0].id)
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>("16:9")
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Cinema pipeline готов")
  const [error, setError] = useState<string | null>(null)
  const [artifact, setArtifact] = useState("")
  const [fallback, setFallback] = useState(false)
  const [taskId, setTaskId] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [providerUsed, setProviderUsed] = useState("")
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null)

  const styleMeta = useMemo(
    () => STYLE_PRESETS.find((s) => s.id === activeStyle) ?? STYLE_PRESETS[0],
    [activeStyle],
  )

  const heroClip = styleMeta
  const safeArtifact = artifact || fallbackStoryboard(prompt, STORYBOARD_SCENES)

  const generate = async () => {
    if (!prompt.trim()) {
      setError("Введите сценарий видео")
      return
    }
    if (!canUseGeneration("video", operator)) {
      setError("Достигнут лимит бесплатной генерации видео")
      setStatus("Лимит исчерпан")
      return
    }
    incrementUsage("video")
    setLoading(true)
    setError(null)
    setStatus("Ставлю рендер в очередь…")
    try {
      const res = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            length: 5,
            resolution: "720p",
            generateAudio: false,
            userEmail: operator,
          }),
        },
        60_000,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.publicError || data.message || `Ошибка ${res.status}`)

      setProviderUsed(String(data.provider || "pollo"))
      setRemainingDaily(typeof data.remainingDailyVideos === "number" ? data.remainingDailyVideos : null)
      setTaskId(String(data.taskId || ""))
      setStatus(data.status === "disabled" ? "Pollo отключён" : "Видео в очереди Pollo…")

      if (!data.taskId) throw new Error("Pollo не вернул taskId")

      const statusUrl = data.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(data.taskId)}`
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2000 : 5000))
        setStatus(attempt < 3 ? "queued" : "generating")
        const statusRes = await clientFetchWithTimeout(statusUrl, { method: "GET" }, 30_000)
        const statusData = await statusRes.json().catch(() => ({}))
        if (!statusRes.ok) throw new Error(statusData.error || `Status ${statusRes.status}`)
        if (statusData.status === "failed") throw new Error(statusData.error || "Pollo render failed")
        const url = statusData.videoUrl || statusData.url
        if (url) {
          setVideoUrl(url)
          setArtifact(url)
          setFallback(false)
          setStatus(`Готово · ${data.model || "pollo-v2-0"}`)
          return
        }
      }
      setStatus("generating — проверьте статус позже")
      setError("Рендер ещё в процессе. Повторите проверку по taskId.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Генерация видео недоступна")
      setStatus("Ошибка или Pollo не настроен")
    } finally {
      setLoading(false)
    }
  }

  const sendCanvas = () => {
    onOpenCanvas?.(safeArtifact)
    setStatus("Storyboard отправлен в Canvas")
  }

  const reset = () => {
    onNewChat?.()
    setPrompt(DEFAULT_PROMPT)
    setArtifact("")
    setFallback(false)
    setError(null)
    setStatus("Cinema pipeline готов")
  }

  return (
    <main className="vgs" data-view="video-generation">
      <div className="vgs__bg" aria-hidden="true" />
      <div className="vgs__inner">

        <div className="vgs__status">
          <span className="vgs__status-left">
            <span className="vgs__dot" />
            <span className="vgs__status-key">Malik Cinema</span>
            <strong className="vgs__status-val">Онлайн</strong>
          </span>
          <span className="vgs__status-right">
            Очередь рендера
            <strong>{loading ? "в работе" : status}</strong>
            {providerUsed && <strong> · {providerUsed}</strong>}
            {remainingDaily !== null && <strong> · осталось {remainingDaily}</strong>}
            {taskId && <strong> · {taskId.slice(0, 8)}</strong>}
          </span>
        </div>

        <header className="vgs__head">
          <span className="vgs__eyebrow"><Clapperboard size={13} /> Кинематографический конвейер</span>
          <h1 className="vgs__title">Video Generation</h1>
          <p className="vgs__lede">
            Премиальная видео-студия для AI-продуктов. Опишите сценарий — получите storyboard, motion-пресеты
            и кинематографичные кадры с экспортом в Canvas. Каждая полка наполнена тёмными кадрами и постерами,
            а не пустыми формами.
          </p>
        </header>

        {/* Hero — dominant poster/video area */}
        <section className="vgs__shelf vgs__hero">
          <div className="vgs__hero-media">
            {videoUrl ? (
              <video src={videoUrl} className="vgs__hero-video" controls playsInline />
            ) : (
              <VideoLoop src={heroClip.src} poster={heroClip.poster} className="vgs__hero-video" />
            )}
            <div className="vgs__hero-overlay" style={{ background: styleMeta.tint }} />
            <div className="vgs__hero-caption">
              <span className="vgs__shelf-label"><Film size={13} /> Текущая сцена</span>
              <h2 className="vgs__shelf-title">{styleMeta.title}</h2>
              <p>{status}</p>
            </div>
          </div>
          <div className="vgs__hero-copy">
            <span className="vgs__shelf-label">Что это и как использовать</span>
            <h2 className="vgs__shelf-title">От сценария до storyboard</h2>
            <p>
              Video Generation — кинематографический конвейер Malik AI. Вы задаёте motion-промпт, выбираете стиль
              и соотношение, а Cinema pipeline рендерит артефакт через <code>{ENDPOINT}</code> с асинхронной
              очередью и безопасным storyboard-резервом.
            </p>
            <ol className="vgs__steps">
              <li><span className="vgs__step-num">1</span><div><strong>Напишите сценарий.</strong> Опишите сцены, темп, свет и движение камеры.</div></li>
              <li><span className="vgs__step-num">2</span><div><strong>Выберите стиль.</strong> Пресеты с постерами задают визуальное направление ролика.</div></li>
              <li><span className="vgs__step-num">3</span><div><strong>Запустите рендер.</strong> API ставит задачу в очередь и возвращает storyboard или видео-URL.</div></li>
              <li><span className="vgs__step-num">4</span><div><strong>Презентуйте.</strong> Отправьте storyboard в Canvas или переходите к Website Builder.</div></li>
            </ol>
          </div>
        </section>

        {/* Prompt lab */}
        <section className="vgs__shelf vgs__prompt">
          <div className="vgs__prompt-head">
            <div>
              <span className="vgs__shelf-label"><Video size={13} /> Motion-лаборатория</span>
              <h2 className="vgs__shelf-title">Опишите видео</h2>
            </div>
            <div className="vgs__ratio-pills" role="group" aria-label="Соотношение кадра">
              {RATIOS.map((r) => (
                <button key={r} type="button" data-active={ratio === r ? "1" : "0"} onClick={() => setRatio(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="vgs__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Сценарий: сцены, темп, свет, движение камеры, финальный CTA…"
          />
          <div className="vgs__chips">
            {PROMPT_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setPrompt(chip)}>
                {chip.slice(0, 54)}…
              </button>
            ))}
          </div>
          {error ? <p className="vgs__error">{error}</p> : null}
          <div className="vgs__actions">
            <button type="button" className="vgs__btn vgs__btn--primary" onClick={generate} disabled={loading}>
              <Sparkles size={15} />
              {loading ? "Рендерю…" : "Сгенерировать"}
            </button>
            <button type="button" className="vgs__btn vgs__btn--ghost" onClick={sendCanvas}>
              <Maximize2 size={15} /> В Canvas
            </button>
            <button type="button" className="vgs__btn vgs__btn--ghost" onClick={onOpenCodex}>
              <Cpu size={15} /> Cortex
            </button>
            <button type="button" className="vgs__btn vgs__btn--ghost" onClick={reset}>
              <RefreshCw size={15} /> Сброс
            </button>
          </div>
        </section>

        {/* Style presets */}
        <section className="vgs__styles" aria-label="Стили видео">
          <div className="vgs__section-head">
            <div>
              <span className="vgs__shelf-label"><Layers size={13} /> Стили</span>
              <h2 className="vgs__shelf-title">20 AI-видео шаблонов — Runway · Kling · Pika</h2>
            </div>
          </div>
          <div className="vgs__style-grid">
            {STYLE_PRESETS.map((preset) => (
              <article
                key={preset.id}
                data-active={activeStyle === preset.id ? "1" : "0"}
                onClick={() => {
                  setActiveStyle(preset.id)
                  setStatus(`Стиль «${preset.title}» выбран`)
                }}
                onKeyDown={(e) => e.key === "Enter" && setActiveStyle(preset.id)}
                role="button"
                tabIndex={0}
              >
                <div className="vgs__style-photo">
                  <VideoLoop src={preset.src} poster={preset.poster} className="vgs__style-video" />
                  <div className="vgs__style-tint" style={{ background: preset.tint }} />
                  <span className="vgs__style-tag">{preset.tag}</span>
                  <span className="vgs__style-provider">
                    {VIDEO_AI_TEMPLATES.find((x) => x.id === preset.id)?.provider}
                  </span>
                </div>
                <div className="vgs__style-body">
                  <strong>{preset.title}</strong>
                  <p>{preset.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Storyboard scenes */}
        <section className="vgs__storyboard" aria-label="Storyboard">
          <div className="vgs__section-head">
            <div>
              <span className="vgs__shelf-label"><Timer size={13} /> Storyboard</span>
              <h2 className="vgs__shelf-title">Сцены ролика</h2>
            </div>
            {artifact ? (
              <span className="vgs__artifact-badge">{fallback ? "Резервный storyboard" : "Артефакт готов"}</span>
            ) : null}
          </div>
          <div className="vgs__scene-grid">
            {STORYBOARD_SCENES.map((scene) => (
              <article key={scene.title} className="vgs__scene-card">
                <div className="vgs__scene-photo">
                  <VideoLoop src={scene.src} poster={scene.poster} className="vgs__scene-video" />
                  <span className="vgs__scene-dur">{scene.duration}</span>
                </div>
                <div className="vgs__scene-body">
                  <strong>{scene.title}</strong>
                  <p>{scene.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="vgs__shelf vgs__cta">
          <div className="vgs__cta-copy">
            <span className="vgs__shelf-label">Кинематографический стандарт</span>
            <h2 className="vgs__shelf-title">Ролики уровня Digital Bridge.</h2>
            <p>Каждый storyboard готов к демо-сцене, питч-деку или продуктовой презентации — без доработки в сторонних редакторах.</p>
          </div>
          <div className="vgs__actions">
            <button type="button" className="vgs__btn vgs__btn--primary" onClick={generate} disabled={loading}>
              <Sparkles size={15} />
              {loading ? "Рендерю…" : "Сгенерировать ролик"}
            </button>
            <button type="button" className="vgs__btn vgs__btn--ghost" onClick={() => onViewChange("website-generation")}>
              Website Builder <ChevronRight size={15} />
            </button>
          </div>
        </section>

        <footer className="vgs__footer">
          <span><Clapperboard size={12} /> Malik Cinema pipeline</span>
          <span>Оператор · {operator}</span>
          <span>Эндпоинт · {ENDPOINT}</span>
          <span className="vgs__footer-comp"><Sparkles size={12} /> Async queue · Canvas export</span>
        </footer>
      </div>

      <style jsx>{`
        .vgs {
          position: relative;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px;
          color: #e7eae8;
          -webkit-font-smoothing: antialiased;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
        }
        .vgs::-webkit-scrollbar { width: 6px; }
        .vgs::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
        @media (max-width: 920px) { .vgs { padding-top: clamp(20px, 3vw, 32px); } }
        .vgs__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(55% 40% at 10% 0%, rgba(139, 92, 246, 0.06), transparent 60%),
            radial-gradient(45% 35% at 92% 6%, rgba(244, 63, 94, 0.05), transparent 62%);
        }
        .vgs__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .vgs__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #b8a3c4;
        }
        .vgs__status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          margin-bottom: 30px;
        }
        .vgs__status-left { display: inline-flex; align-items: center; gap: 10px; }
        .vgs__dot { width: 8px; height: 8px; border-radius: 999px; background: #d8b4fe; }
        .vgs__status-key { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a958f; }
        .vgs__status-val { font-size: 12.5px; font-weight: 700; color: #ede9fe; }
        .vgs__status-right { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a958f; }
        .vgs__status-right strong { margin-left: 8px; font-weight: 700; color: #e9d5ff; }
        .vgs__head { max-width: 70ch; margin: 0 0 40px; }
        .vgs__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #b8a3c4;
          margin-bottom: 18px;
        }
        .vgs__title {
          margin: 0 0 18px;
          font-size: clamp(38px, 6vw, 64px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .vgs__lede {
          margin: 0;
          font-size: clamp(16px, 1.7vw, 20px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 60ch;
        }
        .vgs__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .vgs__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(20px, 2.3vw, 27px);
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: #f1f4f2;
        }
        .vgs__hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          gap: clamp(20px, 3vw, 32px);
          padding: 0;
          overflow: hidden;
          border: none;
          background: transparent;
        }
        @media (max-width: 900px) { .vgs__hero { grid-template-columns: 1fr; } }
        .vgs__hero-media {
          position: relative;
          min-height: 360px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .vgs__hero-video,
        .vgs__style-video,
        .vgs__scene-video,
        .vgs__style-poster {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .vgs__style-poster {
          background-size: cover;
          background-position: center;
        }
        .vgs__style-tint,
        .vgs__hero-overlay {
          z-index: 1;
        }
        .vgs__scene-dur,
        .vgs__style-tag,
        .vgs__hero-caption {
          z-index: 2;
        }
        .vgs__hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 25%, rgba(3, 3, 3, 0.88) 100%);
        }
        .vgs__hero-caption {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 28px;
          z-index: 1;
        }
        .vgs__hero-caption p { margin: 8px 0 0; font-size: 13px; color: #b8c4be; }
        .vgs__hero-copy {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 32px);
        }
        .vgs__hero-copy p {
          margin: 0 0 14px;
          font-size: 15px;
          line-height: 1.7;
          color: #a7b2ac;
        }
        .vgs__hero-copy code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12px;
          color: #d8b4fe;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 1px 6px;
        }
        .vgs__steps { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        .vgs__steps li { display: flex; gap: 14px; align-items: flex-start; }
        .vgs__step-num {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          color: #e9d5ff;
          border: 1px solid rgba(216, 180, 254, 0.28);
          background: rgba(139, 92, 246, 0.1);
        }
        .vgs__steps li div { font-size: 14px; line-height: 1.6; color: #9aa6a0; }
        .vgs__steps strong { display: block; color: #e7ece9; font-weight: 600; margin-bottom: 2px; }
        .vgs__prompt-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .vgs__prompt-head .vgs__shelf-title { margin-bottom: 0; }
        .vgs__ratio-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .vgs__ratio-pills button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: transparent;
          color: #aab4af;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 12px;
          cursor: pointer;
        }
        .vgs__ratio-pills button[data-active="1"] {
          border-color: rgba(216, 180, 254, 0.45);
          background: rgba(139, 92, 246, 0.1);
          color: #ede9fe;
        }
        .vgs__textarea {
          width: 100%;
          resize: vertical;
          min-height: 110px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          color: #e7ece9;
          font-size: 15px;
          line-height: 1.65;
          padding: 16px 18px;
          font-family: inherit;
        }
        .vgs__textarea:focus { outline: none; border-color: rgba(216, 180, 254, 0.35); }
        .vgs__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .vgs__chips button {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          color: #9aa6a0;
          font-size: 12px;
          padding: 8px 14px;
          cursor: pointer;
        }
        .vgs__chips button:hover { border-color: rgba(255, 255, 255, 0.22); color: #e7ece9; }
        .vgs__error { margin: 12px 0 0; font-size: 13px; color: #e8a87c; }
        .vgs__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .vgs__btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          border-radius: 10px;
          padding: 11px 18px;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .vgs__btn--primary { background: #f5f6f5; color: #0c1310; border-color: #f5f6f5; }
        .vgs__btn--primary:hover:not(:disabled) { background: #e3e6e4; }
        .vgs__btn--primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .vgs__btn--ghost {
          background: transparent;
          color: #cdd6d1;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .vgs__btn--ghost:hover { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.28); color: #f1f4f2; }
        .vgs__section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .vgs__section-head .vgs__shelf-title { margin-bottom: 0; }
        .vgs__artifact-badge {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #e9d5ff;
          border: 1px solid rgba(216, 180, 254, 0.3);
          border-radius: 999px;
          padding: 5px 12px;
        }
        .vgs__styles, .vgs__storyboard { margin-bottom: 22px; }
        .vgs__style-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
          padding-bottom: 10px;
        }
        .vgs__style-grid article {
          min-width: 0;
          max-width: none;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.18s, transform 0.18s;
        }
        .vgs__style-grid article:hover { border-color: rgba(255, 255, 255, 0.2); transform: translateY(-2px); }
        .vgs__style-grid article[data-active="1"] { border-color: rgba(216, 180, 254, 0.45); }
        .vgs__style-photo {
          position: relative;
          height: 160px;
          background-size: cover;
          background-position: center;
        }
        .vgs__style-tint { position: absolute; inset: 0; }
        .vgs__style-play {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #f1f4f2;
        }
        .vgs__style-provider {
          position: absolute;
          right: 10px;
          top: 10px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #e9d5ff;
          padding: 3px 7px;
          border-radius: 6px;
          border: 1px solid rgba(216, 180, 254, 0.28);
          background: rgba(0, 0, 0, 0.45);
        }
        .vgs__style-tag {
          position: absolute;
          left: 12px;
          bottom: 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #f1f4f2;
          background: rgba(0, 0, 0, 0.45);
          border-radius: 999px;
          padding: 4px 10px;
        }
        .vgs__style-body { padding: 16px 18px 18px; }
        .vgs__style-body strong { display: block; font-size: 16px; color: #f1f4f2; margin-bottom: 6px; }
        .vgs__style-body p { margin: 0; font-size: 13px; line-height: 1.6; color: #9aa6a0; }
        .vgs__scene-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }
        .vgs__scene-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          overflow: hidden;
        }
        .vgs__scene-photo {
          position: relative;
          height: 150px;
          background-size: cover;
          background-position: center;
        }
        .vgs__scene-dur {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 10px;
          font-weight: 700;
          font-family: ui-monospace, Menlo, monospace;
          color: #f1f4f2;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 999px;
          padding: 4px 10px;
        }
        .vgs__scene-body { padding: 16px 18px 18px; }
        .vgs__scene-body strong { display: block; font-size: 15px; color: #f1f4f2; margin-bottom: 6px; }
        .vgs__scene-body p { margin: 0; font-size: 13px; line-height: 1.6; color: #9aa6a0; }
        .vgs__cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 22px;
        }
        .vgs__cta-copy { max-width: 56ch; }
        .vgs__cta-copy .vgs__shelf-title { margin-bottom: 10px; }
        .vgs__cta-copy p { margin: 0; font-size: 14.5px; line-height: 1.6; color: #a7b2ac; }
        .vgs__cta .vgs__actions { margin-top: 0; }
        .vgs__footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 20px;
          margin-top: 8px;
          padding: 16px 18px;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.015);
          font-size: 11.5px;
          color: #7e8b85;
        }
        .vgs__footer span { display: inline-flex; align-items: center; gap: 6px; }
        .vgs__footer-comp { margin-left: auto; color: #b8a3c4; }
      `}</style>
    </main>
  )
}

export default VideoGenerationStudio
