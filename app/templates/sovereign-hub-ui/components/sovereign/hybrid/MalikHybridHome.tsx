"use client"

import { memo, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { HOME_STARTER_TEMPLATES, KAZAKH_SMI_TEMPLATES } from "@/lib/media-library"
import { unsplashPhoto } from "@/lib/section-media"
import { CapabilityHomeShowcase } from "@/components/sovereign/capabilities"
import { renderCapabilityPrompt } from "@/lib/ai/capabilities/registry"
import type { Capability } from "@/lib/ai/capabilities/types"
import {
  ArrowRight,
  CircleCheck,
  Code2,
  Film,
  Grid3X3,
  Hexagon,
  Image,
  Layout,
  Link2,
  Network,
  PanelLeft,
  Sparkles,
  Terminal,
  Wand2,
  Workflow,
} from "lucide-react"

type StarterTemplate = {
  id: string
  title: string
  subtitle: string
  tag: string
  photo: string
  tint: string
  prompt: string
}

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenWebsite?: () => void
  onOpenCode?: () => void
  onOpenBilling?: () => void
  onOpenCanvas?: () => void
  onOpenCommandCenter?: () => void
  onOpenSupport?: () => void
  onOpenCapabilities?: () => void
}

function MalikLogo({ className }: { className?: string }) {
  return (
    <span className={cn("creator-logo", className)}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="white" />
        <path d="M9 29 L22 15 L22 29 Z" fill="#03040a" />
        <path d="M24 15 H38 L24 29 Z" fill="#03040a" />
      </svg>
    </span>
  )
}

function QuickChip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="creator-chip">
      {children}
    </button>
  )
}

const TEMPLATE_COVER_FALLBACK = unsplashPhoto("photo-1565008576549-57569a49371d", 900)

function TemplateCover({ src, className, priority = "auto" }: { src: string; className?: string; priority?: "high" | "low" | "auto" }) {
  const [url, setUrl] = useState(src)
  return (
    <img
      src={url}
      alt=""
      className={className}
      loading={priority === "high" ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority}
      style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
      onError={() => {
        if (url !== TEMPLATE_COVER_FALLBACK) setUrl(TEMPLATE_COVER_FALLBACK)
      }}
    />
  )
}

function MalikHomeHero() {
  return (
    <section className="creator-hero" aria-label="Malik AI creator home">
      <MalikLogo />
      <p className="creator-brand">MALIK AI</p>
      <p className="creator-powered">POWERED BY SOVEREIGN</p>
      <div className="creator-badge">
        <Sparkles />
        <span>MALIK AI SOVEREIGN CREATOR HOME</span>
      </div>
      <h1 className="creator-title">
        <span className="creator-title-line">Создай продукт или сайт,</span>
        <span className="creator-title-line creator-title-grad">фото, видео, код — одним запросом</span>
      </h1>
      <p className="creator-subtitle">
        Один промпт превращает идею в сайт, код, фото, видео, саунды и многое другое — без шаблонов, плагинов и бесконечных рутин.
      </p>
    </section>
  )
}

function MalikHomeStatsRow() {
  const stats = [
    ["CREATOR ROUTES", "12+", "Активных направлений", <Network key="i" />],
    ["CANVAS READY", "100%", "Генерация без шаблонов", <CircleCheck key="i" />],
    ["MEDIA FLOW", "Live", "Реальное время", <Workflow key="i" />],
    ["RENDER GUARD", "On", "Без сбоев", <Hexagon key="i" />],
  ] as const

  return (
    <section className="creator-stats" aria-label="Creator stats">
      {stats.map(([label, value, detail, icon]) => (
        <div key={label} className="creator-stat-card">
          <div className="creator-card-icon">{icon}</div>
          <div>
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{detail}</span>
          </div>
        </div>
      ))}
    </section>
  )
}

