"use client"

import { useMemo, useState } from "react"
import {
  Bot,
  Check,
  Clock3,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  Folder,
  GitBranch,
  Globe2,
  Grid3X3,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  Monitor,
  Play,
  Rocket,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react"
import { canUseGeneration, incrementUsage, type GenerationLimitType } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"

interface GeneratorPanelProps {
  kind: string
  title: string
  description: string
  endpoint: string
  defaultPrompt: string
  onSendToCanvas?: (code: string) => void
  userEmail?: string
}

type PanelMode = "video" | "website" | "code"

const topbarItems = [
  ["◎", "Malik AI Jenkins"],
  ["✺", "High-Speed queue"],
  ["⌘", "Malik Ask"],
  ["⌕", "Craft & Search"],
  ["↯", "API 2.0"],
  ["✧", "Queue: all new"],
  ["⟡", "Deploy"],
  [">_", "Malik Codex"],
  ["✣", "Creator Mode: ON"],
] as const

const apiProviderSlots = [
  ["auto", "Auto Brain", "Smart router", "Chooses the best connected MALIK engine"],
  ["core", "MALIK Core", "Chat + image", "Core creative lane"],
  ["infrastructure", "Sovereign Cloud", "Scale lane", "Enterprise runtime lane"],
  ["cinema", "MALIK Cinema", "Video motion", "Cinematic video lane"],
  ["queue", "Render Queue", "Async render", "Fast render queue"],
] as const

type ApiProviderId = typeof apiProviderSlots[number][0]

const codeLanguagePacks = [
  "Auto 300+",
  "TypeScript",
  "Python",
  "Rust",
  "Go",
  "Java",
  "C++",
  "C#",
  "Swift",
  "Kotlin",
  "PHP",
  "Ruby",
  "SQL",
  "Solidity",
  "Dart",
]

const globalTemplates = [
  ["SaaS Analytics", "SaaS", "AI-платформа аналитики данных с pricing, dashboard и auth."],
  ["AI Startup", "SaaS", "Современный стартап лендинг с hero, waitlist и investor trust."],
  ["Creative Agency", "Agency", "Портфолио агентства с кейсами, услугами и premium motion."],
  ["Portfolio Pro", "Portfolio", "Персональный сайт для дизайнера, разработчика или founder."],
  ["E-commerce Store", "E-commerce", "Магазин с каталогом, корзиной и conversion sections."],
  ["App Landing", "SaaS", "Landing для mobile/web приложения с screenshots и FAQ."],
  ["AI Course", "Education", "Образовательная платформа с lessons, progress и payments."],
  ["Real Estate Luxe", "Real Estate", "Люксовый сайт недвижимости с объектами и заявками."],
  ["Fintech Dashboard", "Finance", "Финансовый SaaS с charts, compliance и onboarding."],
  ["Medical Clinic", "Healthcare", "Сайт клиники с услугами, врачами и записью."],
  ["Restaurant Brand", "Food", "Премиальный ресторан с меню, бронью и stories."],
  ["Crypto Launch", "Web3", "Web3 лендинг с token utility, roadmap и docs."],
]

const videoScenes = [
  ["Вход в орбиту", "Корабль входит в верхние слои атмосферы планеты.", "00:06"],
  ["Посадка", "Корабль садится на поверхность чужой планеты.", "00:07"],
  ["Исследование", "Астронавт исследует заброшенную структуру.", "00:06"],
  ["Открытие", "Герой находит источник энергии.", "00:05"],
  ["Возвращение", "Корабль взлетает, финальный кадр.", "00:06"],
]

const sampleCode = `"use client"

import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts"

export default function SovereignDashboard() {
  const data = useMemo(() => [
    { day: "Mon", value: 24 },
    { day: "Tue", value: 42 },
    { day: "Wed", value: 36 },
    { day: "Thu", value: 61 },
  ], [])

  return (
    <main className="space-y-6">
      <h1>Sovereign Dashboard</h1>
      <LineChart width={680} height={260} data={data}>
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip />
        <Line dataKey="value" stroke="#8b5cf6" />
      </LineChart>
    </main>
  )
}`

function resolvePanelMode(kind: string): PanelMode {
  const normalized = `${kind}`.toLowerCase()
  if (normalized.includes("video")) return "video"
  if (["website", "landing", "dashboard", "template", "document", "presentation"].some((item) => normalized.includes(item))) return "website"
  return "code"
}

function resolveGeneratorKind(kind: string): GenerationLimitType {
  const mode = resolvePanelMode(kind)
  if (mode === "video") return "video"
  if (mode === "website") return "website"
  return "code"
}

function escapeHtml(value: string) {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] || char)
}

