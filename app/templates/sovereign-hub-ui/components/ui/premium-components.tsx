"use client"

import type { ReactNode } from "react"
import {
  ArrowRight,
  BarChart3,
  Check,
  Code2,
  CreditCard,
  Database,
  Film,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  Lock,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Wand2,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type PremiumSceneKind =
  | "chat"
  | "codex"
  | "photo"
  | "video"
  | "website"
  | "landing"
  | "code"
  | "dashboard"
  | "canvas"
  | "templates"
  | "design"
  | "billing"
  | "settings"
  | "security"
  | "analytics"
  | "commerce"
  | "mobile"
  | "document"
  | "presentation"
  | "support"
  | "default"

type PremiumSceneProps = {
  kind?: PremiumSceneKind | string
  title?: string
  subtitle?: string
  className?: string
  compact?: boolean
}

type PremiumHeroProps = {
  eyebrow: string
  title: string
  subtitle?: string
  kind?: PremiumSceneKind | string
  action?: ReactNode
  metrics?: Array<{ label: string; value: string }>
  className?: string
}

type PremiumActionCardProps = {
  title: string
  description: string
  meta?: string
  status?: string
  kind?: PremiumSceneKind | string
  icon?: ReactNode
  onClick?: () => void
  className?: string
}

export const premiumImagePool = [
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df0852?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=95",
  "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=95",
]

const kindMeta: Record<string, { image: string; accent: string; icon: ReactNode; label: string }> = {
  chat: { image: premiumImagePool[7], accent: "from-cyan-300 via-violet-300 to-fuchsia-300", icon: <Sparkles className="h-5 w-5" />, label: "AI conversation" },
  codex: { image: premiumImagePool[11], accent: "from-violet-300 via-cyan-300 to-emerald-300", icon: <Terminal className="h-5 w-5" />, label: "Agent cockpit" },
  photo: { image: premiumImagePool[0], accent: "from-cyan-200 via-sky-300 to-violet-300", icon: <ImageIcon className="h-5 w-5" />, label: "Photo studio" },
  video: { image: premiumImagePool[4], accent: "from-fuchsia-300 via-violet-300 to-cyan-300", icon: <Film className="h-5 w-5" />, label: "Video render" },
  website: { image: premiumImagePool[1], accent: "from-white via-cyan-200 to-violet-300", icon: <Wand2 className="h-5 w-5" />, label: "Website builder" },
  landing: { image: premiumImagePool[3], accent: "from-amber-200 via-white to-cyan-200", icon: <Layers3 className="h-5 w-5" />, label: "Landing engine" },
  code: { image: premiumImagePool[11], accent: "from-emerald-300 via-cyan-300 to-violet-300", icon: <Code2 className="h-5 w-5" />, label: "Code forge" },
  dashboard: { image: premiumImagePool[6], accent: "from-cyan-300 via-emerald-300 to-violet-300", icon: <LayoutDashboard className="h-5 w-5" />, label: "Dashboard" },
  canvas: { image: premiumImagePool[2], accent: "from-violet-300 via-fuchsia-300 to-cyan-300", icon: <Layers3 className="h-5 w-5" />, label: "Canvas" },
  templates: { image: premiumImagePool[2], accent: "from-cyan-200 via-violet-300 to-fuchsia-300", icon: <Layers3 className="h-5 w-5" />, label: "Template gallery" },
  design: { image: premiumImagePool[10], accent: "from-fuchsia-300 via-violet-300 to-cyan-300", icon: <Sparkles className="h-5 w-5" />, label: "Design system" },
  billing: { image: premiumImagePool[8], accent: "from-amber-200 via-violet-300 to-cyan-300", icon: <CreditCard className="h-5 w-5" />, label: "Billing" },
  settings: { image: premiumImagePool[9], accent: "from-cyan-200 via-white to-violet-300", icon: <Settings className="h-5 w-5" />, label: "Workspace" },
  security: { image: premiumImagePool[5], accent: "from-red-300 via-cyan-300 to-violet-300", icon: <ShieldCheck className="h-5 w-5" />, label: "Security" },
  analytics: { image: premiumImagePool[6], accent: "from-emerald-300 via-cyan-300 to-blue-300", icon: <BarChart3 className="h-5 w-5" />, label: "Analytics" },
  commerce: { image: premiumImagePool[8], accent: "from-amber-200 via-emerald-300 to-cyan-300", icon: <CreditCard className="h-5 w-5" />, label: "Commerce" },
  mobile: { image: premiumImagePool[7], accent: "from-violet-300 via-cyan-300 to-white", icon: <Zap className="h-5 w-5" />, label: "Mobile app" },
  document: { image: premiumImagePool[10], accent: "from-white via-cyan-200 to-violet-300", icon: <Database className="h-5 w-5" />, label: "Document AI" },
  presentation: { image: premiumImagePool[10], accent: "from-fuchsia-300 via-white to-cyan-300", icon: <Layers3 className="h-5 w-5" />, label: "Presentation" },
  support: { image: premiumImagePool[9], accent: "from-emerald-300 via-cyan-300 to-violet-300", icon: <ShieldCheck className="h-5 w-5" />, label: "Support" },
  default: { image: premiumImagePool[1], accent: "from-cyan-300 via-violet-300 to-fuchsia-300", icon: <Sparkles className="h-5 w-5" />, label: "Malik AI" },
}

export function resolvePremiumKind(value?: string): PremiumSceneKind {
  const normalized = (value || "").toLowerCase()
  if (normalized.includes("chat")) return "chat"
  if (normalized.includes("codex") || normalized.includes("agent")) return "codex"
  if (normalized.includes("photo") || normalized.includes("image")) return "photo"
  if (normalized.includes("video") || normalized.includes("film")) return "video"
  if (normalized.includes("website") || normalized.includes("web")) return "website"
  if (normalized.includes("landing")) return "landing"
  if (normalized.includes("portfolio")) return "website"
  if (normalized.includes("code") || normalized.includes("component") || normalized.includes("react")) return "code"
  if (normalized.includes("dashboard") || normalized.includes("admin")) return "dashboard"
  if (normalized.includes("canvas") || normalized.includes("preview")) return "canvas"
  if (normalized.includes("template")) return "templates"
  if (normalized.includes("design")) return "design"
  if (normalized.includes("billing") || normalized.includes("upgrade") || normalized.includes("credit")) return "billing"
  if (normalized.includes("settings") || normalized.includes("profile")) return "settings"
  if (normalized.includes("security") || normalized.includes("cyber")) return "security"
  if (normalized.includes("analytics") || normalized.includes("data") || normalized.includes("crm")) return "analytics"
  if (normalized.includes("commerce") || normalized.includes("shop") || normalized.includes("marketplace")) return "commerce"
  if (normalized.includes("mobile")) return "mobile"
  if (normalized.includes("media") || normalized.includes("blog")) return "video"
  if (normalized.includes("document") || normalized.includes("pdf") || normalized.includes("word")) return "document"
  if (normalized.includes("presentation") || normalized.includes("deck")) return "presentation"
  if (normalized.includes("support")) return "support"
  return "default"
}

function getMeta(kind?: PremiumSceneKind | string) {
  return kindMeta[resolvePremiumKind(String(kind || "default"))] || kindMeta.default
}

export function MalikMark({ className = "" }: { className?: string }) {
  return (
    <span className={cn("grid h-10 w-10 place-items-center rounded-2xl bg-white text-black shadow-[0_0_38px_rgba(255,255,255,.18)]", className)}>
      <svg viewBox="0 0 44 44" className="h-[72%] w-[72%]" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="white" />
        <path d="M9 29 L22 15 L22 29 Z" fill="#030303" />
        <path d="M24 15 H38 L24 29 Z" fill="#030303" />
      </svg>
    </span>
  )
}

export function RealVisualImage({ src, className = "" }: { src?: string; className?: string }) {
  if (!src) return null
  return <img src={src} alt="" loading="lazy" className={cn("absolute inset-0 h-full w-full object-cover", className)} />
}

function BrandBadge({ meta, className = "" }: { meta: ReturnType<typeof getMeta>; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/60 px-3 py-1.5 backdrop-blur-xl", className)}>
      <MalikMark className="h-7 w-7 rounded-xl" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">MALIK AI</span>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-gradient-to-r", meta.accent)} />
    </div>
  )
}

function SceneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative min-h-[220px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050507] shadow-[inset_0_0_80px_rgba(255,255,255,.035)]", className)}>
      {children}
    </div>
  )
}

function PhotoScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  const tiles = premiumImagePool.slice(0, compact ? 6 : 9)
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-70 saturate-150 contrast-125" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.24),transparent_24%),linear-gradient(to_bottom,rgba(0,0,0,.05),rgba(0,0,0,.82))]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative flex h-full min-h-[inherit] flex-col p-4">
        <div className="flex items-center justify-between">
          <BrandBadge meta={meta} />
          <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">image ready</span>
        </div>
        <div className={cn("mt-auto grid gap-2", compact ? "grid-cols-3" : "grid-cols-5")}>
          {tiles.map((src, index) => (
            <div key={`${src}-${index}`} className={cn("relative overflow-hidden rounded-2xl border border-white/10 bg-black/35", compact ? "h-12" : "h-20", index === 0 && !compact && "col-span-2 row-span-2 h-[168px]")}>
              <RealVisualImage src={src} className="opacity-95 saturate-150 transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/56 to-transparent" />
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  )
}

function VideoScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-78 saturate-150 contrast-125 animate-[premium-video-pan_6s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/60 via-violet-950/36 to-black/82" />
      <div className="absolute inset-x-5 top-5 rounded-[1.4rem] border border-white/12 bg-black/50 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <BrandBadge meta={meta} />
          <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[10px] font-black text-white/70">16:9</span>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white/30 bg-white/20 shadow-[0_0_64px_rgba(139,92,246,.38)]">
            <Play className="ml-1 h-7 w-7 fill-white text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Scene 04 · 00:12</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/12">
              <div className={cn("h-full w-2/3 rounded-full bg-gradient-to-r animate-pulse", meta.accent)} />
            </div>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="absolute bottom-5 left-5 right-5 grid grid-cols-6 gap-2">
          {premiumImagePool.slice(2, 8).map((src) => (
            <div key={src} className="relative h-16 overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              <RealVisualImage src={src} className="opacity-78 saturate-150" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          ))}
        </div>
      )}
    </SceneFrame>
  )
}

function CodeScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-20 saturate-150" />
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/28 via-black/72 to-cyan-950/30" />
      <div className="relative grid h-full min-h-[inherit] grid-cols-[92px_1fr] gap-3 p-4 font-mono text-xs">
        <div className="rounded-2xl border border-white/10 bg-black/50 p-3">
          {["app", "ui", "api", "lib", "deploy"].map((item, index) => (
            <div key={item} className="mb-3 flex items-center gap-2 text-white/55">
              <span className={cn("h-2 w-2 rounded-full", index === 1 ? "bg-cyan-300" : "bg-white/20")} />
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-cyan-300/14 bg-black/60 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-200" />
            <span className="font-black text-cyan-100">malik build --preview</span>
          </div>
          {Array.from({ length: compact ? 7 : 12 }).map((_, index) => (
            <div key={index} className="mb-3 h-2.5 rounded-full bg-gradient-to-r from-cyan-200/35 to-transparent" style={{ width: `${94 - index * 5}%` }} />
          ))}
        </div>
      </div>
    </SceneFrame>
  )
}

function WebsiteScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-22 saturate-125 contrast-110" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/58 to-cyan-950/30" />
      <div className="relative h-full min-h-[inherit] p-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
          <BrandBadge meta={meta} className="scale-90 origin-left" />
          <span className="h-7 w-20 rounded-full bg-white" />
        </div>
        <div className={cn("mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-5", compact ? "h-20" : "h-28")}>
          <div className="h-3 w-2/3 rounded-full bg-white/30" />
          <div className="mt-3 h-3 w-1/2 rounded-full bg-white/16" />
          <div className="mt-5 h-8 w-28 rounded-full bg-cyan-300/18" />
        </div>
        {!compact && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 rounded-2xl border border-white/10 bg-white/[0.055]" />
            ))}
          </div>
        )}
      </div>
    </SceneFrame>
  )
}

function DashboardScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-24 saturate-150 contrast-125" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-emerald-950/24 to-black/78" />
      <div className="relative grid h-full min-h-[inherit] grid-cols-[80px_1fr] gap-3 p-4">
        <div className="rounded-2xl border border-white/10 bg-black/52 p-2">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className={cn("mb-2 h-7 rounded-xl", index === 0 ? "bg-cyan-300/24" : "bg-white/8")} />)}
        </div>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <div className="flex items-center justify-between">
              <div className="h-2 w-28 rounded-full bg-white/25" />
              <div className="h-5 w-16 rounded-full bg-emerald-300/20" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-2xl border border-white/10 bg-gradient-to-t from-cyan-300/18 to-white/8" />)}
          </div>
          {!compact && <div className="h-16 rounded-2xl border border-white/10 bg-white/[0.055]" />}
        </div>
      </div>
    </SceneFrame>
  )
}

function ProfileScene({ meta, compact }: { meta: ReturnType<typeof getMeta>; compact?: boolean }) {
  return (
    <SceneFrame className={compact ? "min-h-[170px]" : "min-h-[280px]"}>
      <RealVisualImage src={meta.image} className="opacity-34 saturate-125 contrast-110" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/68 via-black/78 to-violet-950/24" />
      <div className="relative flex h-full min-h-[inherit] items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-[1.7rem] border border-white/10 bg-black/60 p-5 text-center backdrop-blur-xl">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.7rem] bg-gradient-to-br from-cyan-300 to-violet-400 text-black shadow-[0_0_60px_rgba(139,92,246,.25)]">
            {meta.label === "Billing" ? <CreditCard className="h-8 w-8" /> : meta.label === "Workspace" ? <User className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
          </div>
          <p className="mt-5 text-xl font-black text-white">{meta.label}</p>
          <p className="mt-2 text-sm text-white/45">Secure local controls · no dead buttons</p>
          {!compact && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {["safe", "ready", "pro"].map((item) => <span key={item} className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-black text-white/55">{item}</span>)}
            </div>
          )}
        </div>
      </div>
    </SceneFrame>
  )
}

export function PremiumScene({ kind = "default", title, subtitle, className = "", compact }: PremiumSceneProps) {
  const meta = getMeta(kind)
  const resolved = resolvePremiumKind(String(kind))

  const content =
    resolved === "photo" ? <PhotoScene meta={meta} compact={compact} /> :
    resolved === "video" ? <VideoScene meta={meta} compact={compact} /> :
    resolved === "code" || resolved === "codex" || resolved === "chat" ? <CodeScene meta={meta} compact={compact} /> :
    resolved === "website" || resolved === "landing" || resolved === "templates" || resolved === "canvas" ? <WebsiteScene meta={meta} compact={compact} /> :
    resolved === "dashboard" || resolved === "analytics" || resolved === "design" ? <DashboardScene meta={meta} compact={compact} /> :
    resolved === "billing" || resolved === "settings" || resolved === "support" ? <ProfileScene meta={meta} compact={compact} /> :
    <WebsiteScene meta={meta} compact={compact} />

  return (
    <div className={cn("group relative", className)}>
      {content}
      {(title || subtitle) && (
        <div className="mt-4">
          {title && <h3 className="text-xl font-black text-white">{title}</h3>}
          {subtitle && <p className="mt-2 text-sm leading-6 text-zinc-500">{subtitle}</p>}
        </div>
      )}
    </div>
  )
}

export function PremiumHero({ eyebrow, title, subtitle, kind = "default", action, metrics, className = "" }: PremiumHeroProps) {
  const meta = getMeta(kind)
  return (
    <section className={cn("relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_90px_rgba(0,0,0,.34)] backdrop-blur-2xl", className)}>
      <RealVisualImage src={meta.image} className="opacity-16 saturate-150 contrast-125" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,.10),transparent_24%),linear-gradient(to_bottom,rgba(0,0,0,.18),rgba(0,0,0,.76))]" />
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", meta.accent)} />
      <div className="relative grid gap-6 xl:grid-cols-[1fr_420px] xl:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white/80">
            {meta.icon}
            {eyebrow}
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-white md:text-5xl">{title}</h1>
          {subtitle && <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>}
          {metrics?.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {metrics.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/38 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{item.label}</p>
                  <p className="mt-1 text-lg font-black text-white">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="hidden xl:block">
          <PremiumScene kind={kind} compact />
        </div>
        {action && <div className="relative xl:absolute xl:bottom-6 xl:right-6">{action}</div>}
      </div>
    </section>
  )
}

