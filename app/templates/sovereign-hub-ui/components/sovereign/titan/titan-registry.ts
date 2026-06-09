export type TitanTone = "cyan" | "violet" | "blue" | "emerald" | "amber" | "rose" | "gold" | "red"
export type TitanViewGroup = "core" | "creator" | "build" | "workspace" | "system"

export type TitanViewId =
  | "home"
  | "final-intelligence"
  | "unbreakable-ai"
  | "command-center"
  | "capabilities"
  | "business-command-center"
  | "media-newsroom"
  | "search"
  | "ai-generator"
  | "photo-generation"
  | "video-generation"
  | "website-generation"
  | "code-generation"
  | "component-generation"
  | "landing-generation"
  | "dashboard-generation"
  | "document-generation"
  | "presentation-generation"
  | "template-generation"
  | "projects"
  | "chats"
  | "analytics"
  | "notifications"
  | "design"
  | "templates"
  | "settings"
  | "billing"
  | "support"

export type TitanViewMeta = {
  id: TitanViewId
  label: string
  eyebrow: string
  description: string
  tone: TitanTone
  group: TitanViewGroup
  primaryAction: string
  secondaryAction: string
  gradient: string
}

function meta(
  id: TitanViewId,
  label: string,
  eyebrow: string,
  description: string,
  tone: TitanTone,
  group: TitanViewGroup,
  primaryAction: string,
  secondaryAction: string,
  gradient: string,
): TitanViewMeta {
  return { id, label, eyebrow, description, tone, group, primaryAction, secondaryAction, gradient }
}

