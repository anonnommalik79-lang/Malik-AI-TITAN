"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  Eye,
  Factory,
  Filter,
  Gauge,
  Globe2,
  GraduationCap,
  Grid3X3,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  Layers3,
  LockKeyhole,
  Megaphone,
  MessageSquare,
  MonitorSmartphone,
  PanelRightOpen,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TerminalSquare,
  Video,
  Wand2,
  Zap,
} from "lucide-react"
import { PremiumCss, PremiumHero, PremiumScene, resolvePremiumKind } from "../../ui/premium-components"

type TemplateKind =
  | "dashboard"
  | "landing"
  | "chat"
  | "photo"
  | "video"
  | "code"
  | "portfolio"
  | "commerce"
  | "admin"
  | "security"
  | "crm"
  | "analytics"
  | "mobile"
  | "media"
  | "marketplace"
  | "agent"
  | "investor"
  | "clinic"
  | "finance"
  | "education"
  | "events"
  | "real-estate"
  | "devtools"
  | "docs"
  | "automation"
  | "social"

type TemplateTier = "Launch" | "Scale" | "Enterprise" | "Investor"
type TemplateComplexity = "Starter" | "Pro" | "Titan"

type TemplateItem = {
  id: string
  title: string
  category: string
  description: string
  tags: string[]
  kind: TemplateKind
  prompt: string
  tier: TemplateTier
  impact: string
  stage: string
  complexity: TemplateComplexity
  artifact: "Page" | "Dashboard" | "Studio" | "Workflow" | "Deck" | "System"
  signals: Array<[string, string]>
}

type TemplateGalleryPanelProps = {
  onSendToCanvas?: (code: string) => void
  onUseTemplate?: (prompt: string) => void
}

type TemplatePreviewCardProps = TemplateGalleryPanelProps & {
  template: TemplateItem
  onStatus?: (message: string) => void
}

const categoryIcons: Record<string, typeof LayoutDashboard> = {
  Dashboard: LayoutDashboard,
  Website: Globe2,
  AI: Bot,
  Generation: Sparkles,
  Code: Code2,
  Commerce: ShoppingBag,
  Admin: LockKeyhole,
  Security: ShieldCheck,
  Business: Briefcase,
  Data: BarChart3,
  Mobile: MonitorSmartphone,
  Media: Megaphone,
  Marketplace: Grid3X3,
  Investor: Rocket,
  Healthcare: HeartPulse,
  Finance: Database,
  Education: GraduationCap,
  Events: Megaphone,
  RealEstate: Building2,
  Automation: Factory,
}

const titanSignals = [
  ["Canvas", "instant"],
  ["Responsive", "ready"],
  ["Pitch", "clean"],
  ["Fallback", "safe"],
] as const