function fallbackArtifact(mode: PanelMode, prompt: string, language = "TypeScript") {
  if (mode === "code") return sampleCode.replace("SovereignDashboard", "GeneratedByMalikAI")
  if (mode === "video") {
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#02050d] text-white"><main class="min-h-screen p-8"><section class="mx-auto max-w-5xl"><h1 class="text-5xl font-black">Video storyboard</h1><p class="mt-4 text-zinc-400">${escapeHtml(prompt)}</p><div class="mt-8 grid gap-4">${videoScenes.map(([title, text, time]) => `<article class="rounded-3xl border border-violet-400/20 bg-white/5 p-5"><b>${time}</b><h2 class="mt-2 text-2xl font-black">${title}</h2><p class="text-zinc-400">${text}</p></article>`).join("")}</div></section></main></body></html>`
  }
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#030712] text-white"><main class="min-h-screen"><section class="px-8 py-20"><p class="text-cyan-300 font-bold">${language}</p><h1 class="mt-4 max-w-4xl text-6xl font-black">${escapeHtml(prompt)}</h1><p class="mt-5 max-w-2xl text-slate-400">Generated premium website starter by Malik AI.</p><button class="mt-8 rounded-2xl bg-indigo-500 px-6 py-4 font-bold">Начать бесплатно</button></section></main></body></html>`
}


const titanStudioMissions = [
  ["01", "Brief", "Понять идею, аудиторию и бизнес-цель", "Founder-grade input"],
  ["02", "Route", "Выбрать код, сайт, видео или production artifact", "Auto engine"],
  ["03", "Forge", "Собрать результат через fallback-safe pipeline", "No dead demo"],
  ["04", "Ship", "Отправить в Canvas, сохранить и показать на pitch", "Demo-ready"],
] as const

const titanHardeningStack = [
  ["Runtime guard", "Timeouts + local artifact fallback"],
  ["Canvas bridge", "Every output can become visible proof"],
  ["Investor surface", "Screens explain value, not only buttons"],
  ["German-tank UX", "Heavy, stable, aggressive layout rhythm"],
] as const

const titanPromptBoosters = [
  "Сделай интерфейс как premium AI SaaS для investor demo",
  "Добавь enterprise-ready states: loading, empty, error, success",
  "Собери результат под Digital Bridge pitch stage",
  "Сделай production-ready архитектуру с чистыми компонентами",
] as const

