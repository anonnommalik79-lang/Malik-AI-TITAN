"use client"

import { useMemo, useState } from "react"
import {
  Check,
  Clock3,
  Code2,
  Copy,
  FileText,
  ImageIcon,
  Loader2,
  Mic2,
  Play,
  Presentation,
  Send,
  Settings,
  Sparkles,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { clientFetchWithTimeout } from "@/lib/api-client"

type MediaMode = "text" | "code" | "photo" | "video" | "audio" | "presentation"
type MediaFormat = "1:1" | "9:16" | "16:9"

type MediaGeneratorProps = {
  userEmail?: string
  onSendToCanvas?: (code: string) => void
}

type MediaResult = {
  ok?: boolean
  code?: string
  text?: string
  url?: string
  videoUrl?: string
  status?: string
  jobId?: string
  statusUrl?: string
  provider?: string
  model?: string
  engine?: string
  publicError?: string
  message?: string
  storyboard?: {
    title?: string
    frames?: Array<{ time: string; label: string; description: string }>
  }
}

const MEDIA_FREE_USED_KEY = "MALIK_MEDIA_FREE_GENERATION_USED"

const modeTabs: Array<{ id: MediaMode; label: string; icon: typeof FileText }> = [
  { id: "text", label: "Текст", icon: FileText },
  { id: "code", label: "Код", icon: Code2 },
  { id: "photo", label: "Изображение", icon: ImageIcon },
  { id: "video", label: "Видео", icon: Play },
  { id: "audio", label: "Аудио", icon: Mic2 },
  { id: "presentation", label: "Презентация", icon: Presentation },
]

const styles = [
  "cinematic premium",
  "dark glass SaaS",
  "photoreal product",
  "cyber neon",
  "minimal studio",
  "investor pitch",
]

const formats: MediaFormat[] = ["1:1", "9:16", "16:9"]
const durations = [5, 8, 12]

const historyRows = [
  ["SaaS лендинг для AI стартапа", "Текст", "Malik 4.1 Ultra", "Сегодня, 10:24", "Готово"],
  ["Иллюстрация: космический пейзаж", "Изображение", "Malik 4.1 Ultra", "Сегодня, 10:18", "Готово"],
  ["Промо-видео продукта", "Видео", "Malik Video 2.0", "Сегодня, 10:05", "Выполнено"],
  ["Презентация для инвесторов", "Презентация", "Malik Slides", "Вчера, 22:47", "Готово"],
  ["API интеграция: пример кода", "Код", "Malik 4.1 Ultra", "Вчера, 21:31", "Готово"],
]

const quickScenarios = [
  ["Создать SaaS лендинг", "Лендинг с преимуществами, тарифами и отзывами."],
  ["Сгенерировать иллюстрацию", "Иллюстрация для блога, постера или обложки."],
  ["Видео для промо", "Ролик 30-60 сек для продукта или события."],
  ["Презентация для питча", "Структурированная презентация для инвесторов."],
]

const topbarItems = [
  ["◎", "Malik AI Agents"],
  ["✺", "High-Speed queue"],
  ["⌘", "Malik Ask"],
  ["⌕", "Craft & Search"],
  ["↯", "API 2.0"],
  ["✧", "Crew: all flow"],
  ["⟡", "Deploy"],
  [">_", "Malik Codex"],
  ["✣", "Creator Mode: ON"],
] as const

function getFreeUsed() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(MEDIA_FREE_USED_KEY) === "1"
}

function setFreeUsed() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(MEDIA_FREE_USED_KEY, "1")
}

function endpointForMode(mode: MediaMode) {
  if (mode === "video") return "/api/generate/video"
  if (mode === "photo") return "/api/generate/photo"
  if (mode === "code") return "/api/generate/code"
  if (mode === "presentation") return "/api/generate/presentation"
  return "/api/stream"
}