const templateItems: TemplateItem[] = [
  {
    id: "saas-dashboard",
    title: "SaaS Command Dashboard",
    category: "Dashboard",
    description: "Executive metrics, revenue intelligence, AI usage, ops feed and board-level command cards.",
    tags: ["SaaS", "Charts", "Admin", "Revenue"],
    kind: "dashboard",
    prompt: "Create a premium dark SaaS dashboard with executive metrics, revenue charts, AI activity, team controls, alerts and command center.",
    tier: "Scale",
    impact: "Board-ready product proof",
    stage: "Demo / investor call",
    complexity: "Titan",
    artifact: "Dashboard",
    signals: [["KPI", "12"], ["Sections", "8"], ["Trust", "High"]],
  },
  {
    id: "landing-page",
    title: "AI Startup Landing",
    category: "Website",
    description: "High-converting launch page with hero, benefits, pricing, proof, FAQ and investor CTA.",
    tags: ["Landing", "CTA", "Premium", "Waitlist"],
    kind: "landing",
    prompt: "Create a premium AI SaaS landing page with hero, product sections, pricing, trust proof, FAQ and launch CTA.",
    tier: "Launch",
    impact: "First impression upgrade",
    stage: "Public website",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Hero", "Sharp"], ["CTA", "2"], ["SEO", "On"]],
  },
  {
    id: "ai-chat",
    title: "AI Chat Workbench",
    category: "AI",
    description: "Assistant workspace with threaded chat, tool calls, model chips, attachments and right preview panel.",
    tags: ["Chat", "Agent", "Tools", "Canvas"],
    kind: "chat",
    prompt: "Create an AI chat workspace with message stream, tool buttons, composer, file attachments, model switcher and right preview panel.",
    tier: "Enterprise",
    impact: "Product core feels real",
    stage: "App shell",
    complexity: "Titan",
    artifact: "Studio",
    signals: [["Composer", "Pro"], ["Tools", "16"], ["Canvas", "Yes"]],
  },
  {
    id: "photo-generator",
    title: "Vision Studio",
    category: "Generation",
    description: "Prompt, style controls, aspect ratio, quality rails, result grid and gallery actions.",
    tags: ["Photo", "Gallery", "Prompt", "Vision"],
    kind: "photo",
    prompt: "Create a photo generation panel with prompt input, style selector, size selector, quality controls, loading state and result grid.",
    tier: "Scale",
    impact: "Visual engine surface",
    stage: "Creator flow",
    complexity: "Pro",
    artifact: "Studio",
    signals: [["Styles", "34"], ["Grid", "8"], ["Quality", "Ultra"]],
  },
  {
    id: "video-studio",
    title: "Cinema Render Studio",
    category: "Generation",
    description: "Storyboard timeline, motion prompts, scene cards, render queue, video player and delivery actions.",
    tags: ["Video", "Timeline", "Render", "Storyboard"],
    kind: "video",
    prompt: "Create a video studio dashboard with storyboard timeline, render queue, prompt controls, preview player and cinematic export actions.",
    tier: "Enterprise",
    impact: "Demo-stage wow screen",
    stage: "Media generation",
    complexity: "Titan",
    artifact: "Studio",
    signals: [["Scenes", "6"], ["Queue", "Live"], ["Format", "16:9"]],
  },
  {
    id: "code-generator",
    title: "Code Forge IDE",
    category: "Code",
    description: "Prompt-to-code cockpit with files, editor, logs, preview, AI hints and deploy checks.",
    tags: ["Code", "Files", "Preview", "IDE"],
    kind: "code",
    prompt: "Create a code generator interface with file explorer, code editor, terminal logs, AI hints and live preview panel.",
    tier: "Enterprise",
    impact: "Codex-like proof",
    stage: "Build workflow",
    complexity: "Titan",
    artifact: "System",
    signals: [["Files", "28"], ["Build", "Pass"], ["Logs", "Live"]],
  },
  {
    id: "portfolio",
    title: "Founder Portfolio Pro",
    category: "Website",
    description: "Creator profile, cinematic case studies, proof blocks and contact CTA for a technical founder.",
    tags: ["Portfolio", "Creator", "Work", "Founder"],
    kind: "portfolio",
    prompt: "Create a premium founder portfolio website with hero, case studies, testimonials, technical stack and contact CTA.",
    tier: "Launch",
    impact: "Personal brand lift",
    stage: "Founder profile",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Cases", "6"], ["Brand", "Sharp"], ["Contact", "On"]],
  },
  {
    id: "ecommerce",
    title: "Luxury Commerce OS",
    category: "Commerce",
    description: "Product grid, checkout preview, inventory intelligence, order metrics and conversion sections.",
    tags: ["Shop", "Products", "Checkout", "Inventory"],
    kind: "commerce",
    prompt: "Create a dark premium e-commerce storefront with product grid, cart summary, inventory signals and checkout CTA.",
    tier: "Scale",
    impact: "Commercial surface",
    stage: "Store launch",
    complexity: "Pro",
    artifact: "Page",
    signals: [["SKUs", "42"], ["Cart", "Ready"], ["CVR", "+18%"]],
  },
  {
    id: "admin-panel",
    title: "Admin Control Panel",
    category: "Admin",
    description: "Users, roles, permissions, system health, moderation and operational controls.",
    tags: ["Admin", "Users", "Ops", "Roles"],
    kind: "admin",
    prompt: "Create an admin panel with user table, permissions, system health, moderation queue and action controls.",
    tier: "Enterprise",
    impact: "Operations credibility",
    stage: "Internal tooling",
    complexity: "Titan",
    artifact: "Dashboard",
    signals: [["Users", "12k"], ["Roles", "5"], ["Audit", "On"]],
  },
  {
    id: "cyber-security",
    title: "Cyber Defense Center",
    category: "Security",
    description: "Threat timeline, risk score, incident response, policy controls and live infrastructure map.",
    tags: ["Security", "Threats", "Risk", "SOC"],
    kind: "security",
    prompt: "Create a cyber security dashboard with threat feed, risk score, incidents, response actions and live system map.",
    tier: "Enterprise",
    impact: "Trust and safety proof",
    stage: "Security demo",
    complexity: "Titan",
    artifact: "Dashboard",
    signals: [["Risk", "Low"], ["Incidents", "3"], ["Guard", "Live"]],
  },
  {
    id: "crm",
    title: "CRM Revenue Pipeline",
    category: "Business",
    description: "Deals, leads, customer signals, team follow-ups, forecast and close probability.",
    tags: ["CRM", "Sales", "Pipeline", "Deals"],
    kind: "crm",
    prompt: "Create a CRM dashboard with sales pipeline, customer cards, tasks, forecasts and deal analytics.",
    tier: "Scale",
    impact: "Business model screen",
    stage: "Sales ops",
    complexity: "Pro",
    artifact: "Dashboard",
    signals: [["Deals", "42"], ["Forecast", "$1.2M"], ["Tasks", "18"]],
  },
  {
    id: "analytics",
    title: "Analytics Intelligence",
    category: "Data",
    description: "KPI grid, trend blocks, conversion intelligence, segments, cohorts and anomaly alerts.",
    tags: ["Analytics", "KPI", "Data", "Cohorts"],
    kind: "analytics",
    prompt: "Create an analytics dashboard with KPI cards, trend charts, segments, conversion insights, cohorts and anomaly alerts.",
    tier: "Enterprise",
    impact: "Data credibility",
    stage: "Product analytics",
    complexity: "Titan",
    artifact: "Dashboard",
    signals: [["KPI", "16"], ["Cohorts", "8"], ["Alerts", "On"]],
  },
  {
    id: "mobile-app",
    title: "Mobile AI App",
    category: "Mobile",
    description: "Phone-like AI app screen with bottom tabs, chat, cards, compact controls and upgrade CTA.",
    tags: ["Mobile", "App", "Tabs", "Compact"],
    kind: "mobile",
    prompt: "Create a mobile AI app interface with bottom tabs, chat, cards, compact controls and premium upgrade CTA.",
    tier: "Launch",
    impact: "Mobile readiness",
    stage: "App preview",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Tabs", "5"], ["Screen", "iPhone"], ["CTA", "Pro"]],
  },
  {
    id: "blog-media",
    title: "Media Command Page",
    category: "Media",
    description: "Editorial layout, featured story, article grid, author cards, newsletter and content intelligence.",
    tags: ["Blog", "Media", "Editorial", "Newsletter"],
    kind: "media",
    prompt: "Create a media/blog layout with featured story, article grid, author cards, content categories and newsletter CTA.",
    tier: "Launch",
    impact: "Content engine",
    stage: "Publication",
    complexity: "Starter",
    artifact: "Page",
    signals: [["Articles", "24"], ["Authors", "4"], ["SEO", "Ready"]],
  },
  {
    id: "marketplace",
    title: "AI Marketplace",
    category: "Marketplace",
    description: "App tiles, filters, ratings, featured integrations, install actions and creator monetization.",
    tags: ["Marketplace", "Apps", "Integrations", "Ratings"],
    kind: "marketplace",
    prompt: "Create a marketplace page with app tiles, filters, featured integrations, ratings and install actions.",
    tier: "Scale",
    impact: "Ecosystem story",
    stage: "Platform expansion",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Apps", "120"], ["Rating", "4.9"], ["Install", "1-click"]],
  },
  {
    id: "agent-factory",
    title: "Agent Factory",
    category: "AI",
    description: "Autonomous agent board with task routing, tool permissions, memory, queue and handoff states.",
    tags: ["Agents", "Workflow", "Memory", "Tools"],
    kind: "agent",
    prompt: "Create an autonomous AI agent factory with task routing, memory, tool permissions, queue, status and handoff controls.",
    tier: "Enterprise",
    impact: "Autonomy proof",
    stage: "Agent demo",
    complexity: "Titan",
    artifact: "Workflow",
    signals: [["Agents", "18"], ["Tools", "36"], ["Queue", "Live"]],
  },
  {
    id: "investor-deck",
    title: "Investor Pitch Deck",
    category: "Investor",
    description: "Problem, solution, market, product, traction-safe placeholders, roadmap, business model and ask.",
    tags: ["Deck", "Investor", "Roadmap", "Business"],
    kind: "investor",
    prompt: "Create an investor pitch deck for an early-stage AI SaaS with problem, solution, market, product, roadmap and business model. Do not invent fake traction.",
    tier: "Investor",
    impact: "Pitch room readiness",
    stage: "Investor meeting",
    complexity: "Titan",
    artifact: "Deck",
    signals: [["Slides", "10"], ["Claims", "Safe"], ["Ask", "Clear"]],
  },
  {
    id: "clinic-system",
    title: "Clinic AI Front Desk",
    category: "Healthcare",
    description: "Clinic service page, doctors, appointment CTA, trust blocks and patient intake flow.",
    tags: ["Clinic", "Doctors", "Booking", "Trust"],
    kind: "clinic",
    prompt: "Create a premium medical clinic page with services, doctors, booking CTA, patient trust blocks and intake flow.",
    tier: "Scale",
    impact: "Healthcare vertical",
    stage: "Client proposal",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Doctors", "8"], ["Booking", "Ready"], ["Trust", "High"]],
  },
  {
    id: "fintech-os",
    title: "Fintech Risk OS",
    category: "Finance",
    description: "Financial dashboard with risk, compliance, customer segments, transaction signals and audit-ready UI.",
    tags: ["Fintech", "Risk", "Compliance", "Finance"],
    kind: "finance",
    prompt: "Create a fintech risk dashboard with compliance status, transaction signals, customer segments and audit-ready controls.",
    tier: "Enterprise",
    impact: "Enterprise vertical",
    stage: "B2B demo",
    complexity: "Titan",
    artifact: "Dashboard",
    signals: [["Risk", "12"], ["Audit", "On"], ["SLA", "99.9"]],
  },
  {
    id: "education-platform",
    title: "AI Education Platform",
    category: "Education",
    description: "Course dashboard, lessons, student progress, AI tutor, certificates and payment-ready layout.",
    tags: ["Education", "Courses", "Tutor", "Progress"],
    kind: "education",
    prompt: "Create an AI education platform with course cards, lesson progress, AI tutor panel, certificates and payment-ready sections.",
    tier: "Scale",
    impact: "EdTech vertical",
    stage: "MVP proposal",
    complexity: "Pro",
    artifact: "Dashboard",
    signals: [["Courses", "14"], ["Progress", "Live"], ["Tutor", "AI"]],
  },
  {
    id: "event-platform",
    title: "Conference Event OS",
    category: "Events",
    description: "Agenda, speakers, stages, registration, sponsors and live event command center.",
    tags: ["Events", "Conference", "Agenda", "Speakers"],
    kind: "events",
    prompt: "Create a conference event platform with agenda, speakers, stage schedule, registration CTA and sponsor blocks.",
    tier: "Launch",
    impact: "Event-ready site",
    stage: "Conference launch",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Speakers", "24"], ["Stages", "3"], ["Reg", "Open"]],
  },
  {
    id: "real-estate-luxe",
    title: "Real Estate Luxe",
    category: "RealEstate",
    description: "Luxury listing page with properties, filters, map preview, agent profile and lead capture.",
    tags: ["Real Estate", "Luxury", "Listings", "Map"],
    kind: "real-estate",
    prompt: "Create a luxury real estate website with property listings, filters, map preview, agent profile and lead capture CTA.",
    tier: "Scale",
    impact: "High-ticket vertical",
    stage: "Client demo",
    complexity: "Pro",
    artifact: "Page",
    signals: [["Listings", "64"], ["Map", "On"], ["Leads", "+22%"]],
  },
  {
    id: "devtools-platform",
    title: "Developer Tools Portal",
    category: "Code",
    description: "Docs, API keys, SDK cards, usage analytics, logs and developer onboarding.",
    tags: ["DevTools", "API", "SDK", "Docs"],
    kind: "devtools",
    prompt: "Create a developer tools portal with API docs, SDK cards, API keys, usage analytics, logs and onboarding checklist.",
    tier: "Enterprise",
    impact: "Platform maturity",
    stage: "Developer launch",
    complexity: "Titan",
    artifact: "System",
    signals: [["SDK", "6"], ["Keys", "Safe"], ["Docs", "Ready"]],
  },
  {
    id: "documentation-hub",
    title: "Documentation Hub",
    category: "Code",
    description: "Clean documentation portal with search, navigation, snippets, guides and API references.",
    tags: ["Docs", "Search", "Guides", "API"],
    kind: "docs",
    prompt: "Create a documentation hub with sidebar navigation, search, code snippets, quickstart guides and API references.",
    tier: "Launch",
    impact: "Developer trust",
    stage: "Docs launch",
    complexity: "Pro",
    artifact: "System",
    signals: [["Guides", "18"], ["Search", "Ready"], ["API", "Ref"]],
  },
  {
    id: "automation-control",
    title: "Automation Control Room",
    category: "Automation",
    description: "Workflow builder, triggers, actions, logs, approvals and reliability score.",
    tags: ["Automation", "Workflows", "Triggers", "Logs"],
    kind: "automation",
    prompt: "Create an automation control room with workflow builder, triggers, actions, logs, approvals and reliability score.",
    tier: "Enterprise",
    impact: "B2B automation proof",
    stage: "Ops platform",
    complexity: "Titan",
    artifact: "Workflow",
    signals: [["Flows", "32"], ["Runs", "1.2k"], ["Reliability", "99%"]],
  },
  {
    id: "social-studio",
    title: "Social Content Studio",
    category: "Media",
    description: "Content calendar, post generator, analytics, brand voice and multi-channel queue.",
    tags: ["Social", "Content", "Calendar", "Brand"],
    kind: "social",
    prompt: "Create a social content studio with content calendar, post generator, analytics, brand voice controls and multi-channel queue.",
    tier: "Scale",
    impact: "Marketing engine",
    stage: "Content ops",
    complexity: "Pro",
    artifact: "Studio",
    signals: [["Posts", "80"], ["Channels", "5"], ["Voice", "Locked"]],
  },
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function templateTone(template: TemplateItem) {
  if (["Security", "Admin", "Finance", "Automation"].includes(template.category)) return "emerald"
  if (["Generation", "Media", "AI"].includes(template.category)) return "violet"
  if (["Investor", "Business", "Commerce"].includes(template.category)) return "amber"
  if (["Healthcare"].includes(template.category)) return "rose"
  return "cyan"
}

function templateIcon(template: TemplateItem) {
  return categoryIcons[template.category] || categoryIcons[template.category.replace(/\s/g, "")] || Layers3
}

function complexityScore(complexity: TemplateComplexity) {
  if (complexity === "Titan") return 96
  if (complexity === "Pro") return 78
  return 58
}

function buildTemplateCode(template: TemplateItem) {
  const tone = templateTone(template)
  const tags = template.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
  const signals = template.signals
    .map(([label, value]) => `<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`)
    .join("")
  const workflow = ["Brief", "Generate", "Review", "Ship"]
    .map((item, index) => `<li><b>0${index + 1}</b><span>${item}</span></li>`)
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(template.title)} · Malik AI Template</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #020308; color: white; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .shell { min-height: 100vh; overflow: hidden; background:
      radial-gradient(circle at 16% 8%, rgba(228, 187, 94,.26), transparent 28%),
      radial-gradient(circle at 84% 12%, rgba(217, 174, 69,.24), transparent 30%),
      radial-gradient(circle at 50% 105%, rgba(245,158,11,.15), transparent 36%),
      linear-gradient(135deg,#020308,#070b18 48%,#110519); padding: 32px; }
    .card { max-width: 1180px; min-height: calc(100vh - 64px); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); border-radius: 36px; background: rgba(255,255,255,.045); box-shadow: 0 40px 160px rgba(0,0,0,.45); backdrop-filter: blur(24px); overflow: hidden; }
    .top { display: flex; justify-content: space-between; gap: 24px; padding: 28px; border-bottom: 1px solid rgba(255,255,255,.1); background: linear-gradient(90deg, rgba(255,255,255,.05), transparent); }
    .eyebrow { color: ${tone === "amber" ? "#fde68a" : tone === "emerald" ? "#a7f3d0" : tone === "rose" ? "#fecdd3" : "#f8e5ac"}; font-size: 12px; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; }
    h1 { margin: 16px 0 0; max-width: 820px; font-size: clamp(44px, 8vw, 92px); line-height: .88; letter-spacing: -.07em; }
    .subtitle { max-width: 720px; margin-top: 22px; color: rgba(226,232,240,.78); font-size: 18px; line-height: 1.8; }
    .badge { min-width: 210px; align-self: flex-start; border: 1px solid rgba(255,255,255,.12); border-radius: 28px; padding: 18px; background: rgba(0,0,0,.32); }
    .badge small { display: block; color: rgba(148,163,184,.9); text-transform: uppercase; letter-spacing: .18em; font-weight: 900; font-size: 10px; }
    .badge strong { display: block; margin-top: 8px; font-size: 26px; }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; padding: 28px; }
    .metrics article, .panel, .proof article { border: 1px solid rgba(255,255,255,.1); border-radius: 28px; background: rgba(255,255,255,.055); padding: 20px; }
    .metrics small, .proof small { display:block; color: rgba(148,163,184,.82); font-weight: 800; text-transform: uppercase; letter-spacing: .16em; font-size: 10px; }
    .metrics strong, .proof strong { display:block; margin-top: 8px; font-size: 32px; font-weight: 1000; }
    .grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 18px; padding: 0 28px 28px; }
    .panel h2 { margin: 0; font-size: 24px; }
    .tags { display:flex; flex-wrap:wrap; gap: 10px; margin-top: 18px; }
    .tags span { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(255,255,255,.06); padding: 8px 12px; color: rgba(255, 251, 239,.92); font-size: 12px; font-weight: 800; }
    .workflow { margin: 18px 0 0; padding: 0; display: grid; gap: 10px; list-style: none; }
    .workflow li { display:flex; justify-content: space-between; align-items:center; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: rgba(0,0,0,.22); padding: 13px 15px; }
    .workflow b { color: rgba(240, 210, 136,.95); }
    .proof { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
    .cta { display:flex; flex-wrap:wrap; gap: 12px; margin-top: 22px; }
    .cta button { border: 0; border-radius: 18px; padding: 14px 18px; font-weight: 900; }
    .primary { background: white; color:#020308; } .secondary { background: rgba(255,255,255,.06); color:white; border:1px solid rgba(255,255,255,.12)!important; }
    @media (max-width: 900px) { .top, .grid { grid-template-columns: 1fr; display:grid; } .metrics { grid-template-columns: 1fr; } .proof { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <div class="top">
        <div>
          <p class="eyebrow">${escapeHtml(template.category)} · ${escapeHtml(template.tier)}</p>
          <h1>${escapeHtml(template.title)}</h1>
          <p class="subtitle">${escapeHtml(template.description)} Built as a production-grade Malik AI artifact starter with investor-readable structure and safe demo content.</p>
          <div class="tags">${tags}</div>
        </div>
        <aside class="badge"><small>Artifact</small><strong>${escapeHtml(template.artifact)}</strong><small style="margin-top:14px">Complexity</small><strong>${escapeHtml(template.complexity)}</strong></aside>
      </div>
      <div class="metrics">${signals}<article><small>Stage</small><strong>${escapeHtml(template.stage)}</strong></article></div>
      <div class="grid">
        <article class="panel">
          <h2>Prompt brief</h2>
          <p class="subtitle" style="font-size:15px">${escapeHtml(template.prompt)}</p>
          <ul class="workflow">${workflow}</ul>
          <div class="cta"><button class="primary">Open Canvas</button><button class="secondary">Use Template</button></div>
        </article>
        <article class="panel">
          <h2>Business proof</h2>
          <p class="subtitle" style="font-size:15px">${escapeHtml(template.impact)}. This template is structured to show value fast: clean headline, clear control surface, visible metrics, trust blocks and export-ready layout.</p>
          <div class="proof"><article><small>Demo</small><strong>Ready</strong></article><article><small>Mobile</small><strong>Safe</strong></article><article><small>Canvas</small><strong>Live</strong></article><article><small>Fallback</small><strong>On</strong></article></div>
        </article>
      </div>
    </section>
  </main>
</body>
</html>`
}

function useTemplateFilters(query: string, activeCategory: string, activeTier: string, activeComplexity: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return templateItems.filter((template) => {
      const matchesQuery = !normalizedQuery || [
        template.title,
        template.category,
        template.description,
        template.prompt,
        template.tier,
        template.stage,
        template.complexity,
        template.artifact,
        ...template.tags,
      ].join(" ").toLowerCase().includes(normalizedQuery)
      const matchesCategory = activeCategory === "All" || template.category === activeCategory
      const matchesTier = activeTier === "All" || template.tier === activeTier
      const matchesComplexity = activeComplexity === "All" || template.complexity === activeComplexity
      return matchesQuery && matchesCategory && matchesTier && matchesComplexity
    })
  }, [activeCategory, activeComplexity, activeTier, query])
}

function SignalPill({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={strong ? "titan-signal-pill titan-signal-pill-strong" : "titan-signal-pill"}>{children}</span>
}

export function TemplateAnimatedPreview({ kind }: { kind: TemplateKind }) {
  return (
    <div className="titan-template-visual">
      <PremiumScene kind={resolvePremiumKind(kind as any)} compact />
      <div className="titan-template-visual-hud">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

export function TemplatePreviewCard({ template, onSendToCanvas, onUseTemplate, onStatus }: TemplatePreviewCardProps) {
  const Icon = templateIcon(template)
  const score = complexityScore(template.complexity)

  const openTemplate = (intent: "use" | "preview" | "canvas") => {
    const code = buildTemplateCode(template)

    if (intent === "use" && onUseTemplate) {
      onUseTemplate(template.prompt)
      onStatus?.(`${template.title} prompt armed for generation`)
      return
    }

    if (onSendToCanvas) {
      onSendToCanvas(code)
      onStatus?.(`${template.title} opened in Canvas as a production artifact`)
      return
    }

    if (onUseTemplate) {
      onUseTemplate(template.prompt)
      onStatus?.(`${template.title} prompt sent because Canvas hook is not connected`)
      return
    }

    onStatus?.(`${template.title} is ready, but no Canvas/template hook is connected`)
  }

  return (
    <article data-tone={templateTone(template)} className="titan-template-card group">
      <div className="titan-card-topline">
        <SignalPill strong>{template.tier}</SignalPill>
        <SignalPill>{template.complexity}</SignalPill>
        <SignalPill>{template.artifact}</SignalPill>
      </div>

      <TemplateAnimatedPreview kind={template.kind} />

      <div className="titan-card-body">
        <div className="titan-title-row">
          <span className="titan-card-icon"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p>{template.category}</p>
            <h3>{template.title}</h3>
          </div>
          <Sparkles className="h-5 w-5 text-cyan-100/80" />
        </div>

        <p className="titan-card-description">{template.description}</p>

        <div className="titan-score-row">
          <div>
            <span>Production score</span>
            <strong>{score}%</strong>
          </div>
          <div className="titan-score-bar"><i style={{ width: `${score}%` }} /></div>
        </div>

        <div className="titan-card-signal-grid">
          {template.signals.map(([label, value]) => (
            <span key={`${template.id}-${label}`}><b>{value}</b><em>{label}</em></span>
          ))}
        </div>

        <div className="titan-tags">
          {template.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>

        <div className="titan-card-actions">
          <button type="button" onClick={() => openTemplate("use")} className="titan-use-button">
            <Wand2 className="h-4 w-4" /> Use
          </button>
          <button type="button" onClick={() => openTemplate("preview")}>
            <Eye className="h-4 w-4" /> Preview
          </button>
          <button type="button" onClick={() => openTemplate("canvas")}>
            <Send className="h-4 w-4" /> Canvas
          </button>
        </div>
      </div>
    </article>
  )
}

export function TemplateGalleryPanel({ onSendToCanvas, onUseTemplate }: TemplateGalleryPanelProps) {
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeTier, setActiveTier] = useState("All")
  const [activeComplexity, setActiveComplexity] = useState("All")
  const [status, setStatus] = useState("Choose a Titan template and open it in Canvas.")

  const categories = useMemo(() => ["All", ...Array.from(new Set(templateItems.map((item) => item.category)))], [])
  const filteredTemplates = useTemplateFilters(query, activeCategory, activeTier, activeComplexity)
  const titanCount = useMemo(() => templateItems.filter((item) => item.complexity === "Titan").length, [])
  const firstTemplate = filteredTemplates[0] ?? templateItems[0]

  const openFirstMatch = () => {
    const code = buildTemplateCode(firstTemplate)
    onSendToCanvas?.(code)
    onUseTemplate?.(firstTemplate.prompt)
    setStatus(`${firstTemplate.title} sent through available template hooks`)
  }

  return (
    <section className="titan-template-shell">
      <PremiumCss />
      <style>{`
        .titan-template-shell{position:relative;display:flex;height:100%;min-height:0;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:2rem;background:radial-gradient(circle at 12% 0%,rgba(228, 187, 94,.16),transparent 28%),radial-gradient(circle at 88% 10%,rgba(217, 174, 69,.18),transparent 30%),linear-gradient(180deg,rgba(3,7,18,.96),rgba(2,3,8,.98));box-shadow:0 40px 160px rgba(0,0,0,.45);color:white}
        .titan-template-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(circle at 50% 8%,#000,transparent 72%);opacity:.48}
        .titan-template-head{position:relative;z-index:1;border-bottom:1px solid rgba(255,255,255,.10);padding:1.25rem}
        .titan-command-deck{margin-top:1rem;display:grid;gap:.75rem;grid-template-columns:1.2fr repeat(4,minmax(0,.55fr))}
        .titan-search{min-height:3.25rem;border:1px solid rgba(240, 210, 136,.18);border-radius:1.25rem;background:rgba(0,0,0,.35);display:flex;align-items:center;gap:.75rem;padding:0 1rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
        .titan-search svg{height:1.1rem;width:1.1rem;color:rgba(248, 229, 172,.9)}
        .titan-search input{width:100%;background:transparent;outline:none;border:0;color:white;font-size:.9rem}.titan-search input::placeholder{color:rgba(148,163,184,.72)}
        .titan-command-stat{border:1px solid rgba(255,255,255,.10);border-radius:1.25rem;background:rgba(255,255,255,.045);padding:.8rem .95rem}.titan-command-stat span{display:block;color:rgba(148,163,184,.85);font-size:.66rem;font-weight:900;text-transform:uppercase;letter-spacing:.16em}.titan-command-stat strong{display:block;margin-top:.25rem;font-size:1rem;font-weight:1000}
        .titan-filter-board{margin-top:1rem;display:flex;gap:.65rem;overflow-x:auto;padding-bottom:.2rem;scrollbar-width:none}.titan-filter-board::-webkit-scrollbar{display:none}.titan-filter-board button{flex:0 0 auto;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.04);padding:.72rem 1rem;color:rgba(226,232,240,.82);font-size:.75rem;font-weight:900;transition:.18s}.titan-filter-board button:hover,.titan-filter-board button.is-active{border-color:rgba(240, 210, 136,.35);background:rgba(228, 187, 94,.10);color:white;box-shadow:0 0 40px rgba(228, 187, 94,.10)}
        .titan-secondary-filters{margin-top:.8rem;display:flex;flex-wrap:wrap;gap:.55rem}.titan-secondary-filters button{border:1px solid rgba(255,255,255,.10);border-radius:.9rem;background:rgba(0,0,0,.22);padding:.56rem .8rem;color:rgba(203,213,225,.78);font-size:.72rem;font-weight:900}.titan-secondary-filters button.is-active{background:white;color:#020308;border-color:white}
        .titan-status-line{margin-top:.85rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;color:rgba(248, 229, 172,.86);font-size:.82rem;font-weight:800}.titan-status-line button{border:1px solid rgba(255,255,255,.12);border-radius:1rem;background:white;color:#020308;padding:.72rem 1rem;font-weight:1000;display:flex;gap:.45rem;align-items:center}
        .titan-template-body{position:relative;z-index:1;min-height:0;flex:1;overflow-y:auto;padding:1.25rem;scrollbar-width:thin;scrollbar-color:rgba(240, 210, 136,.3) transparent}.titan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
        .titan-template-card{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:2rem;background:rgba(255,255,255,.045);box-shadow:0 26px 90px rgba(0,0,0,.28);backdrop-filter:blur(20px);transition:transform .22s ease,border-color .22s ease,background .22s ease}.titan-template-card:hover{transform:translateY(-4px);border-color:rgba(240, 210, 136,.28);background:rgba(255,255,255,.065)}.titan-template-card:before{content:"";position:absolute;inset:-40% -20% auto;height:55%;background:radial-gradient(circle,rgba(240, 210, 136,.20),transparent 60%);opacity:.75;pointer-events:none}.titan-template-card[data-tone="violet"]:before{background:radial-gradient(circle,rgba(217, 174, 69,.22),transparent 60%)}.titan-template-card[data-tone="amber"]:before{background:radial-gradient(circle,rgba(251,191,36,.20),transparent 60%)}.titan-template-card[data-tone="emerald"]:before{background:radial-gradient(circle,rgba(52,211,153,.20),transparent 60%)}.titan-template-card[data-tone="rose"]:before{background:radial-gradient(circle,rgba(244,63,94,.18),transparent 60%)}
        .titan-card-topline{position:absolute;left:.85rem;right:.85rem;top:.85rem;z-index:3;display:flex;gap:.45rem;flex-wrap:wrap}.titan-signal-pill{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(0,0,0,.42);padding:.36rem .58rem;color:rgba(226,232,240,.86);font-size:.62rem;font-weight:1000;text-transform:uppercase;letter-spacing:.10em;backdrop-filter:blur(14px)}.titan-signal-pill-strong{background:white;color:#020308;border-color:white}
        .titan-template-visual{position:relative;padding:.7rem .7rem 0}.titan-template-visual>div:first-child{border-radius:1.5rem;overflow:hidden}.titan-template-visual-hud{position:absolute;right:1.25rem;bottom:.7rem;display:flex;gap:.35rem}.titan-template-visual-hud span{width:.5rem;height:.5rem;border-radius:999px;background:rgba(240, 210, 136,.85);box-shadow:0 0 16px rgba(228, 187, 94,.5)}.titan-card-body{position:relative;z-index:2;padding:1rem}.titan-title-row{display:flex;align-items:center;gap:.75rem}.titan-title-row p{font-size:.68rem;font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:rgba(240, 210, 136,.82)}.titan-title-row h3{margin-top:.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:1.08rem;font-weight:1000;letter-spacing:-.02em}.titan-card-icon{display:grid;place-items:center;width:2.35rem;height:2.35rem;border:1px solid rgba(255,255,255,.12);border-radius:.95rem;background:rgba(255,255,255,.06)}.titan-card-description{min-height:4.6rem;margin-top:.85rem;color:rgba(203,213,225,.76);font-size:.85rem;line-height:1.65}.titan-score-row{margin-top:.95rem;border:1px solid rgba(255,255,255,.10);border-radius:1.25rem;background:rgba(0,0,0,.22);padding:.85rem}.titan-score-row>div:first-child{display:flex;justify-content:space-between;color:rgba(148,163,184,.88);font-size:.72rem;font-weight:900}.titan-score-row strong{color:white}.titan-score-bar{margin-top:.6rem;height:.42rem;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.titan-score-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f0d288,#e8c56a,#f3de96)}
        .titan-card-signal-grid{margin-top:.8rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.45rem}.titan-card-signal-grid span{border:1px solid rgba(255,255,255,.08);border-radius:1rem;background:rgba(255,255,255,.035);padding:.65rem;text-align:center}.titan-card-signal-grid b{display:block;font-size:.82rem}.titan-card-signal-grid em{display:block;margin-top:.2rem;color:rgba(148,163,184,.78);font-size:.62rem;font-style:normal;font-weight:800;text-transform:uppercase}.titan-tags{margin-top:.85rem;display:flex;flex-wrap:wrap;gap:.4rem}.titan-tags span{border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.035);padding:.34rem .55rem;color:rgba(203,213,225,.82);font-size:.66rem;font-weight:850}.titan-card-actions{margin-top:1rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem}.titan-card-actions button{display:flex;align-items:center;justify-content:center;gap:.35rem;border:1px solid rgba(255,255,255,.10);border-radius:1rem;background:rgba(255,255,255,.045);padding:.78rem .5rem;color:white;font-size:.72rem;font-weight:1000;transition:.18s}.titan-card-actions button:hover{background:rgba(255,255,255,.10)}.titan-card-actions .titan-use-button{background:white;color:#020308;border-color:white}.titan-empty{display:grid;place-items:center;min-height:22rem;border:1px dashed rgba(255,255,255,.14);border-radius:2rem;background:rgba(255,255,255,.035);text-align:center}.titan-empty h3{font-size:1.5rem;font-weight:1000}.titan-empty p{margin-top:.5rem;color:rgba(148,163,184,.88)}
        @media (max-width:1280px){.titan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.titan-command-deck{grid-template-columns:1fr 1fr}.titan-search{grid-column:1/-1}}
        @media (max-width:760px){.titan-template-shell{border-radius:0}.titan-grid{grid-template-columns:1fr}.titan-command-deck{grid-template-columns:1fr}.titan-status-line{align-items:flex-start;flex-direction:column}.titan-card-actions{grid-template-columns:1fr}.titan-template-head,.titan-template-body{padding:1rem}}
      `}</style>

      <div className="titan-template-head">
        <PremiumHero
          eyebrow="Template Library · German Tank Mode"
          title="Titan templates that look like a real AI product"
          subtitle="Animated starter systems for websites, dashboards, agent workspaces, media studios, investor decks and enterprise verticals. Every card can arm a prompt or open a production-like artifact in Canvas."
          kind="templates"
          metrics={[
            { label: "Templates", value: String(filteredTemplates.length) },
            { label: "Titan", value: String(titanCount) },
            { label: "Canvas", value: onSendToCanvas ? "Connected" : "Hook missing" },
          ]}
          action={
            <button type="button" onClick={openFirstMatch}>
              Open First Match
              <ArrowUpRight className="h-4 w-4" />
            </button>
          }
        />

        <div className="titan-command-deck">
          <label className="titan-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search: SaaS, investor, dashboard, code, clinic..." />
          </label>
          <div className="titan-command-stat"><span>Total</span><strong>{templateItems.length}</strong></div>
          <div className="titan-command-stat"><span>Filtered</span><strong>{filteredTemplates.length}</strong></div>
          <div className="titan-command-stat"><span>Mode</span><strong>{activeComplexity}</strong></div>
          <div className="titan-command-stat"><span>Status</span><strong>Ready</strong></div>
        </div>

        <div className="titan-filter-board" aria-label="Template categories">
          {categories.map((category) => {
            const Icon = category === "All" ? Filter : categoryIcons[category] || Layers3
            return (
              <button key={category} type="button" className={activeCategory === category ? "is-active" : ""} onClick={() => setActiveCategory(category)}>
                <Icon className="mr-2 inline h-4 w-4" />
                {category}
              </button>
            )
          })}
        </div>

        <div className="titan-secondary-filters">
          {["All", "Launch", "Scale", "Enterprise", "Investor"].map((tier) => <button key={tier} type="button" className={activeTier === tier ? "is-active" : ""} onClick={() => setActiveTier(tier)}>{tier}</button>)}
          {["All", "Starter", "Pro", "Titan"].map((complexity) => <button key={complexity} type="button" className={activeComplexity === complexity ? "is-active" : ""} onClick={() => setActiveComplexity(complexity)}>{complexity}</button>)}
        </div>

        <div className="titan-status-line">
          <span>{status}</span>
          <button type="button" onClick={openFirstMatch}><PanelRightOpen className="h-4 w-4" /> Send best match</button>
        </div>
      </div>

      <div className="titan-template-body">
        {filteredTemplates.length ? (
          <div className="titan-grid">
            {filteredTemplates.map((template) => (
              <TemplatePreviewCard key={template.id} template={template} onSendToCanvas={onSendToCanvas} onUseTemplate={onUseTemplate} onStatus={setStatus} />
            ))}
          </div>
        ) : (
          <div className="titan-empty">
            <div>
              <Cpu className="mx-auto h-9 w-9 text-cyan-200" />
              <h3>No templates found</h3>
              <p>Reset filters or search another product category.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default TemplateGalleryPanel