function TitanStudioCss() {
  return (
    <style>{`
      .studio-shell {
        position: relative;
        isolation: isolate;
        min-height: 100%;
        overflow: hidden;
        background:
          radial-gradient(circle at 16% 8%, rgba(34,211,238,.16), transparent 30%),
          radial-gradient(circle at 88% 18%, rgba(168,85,247,.16), transparent 34%),
          linear-gradient(135deg, #02040a 0%, #060816 48%, #03030a 100%) !important;
      }
      .studio-shell::before {
        content: "";
        position: absolute;
        inset: -2px;
        z-index: -2;
        opacity: .74;
        background:
          linear-gradient(90deg, rgba(34,211,238,.07) 1px, transparent 1px),
          linear-gradient(0deg, rgba(168,85,247,.055) 1px, transparent 1px),
          radial-gradient(circle at 50% 0%, rgba(255,255,255,.08), transparent 24%);
        background-size: 62px 62px, 62px 62px, 100% 100%;
        mask-image: radial-gradient(ellipse 82% 74% at 50% 24%, #000 0 52%, transparent 100%);
        animation: titanStudioGridMove 18s linear infinite;
      }
      .studio-shell::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          linear-gradient(110deg, transparent 0 26%, rgba(125,211,252,.09) 38%, transparent 48% 100%),
          linear-gradient(250deg, transparent 0 32%, rgba(217,70,239,.08) 48%, transparent 58% 100%);
        mix-blend-mode: screen;
        opacity: .7;
        animation: titanStudioSweep 8s ease-in-out infinite alternate;
      }
      .studio-bg-grid { opacity: .55 !important; }
      .studio-motion-orbit span {
        filter: drop-shadow(0 0 18px rgba(125,211,252,.42));
      }
      .studio-topbar {
        border-bottom: 1px solid rgba(125,211,252,.13) !important;
        background: rgba(1,4,12,.72) !important;
        backdrop-filter: blur(24px) saturate(1.2);
        box-shadow: 0 16px 80px rgba(0,0,0,.35), inset 0 -1px 0 rgba(255,255,255,.035);
      }
      .studio-topbar button {
        border: 1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 0% 0%, rgba(34,211,238,.10), transparent 36%),
          rgba(255,255,255,.035);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      }
      .studio-inner {
        position: relative;
        z-index: 1;
      }
      .studio-page-head {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(125,211,252,.13);
        border-radius: 34px;
        padding: 26px !important;
        background:
          radial-gradient(circle at 15% 0%, rgba(34,211,238,.17), transparent 28%),
          radial-gradient(circle at 88% 12%, rgba(168,85,247,.15), transparent 34%),
          rgba(2,8,23,.62) !important;
        box-shadow: 0 28px 110px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.055);
        backdrop-filter: blur(26px);
      }
      .studio-page-head h1 {
        letter-spacing: -.065em;
        text-shadow: 0 0 42px rgba(125,211,252,.13);
      }
      .studio-api-rail,
      .studio-card,
      .studio-metric-card {
        border-color: rgba(125,211,252,.14) !important;
        background:
          radial-gradient(circle at 8% 0%, rgba(34,211,238,.09), transparent 30%),
          radial-gradient(circle at 100% 100%, rgba(168,85,247,.08), transparent 34%),
          rgba(2,8,23,.68) !important;
        box-shadow: 0 22px 90px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.045) !important;
        backdrop-filter: blur(22px);
      }
      .studio-card-head h2,
      .studio-card h2 {
        letter-spacing: -.035em;
      }
      .studio-primary-action,
      .video-prompt-bar button:last-child,
      .website-config button,
      .code-action-row button:first-child {
        color: #020617 !important;
        background: linear-gradient(135deg, #ffffff, #bae6fd 42%, #ddd6fe) !important;
        border: 0 !important;
        box-shadow: 0 18px 70px rgba(125,211,252,.20), inset 0 1px 0 rgba(255,255,255,.8) !important;
      }
      .titan-studio-deck {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(280px, .92fr);
        gap: 18px;
        margin: 18px 0;
      }
      .titan-studio-main-card,
      .titan-studio-side-card,
      .titan-studio-mission-card {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(125,211,252,.15);
        border-radius: 30px;
        background:
          radial-gradient(circle at 18% 0%, rgba(34,211,238,.14), transparent 28%),
          radial-gradient(circle at 88% 100%, rgba(168,85,247,.12), transparent 30%),
          rgba(2,8,23,.64);
        box-shadow: 0 26px 100px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05);
        backdrop-filter: blur(24px);
      }
      .titan-studio-main-card { padding: 24px; }
      .titan-studio-main-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent, rgba(255,255,255,.08), transparent);
        transform: translateX(-120%);
        animation: titanCardSheen 6s ease-in-out infinite;
      }
      .titan-studio-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(125,211,252,.18);
        border-radius: 999px;
        padding: 8px 12px;
        color: rgba(186,230,253,.9);
        background: rgba(14,165,233,.08);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .titan-studio-title {
        margin-top: 18px;
        max-width: 860px;
        color: #fff;
        font-size: clamp(30px, 4.5vw, 68px);
        line-height: .88;
        letter-spacing: -.075em;
        font-weight: 1000;
      }
      .titan-studio-title span {
        display: block;
        background: linear-gradient(90deg, #67e8f9, #fff, #f0abfc);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .titan-studio-subtitle {
        margin-top: 16px;
        max-width: 760px;
        color: rgba(203,213,225,.78);
        font-size: 14px;
        line-height: 1.75;
      }
      .titan-studio-command-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 20px;
      }
      .titan-studio-command-row button,
      .titan-studio-boosters button {
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 16px;
        padding: 11px 14px;
        color: rgba(241,245,249,.92);
        background: rgba(255,255,255,.045);
        font-weight: 900;
        transition: transform .18s ease, border-color .18s ease, background .18s ease;
      }
      .titan-studio-command-row button:hover,
      .titan-studio-boosters button:hover {
        transform: translateY(-2px);
        border-color: rgba(125,211,252,.35);
        background: rgba(125,211,252,.09);
      }
      .titan-studio-side-card { padding: 18px; }
      .titan-studio-side-card h3,
      .titan-studio-mission-card h3 {
        margin: 0 0 14px;
        color: #fff;
        font-size: 16px;
        font-weight: 1000;
      }
      .titan-studio-health-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .titan-studio-health-grid div,
      .titan-studio-stack-row,
      .titan-studio-mission-step {
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 18px;
        background: rgba(255,255,255,.035);
        padding: 12px;
      }
      .titan-studio-health-grid span,
      .titan-studio-stack-row span,
      .titan-studio-mission-step span {
        display: block;
        color: rgba(148,163,184,.9);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .titan-studio-health-grid strong,
      .titan-studio-stack-row strong,
      .titan-studio-mission-step strong {
        display: block;
        margin-top: 5px;
        color: #fff;
        font-size: 18px;
        font-weight: 1000;
      }
      .titan-studio-health-grid em,
      .titan-studio-stack-row em,
      .titan-studio-mission-step em {
        display: block;
        margin-top: 4px;
        color: rgba(203,213,225,.65);
        font-size: 11px;
        font-style: normal;
        line-height: 1.45;
      }
      .titan-studio-mission-card {
        grid-column: 1 / -1;
        padding: 18px;
      }
      .titan-studio-mission-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .titan-studio-mission-step b {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 12px;
        color: #020617;
        background: linear-gradient(135deg, #67e8f9, #fff, #ddd6fe);
        font-size: 12px;
        font-weight: 1000;
      }
      .titan-studio-boosters {
        display: grid;
        gap: 8px;
        margin-top: 16px;
      }
      @keyframes titanStudioGridMove { from { transform: translate3d(-1%,0,0); } to { transform: translate3d(1%,0,0); } }
      @keyframes titanStudioSweep { from { opacity: .42; transform: translateX(-2%); } to { opacity: .84; transform: translateX(2%); } }
      @keyframes titanCardSheen { 0%, 40% { transform: translateX(-120%); } 72%, 100% { transform: translateX(120%); } }
      @media (max-width: 1100px) {
        .titan-studio-deck { grid-template-columns: 1fr; }
        .titan-studio-mission-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .titan-studio-title { font-size: 36px; }
        .titan-studio-health-grid,
        .titan-studio-mission-grid { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .studio-shell::before,
        .studio-shell::after,
        .titan-studio-main-card::before { animation: none !important; }
      }
    `}</style>
  )
}