function MalikHomePromptComposer({
  prompt,
  isLoading,
  onPromptChange,
  onSubmit,
  onOpenPhoto,
  onOpenWebsite,
  onOpenCanvas,
  onEnhance,
}: {
  prompt: string
  isLoading?: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onOpenPhoto?: () => void
  onOpenWebsite?: () => void
  onOpenCanvas?: () => void
  onEnhance: () => void
}) {
  return (
    <section className="creator-prompt" aria-label="Prompt composer">
      <textarea
        value={prompt}
        onFocus={prefetchChatShell}
        onChange={(event) => {
          if (event.target.value.trim()) prefetchChatShell()
          onPromptChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
        rows={1}
        placeholder="Опиши идею: сайт, фото, видео, код, компонент, dashboard, шаблон..."
      />
      <div className="creator-prompt-actions creator-prompt-toolbar">
        <div className="creator-prompt-tools">
          <button type="button" onClick={onOpenPhoto} className="creator-square-button" aria-label="Add image">
            <Image />
          </button>
          <button type="button" onClick={onOpenWebsite} className="creator-square-button" aria-label="Attach link">
            <Link2 />
          </button>
          <button type="button" onClick={onEnhance} className="creator-tool-button creator-tool-enhance">
            <Wand2 />
            <span>Enhance</span>
          </button>
          <button type="button" onClick={onOpenCanvas} className="creator-tool-button creator-tool-canvas">
            <PanelLeft />
            <span>Canvas</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!prompt.trim() || isLoading}
          className="creator-submit-button"
          aria-label="Отправить запрос"
        >
          <span>{isLoading ? "Генерация..." : "Отправить"}</span>
          <ArrowRight />
        </button>
      </div>
    </section>
  )
}

function MalikHomeQuickChips({ onSelect }: { onSelect: (value: string) => void }) {
  const chips = [
    ["AI Chat", <Sparkles key="i" />, "Создай полноценный AI Chat с историей диалогов, моделями, файлами и streaming"],
    ["CRM", <Grid3X3 key="i" />, "Создай CRM с клиентами, сделками, pipeline и задачами"],
    ["Интернет-магазин", <Layout key="i" />, "Создай интернет-магазин с каталогом, корзиной, checkout и профилем"],
    ["Analytics", <Code2 key="i" />, "Создай analytics dashboard с KPI, графиками, таблицами и фильтрами"],
    ["Photo gallery", <Image key="i" />, "Создай photo gallery"],
    ["Video studio", <Film key="i" />, "Создай video studio"],
  ] as const

  return (
    <section className="creator-chip-row creator-chips" aria-label="Prompt presets">
      {chips.map(([label, icon, value]) => (
        <QuickChip key={label} onClick={() => onSelect(value)}>
          {icon}
          <span>{label}</span>
        </QuickChip>
      ))}
    </section>
  )
}

function MalikHomeFeatureGrid({
  onOpenPhoto,
  onOpenVideo,
  onOpenWebsite,
  onOpenCode,
  onOpenTemplates,
  onOpenCodex,
}: Pick<MalikHybridHomeProps, "onOpenPhoto" | "onOpenVideo" | "onOpenWebsite" | "onOpenCode" | "onOpenTemplates" | "onOpenCodex">) {
  const cards = [
    ["Photo Studio", "AI image flow", <Image key="i" />, onOpenPhoto, "cyan"],
    ["Video Studio", "Cinematic creator", <Film key="i" />, onOpenVideo, "blue"],
    ["Website Builder", "Insert premium prompt", <Layout key="i" />, onOpenWebsite, "sky"],
    ["Code Generator", "Switch to code creation", <Code2 key="i" />, onOpenCode, "cyan"],
    ["Templates", "Open gallery", <Grid3X3 key="i" />, onOpenTemplates, "violet"],
    ["Malik Codex", "Open agent cockpit", <Terminal key="i" />, onOpenCodex, "purple"],
  ] as const

  return (
    <section className="creator-feature-grid" aria-label="Creator engines">
      {cards.map(([title, detail, icon, action, tone]) => (
        <button key={title} type="button" onClick={action} className={cn("creator-feature-card", `creator-feature-card-${tone}`)}>
          <span className="creator-feature-glow" />
          <span className="creator-feature-icon">{icon}</span>
          <span className="creator-feature-copy">
            <strong>{title}</strong>
            <span>{detail}</span>
          </span>
          <ArrowRight className="creator-feature-arrow" />
        </button>
      ))}
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")

  const submit = () => {
    const text = prompt.trim()
    if (!text || props.isLoading) return
    props.onSubmit(text)
    setPrompt("")
  }

  const runTemplate = (tpl: StarterTemplate) => {
    if (props.isLoading) return
    props.onSubmit(tpl.prompt)
    setPrompt("")
  }

  return (
    <main className="creator-home-main malik-hybrid-ui-layer">
      <MalikHomeHero />
      <MalikHomeStatsRow />
      <MalikHomePromptComposer
        prompt={prompt}
        isLoading={props.isLoading}
        onPromptChange={setPrompt}
        onSubmit={submit}
        onOpenPhoto={props.onOpenPhoto}
        onOpenWebsite={props.onOpenWebsite}
        onOpenCanvas={props.onOpenCanvas}
        onEnhance={() => setPrompt(`Сделай как premium Malik AI: ${prompt || "AI product"}`)}
      />
      <MalikHomeQuickChips onSelect={setPrompt} />
      <CapabilityHomeShowcase
        onSelectCapability={(capability: Capability) => setPrompt(renderCapabilityPrompt(capability, prompt))}
        onOpenCapabilities={props.onOpenCapabilities}
      />
      <MalikHomeFeatureGrid
        onOpenPhoto={props.onOpenPhoto}
        onOpenVideo={props.onOpenVideo}
        onOpenWebsite={props.onOpenWebsite}
        onOpenCode={props.onOpenCode}
        onOpenTemplates={props.onOpenTemplates}
        onOpenCodex={props.onOpenCodex}
      />

      <section className="creator-template-shelf" aria-label="Готовые шаблоны">
        <div className="creator-template-head">
          <div>
            <span className="creator-template-eyebrow">
              <Grid3X3 size={13} />
              Стартовые шаблоны
            </span>
            <h2 className="creator-template-title">Четыре рабочих сценария</h2>
          </div>
          <button type="button" className="creator-template-all" onClick={props.onOpenTemplates}>
            Все шаблоны
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="creator-template-grid">
          {HOME_STARTER_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="creator-template-card"
              onClick={() => runTemplate(tpl)}
              disabled={props.isLoading}
            >
              <div className="creator-template-photo" aria-hidden="true">
                <TemplateCover src={tpl.photo} className="creator-template-cover" priority="low" />
                <div className="creator-template-tint" style={{ background: tpl.tint }} />
                <span className="creator-template-tag">{tpl.tag}</span>
              </div>
              <div className="creator-template-body">
                <strong>{tpl.title}</strong>
                <p>{tpl.subtitle}</p>
                <span className="creator-template-cta">
                  Запустить
                  <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="creator-kazakh-shelf" aria-label="Казахстанские СМИ шаблоны">
        <div className="creator-template-head">
          <div>
            <span className="creator-template-eyebrow">
              <Film size={13} />
              Казахстанские СМИ
            </span>
            <h2 className="creator-template-title">30 медиа-шаблонов — листай вправо</h2>
          </div>
        </div>
        <div className="creator-kazakh-scroll">
          {KAZAKH_SMI_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="creator-kazakh-card"
              onClick={() => runTemplate(tpl)}
              disabled={props.isLoading}
            >
              <div className="creator-kazakh-media">
                <TemplateCover src={tpl.photo} className="creator-kazakh-photo" priority="low" />
                <div className="creator-template-tint" style={{ background: tpl.tint }} />
                <span className="creator-template-tag">{tpl.tag}</span>
              </div>
              <div className="creator-kazakh-body">
                <strong>{tpl.title}</strong>
                <p>{tpl.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
