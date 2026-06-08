"use client"

import { useState } from "react"
import {
  ChevronRight,
  Cpu,
  Globe2,
  LayoutTemplate,
  Maximize2,
  Monitor,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { sectionHeroUrl } from "@/lib/section-media"
import { WEBSITE_TEMPLATE_PHOTOS } from "@/lib/media-library"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

const ENDPOINT = "/api/generate/website"
const HERO = sectionHeroUrl("website-generation")

const TEMPLATE_META = [
  { id: "saas", title: "AI SaaS", body: "Продуктовый сайт с pricing, features и demo CTA." },
  { id: "startup", title: "Стартап", body: "Hero, social proof, roadmap и waitlist." },
  { id: "enterprise", title: "Enterprise", body: "B2B-лендинг с кейсами и security-блоком." },
  { id: "portfolio", title: "Портфолио", body: "Витрина проектов и founder story." },
  { id: "astana", title: "Astana Hub", body: "Технопарк и резиденты Казахстана." },
  { id: "media", title: "Media KZ", body: "Новостной портал и видео-лента." },
  { id: "fintech", title: "FinTech", body: "Банкинг, API и compliance dashboard." },
  { id: "travel", title: "Travel KZ", body: "Туризм и маршруты по Казахстану." },
] as const

const TEMPLATES = TEMPLATE_META.map((t) => ({
  ...t,
  photo: WEBSITE_TEMPLATE_PHOTOS.find((p) => p.id === t.id)?.photo ?? "",
}))

const CHIPS = [
  "Премиальный сайт Malik AI Sovereign: hero, features, pricing, demo CTA, тёмный glass UI",
  "Landing для Digital Bridge 2026: инвесторский one-pager + waitlist + live demo block",
  "B2B AI platform: security, SLA, integrations, enterprise pricing",
]

const DEFAULT =
  "Сгенерируй премиальный тёмный сайт для Malik AI Sovereign Hub: hero с большим заголовком, блок возможностей (Final Intelligence, Unbreakable AI, генераторы), pricing, FAQ и CTA на демо."

export function WebsiteGenerationStudio({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: WebsiteGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>("saas")
  const [prompt, setPrompt] = useState(DEFAULT)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Website Builder готов")
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState("")

  const tpl = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0]

  const generate = async () => {
    if (!prompt.trim()) { setError("Введите описание сайта"); return }
    setLoading(true)
    setError(null)
    setStatus("Собираю страницу…")
    try {
      const res = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, template: tpl.title, style: "premium-dark", provider: "auto" }),
        },
        90_000,
      )
      const data = await res.json().catch(() => ({}))
      const out = data.html || data.content || data.code || data.message || ""
      setHtml(String(out).slice(0, 8000))
      setStatus("Сайт сгенерирован")
    } catch {
      const fallback = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Malik AI</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#030303;color:#e8eae9}.hero{min-height:70vh;display:flex;align-items:center;padding:48px 24px}.wrap{max-width:960px;margin:0 auto}h1{font-size:clamp(36px,6vw,64px);line-height:1.05;margin:0 0 16px}p{color:#94a3b8;font-size:18px;line-height:1.6}.cta{display:inline-block;margin-top:24px;padding:14px 22px;border-radius:10px;background:#f4f6f5;color:#0a0a0a;text-decoration:none;font-weight:600}</style></head>
<body><section class="hero"><div class="wrap"><h1>Malik AI Sovereign</h1><p>${prompt.slice(0, 200)}</p><a class="cta" href="#">Запросить демо</a></div></section></body></html>`
      setHtml(fallback)
      setError("API недоступен — показан резервный превью-сайт")
      setStatus("Резервный режим")
    } finally {
      setLoading(false)
    }
  }

  const sendCanvas = () => {
    onOpenCanvas?.(html || `<html><body><p>${prompt}</p></body></html>`)
    setStatus("Сайт в Canvas")
  }

  return (
    <main className="wgs" data-view="website-generation">
      <div className="wgs__bg" aria-hidden="true" />
      <div className="wgs__inner">
        <div className="wgs__status">
          <span><span className="wgs__dot" /> Website Builder <strong>Онлайн</strong></span>
          <span>Шаблон <strong>{tpl.title}</strong></span>
        </div>

        <header className="wgs__head">
          <span className="wgs__eyebrow"><Globe2 size={13} /> Конструктор</span>
          <h1 className="wgs__title">Website Builder</h1>
          <p className="wgs__lede">
            Полноценные продуктовые сайты с превью, шаблонами и экспортом в Canvas. Большие полки,
            кинематографичные фото и спокойный интерфейс — без дешёвого неона.
          </p>
        </header>

        <section className="wgs__hero">
          <div className="wgs__hero-media" style={{ backgroundImage: `url(${HERO})` }}>
            <div className="wgs__hero-overlay" />
            <div className="wgs__hero-cap"><span className="wgs__label"><Monitor size={13} /> Превью</span><h2>{tpl.title}</h2><p>{status}</p></div>
          </div>
          <div className="wgs__hero-copy">
            <span className="wgs__label">Как использовать</span>
            <h2>От промпта до live-сайта</h2>
            <p>Опишите продукт, выберите шаблон, запустите генерацию через <code>{ENDPOINT}</code> и откройте результат в Canvas.</p>
          </div>
        </section>

        <section className="wgs__templates">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="wgs__tpl" data-active={template === t.id ? "1" : "0"} onClick={() => { setTemplate(t.id); setStatus(`Шаблон «${t.title}»`) }}>
              <div className="wgs__tpl-photo" style={{ backgroundImage: `url(${t.photo})` }} />
              <div className="wgs__tpl-body"><LayoutTemplate size={14} /><strong>{t.title}</strong><p>{t.body}</p></div>
            </button>
          ))}
        </section>

        <section className="wgs__shelf">
          <span className="wgs__label"><Wand2 size={13} /> Бриф сайта</span>
          <h2 className="wgs__shelf-title">Опишите продуктовую страницу</h2>
          <textarea className="wgs__textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          <div className="wgs__chips">{CHIPS.map((c) => <button key={c} type="button" onClick={() => setPrompt(c)}>{c.slice(0, 52)}…</button>)}</div>
          {error ? <p className="wgs__error">{error}</p> : null}
          <div className="wgs__actions">
            <button type="button" className="wgs__btn wgs__btn--primary" onClick={generate} disabled={loading}><Sparkles size={15} />{loading ? "Собираю…" : "Сгенерировать сайт"}</button>
            <button type="button" className="wgs__btn wgs__btn--ghost" onClick={sendCanvas}><Maximize2 size={15} /> Canvas</button>
            <button type="button" className="wgs__btn wgs__btn--ghost" onClick={onOpenCodex}><Cpu size={15} /> Codex</button>
            <button type="button" className="wgs__btn wgs__btn--ghost" onClick={() => onViewChange("landing-generation")}>Landing Studio <ChevronRight size={15} /></button>
            <button type="button" className="wgs__btn wgs__btn--ghost" onClick={() => { onNewChat?.(); setHtml(""); setPrompt(DEFAULT) }}><RefreshCw size={15} /> Сброс</button>
          </div>
        </section>

        {html ? (
          <section className="wgs__preview">
            <span className="wgs__label">Live preview</span>
            <h2 className="wgs__shelf-title">Сгенерированная страница</h2>
            <iframe className="wgs__iframe" title="Website preview" srcDoc={html} sandbox="allow-same-origin" />
          </section>
        ) : null}

        <footer className="wgs__footer"><span>Оператор · {operator}</span><span>{ENDPOINT}</span></footer>
      </div>

      <style jsx>{`
        .wgs { position: relative; width: 100%; height: 100%; overflow-y: auto; padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px; color: #e7eae8; scrollbar-width: thin; }
        @media (max-width: 920px) { .wgs { padding-top: 24px; } }
        .wgs__bg { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(50% 40% at 10% 0%, rgba(16,185,129,.05), transparent 60%); }
        .wgs__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .wgs__status { display: flex; justify-content: space-between; padding: 11px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.02); margin-bottom: 28px; font-size: 11px; color: #8a958f; text-transform: uppercase; letter-spacing: .12em; }
        .wgs__status span { display: inline-flex; align-items: center; gap: 8px; }
        .wgs__dot { width: 8px; height: 8px; border-radius: 999px; background: #6ee7b7; }
        .wgs__status strong { color: #a7f3d0; }
        .wgs__head { margin-bottom: 36px; max-width: 68ch; }
        .wgs__eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #8ba3b8; margin-bottom: 16px; }
        .wgs__title { margin: 0 0 16px; font-size: clamp(38px, 6vw, 60px); font-weight: 600; letter-spacing: -.03em; color: #f4f6f5; line-height: 1.02; }
        .wgs__lede { margin: 0; font-size: clamp(16px, 1.7vw, 20px); line-height: 1.55; color: #aab4af; }
        .wgs__hero { display: grid; grid-template-columns: 1.15fr 1fr; gap: 24px; margin-bottom: 22px; }
        @media (max-width: 900px) { .wgs__hero { grid-template-columns: 1fr; } }
        .wgs__hero-media { position: relative; min-height: 320px; border-radius: 22px; border: 1px solid rgba(255,255,255,.1); background-size: cover; background-position: center; }
        .wgs__hero-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(3,3,3,.9) 100%); }
        .wgs__hero-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 24px; }
        .wgs__hero-cap h2 { margin: 8px 0 4px; font-size: 24px; color: #f4f6f5; }
        .wgs__hero-cap p { margin: 0; font-size: 13px; color: #b8c4be; }
        .wgs__hero-copy { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.018); padding: 28px; }
        .wgs__hero-copy h2 { margin: 12px 0 10px; font-size: 22px; color: #f1f4f2; }
        .wgs__hero-copy p { margin: 0; font-size: 15px; line-height: 1.65; color: #a7b2ac; }
        .wgs__hero-copy code { font-size: 12px; color: #6ee7b7; background: rgba(255,255,255,.05); padding: 2px 6px; border-radius: 4px; }
        .wgs__label { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #8ba3b8; }
        .wgs__templates { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
        @media (max-width: 900px) { .wgs__templates { grid-template-columns: repeat(2, 1fr); } }
        .wgs__tpl { text-align: left; border-radius: 16px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.015); overflow: hidden; cursor: pointer; color: inherit; padding: 0; }
        .wgs__tpl[data-active="1"] { border-color: rgba(110,231,183,.4); }
        .wgs__tpl-photo { height: 90px; background-size: cover; background-position: center; }
        .wgs__tpl-body { padding: 12px 14px; }
        .wgs__tpl-body strong { display: block; margin: 6px 0 4px; font-size: 14px; color: #f1f4f2; }
        .wgs__tpl-body p { margin: 0; font-size: 11px; color: #9aa6a0; line-height: 1.45; }
        .wgs__shelf { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.018); padding: clamp(24px, 3vw, 36px); margin-bottom: 20px; }
        .wgs__shelf-title { margin: 12px 0 16px; font-size: clamp(20px, 2.2vw, 26px); font-weight: 600; color: #f1f4f2; }
        .wgs__textarea { width: 100%; min-height: 100px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8ece9; font-size: 15px; padding: 16px; outline: none; resize: vertical; }
        .wgs__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
        .wgs__chips button { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: transparent; color: #aab4af; font-size: 12px; padding: 8px 14px; cursor: pointer; }
        .wgs__error { color: #fca5a5; font-size: 13px; }
        .wgs__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        .wgs__btn { display: inline-flex; align-items: center; gap: 8px; border-radius: 10px; font-size: 14px; font-weight: 600; padding: 11px 18px; cursor: pointer; }
        .wgs__btn--primary { border: 1px solid rgba(255,255,255,.18); background: #f4f6f5; color: #0a0a0a; box-shadow: none; }
        .wgs__btn--primary:disabled { opacity: .55; }
        .wgs__btn--ghost { border: 1px solid rgba(255,255,255,.14); background: transparent; color: #d1d9d4; }
        .wgs__preview { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.018); padding: 24px; margin-bottom: 20px; }
        .wgs__iframe { width: 100%; min-height: 420px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: #fff; }
        .wgs__footer { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #6b756f; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.06); }
      `}</style>
    </main>
  )
}
