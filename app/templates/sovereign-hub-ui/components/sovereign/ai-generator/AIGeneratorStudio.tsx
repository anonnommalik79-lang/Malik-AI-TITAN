"use client"

import { useState } from "react"
import {
  ChevronRight,
  Code2,
  Cpu,
  Globe2,
  ImageIcon,
  Maximize2,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
  Zap,
} from "lucide-react"
import { canUseGeneration, incrementUsage } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { sectionHeroUrl } from "@/lib/section-media"
import { AI_GENERATOR_MODE_PHOTOS } from "@/lib/media-library"

export type AIGeneratorStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type OutputMode = "text" | "code" | "photo" | "video" | "website" | "landing"

const MODE_META: Record<OutputMode, { title: string; body: string; icon: typeof Zap; route: string }> = {
  text: { title: "Текст и бриф", body: "Сценарии, копирайт, PRD и питч-материалы.", icon: Wand2, route: "document-generation" },
  code: { title: "Код", body: "React-компоненты, API-роуты и TSX-блоки.", icon: Code2, route: "code-generation" },
  photo: { title: "Фото", body: "Кинематографичные кадры Malik Vision.", icon: ImageIcon, route: "photo-generation" },
  video: { title: "Видео", body: "Ролики и сцены Malik Cinema.", icon: Video, route: "video-generation" },
  website: { title: "Сайт", body: "Полноценный продуктовый сайт с превью.", icon: Globe2, route: "website-generation" },
  landing: { title: "Лендинг", body: "Hero, CTA, pricing и waitlist.", icon: Sparkles, route: "landing-generation" },
}

const MODES: Array<{ id: OutputMode; title: string; body: string; icon: typeof Zap; route: string; photo: string }> = (
  Object.keys(MODE_META) as OutputMode[]
).map((id) => ({
  id,
  ...MODE_META[id],
  photo: AI_GENERATOR_MODE_PHOTOS.find((m) => m.id === id)?.photo ?? "",
}))

const ENDPOINTS: Record<OutputMode, string> = {
  text: "/api/ai/chat",
  code: "/api/generate/code",
  photo: "/api/generate/photo",
  video: "/api/generate/video",
  website: "/api/generate/website",
  landing: "/api/generate/landing",
}

const DEFAULT_PROMPT =
  "Создай премиальный AI SaaS launch kit: концепт продукта, hero-копирайт, структура лендинга и идея для кинематографичного демо-кадра."

const CHIPS = [
  "Launch kit для Malik AI: лендинг + демо-скрипт + 3 визуальных кадра",
  "React dashboard widget с KPI-картами и тёмным glass UI",
  "Инвесторский one-pager: проблема, решение, рынок, traction",
]

const HERO = sectionHeroUrl("ai-generator")