export const TITAN_VIEW_REGISTRY: Record<TitanViewId, TitanViewMeta> = {
  home: meta("home", "Панель управления", "Sovereign Home", "Chat-first mission control for MALIK AI V6.5 TITAN.", "violet", "core", "Create", "Open command", "from-violet-400 via-cyan-300 to-blue-400"),
  "final-intelligence": meta("final-intelligence", "Final Intelligence", "AI Brain", "Intent router, model brain, launch cockpit and investor-ready reasoning layer.", "cyan", "core", "Launch brain", "Open Codex", "from-cyan-300 via-blue-400 to-violet-400"),
  "unbreakable-ai": meta("unbreakable-ai", "Unbreakable AI", "Fallback Shield", "Retries, failover, guardrails, rate limits and safe public demo behavior.", "emerald", "core", "Open shield", "View signals", "from-emerald-300 via-cyan-300 to-blue-400"),
  "command-center": meta("command-center", "Command Center", "Founder Control Room", "Agent actions, mission telemetry, execution routes and launch operations.", "amber", "core", "Open mission", "View routes", "from-amber-300 via-orange-400 to-violet-400"),
  capabilities: meta("capabilities", "Capabilities", "AI Abilities", "Practical AI modes across product, business, media, code and strategy.", "cyan", "core", "Use ability", "Open search", "from-cyan-300 via-blue-400 to-violet-400"),
  "business-command-center": meta("business-command-center", "Business Command Center", "Business AI", "Founder tools for growth, strategy, sales, ops, finance and execution.", "emerald", "core", "Build plan", "Open analytics", "from-emerald-300 via-teal-300 to-cyan-400"),
  "media-newsroom": meta("media-newsroom", "Newsroom Studio", "Media Lab", "News, fact-check, press, scripts, broadcast and KZ/RU/EN newsroom flow.", "blue", "core", "Create story", "Fact-check", "from-blue-300 via-cyan-300 to-violet-400"),
  search: meta("search", "Глобальный поиск", "Command Router", "Global command surface for views, chats, projects, templates and actions.", "blue", "core", "Search", "Open routes", "from-blue-300 via-cyan-300 to-sky-400"),
  "ai-generator": meta("ai-generator", "AI Генератор", "Creator Engine", "Unified text, code, image, video, website and document generation flow.", "violet", "creator", "Generate", "Enhance prompt", "from-violet-300 via-fuchsia-300 to-cyan-300"),
  "photo-generation": meta("photo-generation", "Photo Generation", "Vision Studio", "Image creation, visual direction, style presets and gallery-ready outputs.", "cyan", "creator", "Generate image", "Open presets", "from-cyan-300 via-blue-400 to-violet-400"),
  "video-generation": meta("video-generation", "Video Generation", "Cinema Pipeline", "Storyboard, motion, render states, provider flow and cinematic output.", "rose", "creator", "Generate video", "Open storyboard", "from-rose-300 via-fuchsia-400 to-violet-400"),
  "website-generation": meta("website-generation", "Website Builder", "Site Factory", "Landing pages, premium sections, preview and deploy-ready UI.", "emerald", "creator", "Build site", "Open preview", "from-emerald-300 via-cyan-300 to-blue-400"),
  "code-generation": meta("code-generation", "Code Generator", "MALIK Codex", "Code generation, debugging, patches, architecture and safe edits.", "amber", "creator", "Generate code", "Open Codex", "from-amber-300 via-orange-400 to-cyan-300"),
  "component-generation": meta("component-generation", "Component Forge", "UI Components", "Reusable TSX blocks, sections, widgets, cards and design primitives.", "cyan", "build", "Forge component", "Open system", "from-cyan-300 via-sky-400 to-violet-400"),
  "landing-generation": meta("landing-generation", "Landing Studio", "Launch Pages", "Hero sections, CTAs, waitlists, product pages and founder-ready websites.", "emerald", "build", "Create landing", "Open templates", "from-emerald-300 via-cyan-300 to-blue-400"),
  "dashboard-generation": meta("dashboard-generation", "Dashboard Builder", "KPI Cockpit", "Analytics dashboards, SaaS cockpits, operator panels and executive views.", "blue", "build", "Build dashboard", "Open data", "from-blue-300 via-cyan-300 to-violet-400"),
  "document-generation": meta("document-generation", "Document Studio", "Docs Engine", "PRDs, reports, briefs, legal drafts, strategy docs and export-ready content.", "amber", "build", "Create document", "Open templates", "from-amber-300 via-orange-300 to-violet-400"),
  "presentation-generation": meta("presentation-generation", "Pitch Deck Studio", "Investor Deck", "Pitch slides, demo story, speaker flow and Digital Bridge presentation polish.", "rose", "build", "Create deck", "Open script", "from-rose-300 via-fuchsia-300 to-amber-300"),
  "template-generation": meta("template-generation", "Template Generator", "Launch Kits", "Reusable templates for startup pages, dashboards, cards and workflows.", "violet", "build", "Generate kit", "Open library", "from-violet-300 via-fuchsia-300 to-cyan-300"),
  projects: meta("projects", "Проекты", "Workspace", "Project memory, active builds, artifacts, status and execution history.", "blue", "workspace", "New project", "Open recent", "from-blue-300 via-cyan-300 to-violet-400"),
  chats: meta("chats", "Нейро-диалоги", "Chat Memory", "Saved conversations, pinned sessions, chat history and AI context.", "violet", "workspace", "New chat", "Open pinned", "from-violet-300 via-cyan-300 to-blue-400"),
  analytics: meta("analytics", "Аналитика", "Telemetry", "Usage, growth, runtime, provider cost, queue and product metrics.", "blue", "workspace", "Generate report", "View signals", "from-blue-300 via-sky-400 to-cyan-300"),
  notifications: meta("notifications", "Сигналы", "Runtime Signals", "Alerts, provider health, generation states, warnings and release events.", "amber", "workspace", "Open alerts", "Support", "from-amber-300 via-orange-400 to-cyan-300"),
  design: meta("design", "Дизайн системы", "Design OS", "Tokens, colors, typography, components and visual language for MALIK AI.", "cyan", "workspace", "Open tokens", "View components", "from-cyan-300 via-blue-400 to-violet-400"),
  templates: meta("templates", "Библиотека шаблонов", "Template Library", "Reusable launch templates, generator presets and demo-ready kits.", "emerald", "workspace", "Open library", "Generate kit", "from-emerald-300 via-cyan-300 to-violet-400"),
  settings: meta("settings", "Настройки профиля", "Profile", "Account, access, preferences, identity and workspace settings.", "violet", "system", "Save settings", "Security", "from-violet-300 via-cyan-300 to-blue-400"),
  billing: meta("billing", "Подписка и биллинг", "Billing", "Plan, limits, invoices, payments and upgrade path.", "blue", "system", "Upgrade", "View plan", "from-blue-300 via-cyan-300 to-violet-400"),
  support: meta("support", "Поддержка 24/7", "Support", "Help center, status, tickets, contact and product guidance.", "emerald", "system", "Ask support", "System status", "from-emerald-300 via-cyan-300 to-blue-400"),
}

export const TITAN_VIEW_IDS = Object.keys(TITAN_VIEW_REGISTRY) as TitanViewId[]

export function isTitanViewId(value: string): value is TitanViewId {
  return value in TITAN_VIEW_REGISTRY
}

export function getTitanViewMeta(id?: string): TitanViewMeta {
  return TITAN_VIEW_REGISTRY[(id || "home") as TitanViewId] || TITAN_VIEW_REGISTRY.home
}

export function getTitanTone(id?: string): TitanTone {
  return getTitanViewMeta(id).tone
}

export function getTitanToneClass(tone: TitanTone = "violet") {
  return {
    cyan: "malik-titan-tone-cyan",
    violet: "malik-titan-tone-violet",
    blue: "malik-titan-tone-blue",
    emerald: "malik-titan-tone-emerald",
    amber: "malik-titan-tone-amber",
    rose: "malik-titan-tone-rose",
    gold: "malik-titan-tone-gold",
    red: "malik-titan-tone-red",
  }[tone]
}