export function PremiumActionCard({ title, description, meta, status = "connected", kind = "default", icon, onClick, className = "" }: PremiumActionCardProps) {
  const visual = getMeta(kind)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group overflow-hidden rounded-[2rem] border border-white/10 bg-[#070709] p-3 text-left shadow-[0_20px_70px_rgba(0,0,0,.30)] transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055]", className)}
    >
      <PremiumScene kind={kind} compact />
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
            {icon || visual.icon}
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-black text-zinc-300">{status}</span>
        </div>
        <h3 className="mt-5 text-xl font-black text-white">{title}</h3>
        <p className="mt-3 min-h-[60px] text-sm leading-6 text-zinc-500">{description}</p>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs font-bold text-zinc-500">
          <span className="truncate">{meta}</span>
          <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1 group-hover:text-white" />
        </div>
      </div>
    </button>
  )
}

export function PremiumStatGrid({ items }: { items: Array<{ label: string; value: string; icon?: ReactNode }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-violet-200">{item.icon || <Sparkles className="h-5 w-5" />}</div>
            <Check className="h-4 w-4 text-emerald-300" />
          </div>
          <p className="mt-4 text-3xl font-black text-white">{item.value}</p>
          <p className="mt-1 text-sm text-zinc-500">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

export function PremiumCss() {
  return (
    <style>{`
      @keyframes premium-video-pan {
        0%, 100% { transform: scale(1) translate3d(0,0,0); filter: hue-rotate(0deg); }
        50% { transform: scale(1.08) translate3d(-12px,8px,0); filter: hue-rotate(16deg); }
      }
    `}</style>
  )
}