function createFallbackArtifact(mode: MediaMode, prompt: string) {
  if (mode === "code") {
    return `export default function MalikGeneratedApp() {\n  return (\n    <main className="min-h-screen bg-slate-950 p-8 text-white">\n      <section className="mx-auto max-w-5xl rounded-3xl border border-cyan-400/20 bg-white/5 p-8">\n        <p className="text-cyan-300">Malik AI Code Generator</p>\n        <h1 className="mt-4 text-4xl font-black">${prompt.slice(0, 96)}</h1>\n      </section>\n    </main>\n  )\n}\n`
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#030303] text-white"><main class="min-h-screen p-8"><section class="mx-auto max-w-5xl"><p class="text-cyan-300 font-bold">Malik AI ${mode}</p><h1 class="mt-4 text-5xl font-black">${prompt.slice(0, 120)}</h1><p class="mt-4 text-zinc-400">Safe local artifact generated while live rendering is being prepared.</p></section></main></body></html>`
}

function createCanvasHtml(mode: MediaMode, prompt: string, result: MediaResult, format: MediaFormat) {
  const mediaUrl = result.videoUrl || result.url || ""
  const mediaNode =
    mode === "video" && mediaUrl
      ? `<video src="${mediaUrl}" controls autoplay muted loop class="mt-8 aspect-video w-full rounded-[2rem] border border-white/10 object-cover"></video>`
      : mediaUrl
        ? `<img src="${mediaUrl}" class="mt-8 aspect-[${format.replace(":", "/")}] w-full rounded-[2rem] border border-white/10 object-cover"/>`
        : `<pre class="mt-8 overflow-auto rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-sm">${(result.code || result.text || result.message || createFallbackArtifact(mode, prompt)).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] || char)}</pre>`

  return `<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#030303] text-white">
  <main class="min-h-screen p-6">
    <section class="mx-auto max-w-5xl">
      <p class="w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100">Malik AI ${mode}</p>
      <h1 class="mt-6 text-5xl font-black">${prompt.slice(0, 120)}</h1>
      <p class="mt-4 text-zinc-400">Engine: ${result.engine || "MALIK Backup"}</p>
      ${mediaNode}
    </section>
  </main>
</body>
</html>`
}


function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function mediaUrlFromResult(data: MediaResult) {
  return data.videoUrl || data.url || ""
}

async function pollVideoUntilReady(
  initial: MediaResult,
  setStatusText: (value: string) => void,
): Promise<MediaResult> {
  const statusUrl =
    initial.statusUrl ||
    (initial.jobId ? `/api/ai/video/status?jobId=${encodeURIComponent(initial.jobId)}` : "")

  if (mediaUrlFromResult(initial)) return initial

  if (!statusUrl) {
    return {
      ...initial,
      ok: false,
      status: "failed",
      message: initial.message || "Veo started, but backend did not return jobId/statusUrl.",
    }
  }

  for (let attempt = 1; attempt <= 45; attempt += 1) {
    setStatusText(`Google Veo rendering... ${attempt}/45`)
    await sleep(attempt === 1 ? 1500 : 4000)

    const response = await fetch(statusUrl, {
      method: "GET",
      cache: "no-store",
    })

    const payload: MediaResult = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.message || payload.publicError || `Video status returned ${response.status}`)
    }

    const merged: MediaResult = {
      ...initial,
      ...payload,
      url: payload.url || payload.videoUrl || initial.url,
      videoUrl: payload.videoUrl || payload.url || initial.videoUrl,
      message: payload.message || initial.message,
      status: payload.status || initial.status,
    }

    if (mediaUrlFromResult(merged)) {
      return {
        ...merged,
        ok: true,
        status: "ready",
        message: "Google Veo video ready.",
      }
    }

    if (payload.status === "failed" || payload.ok === false) {
      return {
        ...merged,
        ok: false,
        status: "failed",
        message: payload.message || payload.publicError || "Google Veo failed.",
      }
    }
  }

  return {
    ...initial,
    ok: false,
    status: "failed",
    message: "Google Veo polling finished, but no video URL was returned.",
  }
}

const titanMediaModes = [
  ["text", "Reasoning copy", "Pitch copy, plans, scripts and product text"],
  ["code", "Code forge", "Components, APIs, UI states and project files"],
  ["photo", "Vision render", "Images, covers, mockups and social assets"],
  ["video", "Cinema lane", "Storyboards, launch videos and motion scenes"],
  ["audio", "Voice layer", "Narration, voice notes and sonic identity"],
  ["presentation", "Deck engine", "Investor slides and demo narrative"],
] as const

const titanMediaGuardrails = [
  ["No blank result", "Safe artifact appears even if provider fails"],
  ["Canvas-first", "Every result can become a preview artifact"],
  ["Mode memory", "The UI explains which creative lane is active"],
  ["Pitch polish", "Outputs are framed for demo, not only download"],
] as const