function TitanStudioDeck({
  panelMode,
  status,
  prompt,
  selectedProvider,
  quality,
  language,
  safeMode,
  loading,
  onGenerate,
  onCanvas,
  onSave,
  onBoost,
}: {
  panelMode: PanelMode
  status: string
  prompt: string
  selectedProvider: ApiProviderId
  quality: string
  language: string
  safeMode: boolean
  loading: boolean
  onGenerate: () => void
  onCanvas?: () => void
  onSave: () => void
  onBoost: (value: string) => void
}) {
  const modeLabel = panelMode === "video" ? "Cinema Engine" : panelMode === "website" ? "Website Factory" : "Code Forge"
  const shipLabel = panelMode === "video" ? "Render scene" : panelMode === "website" ? "Ship website" : "Build component"
  return (
    <section className="titan-studio-deck" aria-label="MALIK AI Titan generator command deck">
      <article className="titan-studio-main-card">
        <span className="titan-studio-label"><Sparkles className="h-4 w-4" /> MALIK AI 6.5 TITAN GENERATION CORE</span>
        <h2 className="titan-studio-title">{modeLabel}<span>German-tank stable production flow</span></h2>
        <p className="titan-studio-subtitle">
          Эта панель не должна выглядеть как обычный генератор. Она должна вести себя как тяжелый production-комбайн:
          принимает идею, держит fallback, показывает бизнес-смысл и сразу отправляет результат в Canvas.
        </p>
        <div className="titan-studio-command-row">
          <button type="button" onClick={onGenerate} disabled={loading}>{loading ? "Forging..." : shipLabel}</button>
          <button type="button" onClick={onCanvas}>Open Canvas proof</button>
          <button type="button" onClick={onSave}>Save mission</button>
        </div>
        <div className="titan-studio-boosters">
          {titanPromptBoosters.map((item) => (
            <button key={item} type="button" onClick={() => onBoost(item)}>+ {item}</button>
          ))}
        </div>
      </article>

      <aside className="titan-studio-side-card">
        <h3>Runtime telemetry</h3>
        <div className="titan-studio-health-grid">
          <div><span>Mode</span><strong>{modeLabel}</strong><em>Active studio route</em></div>
          <div><span>Status</span><strong>{status}</strong><em>Public-safe state</em></div>
          <div><span>Provider</span><strong>{selectedProvider}</strong><em>Router slot</em></div>
          <div><span>Quality</span><strong>{panelMode === "code" ? language : quality}</strong><em>{safeMode ? "Safe mode on" : "Raw mode"}</em></div>
        </div>
        <div className="titan-studio-boosters">
          {titanHardeningStack.map(([title, detail]) => (
            <div key={title} className="titan-studio-stack-row"><span>{title}</span><strong>Locked</strong><em>{detail}</em></div>
          ))}
        </div>
      </aside>

      <article className="titan-studio-mission-card">
        <h3>Artifact pipeline</h3>
        <div className="titan-studio-mission-grid">
          {titanStudioMissions.map(([number, title, detail, note]) => (
            <div key={number} className="titan-studio-mission-step">
              <b>{number}</b>
              <strong>{title}</strong>
              <em>{detail}</em>
              <span>{note}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

export function GeneratorPanel({ kind, title, description, endpoint, defaultPrompt, onSendToCanvas, userEmail }: GeneratorPanelProps) {
  const panelMode = resolvePanelMode(kind)
  const limitType = resolveGeneratorKind(kind)
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Ready")
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [language, setLanguage] = useState("Auto 300+")
  const [activeTemplate, setActiveTemplate] = useState(globalTemplates[0][0])
  const [quality, setQuality] = useState("4K Ultra")
  const [safeMode, setSafeMode] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<ApiProviderId>("auto")
  const [selectedVideoStyle, setSelectedVideoStyle] = useState("Кинематограф")
  const [selectedVideoRatio, setSelectedVideoRatio] = useState("16:9")
  const [selectedScene, setSelectedScene] = useState(0)
  const [scenes, setScenes] = useState(() => videoScenes.map((scene) => [...scene]))
  const [activeVideoTool, setActiveVideoTool] = useState("Эффекты")
  const [renderToggles, setRenderToggles] = useState(["Стабилизация", "Улучшение изображения", "Цветокоррекция", "Плавные переходы"])
  const [selectedWebsiteCategory, setSelectedWebsiteCategory] = useState("Все категории")
  const [selectedSettingsTab, setSelectedSettingsTab] = useState("Дизайн")
  const [enabledSections, setEnabledSections] = useState(["Hero", "Features", "Benefits", "Pricing", "Testimonials", "FAQ"])
  const [activeFile, setActiveFile] = useState("components")
  const [activeEditorTab, setActiveEditorTab] = useState("Dashboard.tsx")
  const [activeTerminalTab, setActiveTerminalTab] = useState("Терминал")

  const viewTitle = panelMode === "video" ? "Video Generation" : panelMode === "website" ? "Website Builder" : "Code Generator"
  const viewSubtitle =
    panelMode === "video"
      ? "Видео из сценариев: сцены, монтаж и рендер."
      : panelMode === "website"
        ? "Сайты без кода: генерация лендингов, секций и готовых страниц."
        : "Код из описания: генерация, редактирование и live preview."

  const safeCode = code || fallbackArtifact(panelMode, prompt, language)

  const generate = async () => {
    if (!prompt.trim()) {
      setError("Prompt is required")
      return
    }
    if (!canUseGeneration(limitType, userEmail)) {
      setBlocked(true)
      setStatus("Free generation limit reached")
      return
    }
    incrementUsage(limitType)
    setBlocked(false)
    setLoading(true)
    setError(null)
    setStatus("Generating...")
    try {
      const response = await clientFetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          kind,
          language,
          quality,
          safeMode,
          provider: "auto",
          context: "max",
          supportedLanguages: "300+",
          template: activeTemplate,
        }),
      }, panelMode === "video" ? 190_000 : 95_000)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.publicError || data.message || `Runtime returned ${response.status}`)
      const nextCode = data.code || data.files?.[0]?.content || fallbackArtifact(panelMode, prompt, language)
      setCode(nextCode)
      setStatus(data.fallback ? "Safe fallback artifact generated" : "Generated")
    } catch (err) {
      setCode(fallbackArtifact(panelMode, prompt, language))
      setError("Runtime request failed. Safe backup mode is active.")
      setStatus("Backend unavailable, local fallback generated")
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(safeCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const save = async () => {
    setStatus("Saving project...")
    try {
      await clientFetchWithTimeout("/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title: viewTitle, prompt, code: safeCode }),
      }, 20_000)
      setStatus("Project saved")
    } catch {
      setStatus("Save fallback completed in UI")
    }
  }

  const handleShortcut = (label: string) => {
    if (label.includes("Deploy")) {
      void save()
      return
    }
    if (label.includes("API")) {
      setStatus(`${selectedProvider.toUpperCase()} runtime lane ready`)
      return
    }
    if (label.includes("Craft")) {
      setPrompt((value) => value.trim() || defaultPrompt)
    }
    setStatus(`${label} ready`)
  }

  const importScenario = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".txt,.md,.json,text/plain,application/json"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        setPrompt(String(reader.result || defaultPrompt))
        setStatus(`${file.name} imported`)
      }
      reader.onerror = () => setStatus("Scenario import failed")
      reader.readAsText(file)
    }
    input.click()
  }

  const addScene = () => {
    setScenes((previous) => {
      const next = [...previous, [`Новая сцена ${previous.length + 1}`, "Опишите действие и движение камеры.", "00:05"]]
      setSelectedScene(next.length - 1)
      return next
    })
    setStatus("New storyboard scene added")
  }

  const topbar = (
    <>
      <div className="studio-bg-grid" />
      <div className="studio-motion-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="studio-topbar" aria-label={`${viewTitle} shortcuts`}>
        {topbarItems.map(([icon, label]) => <button key={label} type="button" onClick={() => handleShortcut(label)}><span>{icon}</span>{label}</button>)}
      </div>
      <div className="studio-topbar-status" aria-hidden="true"><span>♢</span><span>♛ 4,460</span><span>M</span></div>
    </>
  )

  const header = (
    <header className="studio-page-head">
      <div>
        <h1>{viewTitle}</h1>
        <p>{viewSubtitle}</p>
      </div>
      <button type="button" onClick={panelMode === "code" ? copy : save}>
        <Settings className="h-4 w-4" />
        {panelMode === "code" ? "Настроить Code Generator" : panelMode === "video" ? "Настроить панель" : "Опубликовать"}
      </button>
    </header>
  )

  const apiRail = (
    <section className="studio-api-rail" aria-label="MALIK engine slots">
      <div>
        <span>API ROUTER</span>
        <strong>{selectedProvider === "auto" ? "Auto fallback online" : `${selectedProvider.toUpperCase()} lane selected`}</strong>
      </div>
      {apiProviderSlots.map(([id, label, note, detail]) => (
        <button
          key={id}
          type="button"
          className={selectedProvider === id ? "is-active" : ""}
          onClick={() => {
            setSelectedProvider(id)
            setStatus(`${label} slot selected. ${detail}`)
          }}
          title={detail}
        >
          <span>{label}</span>
          <em>{note}</em>
        </button>
      ))}
    </section>
  )

  if (panelMode === "video") {
    return (
      <main className="studio-shell video-clone-shell">
        <TitanStudioCss />
        {topbar}
        <section className="studio-inner video-layout">
          {header}
          {apiRail}
          <TitanStudioDeck panelMode={panelMode} status={status} prompt={prompt} selectedProvider={selectedProvider} quality={quality} language={language} safeMode={safeMode} loading={loading} onGenerate={generate} onCanvas={() => onSendToCanvas?.(safeCode)} onSave={save} onBoost={(value) => setPrompt((current) => `${current}

${value}`)} />
          <section className="video-prompt-bar">
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Опишите сюжет, сцену или загрузите сценарий..." />
            <button type="button" onClick={importScenario}><FileText className="h-4 w-4" /> Импорт сценария</button>
            <button type="button" onClick={generate} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Создать видео</button>
          </section>
          <div className="studio-chip-row">
            {["Все стили", "Кинематограф", "Реклама", "Анимация", "Научпоп", "Арт"].map((item) => <button key={item} type="button" className={selectedVideoStyle === item ? "is-active" : ""} onClick={() => { setSelectedVideoStyle(item); setStatus(`Video style: ${item}`) }}>{item}</button>)}
            <span />
            {["16:9", "9:16", "1:1", "Ещё фильтры"].map((item) => <button key={item} type="button" className={selectedVideoRatio === item ? "is-active" : ""} onClick={() => { setSelectedVideoRatio(item); setStatus(`Video format: ${item}`) }}>{item}</button>)}
          </div>
          <section className="studio-metrics">
            {[["Рендеры", "342", "+24% с прошлой недели", Play], ["Клипы", "1,248", "+18% с прошлой недели", Grid3X3], ["Очередь", "7", "2 в обработке • 5 в очереди", Folder], ["Средняя длительность", "00:38", "+5% с прошлой недели", Clock3]].map(([label, value, note, Icon]) => <article key={label as string} className="studio-metric-card"><div><p>{label as string}</p><strong>{value as string}</strong><span>{note as string}</span></div><Icon className="h-6 w-6" /></article>)}
          </section>
          <section className="video-workbench">
            <article className="studio-card video-storyboard">
              <div className="studio-card-head"><h2>Сценарий / Сториборд</h2><button type="button" onClick={addScene}>+ Добавить сцену</button></div>
              {scenes.map(([scene, text, time], index) => (
                <button key={scene} type="button" className={index === selectedScene ? "is-active" : ""} onClick={() => { setSelectedScene(index); setStatus(`Scene selected: ${scene}`) }}>
                  <span className="scene-thumb" />
                  <b>{index + 1}</b>
                  <span><strong>{scene}</strong><em>{text}</em></span>
                  <small>{time}</small>
                </button>
              ))}
              <footer><span>Общая длительность: 00:30</span><button type="button" onClick={generate}>Сгенерировать раскадровку</button></footer>
            </article>
            <article className="studio-card video-preview">
              <div className="studio-card-head"><h2>Предпросмотр: Сцена {selectedScene + 1} — {(scenes[selectedScene] || scenes[0])?.[0]}</h2></div>
              <div className="video-frame"><Play className="h-10 w-10" /><span>00:02 / 00:06</span></div>
              <div className="video-timeline">{scenes.map((scene, index) => <button key={`${scene[0]}-${index}`} type="button" className={index === selectedScene ? "is-active" : ""} onClick={() => setSelectedScene(index)}><span>{index + 1}</span></button>)}<button type="button" onClick={addScene}>+</button></div>
              <div className="video-tools">{["Разделить", "Обрезать", "Переходы", "Эффекты", "Музыка", "Субтитры", "Настройки"].map((item) => <button key={item} type="button" className={activeVideoTool === item ? "is-active" : ""} onClick={() => { setActiveVideoTool(item); setStatus(`${item} tool ready`) }}>{item}</button>)}</div>
            </article>
            <article className="studio-card video-settings">
              <div className="studio-card-head"><h2>Настройки рендера</h2><button type="button" onClick={() => setStatus("Render templates ready")}>Шаблоны</button></div>
              {["Модель видео", "Качество", "Стиль", "Частота кадров", "Длительность"].map((item, index) => <label key={item}><span>{item}</span><select value={index === 1 ? quality : index === 2 ? selectedVideoStyle : undefined} onChange={(event) => { if (index === 1) setQuality(event.target.value); if (index === 2) setSelectedVideoStyle(event.target.value); setStatus(`${item}: ${event.target.value}`) }}><option>{index === 0 ? "Malik Video Engine 2.0" : index === 1 ? "4K Ultra" : index === 2 ? selectedVideoStyle : index === 3 ? "24 FPS (Кино)" : "00:30 (Авто)"}</option></select></label>)}
              {["Стабилизация", "Улучшение изображения", "Цветокоррекция", "Плавные переходы"].map((item) => <button key={item} type="button" className={`video-toggle ${renderToggles.includes(item) ? "is-on" : ""}`} onClick={() => setRenderToggles((prev) => prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item])}>{item}<span /></button>)}
              <button type="button" className="studio-primary-action" onClick={generate} disabled={loading}>Создать рендер</button>
            </article>
          </section>
          <section className="studio-card recent-video-row"><div className="studio-card-head"><h2>Недавние видеопроекты</h2><button type="button" onClick={() => setStatus("Recent video library opened")}>Смотреть все</button></div><div>{["Исходный сигнал", "Путешествие сквозь туманности", "Город будущего", "Эхо пустоты", "Хроники экспедиции", "Пробуждение машины"].map((item) => <button key={item} type="button" onClick={() => { setPrompt(`Продолжи видеопроект: ${item}`); setStatus(`${item} loaded`) }}><span /><strong>{item}</strong><em>Обновлено недавно</em><b>4K</b></button>)}</div></section>
        </section>
      </main>
    )
  }

  if (panelMode === "website") {
    return (
      <main className="studio-shell website-clone-shell">
        <TitanStudioCss />
        {topbar}
        <section className="studio-inner website-layout">
          {header}
          {apiRail}
          <TitanStudioDeck panelMode={panelMode} status={status} prompt={prompt} selectedProvider={selectedProvider} quality={quality} language={language} safeMode={safeMode} loading={loading} onGenerate={generate} onCanvas={() => onSendToCanvas?.(safeCode)} onSave={save} onBoost={(value) => setPrompt((current) => `${current}

${value}`)} />
          <section className="studio-metrics">
            {[["Сайты", "18", "Опубликовано", Globe2], ["Шаблоны", String(globalTemplates.length * 8), "Доступно шаблонов", Grid3X3], ["Компоненты", "312", "Готовых блоков", Sparkles], ["Публикации", "9", "За последние 7 дней", Rocket]].map(([label, value, note, Icon]) => <article key={label as string} className="studio-metric-card"><div><p>{label as string}</p><strong>{value as string}</strong><span>{note as string}</span></div><Icon className="h-6 w-6" /></article>)}
          </section>
          <section className="website-workbench">
            <aside className="studio-card template-sidebar">
              <h2>Шаблоны и категории</h2>
              <input placeholder="Поиск шаблонов..." />
              {["Все категории", "SaaS", "Portfolio", "Agency", "E-commerce", "Landing Pages", "Web Apps", "Blog & News"].map((item, index) => <button key={item} type="button" className={selectedWebsiteCategory === item ? "is-active" : ""} onClick={() => { setSelectedWebsiteCategory(item); setStatus(`Category: ${item}`) }}>{item}<span>{index === 0 ? globalTemplates.length : 12 - index}</span></button>)}
            </aside>
            <article className="studio-card website-builder-main">
              <label className="studio-field compact"><span>Опишите сайт, который хотите создать</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
              <div className="website-config"><select><option>AI режим: Smart</option></select><select><option>Язык: Русский</option></select><select><option>Страниц: 1-5</option></select><button type="button" onClick={generate} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Сгенерировать сайт</button></div>
              <div className="website-preview-window">
                <div><span /><span /><span /><em>https://dataviz-ai.com</em></div>
                <section>
                  <b>DataViz AI</b>
                  <nav>Продукт • Решения • Тарифы • Ресурсы • Компания</nav>
                  <h3>Аналитика данных<br /><span>на новом уровне</span></h3>
                  <p>AI-платформа для автоматизации аналитики и принятия решений.</p>
                  <button type="button" onClick={generate}>Начать бесплатно</button>
                </section>
              </div>
            </article>
            <aside className="studio-card website-settings">
              <h2>Настройки сайта</h2>
              <div className="settings-tabs">{["Дизайн", "Страницы", "Интеграции", "SEO"].map((item) => <button key={item} type="button" className={selectedSettingsTab === item ? "is-active" : ""} onClick={() => { setSelectedSettingsTab(item); setStatus(`${item} settings opened`) }}>{item}</button>)}</div>
              <label><span>Логотип</span><input value="DataViz AI" readOnly /></label>
              <label><span>Слоган</span><input value="AI-платформа для умной аналитики" readOnly /></label>
              <div className="palette-row">{["#7c3aed", "#2563eb", "#06b6d4", "#10b981", "#ec4899", "#312e81"].map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => setStatus(`Palette selected: ${color}`)} />)}</div>
              {["Hero", "Features", "Benefits", "Pricing", "Testimonials", "FAQ"].map((item) => <button key={item} type="button" className={`section-toggle ${enabledSections.includes(item) ? "is-on" : ""}`} onClick={() => setEnabledSections((prev) => prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item])}>{item}<span /></button>)}
              <button type="button" className="studio-primary-action" onClick={() => onSendToCanvas?.(safeCode)}>Открыть preview</button>
            </aside>
          </section>
          <section className="studio-card template-strip"><h2>Популярные мировые шаблоны</h2><div>{globalTemplates.map(([name, category, text]) => <button key={name} type="button" className={activeTemplate === name ? "is-active" : ""} onClick={() => { setActiveTemplate(name); setPrompt(text) }}><span /><strong>{name}</strong><em>{category}</em></button>)}</div></section>
        </section>
      </main>
    )
  }

  return (
    <main className="studio-shell code-clone-shell">
      {topbar}
      <section className="studio-inner code-layout">
        {header}
        {apiRail}
        <TitanStudioDeck panelMode={panelMode} status={status} prompt={prompt} selectedProvider={selectedProvider} quality={quality} language={language} safeMode={safeMode} loading={loading} onGenerate={generate} onCanvas={() => onSendToCanvas?.(safeCode)} onSave={save} onBoost={(value) => setPrompt((current) => `${current}

${value}`)} />
        <section className="studio-metrics code-metrics">
          {[["Файлы", "28", "+4 за сегодня", Folder], ["Коммиты", "156", "+23 сегодня", GitBranch], ["Билды", "12", "+2 успешных", ShieldCheck]].map(([label, value, note, Icon]) => <article key={label as string} className="studio-metric-card"><div><p>{label as string}</p><strong>{value as string}</strong><span>{note as string}</span></div><Icon className="h-6 w-6" /></article>)}
          <article className="studio-metric-card code-language-card"><div><p>Языки</p><strong>300+</strong><span>Auto routing для любого стека</span></div><select value={language} onChange={(event) => setLanguage(event.target.value)}>{codeLanguagePacks.map((item) => <option key={item}>{item}</option>)}</select></article>
        </section>
        <section className="code-workbench">
          <article className="studio-card file-tree">
            <div className="studio-card-head"><h2>Проект</h2><button type="button" onClick={() => setStatus("Project selector ready")}>sov-ui-dashboard⌄</button></div>
            {["app", "components", "hooks", "lib", "api.ts", "package.json", "tsconfig.json", "tailwind.config.ts"].map((item, index) => <button key={item} type="button" className={activeFile === item ? "is-active" : ""} onClick={() => { setActiveFile(item); setStatus(`${item} opened`) }}>{index < 4 ? <Folder className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}{item}</button>)}
          </article>
          <article className="studio-card code-editor">
            <div className="editor-tabs">{["Dashboard.tsx", "api.ts", "types.ts", "useMetrics.ts", "package.json"].map((item) => <button key={item} type="button" className={activeEditorTab === item ? "is-active" : ""} onClick={() => { setActiveEditorTab(item); setStatus(`${item} tab active`) }}>{item}</button>)}</div>
            <pre><code>{safeCode}</code></pre>
            <footer><span>Строка 23, столбец 15</span><span>Проблемы: {error ? 1 : 0}</span><span>UTF-8</span><span>{language}</span><b>Auto Save</b></footer>
          </article>
          <article className="studio-card live-preview">
            <div className="studio-card-head"><h2>LIVE PREVIEW</h2><span>Online</span></div>
            <div className="preview-dashboard">
              <b>Sovereign Dashboard</b>
              <div>{["Проекты 24", "Запросы 1,248", "Генерации 342", "Время работы 98.7%"].map((item) => <span key={item}>{item}</span>)}</div>
              <LayoutDashboard className="h-28 w-full" />
            </div>
          </article>
          <article className="studio-card ai-hints">
            <h2>AI подсказки</h2>
            {["Оптимизируй запросы в useMetrics", "Добавь обработку ошибок", "Вынеси MetricCard в memo", "Покрыть tests + edge cases"].map((item) => <button key={item} type="button" onClick={() => setPrompt(item)}><strong>{item}</strong><span>Применить</span></button>)}
          </article>
          <article className="studio-card terminal-panel">
            <div className="editor-tabs">{["Терминал", "Проблемы", "Вывод", "Логи"].map((item) => <button key={item} type="button" className={activeTerminalTab === item ? "is-active" : ""} onClick={() => setActiveTerminalTab(item)}>{item}</button>)}</div>
            <pre>{`> malik build --preview\n✓ Ready in 1.2s\n✓ Local: http://localhost:3000\n✓ Compiled successfully\n✓ Generated ${language} artifact\n>`}</pre>
          </article>
          <article className="studio-card code-prompt">
            <label className="studio-field compact"><span>Опиши, что нужно создать...</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: добавь виджет с распределением запросов по моделям за 7 дней..." /></label>
            <div className="code-action-row">
              <button type="button" onClick={generate} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Refactor</button>
              <button type="button" onClick={generate}>Debug</button>
              <button type="button" onClick={() => onSendToCanvas?.(safeCode)}>Preview</button>
              <button type="button" onClick={save}>Deploy</button>
            </div>
            <div className="studio-status">{status}</div>
            <button type="button" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy code</button>
          </article>
        </section>
      </section>
    </main>
  )
}

export default GeneratorPanel

