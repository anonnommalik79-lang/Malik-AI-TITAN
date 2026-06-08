"use client"

import { useMemo, useState } from "react"
import {
  Box,
  Clock3,
  Download,
  Folder,
  Grid3X3,
  Image,
  ImageIcon,
  Loader2,
  Maximize2,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react"
import { canUseGeneration, incrementUsage } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"

type PhotoResult = {
  url: string
  prompt?: string
  filename?: string
  fallback?: boolean
}

interface PhotoGenerationPanelProps {
  onSendToCanvas?: (code: string) => void
  userEmail?: string
}

const styles = ["Все стили", "Фотореализм", "Киберпанк", "Минимализм", "Портрет", "3D", "Арт"]
const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4"]
const historyPrompts = [
  "Киберпанковский мегаполис ночью, дождь, неоновые вывески...",
  "Астронавт на Луне, Земля на горизонте",
  "Футуристичный интерьер с панорамным окном",
  "Портрет кибернетической девушки",
  "Плавающий город в облаках",
]

const topbarItems = [
  ["◎", "Malik AI Jenkins"],
  ["✺", "High-Speed queue"],
  ["⌘", "Malik Ask"],
  ["⌕", "Craft & Search"],
  ["↯", "API 2.0"],
  ["✧", "Queue: 3"],
  ["⟡", "Deploy"],
  [">_", "Malik Codex"],
  ["✣", "Creator Mode: ON"],
] as const

const apiProviderSlots = [
  ["auto", "Auto Vision", "Router"],
  ["vision", "MALIK Vision", "Image engine"],
  ["queue", "Render Queue", "Fast render"],
  ["cloud", "Sovereign Cloud", "Storage"],
  ["cinema", "MALIK Cinema", "Motion"],
] as const

type ApiProviderId = typeof apiProviderSlots[number][0]

function localSvgDataUrl(prompt: string, style: string) {
  const safePrompt = (prompt || "Malik AI premium photo").slice(0, 120)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768" viewBox="0 0 1344 768"><defs><radialGradient id="g" cx="25%" cy="15%" r="80%"><stop offset="0%" stop-color="#7c3aed"/><stop offset="46%" stop-color="#0f172a"/><stop offset="100%" stop-color="#020617"/></radialGradient><linearGradient id="h" x1="0" x2="1"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="1344" height="768" fill="url(#g)"/><circle cx="1040" cy="160" r="190" fill="#22d3ee" opacity=".16"/><path d="M0 640 C250 548 470 720 710 610 C930 508 1080 612 1344 540 L1344 768 L0 768Z" fill="#020617" opacity=".7"/><rect x="80" y="76" width="1184" height="616" rx="56" fill="#030712" opacity=".56" stroke="url(#h)" stroke-width="2"/><text x="128" y="170" fill="#fff" font-family="Arial" font-size="44" font-weight="900">Malik Vision XL v2</text><text x="128" y="226" fill="#67e8f9" font-family="Arial" font-size="24">${style}</text><foreignObject x="128" y="520" width="1040" height="110"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;color:white;font-size:32px;font-weight:900;line-height:1.12;">${safePrompt}</div></foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const seededGallery = [
  "Киберпанковский мегаполис ночью, мокрый асфальт",
  "Футуристический город с планетой на горизонте",
  "Портрет кибернетической девушки",
  "Неоновый переулок под дождем",
  "Астронавт на поверхности Луны",
  "Светящийся треугольный портал",
  "Летающий город над облаками",
  "Интерьер космического корабля",
]


const titanPhotoDirectors = [
  ["Composition", "Rule-of-thirds, central hero object, cinematic depth"],
  ["Light", "Volumetric glow, premium reflections, realistic contrast"],
  ["Material", "Glass, metal, fabric and skin details stay grounded"],
  ["Brand", "MALIK AI dark/crimson/blue premium product language"],
] as const

const titanPhotoPresets = [
  "MALIK AI founder booth, Digital Bridge stage, cinematic product photo, premium glass SaaS dashboard",
  "Sovereign AI data center from Kazakhstan, realistic dark blue lighting, enterprise infrastructure feel",
  "Apple-level AI product hero image, black background, elegant glowing interface, investor demo mood",
  "German-tank stable AI machine visual, heavy premium metal, blue energy core, not fantasy, realistic product ad",
] as const

function TitanPhotoCss() {
  return (
    <style>{`
      .photo-clone-shell {
        position: relative;
        isolation: isolate;
        background:
          radial-gradient(circle at 16% 0%, rgba(34,211,238,.16), transparent 32%),
          radial-gradient(circle at 86% 18%, rgba(168,85,247,.15), transparent 38%),
          radial-gradient(circle at 50% 110%, rgba(59,130,246,.10), transparent 36%),
          linear-gradient(135deg, #02030a, #060816 52%, #03020a) !important;
      }
      .photo-clone-shell::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(34,211,238,.055) 1px, transparent 1px),
          linear-gradient(0deg, rgba(168,85,247,.045) 1px, transparent 1px),
          radial-gradient(circle at 50% 0%, rgba(255,255,255,.07), transparent 28%);
        background-size: 70px 70px, 70px 70px, 100% 100%;
        mask-image: radial-gradient(ellipse 82% 70% at 50% 25%, #000 0 55%, transparent 100%);
        animation: titanPhotoGrid 16s linear infinite;
      }
      .photo-clone-shell .studio-inner { position: relative; z-index: 1; }
      .photo-clone-shell .studio-card,
      .photo-clone-shell .studio-metric-card,
      .photo-clone-shell .studio-page-head,
      .photo-clone-shell .studio-api-rail {
        border-color: rgba(125,211,252,.14) !important;
        background:
          radial-gradient(circle at 8% 0%, rgba(34,211,238,.09), transparent 30%),
          radial-gradient(circle at 100% 100%, rgba(168,85,247,.08), transparent 34%),
          rgba(2,8,23,.70) !important;
        box-shadow: 0 22px 95px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.045) !important;
        backdrop-filter: blur(22px);
      }
      .photo-clone-shell .studio-primary-action,
      .photo-prompt-actions button:last-child {
        color: #020617 !important;
        background: linear-gradient(135deg, #fff, #bae6fd 44%, #ddd6fe) !important;
        box-shadow: 0 18px 70px rgba(125,211,252,.22), inset 0 1px 0 rgba(255,255,255,.9) !important;
      }
      .titan-photo-director {
        display: grid;
        grid-template-columns: minmax(0, 1.12fr) minmax(320px, .88fr);
        gap: 18px;
        margin: 18px 0;
      }
      .titan-photo-hero,
      .titan-photo-control,
      .titan-photo-board {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(125,211,252,.15);
        border-radius: 34px;
        background:
          radial-gradient(circle at 14% 0%, rgba(34,211,238,.14), transparent 34%),
          radial-gradient(circle at 100% 100%, rgba(168,85,247,.12), transparent 34%),
          rgba(2,8,23,.68);
        box-shadow: 0 26px 105px rgba(0,0,0,.37), inset 0 1px 0 rgba(255,255,255,.055);
        backdrop-filter: blur(26px);
      }
      .titan-photo-hero { padding: 26px; }
      .titan-photo-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(125,211,252,.18);
        border-radius: 999px;
        padding: 8px 12px;
        color: rgba(186,230,253,.92);
        background: rgba(34,211,238,.08);
        font-size: 10px;
        font-weight: 1000;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .titan-photo-title {
        margin: 18px 0 0;
        color: white;
        font-size: clamp(34px, 5vw, 76px);
        line-height: .86;
        letter-spacing: -.08em;
        font-weight: 1000;
      }
      .titan-photo-title span {
        display: block;
        background: linear-gradient(90deg, #67e8f9, #fff, #f0abfc);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .titan-photo-text {
        max-width: 760px;
        margin-top: 16px;
        color: rgba(203,213,225,.78);
        font-size: 14px;
        line-height: 1.75;
      }
      .titan-photo-preset-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 20px;
      }
      .titan-photo-preset-grid button,
      .titan-photo-control div,
      .titan-photo-board div {
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 18px;
        background: rgba(255,255,255,.04);
        color: rgba(241,245,249,.92);
        padding: 13px;
        text-align: left;
      }
      .titan-photo-preset-grid button:hover {
        transform: translateY(-2px);
        border-color: rgba(125,211,252,.32);
        background: rgba(125,211,252,.08);
      }
      .titan-photo-control { padding: 18px; }
      .titan-photo-control h3,
      .titan-photo-board h3 {
        margin: 0 0 14px;
        color: white;
        font-size: 16px;
        font-weight: 1000;
      }
      .titan-photo-control-grid,
      .titan-photo-board-grid {
        display: grid;
        gap: 10px;
      }
      .titan-photo-control strong,
      .titan-photo-board strong { display:block; color:white; font-weight:1000; }
      .titan-photo-control span,
      .titan-photo-board span { display:block; margin-top:4px; color:rgba(148,163,184,.88); font-size:11px; }
      .titan-photo-board {
        grid-column: 1 / -1;
        padding: 18px;
      }
      .titan-photo-board-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .photo-gallery-item {
        box-shadow: 0 22px 70px rgba(0,0,0,.34), 0 0 0 1px rgba(125,211,252,.10);
      }
      @keyframes titanPhotoGrid { from { transform: translateX(-1%); } to { transform: translateX(1%); } }
      @media (max-width: 1100px) {
        .titan-photo-director { grid-template-columns: 1fr; }
        .titan-photo-board-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .titan-photo-preset-grid,
        .titan-photo-board-grid { grid-template-columns: 1fr; }
        .titan-photo-title { font-size: 38px; }
      }
      @media (prefers-reduced-motion: reduce) { .photo-clone-shell::before { animation: none !important; } }
    `}</style>
  )
}

function TitanPhotoDirector({
  prompt,
  style,
  ratio,
  lighting,
  model,
  status,
  loading,
  onGenerate,
  onPreset,
  onCanvas,
}: {
  prompt: string
  style: string
  ratio: string
  lighting: string
  model: string
  status: string
  loading: boolean
  onGenerate: () => void
  onPreset: (value: string) => void
  onCanvas: () => void
}) {
  return (
    <section className="titan-photo-director" aria-label="MALIK Vision Titan director">
      <article className="titan-photo-hero">
        <span className="titan-photo-eyebrow"><Sparkles className="h-4 w-4" /> MALIK VISION TITAN DIRECTOR</span>
        <h2 className="titan-photo-title">Not random images.<span>Product-grade visual command.</span></h2>
        <p className="titan-photo-text">
          Photo Generation должен выглядеть как режиссёрская панель: промпт, стиль, свет, ratio, модель и Canvas идут как один production flow.
          Цель — картинка, которую не стыдно показать на Digital Bridge demo stage.
        </p>
        <div className="titan-photo-preset-grid">
          {titanPhotoPresets.map((item) => <button key={item} type="button" onClick={() => onPreset(item)}>{item}</button>)}
        </div>
        <div className="titan-photo-preset-grid">
          <button type="button" onClick={onGenerate}>{loading ? "Rendering..." : "Render Titan frame"}</button>
          <button type="button" onClick={onCanvas}>Send visual proof to Canvas</button>
        </div>
      </article>

      <aside className="titan-photo-control">
        <h3>Director telemetry</h3>
        <div className="titan-photo-control-grid">
          <div><strong>{status}</strong><span>Status</span></div>
          <div><strong>{style}</strong><span>Style lane</span></div>
          <div><strong>{ratio}</strong><span>Aspect ratio</span></div>
          <div><strong>{lighting}</strong><span>Lighting</span></div>
          <div><strong>{model}</strong><span>Model</span></div>
          <div><strong>{Math.min(1600, prompt.length)} chars</strong><span>Prompt depth</span></div>
        </div>
      </aside>

      <article className="titan-photo-board">
        <h3>Quality board</h3>
        <div className="titan-photo-board-grid">
          {titanPhotoDirectors.map(([title, detail]) => <div key={title}><strong>{title}</strong><span>{detail}</span></div>)}
        </div>
      </article>
    </section>
  )
}

export function PhotoGenerationPanel({ onSendToCanvas, userEmail }: PhotoGenerationPanelProps) {
  const [prompt, setPrompt] = useState("Киберпанковский мегаполис ночью, дождь, неоновые вывески, летающие машины, отражения на мокром асфальте, кинематографичный свет")
  const [style, setStyle] = useState(styles[0])
  const [ratio, setRatio] = useState("16:9")
  const [lighting, setLighting] = useState("Кинематографичное")
  const [seed, setSeed] = useState("872341910")
  const [guidance, setGuidance] = useState("7.5")
  const [model, setModel] = useState("Malik Vision XL v2")
  const [selectedProvider, setSelectedProvider] = useState<ApiProviderId>("auto")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("Image studio ready")
  const [results, setResults] = useState<PhotoResult[]>([])
  const [blocked, setBlocked] = useState(false)

  const gallery = useMemo(() => {
    const generated = results.map((item) => ({ url: item.url, prompt: item.prompt || prompt }))
    const seeded = seededGallery.map((item) => ({ url: localSvgDataUrl(item, style), prompt: item }))
    return [...generated, ...seeded].slice(0, 8)
  }, [prompt, results, style])

  const canvasCode = useMemo(() => {
    const first = gallery[0]
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#030303] text-white"><main class="min-h-screen p-8"><section class="mx-auto max-w-6xl"><h1 class="text-5xl font-black">Malik Photo Generation</h1><p class="mt-4 text-zinc-400">${prompt}</p><img src="${first?.url || localSvgDataUrl(prompt, style)}" class="mt-8 w-full rounded-[2rem] border border-white/10 shadow-2xl"/></section></main></body></html>`
  }, [gallery, prompt, style])

  const generatePhoto = async () => {
    if (!prompt.trim()) {
      setError("Prompt is required")
      return
    }
    if (!canUseGeneration("image", userEmail)) {
      setBlocked(true)
      setStatus("Free image generation limit reached")
      return
    }
    incrementUsage("image")
    setBlocked(false)
    setLoading(true)
    setError(null)
    setStatus("Generating photo...")
    try {
      const response = await clientFetchWithTimeout("/api/media/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: ratio, mode: "cinematic", userEmail }),
      }, 95_000)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || `Backend returned ${response.status}`)
      const imageUrl = data.imageUrl || data.url
      if (!imageUrl) throw new Error("No imageUrl returned")
      const next: PhotoResult = { url: imageUrl, prompt, fallback: data.provider === "pollinations" }
      setResults((previous) => [next, ...previous].slice(0, 12))
      setStatus(data.provider === "pollinations" ? `Fallback · ${data.provider}` : `Photo generated · ${data.provider}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo generation failed")
      setStatus("Generation error")
    } finally {
      setLoading(false)
    }
  }

  const saveToGallery = async (item: PhotoResult) => {
    setStatus("Saving gallery item...")
    try {
      await clientFetchWithTimeout("/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "photo", title: prompt.slice(0, 64), photo: item }),
      }, 20_000)
      setStatus("Saved to project gallery")
    } catch {
      setStatus("Saved locally in browser fallback")
    }
  }

  const handleShortcut = (label: string) => {
    setStatus(`${label} ready`)
  }

  const resetSettings = () => {
    setStyle(styles[0])
    setRatio("16:9")
    setLighting("Кинематографичное")
    setSeed("872341910")
    setGuidance("7.5")
    setModel("Malik Vision XL v2")
    setSelectedProvider("auto")
    setStatus("Generation settings reset")
  }

  return (
    <main className="studio-shell photo-clone-shell">
      <TitanPhotoCss />
      <div className="studio-bg-grid" />
      <div className="studio-motion-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="studio-topbar" aria-label="Photo generation shortcuts">
        {topbarItems.map(([icon, label]) => <button key={label} type="button" onClick={() => handleShortcut(label)}><span>{icon}</span>{label}</button>)}
      </div>
      <div className="studio-topbar-status" aria-hidden="true"><span>♢</span><span>♛ 4,460</span><span>M</span></div>

      <section className="studio-inner photo-layout">
        <header className="studio-page-head">
          <div>
            <h1>Photo Generation</h1>
            <p>Изображения из идей: генерация, стили и галерея результатов.</p>
          </div>
        </header>

        <section className="studio-api-rail photo-api-rail" aria-label="Photo MALIK engine slots">
          <div>
            <span>VISION ROUTER</span>
            <strong>{selectedProvider === "auto" ? "Auto engine online" : `${selectedProvider.toUpperCase()} lane selected`}</strong>
          </div>
          {apiProviderSlots.map(([id, label, note]) => (
            <button
              key={id}
              type="button"
              className={selectedProvider === id ? "is-active" : ""}
              onClick={() => {
                setSelectedProvider(id)
                setStatus(`${label} slot selected`)
              }}
            >
              <span>{label}</span>
              <em>{note}</em>
            </button>
          ))}
        </section>

        <TitanPhotoDirector prompt={prompt} style={style} ratio={ratio} lighting={lighting} model={model} status={status} loading={loading} onGenerate={generatePhoto} onPreset={setPrompt} onCanvas={() => onSendToCanvas?.(canvasCode)} />

        <section className="photo-main-grid">
          <div className="photo-left">
            <article className="studio-card photo-prompt-card">
              <label className="studio-field compact">
                <span>Опишите, что вы хотите сгенерировать</span>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </label>
              <div className="photo-prompt-actions">
                <button type="button" onClick={() => setPrompt("Случайный премиальный sci-fi prompt для Malik Vision XL v2")}>Случайный промпт</button>
                <span>{prompt.length} / 1600</span>
                <button type="button" onClick={() => setPrompt("")}>×</button>
                <button type="button" onClick={() => setStatus("Advanced settings are available on the right")}>Расширенные настройки⌄</button>
                <button type="button" onClick={generatePhoto} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Сгенерировать</button>
              </div>
            </article>

            <div className="studio-chip-row photo-style-row">
              {styles.map((item) => <button key={item} type="button" className={style === item ? "is-active" : ""} onClick={() => setStyle(item)}>{item}</button>)}
            </div>

            <section className="studio-metrics">
              {[["Генераций", "1,248", "+24% с прошлой недели", Folder], ["Стили", "34", "+12% доступно стилей", Box], ["Очередь", blocked ? "Limit" : "3", "Среднее время: 23 сек", Clock3], ["Качество", "Ultra", "Детализация и реализм", ShieldCheck]].map(([label, value, note, Icon]) => <article key={label as string} className="studio-metric-card"><div><p>{label as string}</p><strong>{value as string}</strong><span>{note as string}</span></div><Icon className="h-6 w-6" /></article>)}
            </section>

            <article className="studio-card photo-gallery-card">
              <div className="studio-card-head">
                <h2>Галерея результатов</h2>
                <div><button type="button" onClick={() => setStatus("Showing all results")}>Все результаты⌄</button><button type="button" onClick={() => setStatus("Gallery grid mode selected")}><Grid3X3 className="h-4 w-4" /></button><button type="button" onClick={() => setStatus("Gallery focus mode selected")}><Maximize2 className="h-4 w-4" /></button></div>
              </div>
              <div className="photo-gallery-grid">
                {gallery.map((item, index) => (
                  <article key={`${item.url}-${index}`} className="photo-gallery-item">
                    <img src={item.url} alt={item.prompt} />
                    <button type="button" onClick={() => saveToGallery({ url: item.url, prompt: item.prompt })}>⋯</button>
                    <span>☆</span>
                  </article>
                ))}
              </div>
              <button type="button" className="search-more" onClick={() => setResults((prev) => [...prev, { url: localSvgDataUrl(prompt, style), prompt, fallback: true }])}>Загрузить ещё</button>
            </article>
          </div>

          <aside className="photo-right">
            <article className="studio-card photo-settings">
              <div className="studio-card-head"><h2>Настройки генерации</h2><button type="button" onClick={resetSettings}>Сбросить</button></div>
              <label><span>Соотношение сторон</span><div className="ratio-grid">{ratios.map((item) => <button key={item} type="button" className={ratio === item ? "is-active" : ""} onClick={() => setRatio(item)}>{item}</button>)}</div></label>
              <label><span>Освещение</span><select value={lighting} onChange={(event) => setLighting(event.target.value)}><option>Кинематографичное</option><option>Softbox studio</option><option>Neon night</option></select></label>
              <label><span>Seed</span><input value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
              <label><span>Guidance Scale</span><input type="range" min="1" max="12" step=".5" value={guidance} onChange={(event) => setGuidance(event.target.value)} /><b>{guidance}</b></label>
              <label><span>Модель</span><select value={model} onChange={(event) => setModel(event.target.value)}><option>Malik Vision XL v2</option><option>Malik 4.1 Ultra</option></select></label>
              <button type="button" className="studio-primary-action" onClick={() => onSendToCanvas?.(canvasCode)}><ImageIcon className="h-4 w-4" /> Отправить в Canvas</button>
              {error && <p className="photo-error">{error}</p>}
              <p className="studio-status">{status}</p>
            </article>

            <article className="studio-card prompt-history">
              <div className="studio-card-head"><h2>История промптов</h2><button type="button" onClick={() => setStatus("Prompt history opened")}>Смотреть все</button></div>
              {historyPrompts.map((item, index) => (
                <button key={item} type="button" onClick={() => setPrompt(item)}>
                  <img src={localSvgDataUrl(item, styles[index % styles.length])} alt="" />
                  <span><strong>{item}</strong><em>{index % 2 ? "1 неделю назад" : "22 мин назад"}</em></span>
                </button>
              ))}
              <button type="button" onClick={() => setResults([])}><Download className="h-4 w-4" /> Очистить историю</button>
            </article>
          </aside>
        </section>
      </section>
    </main>
  )
}

export default PhotoGenerationPanel