const titanMediaPresets = [
  "Сделай Digital Bridge demo launch package: текст, сайт, фото и pitch story",
  "Сгенерируй investor-grade visual concept для MALIK AI 6.5 TITAN",
  "Создай production-ready кодовый компонент с empty/loading/error states",
  "Сделай cinematic product video storyboard в стиле Apple event",
] as const

function TitanMediaCss() {
  return (
    <style>{`
      .ai-generator-clone {
        position: relative;
        isolation: isolate;
        background:
          radial-gradient(circle at 18% 0%, rgba(228, 187, 94,.16), transparent 32%),
          radial-gradient(circle at 88% 18%, rgba(217, 174, 69,.14), transparent 38%),
          linear-gradient(135deg, #02030a, #050816 58%, #04020a) !important;
      }
      .ai-generator-clone::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(228, 187, 94,.055) 1px, transparent 1px),
          linear-gradient(0deg, rgba(217, 174, 69,.05) 1px, transparent 1px),
          radial-gradient(circle at 50% 10%, rgba(255,255,255,.07), transparent 25%);
        background-size: 72px 72px, 72px 72px, 100% 100%;
        mask-image: radial-gradient(ellipse 80% 70% at 50% 24%, #000 0 55%, transparent 100%);
        animation: titanMediaGrid 16s linear infinite;
      }
      .ai-generator-clone .studio-inner {
        position: relative;
        z-index: 1;
      }
      .titan-media-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.18fr) minmax(320px, .82fr);
        gap: 18px;
        margin: 18px 0;
      }
      .titan-media-card,
      .titan-media-router,
      .titan-media-proof {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(240, 210, 136,.15);
        border-radius: 34px;
        background:
          radial-gradient(circle at 14% 0%, rgba(228, 187, 94,.14), transparent 34%),
          radial-gradient(circle at 100% 100%, rgba(217, 174, 69,.12), transparent 34%),
          rgba(2,8,23,.68);
        box-shadow: 0 26px 105px rgba(0,0,0,.37), inset 0 1px 0 rgba(255,255,255,.055);
        backdrop-filter: blur(26px);
      }
      .titan-media-card { padding: 26px; }
      .titan-media-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(240, 210, 136,.18);
        border-radius: 999px;
        padding: 8px 12px;
        color: rgba(248, 229, 172,.92);
        background: rgba(228, 187, 94,.08);
        font-size: 10px;
        font-weight: 1000;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .titan-media-title {
        margin: 18px 0 0;
        color: white;
        font-size: clamp(34px, 5vw, 76px);
        line-height: .86;
        letter-spacing: -.08em;
        font-weight: 1000;
      }
      .titan-media-title span {
        display: block;
        background: linear-gradient(90deg, #f0d288, #fff, #f3de96);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .titan-media-description {
        max-width: 760px;
        margin-top: 16px;
        color: rgba(203,213,225,.78);
        font-size: 14px;
        line-height: 1.75;
      }
      .titan-media-preset-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 20px;
      }
      .titan-media-preset-grid button,
      .titan-media-router button,
      .titan-media-proof div {
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 18px;
        background: rgba(255,255,255,.04);
        color: rgba(241,245,249,.92);
        padding: 13px;
        text-align: left;
      }
      .titan-media-preset-grid button:hover,
      .titan-media-router button:hover {
        transform: translateY(-2px);
        border-color: rgba(240, 210, 136,.32);
        background: rgba(240, 210, 136,.08);
      }
      .titan-media-router { padding: 18px; }
      .titan-media-router h3,
      .titan-media-proof h3 {
        margin: 0 0 14px;
        color: white;
        font-size: 16px;
        font-weight: 1000;
      }
      .titan-media-router button {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 10px;
        width: 100%;
        margin-top: 8px;
        transition: .18s ease;
      }
      .titan-media-router button.is-active {
        border-color: rgba(240, 210, 136,.4);
        background: rgba(228, 187, 94,.12);
        box-shadow: 0 18px 55px rgba(228, 187, 94,.12);
      }
      .titan-media-router b {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 11px;
        color: #020617;
        background: linear-gradient(135deg, #f0d288, #fff, #faefc8);
        font-size: 11px;
      }
      .titan-media-router strong,
      .titan-media-proof strong { color: #fff; font-weight: 1000; }
      .titan-media-router span,
      .titan-media-proof span { color: rgba(148,163,184,.88); font-size: 11px; }
      .titan-media-router em,
      .titan-media-proof em { grid-column: 2; color: rgba(203,213,225,.68); font-size: 11px; font-style: normal; }
      .titan-media-proof {
        grid-column: 1 / -1;
        padding: 18px;
      }
      .titan-media-proof-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .ai-generator-clone .studio-card,
      .ai-generator-clone .studio-metric-card,
      .ai-generator-clone .studio-page-head {
        border-color: rgba(240, 210, 136,.14) !important;
        background:
          radial-gradient(circle at 8% 0%, rgba(228, 187, 94,.09), transparent 30%),
          radial-gradient(circle at 100% 100%, rgba(217, 174, 69,.08), transparent 34%),
          rgba(2,8,23,.70) !important;
        box-shadow: 0 22px 95px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.045) !important;
        backdrop-filter: blur(22px);
      }
      .ai-generator-clone .studio-primary-action {
        color: #020617 !important;
        background: linear-gradient(135deg, #fff, #f8e5ac 44%, #faefc8) !important;
        box-shadow: 0 18px 70px rgba(240, 210, 136,.22), inset 0 1px 0 rgba(255,255,255,.9) !important;
      }
      @keyframes titanMediaGrid { from { transform: translateX(-1%); } to { transform: translateX(1%); } }
      @media (max-width: 1100px) {
        .titan-media-hero { grid-template-columns: 1fr; }
        .titan-media-proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .titan-media-preset-grid,
        .titan-media-proof-grid { grid-template-columns: 1fr; }
        .titan-media-title { font-size: 38px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ai-generator-clone::before { animation: none !important; }
      }
    `}</style>
  )
}