export function AIGeneratorStudio({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: AIGeneratorStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [mode, setMode] = useState<OutputMode>("text")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Единый генератор готов")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")

  const active = MODES.find((m) => m.id === mode) ?? MODES[0]

  const generate = async () => {
    if (!prompt.trim()) {
      setError("Введите промпт")
      return
    }
    if (mode === "photo" && !canUseGeneration("image", operator)) {
      setError("Достигнут лимит генерации")
      return
    }
    if (mode === "video" && !canUseGeneration("video", operator)) {
      setError("Достигнут лимит генерации")
      return
    }
    if (mode === "photo") incrementUsage("image")
    if (mode === "video") incrementUsage("video")

    setLoading(true)
    setError(null)
    setStatus("Генерирую…")
    const endpoint = ENDPOINTS[mode]
    try {
      const body =
        mode === "text"
          ? { message: prompt, mode: "creator" }
          : { prompt, provider: "auto", quality: "ultra" }
      const res = await clientFetchWithTimeout(
        endpoint,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        90_000,
      )
      const data = await res.json().catch(() => ({}))
      const text =
        data.reply || data.message || data.content || data.html || data.code || data.url || JSON.stringify(data, null, 2)
      setResult(String(text).slice(0, 4000))
      setStatus("Артефакт готов")
    } catch {
      setResult(`[Резерв] ${active.title}: ${prompt.slice(0, 200)}…`)
      setError("API недоступен — показан резервный артефакт")
      setStatus("Резервный режим")
    } finally {
      setLoading(false)
    }
  }

  const sendCanvas = () => {
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>AI Generator</title>
<style>body{margin:0;font-family:system-ui;background:#030303;color:#e8eae9;padding:32px;line-height:1.6}pre{white-space:pre-wrap}</style></head>
<body><h1>AI Generator · ${active.title}</h1><pre>${(result || prompt).replace(/</g, "&lt;")}</pre></body></html>`
    onOpenCanvas?.(html)
    setStatus("Отправлено в Canvas")
  }

  return (
    <main className="ags" data-view="ai-generator">
      <div className="ags__bg" aria-hidden="true" />
      <div className="ags__inner">
        <div className="ags__status">
          <span className="ags__status-left"><span className="ags__dot" /><span className="ags__status-key">AI Generator</span><strong>Онлайн</strong></span>
          <span className="ags__status-right">Режим <strong>{active.title}</strong></span>
        </div>

        <header className="ags__head">
          <span className="ags__eyebrow"><Zap size={13} /> Единый движок</span>
          <h1 className="ags__title">AI Генератор</h1>
          <p className="ags__lede">
            Один вход — шесть выходов: текст, код, фото, видео, сайт и лендинг. Премиальные полки с фото,
            русский copy и спокойные кнопки без неонового свечения.
          </p>
        </header>

        <section className="ags__hero">
          <div className="ags__hero-media" style={{ backgroundImage: `url(${HERO})` }}>
            <div className="ags__hero-overlay" />
            <div className="ags__hero-cap"><span className="ags__label">Активный режим</span><h2>{active.title}</h2><p>{status}</p></div>
          </div>
          <div className="ags__hero-copy">
            <span className="ags__label">Как использовать</span>
            <h2>Выберите тип артефакта</h2>
            <p>Карточки ниже переключают режим и маршрут API. Промпт — в лаборатории. Результат — в Canvas или в специализированной студии.</p>
          </div>
        </section>

        <section className="ags__modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="ags__mode"
              data-active={mode === m.id ? "1" : "0"}
              onClick={() => { setMode(m.id); setStatus(`Режим «${m.title}»`) }}
            >
              <div className="ags__mode-photo" style={{ backgroundImage: `url(${m.photo})` }} />
              <div className="ags__mode-body">
                <m.icon size={16} />
                <strong>{m.title}</strong>
                <p>{m.body}</p>
              </div>
            </button>
          ))}
        </section>

        <section className="ags__shelf">
          <span className="ags__label"><Wand2 size={13} /> Промпт-лаборатория</span>
          <h2 className="ags__shelf-title">Опишите артефакт</h2>
          <textarea className="ags__textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          <div className="ags__chips">
            {CHIPS.map((c) => <button key={c} type="button" onClick={() => setPrompt(c)}>{c.slice(0, 50)}…</button>)}
          </div>
          {error ? <p className="ags__error">{error}</p> : null}
          {result ? <pre className="ags__result">{result.slice(0, 1200)}{result.length > 1200 ? "…" : ""}</pre> : null}
          <div className="ags__actions">
            <button type="button" className="ags__btn ags__btn--primary" onClick={generate} disabled={loading}>
              <Sparkles size={15} />{loading ? "Генерирую…" : "Сгенерировать"}
            </button>
            <button type="button" className="ags__btn ags__btn--ghost" onClick={sendCanvas}><Maximize2 size={15} /> Canvas</button>
            <button type="button" className="ags__btn ags__btn--ghost" onClick={onOpenCodex}><Cpu size={15} /> Codex</button>
            <button type="button" className="ags__btn ags__btn--ghost" onClick={() => onViewChange(active.route)}>
              {active.title} <ChevronRight size={15} />
            </button>
            <button type="button" className="ags__btn ags__btn--ghost" onClick={() => { onNewChat?.(); setResult(""); setPrompt(DEFAULT_PROMPT) }}>
              <RefreshCw size={15} /> Сброс
            </button>
          </div>
        </section>

        <footer className="ags__footer">
          <span>Оператор · {operator}</span>
          <span>Эндпоинт · {ENDPOINTS[mode]}</span>
        </footer>
      </div>

      <style jsx>{`
        .ags { position: relative; width: 100%; height: 100%; overflow-y: auto; padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px; color: #e7eae8; scrollbar-width: thin; }
        @media (max-width: 920px) { .ags { padding-top: 24px; } }
        .ags__bg { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(50% 40% at 8% 0%, rgba(217, 174, 69, 0.06), transparent 60%); }
        .ags__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .ags__status { display: flex; justify-content: space-between; padding: 11px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.02); margin-bottom: 28px; font-size: 11px; color: #8a958f; text-transform: uppercase; letter-spacing: .12em; }
        .ags__status-left { display: flex; align-items: center; gap: 10px; }
        .ags__dot { width: 8px; height: 8px; border-radius: 999px; background: #f3de96; }
        .ags__status-left strong { color: #e9d5ff; margin-left: 4px; }
        .ags__status-right strong { color: #e9d5ff; margin-left: 6px; }
        .ags__head { margin-bottom: 36px; max-width: 68ch; }
        .ags__eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #8ba3b8; margin-bottom: 16px; }
        .ags__title { margin: 0 0 16px; font-size: clamp(38px, 6vw, 60px); font-weight: 600; letter-spacing: -.03em; color: #f4f6f5; line-height: 1.02; }
        .ags__lede { margin: 0; font-size: clamp(16px, 1.7vw, 20px); line-height: 1.55; color: #aab4af; }
        .ags__hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 24px; margin-bottom: 22px; }
        @media (max-width: 900px) { .ags__hero { grid-template-columns: 1fr; } }
        .ags__hero-media { position: relative; min-height: 300px; border-radius: 22px; border: 1px solid rgba(255,255,255,.1); background-size: cover; background-position: center; overflow: hidden; }
        .ags__hero-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(3,3,3,.9) 100%); }
        .ags__hero-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 24px; }
        .ags__hero-cap h2 { margin: 8px 0 4px; font-size: 24px; color: #f4f6f5; }
        .ags__hero-cap p { margin: 0; font-size: 13px; color: #b8c4be; }
        .ags__hero-copy { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.018); padding: 28px; }
        .ags__hero-copy h2 { margin: 12px 0 10px; font-size: 22px; color: #f1f4f2; }
        .ags__hero-copy p { margin: 0; font-size: 15px; line-height: 1.65; color: #a7b2ac; }
        .ags__label { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #8ba3b8; }
        .ags__modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 22px; }
        @media (max-width: 900px) { .ags__modes { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .ags__modes { grid-template-columns: 1fr; } }
        .ags__mode { text-align: left; border-radius: 16px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.015); overflow: hidden; cursor: pointer; color: inherit; padding: 0; }
        .ags__mode[data-active="1"] { border-color: rgba(243, 222, 150,.45); box-shadow: inset 0 0 0 1px rgba(243, 222, 150,.12); }
        .ags__mode-photo { height: 100px; background-size: cover; background-position: center; }
        .ags__mode-body { padding: 14px 16px; }
        .ags__mode-body strong { display: block; margin: 8px 0 4px; color: #f1f4f2; font-size: 15px; }
        .ags__mode-body p { margin: 0; font-size: 12px; line-height: 1.5; color: #9aa6a0; }
        .ags__shelf { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.018); padding: clamp(24px, 3vw, 36px); margin-bottom: 20px; }
        .ags__shelf-title { margin: 12px 0 16px; font-size: clamp(20px, 2.2vw, 26px); font-weight: 600; color: #f1f4f2; }
        .ags__textarea { width: 100%; min-height: 100px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8ece9; font-size: 15px; padding: 16px; outline: none; resize: vertical; }
        .ags__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
        .ags__chips button { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: transparent; color: #aab4af; font-size: 12px; padding: 8px 14px; cursor: pointer; }
        .ags__error { color: #fca5a5; font-size: 13px; margin: 0 0 10px; }
        .ags__result { margin: 0 0 14px; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.2); font-size: 12px; color: #c5cdc8; white-space: pre-wrap; max-height: 200px; overflow: auto; }
        .ags__actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .ags__btn { display: inline-flex; align-items: center; gap: 8px; border-radius: 10px; font-size: 14px; font-weight: 600; padding: 11px 18px; cursor: pointer; }
        .ags__btn--primary { border: 1px solid rgba(255,255,255,.18); background: #f4f6f5; color: #0a0a0a; box-shadow: none; }
        .ags__btn--primary:disabled { opacity: .55; }
        .ags__btn--ghost { border: 1px solid rgba(255,255,255,.14); background: transparent; color: #d1d9d4; }
        .ags__footer { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #6b756f; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.06); }
      `}</style>
    </main>
  )
}