function TitanMediaCommandDeck({
  mode,
  prompt,
  status,
  format,
  duration,
  style,
  loading,
  toggles,
  onGenerate,
  onPreset,
}: {
  mode: MediaMode
  prompt: string
  status: string
  format: MediaFormat
  duration: number
  style: string
  loading: boolean
  toggles: Record<string, boolean>
  onGenerate: () => void
  onPreset: (value: string) => void
}) {
  return (
    <section className="titan-media-hero" aria-label="MALIK AI Titan media command deck">
      <article className="titan-media-card">
        <span className="titan-media-eyebrow"><Sparkles className="h-4 w-4" /> MULTIMODAL SOVEREIGN FACTORY</span>
        <h2 className="titan-media-title">One prompt.<span>Six creation engines.</span></h2>
        <p className="titan-media-description">
          Здесь Malik AI должен ощущаться как завод контента: текст, код, фото, видео, аудио и презентации идут через один контрольный слой,
          с fallback-защитой, Canvas-доказательством и pitch-ready подачей.
        </p>
        <div className="titan-media-preset-grid">
          {titanMediaPresets.map((item) => (
            <button key={item} type="button" onClick={() => onPreset(item)}>{item}</button>
          ))}
        </div>
        <div className="titan-media-preset-grid">
          <button type="button" onClick={onGenerate}>{loading ? "Generation in progress..." : "Launch Titan generation"}</button>
          <button type="button" onClick={() => onPreset(`${prompt}\n\nСделай результат в формате ${format}, style: ${style}, duration: ${duration}s.`)}>Inject production settings</button>
        </div>
      </article>

      <aside className="titan-media-router">
        <h3>Active route</h3>
        {titanMediaModes.map(([id, title, detail], index) => (
          <button key={id} type="button" className={mode === id ? "is-active" : ""} onClick={() => onPreset(`${title}: ${detail}`)}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <strong>{title}</strong>
            <em>{detail}</em>
          </button>
        ))}
      </aside>

      <article className="titan-media-proof">
        <h3>Demo integrity</h3>
        <div className="titan-media-proof-grid">
          <div><strong>{status}</strong><span>Status</span><em>Public-safe message</em></div>
          <div><strong>{format}</strong><span>Format</span><em>Output ratio</em></div>
          <div><strong>{duration}s</strong><span>Duration</span><em>Motion budget</em></div>
          <div><strong>{Object.values(toggles).filter(Boolean).length}/4</strong><span>Context</span><em>Web/knowledge/code/memory</em></div>
          {titanMediaGuardrails.map(([title, detail]) => <div key={title}><strong>{title}</strong><span>Locked</span><em>{detail}</em></div>)}
        </div>
      </article>
    </section>
  )
}

export function MediaGenerator({ userEmail, onSendToCanvas }: MediaGeneratorProps) {
  const [mode, setMode] = useState<MediaMode>("text")
  const [prompt, setPrompt] = useState("Опишите, что вы хотите создать...")
  const [style, setStyle] = useState(styles[0])
  const [format, setFormat] = useState<MediaFormat>("16:9")
  const [duration, setDuration] = useState(8)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MediaResult | null>(null)
  const [status, setStatus] = useState("Ready")
  const [copied, setCopied] = useState(false)
  const [toggles, setToggles] = useState({ web: true, knowledge: true, codeSearch: true, memory: true })

  const endpoint = endpointForMode(mode)
  const isProviderMode = mode === "photo" || mode === "video"
  const blocked = isProviderMode && getFreeUsed()
  const canvasHtml = useMemo(() => createCanvasHtml(mode, prompt, result || {}, format), [format, mode, prompt, result])

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setStatus("Prompt is required")
      return
    }
    if (blocked) {
      setStatus("Free generation used. Upgrade your plan to continue.")
      setResult({ ok: false, publicError: "pro_required", message: "One free generation is already used. Upgrade your plan to continue." })
      return
    }

    setLoading(true)
    setStatus("Generating...")
    setResult(null)
    try {
      const response = await clientFetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          style,
          format,
          duration,
          userEmail,
          mode,
          options: toggles,
        }),
      }, mode === "video" ? 190_000 : 95_000)

      let data: MediaResult = {}
      if (endpoint === "/api/stream") {
        data = { ok: response.ok, text: response.ok ? "AI text stream endpoint connected. Use chat for full streaming response." : "Text endpoint fallback ready." }
      } else {
        data = await response.json()
      }

      if (!response.ok) throw new Error(data.message || `Backend returned ${response.status}`)
      const fallback = createFallbackArtifact(mode, cleanPrompt)
      const next = { ...data, code: data.code || fallback, text: data.text || data.message || fallback }
      setResult(next)
      if (isProviderMode && data.ok && data.status !== "queued" && data.status !== "rendering") setFreeUsed()
      setStatus(data.ok === false ? data.message || "Safe fallback generated" : `Generated by ${data.engine || "MALIK runtime"}`)
    } catch (error) {
      const fallback = createFallbackArtifact(mode, cleanPrompt)
      setResult({ ok: false, publicError: "request_failed", message: "Request could not be completed. Safe fallback generated.", code: fallback, text: fallback })
      setStatus("Backend unavailable, local fallback generated")
    } finally {
      setLoading(false)
    }
  }

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const handleShortcut = (label: string) => {
    if (label.includes("Deploy")) {
      setStatus("Deploy handoff ready. Open Canvas to publish the generated artifact.")
      return
    }
    if (label.includes("API")) {
      setStatus("API router ready. Check API status in the dashboard topbar.")
      return
    }
    if (label.includes("Codex")) {
      setStatus("Malik Codex is available from the dashboard topbar.")
      return
    }
    setStatus(`${label} ready`)
  }

  return (
    <main className="studio-shell ai-generator-clone">
      <TitanMediaCss />
      <div className="studio-bg-grid" />
      <div className="studio-topbar" aria-label="AI generator shortcuts">
        {topbarItems.map(([icon, label]) => <button key={label} type="button" onClick={() => handleShortcut(label)}><span>{icon}</span>{label}</button>)}
      </div>
      <div className="studio-topbar-status" aria-hidden="true"><span>♢</span><span>♛ 4,460</span><span>M</span></div>

      <section className="studio-inner ai-generator-layout">
        <header className="studio-page-head">
          <div>
            <h1>AI Генератор</h1>
            <p>Единый генератор для текста, кода, изображений, видео и презентаций.</p>
          </div>
          <button type="button" onClick={() => setStatus("Studio settings are ready below.")}><Settings className="h-4 w-4" /> Настроить студию</button>
        </header>

        <TitanMediaCommandDeck mode={mode} prompt={prompt} status={status} format={format} duration={duration} style={style} loading={loading} toggles={toggles} onGenerate={generate} onPreset={(value) => setPrompt(value)} />

        <section className="studio-metrics">
          {[
            ["Запросы", "1,248", "+18% с прошлой недели", Sparkles],
            ["Успешно", "98.7%", "+2.6% с прошлой недели", Check],
            ["Среднее время", "8.4 сек", "+1.3 сек с прошлой недели", Clock3],
            ["Активные очереди", "7", "Низкая нагрузка", Wand2],
          ].map(([label, value, note, Icon]) => (
            <article key={label as string} className="studio-metric-card">
              <div><p>{label as string}</p><strong>{value as string}</strong><span>{note as string}</span></div>
              <Icon className="h-6 w-6" />
            </article>
          ))}
        </section>

        <section className="ai-generator-main">
          <article className="studio-card ai-generator-form">
            <div className="generator-tabs">
              {modeTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button key={tab.id} type="button" className={mode === tab.id ? "is-active" : ""} onClick={() => setMode(tab.id)}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <label className="studio-field">
              <span>Ваш запрос</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Опишите, что вы хотите создать..." />
            </label>

            <div className="ai-small-actions">
              <button type="button" onClick={() => setStatus("Attach files from the main chat composer.")}>Прикрепить файл</button>
              <button type="button" onClick={() => setPrompt(`${prompt} Сделай результат премиальным, структурным и production-ready.`)}>Улучшить промпт</button>
              <span>{prompt.length} / 8000</span>
            </div>

            <div className="ai-config-grid">
              <label><span>Модель</span><select value={mode === "video" ? "Malik Video 2.0" : "Malik 4.1 Ultra"} onChange={() => undefined}><option>Malik 4.1 Ultra</option><option>Malik Vision XL v2</option><option>Malik Video 2.0</option></select></label>
              <label><span>Режим</span><select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Длина</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{durations.map((item) => <option key={item} value={item}>{item}s / auto</option>)}</select></label>
            </div>

            <div className="ai-toggle-row">
              {Object.entries(toggles).map(([key, value]) => (
                <button key={key} type="button" className={value ? "is-on" : ""} onClick={() => setToggles((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}>
                  {key === "web" ? "Веб-поиск" : key === "knowledge" ? "Знания" : key === "codeSearch" ? "Поиск кода" : "Память"}
                </button>
              ))}
            </div>

            <div className="studio-status">{status}</div>
            <button type="button" onClick={generate} disabled={loading} className="studio-primary-action">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              Сгенерировать
            </button>
          </article>

          <article className="studio-card ai-preview-card">
            <div className="studio-card-head">
              <h2>Предпросмотр (Live)</h2>
              <button type="button" onClick={() => setResult(null)}>Очистить</button>
            </div>
            <div className="ai-preview-frame">
              {(result?.url || result?.videoUrl) ? (
                mode === "video" ? <video src={result.videoUrl || result.url} controls /> : <img src={result.url} alt={prompt} />
              ) : (
                <div className="ai-preview-art">
                  <span />
                  <strong>{loading ? "Генерирую..." : "Malik AI preview"}</strong>
                  <p>{result?.message || "Футуристический пейзаж, высокая детализация, cinematic lighting."}</p>
                </div>
              )}
            </div>
            <p className="ai-preview-prompt">{prompt}</p>
            <div className="ai-preview-actions">
              <button type="button" onClick={copyPrompt}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Скопировать</button>
              <button type="button" onClick={() => setPrompt(`${prompt} Улучши композицию и добавь больше деталей.`)}>Улучшить</button>
              <button type="button" onClick={() => onSendToCanvas?.(canvasHtml)}><Send className="h-4 w-4" /> Использовать</button>
            </div>
          </article>
        </section>

        <section className="ai-bottom-grid">
          <article className="studio-card quick-scenarios">
            <h2>Быстрые сценарии</h2>
            <div>
              {quickScenarios.map(([title, text]) => (
                <button key={title} type="button" onClick={() => setPrompt(title)}>
                  <Sparkles className="h-5 w-5" />
                  <strong>{title}</strong>
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </article>
          <article className="studio-card ai-history">
            <div className="studio-card-head"><h2>История генераций</h2><button type="button" onClick={() => setStatus("Showing all generation types")}>Все типы⌄</button></div>
            {historyRows.map(([title, type, model, time, state]) => (
              <button key={title} type="button" onClick={() => setPrompt(title)}>
                <span>{type}</span>
                <strong>{title}</strong>
                <em>{model}</em>
                <small>{time}</small>
                <b>{state}</b>
              </button>
            ))}
          </article>
        </section>
      </section>
    </main>
  )
}

export default MediaGenerator



