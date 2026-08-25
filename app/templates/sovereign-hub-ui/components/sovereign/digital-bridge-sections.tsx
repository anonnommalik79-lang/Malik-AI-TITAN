"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { takePrefillPrompt } from "@/lib/malik-context"

type DemoTone = "cyan" | "violet" | "emerald" | "amber" | "rose" | "blue"
type DemoVisual =
  | "brain"
  | "shield"
  | "mission"
  | "search"
  | "creator"
  | "photo"
  | "cinema"
  | "website"
  | "code"
  | "projects"
  | "chats"
  | "design"
  | "templates"
  | "billing"
  | "settings"
  | "support"

type DemoSection = {
  title: string
  kicker: string
  subtitle: string
  tone: DemoTone
  visual: DemoVisual
  prompt: string
  endpoint?: string
  method?: "GET" | "POST"
  kind?: string
  nextView: string
  stats: Array<[string, string, string]>
  features: Array<[string, string]>
  gallery: Array<[string, string]>
  workflow: Array<[string, string]>
  stageScript?: string[]
  investorProof?: Array<[string, string, string]>
  controlRoom?: Array<[string, string]>
  commercialAngle?: string
}

type ChatPreview = {
  id: string
  title: string
  status?: string
  techStack?: string[]
  timestamp?: Date
}

type DigitalBridgeSectionExperienceProps = {
  activeView: string
  username?: string
  chats?: ChatPreview[]
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

const commonStats: DemoSection["stats"] = [
  ["Live APIs", "Ready", "Keys activate server routes"],
  ["Fallback", "Auto", "No dead demo screens"],
  ["Canvas", "Safe", "Opens only for artifacts"],
]

const sections: Record<string, DemoSection> = {
  "final-intelligence": {
    title: "Final Intelligence",
    kicker: "AI brain cockpit",
    subtitle: "A founder-grade intelligence layer: prompt routing, model orchestration, artifact creation, and investor-friendly explanation in one clean screen.",
    tone: "cyan",
    visual: "brain",
    prompt: "Plan a launch-ready AI product demo for Digital Bridge 2026.",
    endpoint: "/api/ai/chat",
    kind: "chat",
    nextView: "website-generation",
    stats: [["Intent routes", "14", "Chat, code, media, docs"], ["Brain lanes", "Multi", "Provider router ready"], ["Demo mode", "On", "White-label public UI"]],
    features: [["Intent router", "Classifies normal chat, project, website, image, video and code requests."], ["Model orchestra", "Uses configured keys without exposing raw provider identity."], ["Launch cockpit", "Explains the whole product story in a booth-ready format."]],
    gallery: [["Neural map", "Prompt routes"], ["Brain sphere", "Reasoning lanes"], ["Launch story", "Founder script"]],
    workflow: [["Ask", "User prompt enters the router"], ["Route", "Best available engine is selected"], ["Create", "Artifact or answer is produced"], ["Present", "Founder explains value live"]],
  },
  "unbreakable-ai": {
    title: "Unbreakable AI",
    kicker: "Fallback and safety engine",
    subtitle: "A resilient guard layer for provider failure, retry policy, safe backup mode, rate limits, privacy and demo continuity under pressure.",
    tone: "emerald",
    visual: "shield",
    prompt: "Check MALIK AI runtime safety and fallback readiness.",
    endpoint: "/api/ai/status",
    method: "GET",
    kind: "status",
    nextView: "features",
    stats: [["Guard", "Live", "Circuit breaker ready"], ["Privacy", "White", "Provider identity hidden"], ["Risk", "Low", "Safe public fallback"]],
    features: [["Retry shield", "Requests can fall through configured providers instead of dying."], ["Privacy wall", "Public responses avoid raw API names, headers and secrets."], ["Demo continuity", "If a live API fails, the section still shows a strong result path."]],
    gallery: [["Shield core", "Runtime guard"], ["Signal wall", "Health checks"], ["Recovery path", "Backup engine"]],
    workflow: [["Detect", "Provider health is checked"], ["Retry", "Failures are isolated"], ["Fallback", "Backup mode keeps UI alive"], ["Report", "Status stays public-safe"]],
  },
  "command-center": {
    title: "Command Center",
    kicker: "Mission control",
    subtitle: "A premium control room for agents, launch tasks, project actions, Codex handoff, Canvas handoff and execution telemetry.",
    tone: "amber",
    visual: "mission",
    prompt: "Create a mission plan for preparing MALIK AI for investor demo day.",
    endpoint: "/api/ai/chat",
    kind: "chat",
    nextView: "projects",
    stats: [["Agents", "18", "Task lanes"], ["Missions", "24", "Launch boards"], ["Flow", "Live", "Actions connected"]],
    features: [["Agent graph", "Shows autonomous lanes and task ownership."], ["Mission queue", "Turns ideas into launchable operational steps."], ["Action bridge", "Routes into Codex, Canvas, projects and generators."]],
    gallery: [["Agent map", "Live nodes"], ["Mission board", "Launch queue"], ["Telemetry", "Execution feed"]],
    workflow: [["Brief", "Define objective"], ["Assign", "Choose agent lane"], ["Execute", "Run generation/action"], ["Ship", "Move to project or canvas"]],
  },
  search: {
    title: "Global Search",
    kicker: "Command search router",
    subtitle: "A universal launcher for projects, chats, tools, templates, generated artifacts and founder demo navigation.",
    tone: "blue",
    visual: "search",
    prompt: "Search product modules, projects, generated artifacts and AI tools.",
    endpoint: "/api/ai/chat",
    kind: "chat",
    nextView: "templates",
    stats: [["Index", "Full", "Tools and projects"], ["Routes", "All", "Section launcher"], ["Speed", "Fast", "Pitch navigation"]],
    features: [["One search", "Find projects, chats, tools and launch routes."], ["Demo launcher", "Jump to any strong module during a live pitch."], ["Knowledge surface", "Acts like command palette plus product memory."]],
    gallery: [["Search beam", "Command input"], ["Result cards", "Project memory"], ["Route map", "Tools"]],
    workflow: [["Type", "Enter a product query"], ["Match", "Find route and content"], ["Open", "Jump to module"], ["Continue", "Generate or present"]],
  },
  "ai-generator": {
    title: "AI Generator",
    kicker: "Unified creator engine",
    subtitle: "One new creator surface for text, code, photos, video, websites and pitch content. API keys activate live generation automatically.",
    tone: "violet",
    visual: "creator",
    prompt: "Create a premium AI SaaS launch concept with website, image and demo script.",
    endpoint: "/api/generate",
    kind: "website",
    nextView: "photo-generation",
    stats: [["Modes", "6", "Text/code/photo/video"], ["Queue", "Fast", "Async ready"], ["Output", "Canvas", "Artifact handoff"]],
    features: [["Multi-output lab", "Switch from concept to media, code or website."], ["Live API bridge", "Configured keys activate real server generation."], ["Fallback artifact", "No blank booth state if a provider is missing."]],
    gallery: [["Prompt lab", "Creator input"], ["Output wall", "Artifacts"], ["Media flow", "Images/video"]],
    workflow: [["Prompt", "Describe idea"], ["Choose", "Select output type"], ["Generate", "Call API route"], ["Export", "Send to Canvas"]],
  },
  "photo-generation": {
    title: "Photo Generation",
    kicker: "MALIK Vision studio",
    subtitle: "A new visual studio with animated photo spheres, style presets, gallery previews and real image generation once keys are configured.",
    tone: "cyan",
    visual: "photo",
    prompt: "Cyberpunk AI founder booth in Astana, premium SaaS dashboard, blue violet lights, cinematic product photo.",
    endpoint: "/api/generate/photo",
    kind: "photo",
    nextView: "video-generation",
    stats: [["Vision", "XL", "Image route ready"], ["Styles", "34", "Prompt presets"], ["Gallery", "Live", "New visual wall"]],
    features: [["Photo spheres", "Animated gallery orbs and image cards for a fresh visual identity."], ["Provider-ready", "OpenAI, FAL, Stability or AWS image lanes can activate from env keys."], ["Canvas export", "Generated images can become artifact preview pages."]],
    gallery: [["Neon booth", "Cyber SaaS"], ["Founder shot", "Pitch visual"], ["AI product", "Dashboard photo"]],
    workflow: [["Prompt", "Describe image"], ["Style", "Pick visual lane"], ["Render", "Call image route"], ["Save", "Gallery or Canvas"]],
  },
  "video-generation": {
    title: "Video Generation",
    kicker: "MALIK Cinema pipeline",
    subtitle: "A cinematic render lab with motion spheres, storyboard cards, async job polling and provider-ready video generation.",
    tone: "rose",
    visual: "cinema",
    prompt: "Create a 16:9 cinematic product launch video for MALIK AI at Digital Bridge 2026.",
    endpoint: "/api/generate/video",
    kind: "video",
    nextView: "website-generation",
    stats: [["Cinema", "Queue", "Async video jobs"], ["Polling", "Live", "Local status route"], ["Story", "Ready", "Storyboard fallback"]],
    features: [["Motion board", "Scene beats, timing and cinematic direction in one new screen."], ["Provider-ready", "Runway, Luma, FAL and Veo routes activate after real keys."], ["White-label queue", "Public UI sees MALIK Cinema, not raw provider internals."]],
    gallery: [["Scene 01", "Hero reveal"], ["Scene 02", "Product flythrough"], ["Scene 03", "Launch close"]],
    workflow: [["Script", "Write motion prompt"], ["Queue", "Create provider job"], ["Poll", "Wait for video URL"], ["Present", "Play or show storyboard"]],
  },
  "website-generation": {
    title: "Website Builder",
    kicker: "No-code product webflow",
    subtitle: "A new website lab for full landing pages, SaaS sites, dashboards and commercial product previews.",
    tone: "emerald",
    visual: "website",
    prompt: "Generate a world-class AI SaaS website for MALIK AI with hero, features, pricing, testimonials and investor CTA.",
    endpoint: "/api/generate/website",
    kind: "website",
    nextView: "code-generation",
    stats: [["Sections", "12+", "Hero/pricing/FAQ"], ["Preview", "Canvas", "Artifact handoff"], ["Export", "HTML", "Live result"]],
    features: [["Website from prompt", "Turns a product idea into a structured website artifact."], ["Investor CTA", "Built for demos, pricing story and product positioning."], ["Canvas-ready", "Generated HTML can be previewed without opening an empty panel."]],
    gallery: [["Hero page", "SaaS launch"], ["Pricing", "Revenue story"], ["Dashboard", "Product proof"]],
    workflow: [["Describe", "Write product brief"], ["Generate", "Call website route"], ["Preview", "Send artifact"], ["Pitch", "Show business story"]],
  },
  "code-generation": {
    title: "Code Generator",
    kicker: "MALIK Codex build lab",
    subtitle: "A new code studio for components, dashboards, app screens and developer artifacts, with real text/code provider routing.",
    tone: "amber",
    visual: "code",
    prompt: "Generate a premium React dashboard component for an AI SaaS product with metrics, cards and loading states.",
    endpoint: "/api/generate/code",
    kind: "code",
    nextView: "projects",
    stats: [["Languages", "300+", "Prompt-assisted"], ["Router", "Live", "Code providers"], ["Export", "Canvas", "Preview-ready"]],
    features: [["Code screen", "New editor-like visual with code rain and file cards."], ["Provider routing", "OpenAI, Kimi, Claude, Gemini and others can power output."], ["Artifact export", "Generated code can move into Canvas for preview."]],
    gallery: [["Editor", "TSX"], ["File tree", "Project"], ["Terminal", "Build"]],
    workflow: [["Spec", "Describe component"], ["Generate", "Call code route"], ["Review", "Inspect artifact"], ["Canvas", "Preview/export"]],
  },
  projects: {
    title: "Projects",
    kicker: "Workspace memory",
    subtitle: "A new project command wall for generated apps, chats, artifacts, status cards and demo continuity.",
    tone: "blue",
    visual: "projects",
    prompt: "Summarize my MALIK AI project workspace and next launch steps.",
    endpoint: "/api/ai/chat",
    kind: "chat",
    nextView: "chats",
    stats: [["Projects", "Live", "Chat/project history"], ["Artifacts", "Saved", "Generated outputs"], ["Status", "Tracked", "Draft/build/ready"]],
    features: [["Project wall", "Shows product memory instead of a simple old list."], ["Artifact states", "Draft, building and ready states tell a product story."], ["Demo continuity", "Investors see a full workspace, not just a prompt box."]],
    gallery: [["Project card", "Launch app"], ["Artifact", "Website/code"], ["Status", "Ready"]],
    workflow: [["Create", "Start from chat"], ["Generate", "Produce artifact"], ["Track", "Store status"], ["Open", "Return to project"]],
  },
  chats: {
    title: "Neuro Dialogues",
    kicker: "Conversation cockpit",
    subtitle: "A redesigned chat memory section for normal prompts, generated ideas and safe chat-only behavior.",
    tone: "violet",
    visual: "chats",
    prompt: "Create a concise founder pitch for MALIK AI.",
    endpoint: "/api/ai/chat",
    kind: "chat",
    nextView: "home",
    stats: [["Chat", "Safe", "No empty canvas"], ["Memory", "Ready", "History surface"], ["Prompt", "Fast", "Normal chat flow"]],
    features: [["Chat-only safe", "Normal prompts stay full-width and do not open empty preview."], ["Conversation memory", "Old chats become product context."], ["Pitch flow", "Use chat to prepare demo scripts and answers."]],
    gallery: [["Thread", "Prompt"], ["Assistant", "Answer"], ["Memory", "History"]],
    workflow: [["Ask", "Normal chat prompt"], ["Answer", "Assistant response"], ["Save", "History"], ["Route", "Optional generator"]],
  },
  design: {
    title: "Design System",
    kicker: "Sovereign visual kit",
    subtitle: "A new design lab for colors, glass cards, motion, UI patterns and Digital Bridge visual consistency.",
    tone: "cyan",
    visual: "design",
    prompt: "Generate a design system guide for MALIK AI with tokens, cards and motion rules.",
    endpoint: "/api/generate/document",
    kind: "document",
    nextView: "templates",
    stats: [["Tokens", "8", "Brand colors"], ["Motion", "Smooth", "Reduced-motion ready"], ["Cards", "Glass", "Premium SaaS"]],
    features: [["Visual kit", "New tokens, surfaces and motion patterns."], ["Section identity", "Each module has its own visual language."], ["Demo polish", "Screens read like a serious AI SaaS product."]],
    gallery: [["Tokens", "Color"], ["Cards", "Glass UI"], ["Motion", "Animation"]],
    workflow: [["Tokenize", "Define style"], ["Apply", "Cards/sections"], ["Animate", "Motion rules"], ["Ship", "Consistent product"]],
  },
  templates: {
    title: "Templates",
    kicker: "Launch library",
    subtitle: "A new template gallery for SaaS, dashboards, websites, media prompts, code modules and investor demo starters.",
    tone: "emerald",
    visual: "templates",
    prompt: "Generate a reusable AI SaaS template for MALIK AI with hero, dashboard and pricing blocks.",
    endpoint: "/api/generate/template",
    kind: "template",
    nextView: "landing-generation",
    stats: [["Templates", "100+", "Starter prompts"], ["SaaS", "Ready", "Launch kits"], ["Canvas", "On", "Preview export"]],
    features: [["Template shelves", "Fresh cards and template shots instead of old flat grids."], ["Prompt starters", "Use templates to start strong live demos."], ["Artifact output", "Templates can generate previewable code/HTML."]],
    gallery: [["SaaS kit", "Landing"], ["Dashboard kit", "Analytics"], ["Media kit", "Photo/video"]],
    workflow: [["Pick", "Choose template"], ["Prompt", "Customize brief"], ["Generate", "Create artifact"], ["Preview", "Canvas output"]],
  },
  billing: {
    title: "Billing",
    kicker: "Commercial cockpit",
    subtitle: "A product-grade billing screen for plans, limits, checkout readiness and investor business model story.",
    tone: "amber",
    visual: "billing",
    prompt: "Create a pricing strategy for MALIK AI with free, pro and enterprise tiers.",
    endpoint: "/api/billing/plans",
    method: "GET",
    kind: "billing",
    nextView: "settings",
    stats: [["Plans", "Ready", "Commercial story"], ["Limits", "On", "Usage gated"], ["Checkout", "Prepared", "Payment route"]],
    features: [["Business model", "Shows how the product can sell, not only demo."], ["Usage limits", "Generation limits support paid tiers."], ["Admin flow", "Billing approval routes are ready for controlled demos."]],
    gallery: [["Plan cards", "Pricing"], ["Limits", "Usage"], ["Checkout", "Payment"]],
    workflow: [["Plan", "Choose tier"], ["Use", "Track limits"], ["Pay", "Checkout"], ["Approve", "Admin flow"]],
  },
  settings: {
    title: "Settings",
    kicker: "Sovereign profile",
    subtitle: "A new profile control surface for identity, access, OAuth readiness, admin debug gates and session behavior.",
    tone: "violet",
    visual: "settings",
    prompt: "Check identity and provider debug readiness for MALIK AI.",
    endpoint: "/api/auth/status",
    method: "GET",
    kind: "settings",
    nextView: "billing",
    stats: [["Profile", "Ready", "User session"], ["OAuth", "Safe", "Supabase flags"], ["Admin", "Gated", "Debug only admin"]],
    features: [["Identity surface", "Looks like a real app profile screen."], ["OAuth readiness", "Google/GitHub/Apple/Microsoft flags remain server-safe."], ["Admin privacy", "Debug is hidden unless admin env allows it."]],
    gallery: [["Profile", "User"], ["Access", "Roles"], ["Security", "Session"]],
    workflow: [["Login", "Session state"], ["Profile", "Sync identity"], ["Access", "Role checks"], ["Debug", "Admin only"]],
  },
  support: {
    title: "Support",
    kicker: "Operations desk",
    subtitle: "A polished operations section for status, support, runtime readiness, queue health and demo confidence.",
    tone: "emerald",
    visual: "support",
    prompt: "Check MALIK AI operational readiness.",
    endpoint: "/api/health",
    method: "GET",
    kind: "support",
    nextView: "features",
    stats: [["Status", "Online", "Health route"], ["Ops", "Ready", "Support story"], ["Queue", "Safe", "Fallback mode"]],
    features: [["Status desk", "Shows readiness without raw provider leaks."], ["Support story", "Makes the product feel complete for investors."], ["Runtime checks", "Health routes and fallback routes remain visible."]],
    gallery: [["Health", "Status"], ["Support", "Desk"], ["Ops", "Signals"]],
    workflow: [["Check", "Health route"], ["Explain", "Fallback state"], ["Support", "User help"], ["Resolve", "Admin path"]],
  },
  features: {
    title: "Feature Center",
    kicker: "Product capability map",
    subtitle: "A redesigned capability center for every connected power: generation, search, projects, Codex, media, billing and support.",
    tone: "blue",
    visual: "creator",
    prompt: "List the strongest MALIK AI features for an investor demo.",
    endpoint: "/api/ai/providers",
    method: "GET",
    kind: "features",
    nextView: "command-center",
    stats: [["Modules", "Live", "Feature map"], ["Routes", "Ready", "Clickable sections"], ["Demo", "Full", "Investor tour"]],
    features: [["Capability map", "Shows breadth without digging through menus."], ["Working routes", "Cards lead to real sections."], ["API readiness", "Engines show public-safe readiness."]],
    gallery: [["Modules", "Feature cards"], ["Routes", "Actions"], ["Engines", "Readiness"]],
    workflow: [["Map", "Show modules"], ["Open", "Route to section"], ["Generate", "Use API"], ["Pitch", "Explain value"]],
  },
}

Object.assign(sections, {
  "component-generation": {
    ...sections["code-generation"],
    title: "React Component Forge",
    kicker: "Interface foundry",
    subtitle: "A focused component universe for cards, panels, buttons, loaders, empty states and production TSX blocks.",
    prompt: "Generate a premium React component system for an AI dashboard with cards, tabs, empty states and motion.",
    gallery: [["Component card", "Glass state"], ["Interaction", "Hover logic"], ["Export TSX", "Canvas-ready"]],
    workflow: [["Spec", "Name the UI block"], ["Forge", "Generate TSX"], ["Skin", "Apply tokens"], ["Preview", "Send to Canvas"]],
  },
  "dashboard-generation": {
    ...sections["website-generation"],
    title: "Dashboard Builder",
    kicker: "Analytics universe",
    subtitle: "A data-product screen for KPI cockpits, growth dashboards, queue monitors and investor telemetry.",
    visual: "projects",
    prompt: "Generate a premium AI SaaS analytics dashboard with KPI cards, model usage, media queue and revenue charts.",
    gallery: [["KPI cockpit", "Revenue"], ["Usage map", "AI cost"], ["Queue board", "Media jobs"]],
    workflow: [["Metrics", "Define KPIs"], ["Layout", "Build cockpit"], ["Chart", "Render insight"], ["Present", "Show traction"]],
  },
  "document-generation": {
    ...sections.templates,
    title: "Document Studio",
    kicker: "Founder document lab",
    subtitle: "A clean document universe for PRDs, pitch notes, investor briefs, support docs and launch plans.",
    visual: "templates",
    prompt: "Generate an investor-ready MALIK AI product brief with roadmap, architecture and go-to-market.",
    gallery: [["Investor brief", "Narrative"], ["PRD", "Roadmap"], ["Launch doc", "Checklist"]],
    workflow: [["Brief", "Choose document"], ["Draft", "Generate sections"], ["Polish", "Refine tone"], ["Export", "Canvas artifact"]],
  },
  "presentation-generation": {
    ...sections.templates,
    title: "Pitch Deck Studio",
    kicker: "Investor story engine",
    subtitle: "A pitch-deck universe for demo-day story, slide arcs, traction narrative and founder presentation flow.",
    visual: "design",
    prompt: "Generate a 10-slide Digital Bridge 2026 investor pitch deck for MALIK AI.",
    gallery: [["Slide arc", "Story"], ["Market proof", "Charts"], ["Demo close", "CTA"]],
    workflow: [["Story", "Set arc"], ["Slides", "Generate deck"], ["Design", "Apply style"], ["Pitch", "Practice flow"]],
  },
  "template-generation": {
    ...sections.templates,
    title: "Template Generator",
    kicker: "Launch kit creator",
    subtitle: "A template-making universe for SaaS kits, media prompts, website blocks and reusable creator packs.",
    prompt: "Generate a reusable AI product launch template with website, photo, video, dashboard and pricing prompts.",
    gallery: [["SaaS pack", "Website"], ["Media pack", "Photo/video"], ["Code pack", "Components"]],
    workflow: [["Choose kit", "Pick domain"], ["Generate", "Create starter"], ["Adapt", "Brand it"], ["Launch", "Use anywhere"]],
  },
})


const viewAliases: Record<string, string> = {
  home: "final-intelligence",
  intelligence: "final-intelligence",
  "final intelligence": "final-intelligence",
  brain: "final-intelligence",
  guard: "unbreakable-ai",
  safety: "unbreakable-ai",
  fallback: "unbreakable-ai",
  command: "command-center",
  console: "command-center",
  generator: "ai-generator",
  media: "ai-generator",
  image: "photo-generation",
  photo: "photo-generation",
  vision: "photo-generation",
  cinema: "video-generation",
  movie: "video-generation",
  video: "video-generation",
  site: "website-generation",
  website: "website-generation",
  landing: "landing-generation",
  dashboard: "dashboard-generation",
  analytics: "analytics",
  react: "component-generation",
  component: "component-generation",
  document: "document-generation",
  docs: "document-generation",
  deck: "presentation-generation",
  pitch: "presentation-generation",
  presentation: "presentation-generation",
  template: "template-generation",
  profile: "profile",
  notifications: "notifications",
}

Object.assign(sections, {
  "landing-generation": {
    ...sections["website-generation"],
    title: "Landing Page Studio",
    kicker: "Conversion-grade launch page",
    subtitle: "A focused landing universe for one-screen product launches, investor CTAs, waitlists, media screenshots and Astana Hub demo links.",
    visual: "website",
    prompt: "Generate a premium one-page launch landing for MALIK AI 6.5 TITAN with hero, proof, waitlist and Digital Bridge CTA.",
    nextView: "dashboard-generation",
    stats: [["Hero", "Sharp", "One-screen value"], ["CTA", "Investor", "Waitlist + demo"], ["Proof", "Visual", "Product screenshots"]],
    gallery: [["Launch hero", "Narrative"], ["Proof row", "Credibility"], ["CTA close", "Conversion"]],
    workflow: [["Hook", "Lead with sovereign AI"], ["Show", "Reveal product proof"], ["Convert", "Push waitlist/demo"], ["Share", "Use as public link"]],
  },
  analytics: {
    ...sections["dashboard-generation"],
    title: "Analytics Command Room",
    kicker: "Executive telemetry",
    subtitle: "A premium analytics command room for model usage, render queues, growth metrics, cost signals, demo readiness and investor KPI storytelling.",
    visual: "projects",
    prompt: "Generate an executive analytics cockpit for MALIK AI with usage, revenue, media queue, retention and demo health.",
    nextView: "notifications",
    stats: [["KPI", "Live", "Demo telemetry"], ["Queue", "Tracked", "Image/video jobs"], ["Costs", "Visible", "Model spend story"]],
    gallery: [["Growth panel", "Usage"], ["Queue matrix", "Media"], ["Cost signal", "AI spend"]],
    workflow: [["Collect", "Read product signals"], ["Explain", "Turn metrics into story"], ["Prioritize", "Find next work"], ["Pitch", "Show investor clarity"]],
  },
  notifications: {
    ...sections.support,
    title: "Notifications Center",
    kicker: "Signal inbox",
    subtitle: "A clean signal center for generation alerts, queue events, billing notices, support updates and founder-critical demo warnings.",
    visual: "support",
    prompt: "Create a notification policy for MALIK AI: generation done, failed route, billing warning, support update and demo alert.",
    nextView: "support",
    stats: [["Signals", "Clean", "No noisy UI"], ["Alerts", "Smart", "Only important"], ["Demo", "Safe", "Failure visible"]],
    gallery: [["Alert", "Generation"], ["Warning", "Limits"], ["Ready", "Deploy"]],
    workflow: [["Capture", "System event"], ["Classify", "Urgency"], ["Notify", "Show clean card"], ["Resolve", "Route user"]],
  },
  profile: {
    ...sections.settings,
    title: "Founder Profile",
    kicker: "Identity and access",
    subtitle: "A founder-grade profile surface for account identity, admin access, demo ownership, avatar, security and public-facing operator status.",
    visual: "settings",
    prompt: "Check founder profile readiness for MALIK AI demo: identity, access, avatar, admin state and public-safe display.",
    nextView: "settings",
    stats: [["Identity", "Synced", "Safe profile"], ["Access", "Gated", "Admin only"], ["Demo", "Owner", "Founder visible"]],
    gallery: [["Founder", "Profile"], ["Access", "Role"], ["Session", "Security"]],
    workflow: [["Read", "Session snapshot"], ["Gate", "Check role"], ["Display", "Show public-safe identity"], ["Secure", "Logout cleanly"]],
  },
})

function normalizeView(view: string) {
  const raw = String(view || "").trim()
  const lower = raw.toLowerCase()
  if (sections[raw]) return raw
  if (sections[lower]) return lower
  if (viewAliases[lower]) return viewAliases[lower]
  if (lower.includes("landing")) return "landing-generation"
  if (lower.includes("analytics")) return "analytics"
  if (lower.includes("dashboard")) return "dashboard-generation"
  if (lower.includes("component")) return "component-generation"
  if (lower.includes("document")) return "document-generation"
  if (lower.includes("presentation")) return "presentation-generation"
  if (lower.includes("template")) return "template-generation"
  if (lower.includes("profile")) return "profile"
  if (lower.includes("notification")) return "notifications"
  return "features"
}

function textFromPayload(payload: Record<string, unknown>) {
  const content = payload.content || payload.text || payload.message || payload.publicError || payload.status
  if (typeof content === "string") return content
  if (payload.code && typeof payload.code === "string") return payload.code
  if (payload.url && typeof payload.url === "string") return payload.url
  return JSON.stringify(payload, null, 2)
}

function artifactFor(section: DemoSection, output: string) {
  if (output.startsWith("http") || output.startsWith("data:image")) {
    return `<!doctype html><html><body style="margin:0;background:#020617;color:white;font-family:Arial"><main style="min-height:100vh;padding:40px"><h1>${section.title}</h1><img src="${output}" style="width:100%;max-width:1100px;border-radius:32px;border:1px solid rgba(255,255,255,.15)"/></main></body></html>`
  }
  if (section.kind === "code" || output.includes("export default") || output.includes("<html")) return output
  return `<!doctype html><html><body style="margin:0;background:#020617;color:white;font-family:Arial"><main style="min-height:100vh;padding:40px"><p style="color:#f0d288;font-weight:900">${section.kicker}</p><h1 style="font-size:56px">${section.title}</h1><pre style="white-space:pre-wrap;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:24px;background:rgba(255,255,255,.05)">${output.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] || char)}</pre></main></body></html>`
}

function fallbackOutput(section: DemoSection) {
  if (section.visual === "photo") return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="840"><defs><radialGradient id="g" cx="28%" cy="18%" r="85%"><stop stop-color="#e4bb5e"/><stop offset=".45" stop-color="#172554"/><stop offset="1" stop-color="#020617"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="1080" cy="180" r="210" fill="#d9ae45" opacity=".28"/><text x="90" y="150" fill="white" font-size="58" font-weight="900" font-family="Arial">${section.title}</text><text x="90" y="730" fill="#f8e5ac" font-size="34" font-weight="700" font-family="Arial">Digital Bridge visual generated locally</text></svg>`)
  if (section.visual === "cinema") return "Storyboard queued: hero reveal, product flythrough, AI engine close-up, Digital Bridge founder CTA."
  if (section.visual === "code") return `"use client"\n\nexport default function ${section.title.replace(/[^a-zA-Z0-9]/g, "")}Demo() {\n  return <main className="min-h-screen bg-slate-950 p-8 text-white">Digital Bridge code artifact ready</main>\n}\n`
  return `${section.title} demo output ready. Configure API keys to activate live generation.`
}


const universalInvestorProof: Array<[string, string, string]> = [
  ["Architecture", "Clean", "Routes, fallbacks and canvas handoff are visible during a live demo."],
  ["Commercial", "Ready", "Billing, limits and workspace screens explain how the product can become SaaS."],
  ["Demo safety", "Protected", "Every section has a backup state so the stage does not die when an API key is missing."],
]

const visualStageScripts: Record<DemoVisual, string[]> = {
  brain: [
    "Start with the brain: one prompt enters, MALIK AI decides whether it is chat, code, media, website or document.",
    "Show that this is not a landing page only — it is an operating layer for many creator engines.",
    "Close with the founder line: Kazakhstan can build sovereign AI products, not just consume them.",
  ],
  shield: [
    "Open the safety layer and explain that a demo cannot collapse when one provider fails.",
    "Point to retry, fallback and public-safe provider masking.",
    "Say clearly: users see MALIK AI, not raw API chaos.",
  ],
  mission: [
    "Present this as mission control for building, shipping and operating products.",
    "Use Codex and Canvas buttons as proof of workflow, not decoration.",
    "End by routing into Projects to show continuity.",
  ],
  search: [
    "Use this as the fastest live-pitch navigator.",
    "Search becomes command palette plus product memory.",
    "It keeps the founder in control during questions.",
  ],
  creator: [
    "Frame this as the unified creator engine.",
    "Move from idea to website, photo, video, code or deck.",
    "Send a result to Canvas so the audience sees artifact flow.",
  ],
  photo: [
    "Explain MALIK Vision as the image layer.",
    "Show style presets, prompt discipline and gallery proof.",
    "For stage safety, fallback SVG still proves the visual pipeline.",
  ],
  cinema: [
    "Explain async queue and storyboard first; video routes can be slow live.",
    "Show that the UI understands scenes, timing and status.",
    "Do not promise fake instant cinema — show pipeline maturity.",
  ],
  website: [
    "Position this as the public face of any startup idea.",
    "Generate hero, proof, pricing and CTA.",
    "Canvas handoff makes it feel like a real builder.",
  ],
  code: [
    "Tell developers this is the build lab.",
    "Show TSX artifact export and component thinking.",
    "Route into Codex for serious project work.",
  ],
  projects: [
    "Explain that generated work cannot disappear after one chat.",
    "Projects create continuity and memory.",
    "This is where MALIK AI becomes a workspace, not a toy.",
  ],
  chats: [
    "Show normal chat stays clean and does not open empty canvas.",
    "Use it for founder prep, product thinking and support.",
    "It is the calm cockpit behind the generators.",
  ],
  design: [
    "Explain visual consistency: tokens, surfaces, motion and premium identity.",
    "This protects the product from looking like random AI output.",
    "It makes MALIK AI investor-readable.",
  ],
  templates: [
    "Templates turn repeated startup work into launch kits.",
    "They are reusable prompt and artifact shelves.",
    "This is a marketplace direction for the future.",
  ],
  billing: [
    "Show that the product has a commercial path.",
    "Usage limits and tiers make the SaaS story real.",
    "Investors need this screen to understand revenue architecture.",
  ],
  settings: [
    "Keep this boring on purpose: identity, security, role and logout must feel reliable.",
    "Public demo should never expose secrets.",
    "Admin/debug remains gated.",
  ],
  support: [
    "Support proves operational maturity.",
    "Health checks, queues and status reduce demo risk.",
    "This is how the product earns trust.",
  ],
}

function buildControlRoom(section: DemoSection, username?: string): Array<[string, string]> {
  return section.controlRoom || [
    ["Operator", username ? username.split("@")[0] : "Founder"],
    ["Current engine", section.kicker],
    ["Next move", section.nextView.replace(/-/g, " ")],
    ["Artifact path", section.endpoint ? section.endpoint : "local fallback"],
  ]
}

function buildInvestorProof(section: DemoSection): Array<[string, string, string]> {
  return section.investorProof || universalInvestorProof
}

function buildStageScript(section: DemoSection): string[] {
  return section.stageScript || visualStageScripts[section.visual] || visualStageScripts.brain
}

const universeLanguage: Record<DemoVisual, { lab: string; labState: string; features: string; featureState: string; workflow: string; workflowState: string; assets: string; assetState: string }> = {
  brain: { lab: "Reasoning lab", labState: "Router live", features: "Cognitive modules", featureState: "Brain identity", workflow: "Thought path", workflowState: "Intent to output", assets: "Neural proofs", assetState: "Demo memory" },
  shield: { lab: "Resilience lab", labState: "Guard active", features: "Protection layers", featureState: "Failure-safe", workflow: "Recovery chain", workflowState: "No dead screen", assets: "Safety signals", assetState: "Runtime proof" },
  mission: { lab: "Mission console", labState: "Command ready", features: "Agent controls", featureState: "Launch ops", workflow: "Execution lanes", workflowState: "Brief to ship", assets: "Mission files", assetState: "Operational" },
  search: { lab: "Search router", labState: "Index awake", features: "Result intelligence", featureState: "Command palette", workflow: "Discovery flow", workflowState: "Find to open", assets: "Search results", assetState: "Routable" },
  creator: { lab: "Creator engine", labState: "Multi-output", features: "Creation modes", featureState: "AI studio", workflow: "Creation flow", workflowState: "Prompt to artifact", assets: "Output wall", assetState: "Generated" },
  photo: { lab: "Vision prompt", labState: "Render-ready", features: "Image controls", featureState: "Photo identity", workflow: "Image pipeline", workflowState: "Prompt to gallery", assets: "Photo set", assetState: "Visual" },
  cinema: { lab: "Cinema prompt", labState: "Queue-ready", features: "Motion controls", featureState: "Film identity", workflow: "Render timeline", workflowState: "Script to video", assets: "Storyboard", assetState: "Scenes" },
  website: { lab: "Website brief", labState: "Canvas-ready", features: "Page systems", featureState: "Web identity", workflow: "Build flow", workflowState: "Brief to site", assets: "Page shots", assetState: "Preview" },
  code: { lab: "Code brief", labState: "Compiler path", features: "Dev powers", featureState: "Code identity", workflow: "Build chain", workflowState: "Spec to TSX", assets: "File artifacts", assetState: "Source" },
  projects: { lab: "Project brief", labState: "Workspace", features: "Project memory", featureState: "Launch identity", workflow: "Project chain", workflowState: "Idea to status", assets: "Project galaxy", assetState: "Tracked" },
  chats: { lab: "Chat brief", labState: "Conversation", features: "Dialogue powers", featureState: "Chat identity", workflow: "Conversation flow", workflowState: "Ask to remember", assets: "Dialogue stream", assetState: "History" },
  design: { lab: "Design brief", labState: "Style system", features: "Visual rules", featureState: "Design identity", workflow: "Design path", workflowState: "Token to screen", assets: "Style boards", assetState: "Brand" },
  templates: { lab: "Template brief", labState: "Kit builder", features: "Template packs", featureState: "Library identity", workflow: "Template chain", workflowState: "Pick to launch", assets: "Template shelves", assetState: "Reusable" },
  billing: { lab: "Pricing lab", labState: "Commercial", features: "Revenue logic", featureState: "Business identity", workflow: "Billing path", workflowState: "Plan to paid", assets: "Plan stack", assetState: "Monetized" },
  settings: { lab: "Profile lab", labState: "Access safe", features: "Identity controls", featureState: "Account identity", workflow: "Access chain", workflowState: "Login to role", assets: "Profile matrix", assetState: "Secure" },
  support: { lab: "Ops lab", labState: "Health ready", features: "Support layers", featureState: "Ops identity", workflow: "Resolution path", workflowState: "Check to resolve", assets: "Status wall", assetState: "Online" },
}

function cssVars(vars: Record<`--${string}`, string | number>) {
  return vars as CSSProperties
}

function renderUniverseVisual(section: DemoSection) {
  const gallery = section.gallery
  const dots = Array.from({ length: 18 }, (_, index) => index)
  const bars = Array.from({ length: 10 }, (_, index) => index)

  if (section.visual === "photo") {
    return (
      <div className="dbx-universe dbx-photo-universe">
        <div className="dbx-lens-orb" />
        {gallery.map(([title, note], index) => (
          <article key={title} className={`dbx-gallery-frame frame-${index + 1}`}>
            <div className="dbx-photo-image"><span /><span /><span /></div>
            <strong>{title}</strong>
            <em>{note}</em>
          </article>
        ))}
        <div className="dbx-camera-strip">{bars.slice(0, 7).map((item) => <span key={item} />)}</div>
      </div>
    )
  }

  if (section.visual === "cinema") {
    return (
      <div className="dbx-universe dbx-cinema-universe">
        <div className="dbx-play-screen"><i /></div>
        <div className="dbx-film-strip">{bars.map((item) => <span key={item} />)}</div>
        <div className="dbx-scene-stack">
          {gallery.map(([title, note], index) => (
            <article key={title} style={cssVars({ "--offset": `${index * 74}px`, "--shift": `${index * -22}px` })}>
              <strong>{title}</strong>
              <em>{note}</em>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (section.visual === "code") {
    return (
      <div className="dbx-universe dbx-code-universe">
        <div className="dbx-editor-window">
          <header><span /><span /><span /><strong>{section.title}.tsx</strong></header>
          <pre>{`export function ${section.title.replace(/[^a-zA-Z0-9]/g, "")}() {\n  const route = "live-api";\n  return <PremiumArtifact />\n}`}</pre>
        </div>
        <div className="dbx-file-stack">
          {gallery.map(([title, note]) => <span key={title}><strong>{title}</strong><em>{note}</em></span>)}
        </div>
      </div>
    )
  }

  if (section.visual === "website") {
    return (
      <div className="dbx-universe dbx-website-universe">
        <div className="dbx-browser-shot">
          <header><span /><span /><span /></header>
          <section><b /><b /><b /></section>
          <footer>{gallery.map(([title]) => <i key={title}>{title}</i>)}</footer>
        </div>
        <div className="dbx-page-orbit"><span /><span /></div>
      </div>
    )
  }

  if (section.visual === "shield") {
    return (
      <div className="dbx-universe dbx-shield-universe">
        <div className="dbx-shield-core"><span /><i /></div>
        <div className="dbx-guard-rings"><span /><span /><span /></div>
        <div className="dbx-security-list">
          {gallery.map(([title, note]) => <strong key={title}>{title}<em>{note}</em></strong>)}
        </div>
      </div>
    )
  }

  if (section.visual === "mission") {
    return (
      <div className="dbx-universe dbx-mission-universe">
        <div className="dbx-radar"><span /><span /><span /></div>
        <div className="dbx-command-lanes">
          {section.workflow.map(([title, note], index) => <article key={title}><i>0{index + 1}</i><strong>{title}</strong><em>{note}</em></article>)}
        </div>
      </div>
    )
  }

  if (section.visual === "search") {
    return (
      <div className="dbx-universe dbx-search-universe">
        <div className="dbx-search-core"><span>Ctrl K</span><strong>{section.title}</strong></div>
        <div className="dbx-result-beams">
          {gallery.map(([title, note], index) => <article key={title} className={`beam-${index + 1}`}><strong>{title}</strong><em>{note}</em></article>)}
        </div>
      </div>
    )
  }

  if (section.visual === "projects") {
    return (
      <div className="dbx-universe dbx-project-universe dbx-projects-universe">
        <div className="dbx-project-core">{section.title}</div>
        {gallery.map(([title, note], index) => <article key={title} className={`project-orbit-${index + 1}`}><strong>{title}</strong><em>{note}</em></article>)}
        {dots.slice(0, 10).map((dot) => <i key={dot} style={cssVars({ "--x": `${12 + ((dot * 19) % 76)}%`, "--y": `${14 + ((dot * 23) % 66)}%`, "--delay": `${dot * -0.14}s` })} />)}
      </div>
    )
  }

  if (section.visual === "chats") {
    return (
      <div className="dbx-universe dbx-chat-universe dbx-chats-universe">
        {gallery.map(([title, note], index) => <article key={title} className={`bubble-${index + 1}`}><strong>{title}</strong><em>{note}</em></article>)}
        <div className="dbx-voice-wave">{bars.map((item) => <span key={item} style={cssVars({ "--bar-height": `${18 + ((item * 17) % 62)}px`, "--delay": `${item * -0.08}s` })} />)}</div>
      </div>
    )
  }

  if (section.visual === "design") {
    return (
      <div className="dbx-universe dbx-design-universe">
        <div className="dbx-token-wheel">{dots.slice(0, 12).map((dot) => <span key={dot} style={cssVars({ "--angle": `${dot * 30}deg`, "--hue": `${dot * 28}` })} />)}</div>
        <div className="dbx-style-board">
          {gallery.map(([title, note]) => <article key={title}><b /><strong>{title}</strong><em>{note}</em></article>)}
        </div>
      </div>
    )
  }

  if (section.visual === "templates") {
    return (
      <div className="dbx-universe dbx-template-universe dbx-templates-universe">
        {gallery.map(([title, note], index) => <article key={title} className={`shelf-${index + 1}`}><div /><strong>{title}</strong><em>{note}</em></article>)}
        <div className="dbx-template-grid">{dots.slice(0, 16).map((dot) => <span key={dot} />)}</div>
      </div>
    )
  }

  if (section.visual === "billing") {
    return (
      <div className="dbx-universe dbx-billing-universe">
        {["Free", "Pro", "Enterprise"].map((plan, index) => <article key={plan} className={`plan-${index + 1}`}><span>{plan}</span><strong>{index === 0 ? "$0" : index === 1 ? "$49" : "Custom"}</strong><em>{gallery[index]?.[0] || "Plan"}</em></article>)}
        <div className="dbx-revenue-curve">{bars.map((item) => <span key={item} style={cssVars({ "--bar-height": `${24 + item * 8}px` })} />)}</div>
      </div>
    )
  }

  if (section.visual === "settings") {
    return (
      <div className="dbx-universe dbx-settings-universe">
        <div className="dbx-profile-card"><span>{section.title.slice(0, 1)}</span><strong>{section.title}</strong><em>Access matrix ready</em></div>
        {gallery.map(([title, note]) => <article key={title}><strong>{title}</strong><em>{note}</em><span /></article>)}
      </div>
    )
  }

  if (section.visual === "support") {
    return (
      <div className="dbx-universe dbx-support-universe">
        <div className="dbx-status-pulse"><span /></div>
        {gallery.map(([title, note], index) => <article key={title} className={`ops-${index + 1}`}><strong>{title}</strong><em>{note}</em></article>)}
      </div>
    )
  }

  if (section.visual === "creator") {
    return (
      <div className="dbx-universe dbx-creator-universe">
        <div className="dbx-creator-core"><span>AI</span><strong>Text Photo Video Code Site</strong></div>
        {gallery.map(([title, note], index) => <article key={title} className={`creator-card-${index + 1}`}><strong>{title}</strong><em>{note}</em></article>)}
      </div>
    )
  }

  return (
    <div className="dbx-universe dbx-brain-universe">
      <div className="dbx-brain-core"><span /><span /><span /></div>
      <div className="dbx-neural-web">
        {dots.map((dot) => <i key={dot} style={cssVars({ "--x": `${10 + ((dot * 17) % 82)}%`, "--y": `${12 + ((dot * 29) % 70)}%`, "--delay": `${dot * -0.12}s` })} />)}
      </div>
      <div className="dbx-cortex-cards">
        {gallery.map(([title, note]) => <article key={title}><strong>{title}</strong><em>{note}</em></article>)}
      </div>
    </div>
  )
}

export function DigitalBridgeSectionExperience({
  activeView,
  username,
  chats = [],
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: DigitalBridgeSectionExperienceProps) {
  const normalizedView = normalizeView(activeView)
  const section = sections[normalizedView] || sections.features
  const language = universeLanguage[section.visual]
  const [prompt, setPrompt] = useState(section.prompt)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Ready for Digital Bridge demo")
  const [output, setOutput] = useState("")
  const requestSeqRef = useRef(0)

  useEffect(() => {
    requestSeqRef.current += 1
    setPrompt(takePrefillPrompt() || section.prompt)
    setStatus("Ready for Digital Bridge demo")
    setOutput("")
    setLoading(false)
  }, [normalizedView, section.prompt])

  const controlRoom = useMemo(() => buildControlRoom(section, username), [section, username])
  const investorProof = useMemo(() => buildInvestorProof(section), [section])
  const stageScript = useMemo(() => buildStageScript(section), [section])

  const visibleProjects = useMemo(() => {
    const fallback = [
      { id: "demo-1", title: "Digital Bridge investor demo", status: "ready", techStack: ["Website", "AI", "Canvas"] },
      { id: "demo-2", title: "MALIK Vision launch gallery", status: "building", techStack: ["Photo", "FAL", "OpenAI"] },
      { id: "demo-3", title: "MALIK Cinema storyboard", status: "draft", techStack: ["Video", "Queue", "Veo"] },
    ]
    return chats.length ? chats.slice(0, 6) : fallback
  }, [chats])

  const runLive = async () => {
    if (!section.endpoint) return
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    const isCurrentRequest = () => requestSeqRef.current === requestSeq

    setLoading(true)
    setStatus("Calling live route...")
    try {
      const response = await clientFetchWithTimeout(section.endpoint, section.method === "GET" ? { method: "GET" } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          message: prompt,
          kind: section.kind,
          userEmail: username,
          aspectRatio: section.visual === "cinema" ? "16:9" : "1:1",
          duration: section.visual === "cinema" ? 5 : undefined,
          style: section.kicker,
        }),
      }, section.visual === "cinema" ? 190_000 : 95_000)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.publicError || payload.message || `Route returned ${response.status}`)
      const nextOutput = textFromPayload(payload)
      if (!isCurrentRequest()) return
      setOutput(nextOutput || fallbackOutput(section))
      setStatus(payload.fallback || payload.fallbackUsed ? "Safe fallback output ready" : "Live route completed")
    } catch {
      if (!isCurrentRequest()) return
      setOutput(fallbackOutput(section))
      setStatus("Backup mode active")
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }

  const sendCanvas = () => {
    const next = artifactFor(section, output || fallbackOutput(section))
    onOpenCanvas?.(next)
  }

  return (
    <main className={`db-section-experience db-section-${section.tone} db-universe-${section.visual}`} data-visual={section.visual} data-view={normalizedView}>
      <div className="dbx-background" aria-hidden="true"><span /><span /><span /><span /></div>

      <section className="dbx-hero">
        <div className="dbx-copy">
          <div className="dbx-kicker"><span>AI & Digital Bridge 2026</span><i>{section.kicker}</i></div>
          <h1>{section.title}</h1>
          <p>{section.subtitle}</p>
          <div className="dbx-actions">
            <button type="button" onClick={runLive} disabled={loading}>{loading ? "Running..." : "Run live route"}</button>
            <button type="button" onClick={sendCanvas}>Send to Canvas</button>
            <button type="button" onClick={() => onViewChange(section.nextView)}>Next section</button>
            <button type="button" onClick={onOpenCodex}>Open Codex</button>
          </div>

          <div className="dbx-trust-row" aria-label="Demo control signals">
            {controlRoom.map(([label, value]) => (
              <span key={label}><strong>{label}</strong><em>{value}</em></span>
            ))}
          </div>
        </div>

        <div className="dbx-visual" aria-label={`${section.title} animated visual`}>
          {renderUniverseVisual(section)}
          <div className="dbx-visual-hud">
            <span>LIVE DEMO</span>
            <strong>{section.visual.toUpperCase()}</strong>
            <em>{section.endpoint || "local-safe"}</em>
          </div>
        </div>
      </section>

      <section className="dbx-stats">
        {section.stats.map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </section>

      <section className="dbx-main-grid">
        <article className="dbx-panel dbx-prompt-lab">
          <div className="dbx-panel-head">
            <span>{language.lab}</span>
            <strong>{status || language.labState}</strong>
          </div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="dbx-lab-actions">
            <button type="button" onClick={runLive} disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
            <button type="button" onClick={() => setPrompt(section.prompt)}>Reset prompt</button>
            <button type="button" onClick={sendCanvas}>Canvas artifact</button>
          </div>
          <pre>{output || fallbackOutput(section)}</pre>
        </article>

        <article className="dbx-panel dbx-feature-wall">
          <div className="dbx-panel-head">
            <span>{language.features}</span>
            <strong>{language.featureState}</strong>
          </div>
          <div className="dbx-feature-list">
            {section.features.map(([title, text], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="dbx-panel dbx-workflow">
          <div className="dbx-panel-head">
            <span>{language.workflow}</span>
            <strong>{language.workflowState}</strong>
          </div>
          {section.workflow.map(([title, text], index) => (
            <div key={title} className="dbx-step">
              <i>{index + 1}</i>
              <span><strong>{title}</strong><em>{text}</em></span>
            </div>
          ))}
        </article>

        <article className="dbx-panel dbx-project-wall">
          <div className="dbx-panel-head">
            <span>{language.assets}</span>
            <strong>{language.assetState}</strong>
          </div>
          <div className="dbx-project-list">
            {visibleProjects.map((item) => (
              <button key={item.id} type="button" onClick={() => item.id.startsWith("demo") ? onViewChange(section.nextView) : onViewChange("chats")}>
                <strong>{item.title}</strong>
                <span>{item.status || "draft"}</span>
                <em>{item.techStack?.join(" / ") || section.kicker}</em>
              </button>
            ))}
          </div>
          <button className="dbx-new-project" type="button" onClick={onNewChat}>New demo project</button>
        </article>

        <article className="dbx-panel dbx-investor-room">
          <div className="dbx-panel-head">
            <span>Investor proof</span>
            <strong>{section.commercialAngle || "Stage-ready story"}</strong>
          </div>
          <div className="dbx-investor-proof">
            {investorProof.map(([title, value, note]) => (
              <div key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
                <p>{note}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="dbx-panel dbx-stage-script">
          <div className="dbx-panel-head">
            <span>Founder script</span>
            <strong>What to say on demo stage</strong>
          </div>
          <ol>
            {stageScript.map((line, index) => (
              <li key={line}><span>{String(index + 1).padStart(2, "0")}</span><p>{line}</p></li>
            ))}
          </ol>
        </article>
      </section>

      <style jsx global>{`
        .db-section-experience {
          --dbx-a: #f0d288;
          --dbx-b: #e8c56a;
          position: relative;
          isolation: isolate;
          min-height: 100%;
          width: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(18px, 2vw, 32px);
          color: white;
          background:
            radial-gradient(ellipse 46% 30% at 50% 0%, color-mix(in srgb, var(--dbx-a) 18%, transparent), transparent 70%),
            radial-gradient(ellipse 36% 50% at 4% 42%, color-mix(in srgb, var(--dbx-a) 22%, transparent), transparent 74%),
            radial-gradient(ellipse 36% 50% at 96% 42%, color-mix(in srgb, var(--dbx-b) 20%, transparent), transparent 74%),
            linear-gradient(180deg, #020617 0%, #030712 58%, #01030a 100%);
        }

        .db-section-cyan { --dbx-a: #f0d288; --dbx-b: #e4bb5e; }
        .db-section-violet { --dbx-a: #e8c56a; --dbx-b: #f3de96; }
        .db-section-emerald { --dbx-a: #6ee7b7; --dbx-b: #e4bb5e; }
        .db-section-amber { --dbx-a: #fbbf24; --dbx-b: #fb7185; }
        .db-section-rose { --dbx-a: #fb7185; --dbx-b: #f3de96; }
        .db-section-blue { --dbx-a: #e4bb5e; --dbx-b: #f0d288; }

        .dbx-background {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .dbx-background::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .62;
          background:
            radial-gradient(circle at 14% 16%, rgba(255,255,255,.78) 0 1px, transparent 2px),
            radial-gradient(circle at 82% 24%, rgba(255,255,255,.54) 0 1px, transparent 2px),
            radial-gradient(circle at 52% 86%, rgba(255,255,255,.38) 0 1px, transparent 2px),
            linear-gradient(rgba(148,163,184,.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,.045) 1px, transparent 1px);
          background-size: 360px 240px, 480px 310px, 420px 280px, 54px 54px, 54px 54px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.82), rgba(0,0,0,.38) 58%, transparent 100%);
        }

        .dbx-background span {
          position: absolute;
          width: min(760px, 58vw);
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--dbx-a), var(--dbx-b), transparent);
          box-shadow: 0 0 30px color-mix(in srgb, var(--dbx-a) 48%, transparent);
          opacity: .46;
          animation: dbxBeam 8s ease-in-out infinite;
        }

        .dbx-background span:nth-child(1) { left: -12%; top: 18%; transform: rotate(-10deg); }
        .dbx-background span:nth-child(2) { right: -14%; top: 32%; transform: rotate(9deg); animation-delay: -2s; }
        .dbx-background span:nth-child(3) { left: 12%; bottom: 14%; transform: rotate(3deg); animation-delay: -4s; }
        .dbx-background span:nth-child(4) { right: 20%; bottom: 24%; transform: rotate(-5deg); animation-delay: -6s; }

        .dbx-hero,
        .dbx-stats,
        .dbx-main-grid {
          position: relative;
          z-index: 2;
          margin-inline: auto;
          width: min(100%, 1660px);
        }

        .dbx-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(420px, .92fr);
          gap: clamp(18px, 2.5vw, 38px);
          min-height: 460px;
          overflow: hidden;
          border: 1px solid rgba(148,163,184,.2);
          border-radius: 38px;
          background:
            linear-gradient(135deg, rgba(15,23,42,.86), rgba(2,6,23,.58)),
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--dbx-a) 22%, transparent), transparent 36%),
            radial-gradient(circle at 92% 4%, color-mix(in srgb, var(--dbx-b) 20%, transparent), transparent 36%);
          padding: clamp(24px, 3.4vw, 54px);
          box-shadow: 0 30px 120px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.07);
        }

        .dbx-copy {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .dbx-kicker {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 18px;
        }

        .dbx-kicker span,
        .dbx-kicker i {
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 999px;
          background: rgba(15,23,42,.62);
          color: rgba(226,232,240,.9);
          padding: 8px 11px;
          font-size: 10px;
          font-style: normal;
          font-weight: 950;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .dbx-kicker i { color: var(--dbx-a); }

        .dbx-copy h1 {
          margin: 0;
          max-width: 900px;
          background: linear-gradient(92deg, #fff 0%, #e0f2fe 34%, var(--dbx-a) 62%, var(--dbx-b) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: clamp(48px, 6vw, 104px);
          font-weight: 1000;
          letter-spacing: -.07em;
          line-height: .88;
        }

        .dbx-copy p {
          margin: 20px 0 0;
          max-width: 780px;
          color: rgba(203,213,225,.82);
          font-size: clamp(15px, 1.22vw, 19px);
          line-height: 1.75;
        }

        .dbx-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 30px;
        }

        .dbx-actions button,
        .dbx-lab-actions button,
        .dbx-new-project {
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 18px;
          background: rgba(15,23,42,.72);
          color: white;
          padding: 12px 16px;
          font-weight: 950;
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }

        .dbx-actions button:first-child,
        .dbx-lab-actions button:first-child {
          border-color: color-mix(in srgb, var(--dbx-a) 46%, transparent);
          background: linear-gradient(135deg, color-mix(in srgb, var(--dbx-a) 26%, #0f172a), color-mix(in srgb, var(--dbx-b) 18%, #111827));
          box-shadow: 0 18px 64px color-mix(in srgb, var(--dbx-a) 18%, transparent);
        }

        .dbx-actions button:hover,
        .dbx-lab-actions button:hover,
        .dbx-new-project:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--dbx-a) 46%, transparent);
        }

        .dbx-visual {
          position: relative;
          min-height: 410px;
          border: 1px solid rgba(148,163,184,.16);
          border-radius: 34px;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--dbx-a) 22%, transparent), transparent 44%),
            radial-gradient(circle at 76% 70%, color-mix(in srgb, var(--dbx-b) 20%, transparent), transparent 48%),
            rgba(2,6,23,.54);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        }

        .dbx-universe {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .dbx-universe::before {
          content: "";
          position: absolute;
          inset: -20%;
          background:
            radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--dbx-a) 36%, transparent), transparent 22%),
            radial-gradient(circle at 76% 72%, color-mix(in srgb, var(--dbx-b) 30%, transparent), transparent 30%);
          filter: blur(10px);
          opacity: .76;
          animation: dbxUniverseGlow 9s ease-in-out infinite alternate;
        }

        .dbx-universe article,
        .dbx-universe strong,
        .dbx-universe em,
        .dbx-universe span,
        .dbx-universe i,
        .dbx-universe b,
        .dbx-universe pre {
          position: relative;
          z-index: 2;
        }

        .dbx-universe article {
          border: 1px solid rgba(148,163,184,.17);
          background: rgba(15,23,42,.7);
          box-shadow: 0 20px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07);
          backdrop-filter: blur(16px);
        }

        .dbx-brain-core {
          position: absolute;
          left: 50%;
          top: 47%;
          width: 250px;
          height: 250px;
          transform: translate(-50%, -50%);
          border-radius: 42% 58% 46% 54%;
          border: 1px solid color-mix(in srgb, var(--dbx-a) 34%, transparent);
          background:
            radial-gradient(circle at 34% 24%, rgba(255,255,255,.78), transparent 10%),
            radial-gradient(circle at 34% 40%, var(--dbx-a), transparent 34%),
            radial-gradient(circle at 70% 66%, var(--dbx-b), transparent 42%),
            rgba(2,6,23,.9);
          box-shadow: 0 0 100px color-mix(in srgb, var(--dbx-a) 34%, transparent);
          animation: dbxBrainMorph 7s ease-in-out infinite alternate;
        }

        .dbx-brain-core span {
          position: absolute;
          inset: 18%;
          border-radius: inherit;
          border: 1px dashed rgba(255,255,255,.22);
          animation: dbxSpin 16s linear infinite;
        }

        .dbx-brain-core span:nth-child(2) { inset: 30%; animation-direction: reverse; }
        .dbx-brain-core span:nth-child(3) { inset: 42%; animation-duration: 9s; }

        .dbx-neural-web i,
        .dbx-project-universe i {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: var(--dbx-a);
          box-shadow: 0 0 22px var(--dbx-a);
          animation: dbxPulseDot 2.8s ease-in-out infinite;
          animation-delay: var(--delay, 0s);
        }

        .dbx-cortex-cards article,
        .dbx-security-list strong,
        .dbx-result-beams article {
          position: absolute;
          width: 178px;
          border-radius: 22px;
          padding: 14px;
        }

        .dbx-cortex-cards article:nth-child(1) { left: 7%; top: 10%; }
        .dbx-cortex-cards article:nth-child(2) { right: 7%; top: 30%; }
        .dbx-cortex-cards article:nth-child(3) { left: 28%; bottom: 9%; }

        .dbx-photo-universe {
          background:
            linear-gradient(115deg, rgba(8,47,73,.18), transparent 45%),
            repeating-linear-gradient(90deg, rgba(240, 210, 136,.08) 0 1px, transparent 1px 52px);
        }

        .dbx-lens-orb {
          position: absolute;
          right: 8%;
          top: 12%;
          width: 170px;
          height: 170px;
          border-radius: 999px;
          background:
            conic-gradient(from 120deg, #f0d288, #e4bb5e, #f3de96, #f0d288);
          filter: drop-shadow(0 0 50px rgba(240, 210, 136,.46));
          opacity: .9;
          animation: dbxSpin 14s linear infinite;
        }

        .dbx-lens-orb::after {
          content: "";
          position: absolute;
          inset: 22px;
          border-radius: inherit;
          background: #020617;
        }

        .dbx-gallery-frame {
          position: absolute;
          width: 230px;
          border-radius: 28px;
          padding: 11px;
        }

        .dbx-gallery-frame.frame-1 { left: 7%; top: 10%; transform: rotate(-5deg); }
        .dbx-gallery-frame.frame-2 { left: 26%; bottom: 8%; transform: rotate(3deg); }
        .dbx-gallery-frame.frame-3 { right: 8%; bottom: 11%; transform: rotate(-2deg); }

        .dbx-photo-image {
          height: 148px;
          overflow: hidden;
          border-radius: 22px;
          background:
            radial-gradient(circle at 28% 26%, #e0f2fe, transparent 9%),
            radial-gradient(circle at 38% 34%, #e4bb5e, transparent 28%),
            radial-gradient(circle at 78% 36%, #f3de96, transparent 32%),
            linear-gradient(140deg, #082f49, #172554, #020617);
        }

        .dbx-photo-image span {
          position: absolute;
          left: 12%;
          right: 9%;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.92), transparent);
          animation: dbxBeam .9s ease-in-out infinite alternate;
        }

        .dbx-photo-image span:nth-child(1) { top: 35%; transform: rotate(-8deg); }
        .dbx-photo-image span:nth-child(2) { top: 56%; transform: rotate(7deg); animation-delay: -.25s; }
        .dbx-photo-image span:nth-child(3) { top: 74%; transform: rotate(-3deg); animation-delay: -.5s; }

        .dbx-camera-strip,
        .dbx-film-strip {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 22px;
          display: flex;
          gap: 10px;
          justify-content: center;
        }

        .dbx-camera-strip span,
        .dbx-film-strip span {
          width: 42px;
          height: 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--dbx-a) 28%, transparent);
          box-shadow: 0 0 22px color-mix(in srgb, var(--dbx-a) 24%, transparent);
        }

        .dbx-play-screen {
          position: absolute;
          left: 9%;
          right: 9%;
          top: 12%;
          height: 210px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 30px;
          background:
            radial-gradient(circle at 50% 40%, rgba(251,113,133,.36), transparent 32%),
            linear-gradient(130deg, rgba(15,23,42,.9), rgba(88,28,135,.28), rgba(2,6,23,.88));
          box-shadow: inset 0 0 80px rgba(251,113,133,.12), 0 0 80px rgba(251,113,133,.16);
        }

        .dbx-play-screen i {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 74px;
          height: 74px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          box-shadow: 0 0 40px rgba(255,255,255,.22);
        }

        .dbx-play-screen i::after {
          content: "";
          position: absolute;
          left: 31px;
          top: 22px;
          border-left: 22px solid white;
          border-top: 14px solid transparent;
          border-bottom: 14px solid transparent;
        }

        .dbx-scene-stack article {
          position: absolute;
          right: 7%;
          bottom: calc(34px + var(--offset, 0px));
          width: 220px;
          border-radius: 22px;
          padding: 14px;
          transform: translateX(var(--shift, 0px));
        }

        .dbx-editor-window {
          position: absolute;
          left: 7%;
          right: 8%;
          top: 11%;
          min-height: 270px;
          overflow: hidden;
          border: 1px solid rgba(251,191,36,.22);
          border-radius: 28px;
          background: rgba(0,0,0,.68);
          box-shadow: 0 0 70px rgba(251,191,36,.12);
        }

        .dbx-editor-window header,
        .dbx-browser-shot header {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 42px;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding: 0 14px;
          background: rgba(15,23,42,.78);
        }

        .dbx-editor-window header span,
        .dbx-browser-shot header span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--dbx-a);
        }

        .dbx-editor-window header strong {
          margin-left: 8px;
          color: rgba(226,232,240,.78);
          font-size: 11px;
        }

        .dbx-editor-window pre {
          margin: 0;
          padding: 20px;
          color: #fde68a;
          font-size: 13px;
          line-height: 1.8;
          white-space: pre-wrap;
        }

        .dbx-file-stack {
          position: absolute;
          right: 8%;
          bottom: 9%;
          display: grid;
          gap: 10px;
          width: 210px;
        }

        .dbx-file-stack span {
          display: block;
          border: 1px solid rgba(251,191,36,.16);
          border-radius: 18px;
          background: rgba(15,23,42,.78);
          padding: 12px;
        }

        .dbx-browser-shot {
          position: absolute;
          left: 8%;
          right: 8%;
          top: 10%;
          bottom: 10%;
          border: 1px solid rgba(110,231,183,.2);
          border-radius: 30px;
          overflow: hidden;
          background: rgba(2,6,23,.72);
        }

        .dbx-browser-shot section {
          display: grid;
          grid-template-columns: 1.2fr .8fr;
          gap: 14px;
          padding: 18px;
        }

        .dbx-browser-shot section b {
          min-height: 94px;
          border-radius: 20px;
          background: linear-gradient(135deg, color-mix(in srgb, var(--dbx-a) 30%, transparent), rgba(255,255,255,.04));
        }

        .dbx-browser-shot section b:first-child {
          grid-column: span 2;
          min-height: 120px;
        }

        .dbx-browser-shot footer {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          padding: 0 18px 18px;
        }

        .dbx-browser-shot footer i {
          border-radius: 16px;
          background: rgba(255,255,255,.05);
          color: rgba(226,232,240,.76);
          padding: 12px;
          font-size: 11px;
          font-style: normal;
          font-weight: 900;
        }

        .dbx-page-orbit span {
          position: absolute;
          border: 1px solid color-mix(in srgb, var(--dbx-a) 22%, transparent);
          border-radius: 999px;
          animation: dbxSpin 20s linear infinite;
        }

        .dbx-page-orbit span:first-child { inset: 8%; }
        .dbx-page-orbit span:last-child { inset: 18%; animation-direction: reverse; }

        .dbx-shield-core {
          position: absolute;
          left: 50%;
          top: 45%;
          width: 190px;
          height: 230px;
          transform: translate(-50%, -50%);
          clip-path: polygon(50% 0, 92% 18%, 84% 72%, 50% 100%, 16% 72%, 8% 18%);
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,.75), transparent 12%),
            linear-gradient(160deg, var(--dbx-a), rgba(15,23,42,.88), var(--dbx-b));
          box-shadow: 0 0 90px color-mix(in srgb, var(--dbx-a) 30%, transparent);
          animation: dbxFloat 6s ease-in-out infinite alternate;
        }

        .dbx-guard-rings span,
        .dbx-radar span {
          position: absolute;
          inset: 16%;
          border-radius: 999px;
          border: 1px dashed color-mix(in srgb, var(--dbx-a) 26%, transparent);
          animation: dbxSpin 18s linear infinite;
        }

        .dbx-guard-rings span:nth-child(2),
        .dbx-radar span:nth-child(2) { inset: 27%; animation-direction: reverse; }
        .dbx-guard-rings span:nth-child(3),
        .dbx-radar span:nth-child(3) { inset: 38%; animation-duration: 9s; }

        .dbx-security-list strong:nth-child(1) { left: 7%; top: 13%; }
        .dbx-security-list strong:nth-child(2) { right: 7%; top: 35%; }
        .dbx-security-list strong:nth-child(3) { left: 24%; bottom: 10%; }

        .dbx-radar {
          position: absolute;
          left: 8%;
          top: 11%;
          width: 260px;
          height: 260px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(251,191,36,.2), transparent 62%);
        }

        .dbx-radar::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 48%;
          height: 2px;
          transform-origin: left center;
          background: linear-gradient(90deg, var(--dbx-a), transparent);
          animation: dbxSpin 4s linear infinite;
        }

        .dbx-command-lanes {
          position: absolute;
          right: 7%;
          top: 10%;
          bottom: 10%;
          display: grid;
          gap: 10px;
          width: 260px;
        }

        .dbx-command-lanes article {
          border-radius: 20px;
          padding: 13px;
        }

        .dbx-search-core {
          position: absolute;
          left: 50%;
          top: 28%;
          width: min(76%, 440px);
          transform: translateX(-50%);
          border: 1px solid rgba(228, 187, 94,.22);
          border-radius: 999px;
          background: rgba(2,6,23,.76);
          padding: 18px 24px;
          box-shadow: 0 0 70px rgba(228, 187, 94,.16);
        }

        .dbx-search-core span {
          display: inline-flex;
          margin-right: 12px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          padding: 6px 10px;
          color: var(--dbx-a);
          font-size: 11px;
          font-weight: 950;
        }

        .dbx-result-beams article.beam-1 { left: 8%; bottom: 18%; }
        .dbx-result-beams article.beam-2 { left: 36%; bottom: 9%; }
        .dbx-result-beams article.beam-3 { right: 8%; bottom: 22%; }

        .dbx-project-core,
        .dbx-creator-core {
          position: absolute;
          left: 50%;
          top: 48%;
          display: grid;
          place-items: center;
          width: 210px;
          height: 210px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--dbx-a) 34%, transparent);
          background: radial-gradient(circle, color-mix(in srgb, var(--dbx-a) 24%, transparent), rgba(2,6,23,.86));
          color: white;
          text-align: center;
          font-weight: 1000;
          box-shadow: 0 0 90px color-mix(in srgb, var(--dbx-a) 24%, transparent);
        }

        .dbx-project-universe article,
        .dbx-creator-universe article {
          position: absolute;
          width: 170px;
          border-radius: 22px;
          padding: 14px;
        }

        .project-orbit-1,
        .creator-card-1 { left: 8%; top: 16%; }
        .project-orbit-2,
        .creator-card-2 { right: 8%; top: 28%; }
        .project-orbit-3,
        .creator-card-3 { left: 26%; bottom: 9%; }

        .dbx-chat-universe article {
          position: absolute;
          width: 230px;
          border-radius: 26px;
          padding: 16px;
        }

        .bubble-1 { left: 9%; top: 13%; border-bottom-left-radius: 8px !important; }
        .bubble-2 { right: 9%; top: 34%; border-bottom-right-radius: 8px !important; }
        .bubble-3 { left: 24%; bottom: 13%; border-bottom-left-radius: 8px !important; }

        .dbx-voice-wave {
          position: absolute;
          left: 12%;
          right: 12%;
          bottom: 10%;
          display: flex;
          align-items: end;
          gap: 8px;
          height: 78px;
        }

        .dbx-voice-wave span {
          flex: 1;
          border-radius: 999px;
          height: var(--bar-height, 34px);
          background: linear-gradient(180deg, var(--dbx-a), var(--dbx-b));
          animation: dbxWave 1.2s ease-in-out infinite alternate;
          animation-delay: var(--delay, 0s);
        }

        .dbx-token-wheel {
          position: absolute;
          left: 9%;
          top: 10%;
          width: 230px;
          height: 230px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.12);
          animation: dbxSpin 24s linear infinite;
        }

        .dbx-token-wheel span {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 22px;
          height: 22px;
          margin: -11px;
          border-radius: 999px;
          background: hsl(var(--hue, 180), 88%, 66%);
          transform: rotate(var(--angle, 0deg)) translateX(114px);
          box-shadow: 0 0 22px currentColor;
        }

        .dbx-style-board {
          position: absolute;
          right: 8%;
          top: 10%;
          bottom: 10%;
          display: grid;
          gap: 12px;
          width: 260px;
        }

        .dbx-style-board article,
        .dbx-template-universe article,
        .dbx-billing-universe article,
        .dbx-settings-universe article,
        .dbx-support-universe article {
          border-radius: 22px;
          padding: 14px;
        }

        .dbx-style-board b {
          display: block;
          height: 42px;
          border-radius: 15px;
          background: linear-gradient(90deg, var(--dbx-a), var(--dbx-b));
        }

        .dbx-template-universe article {
          position: absolute;
          width: 210px;
        }

        .dbx-template-universe article div {
          height: 116px;
          border-radius: 18px;
          background:
            linear-gradient(90deg, rgba(255,255,255,.18), transparent),
            repeating-linear-gradient(180deg, color-mix(in srgb, var(--dbx-a) 22%, transparent) 0 18px, transparent 18px 26px);
        }

        .shelf-1 { left: 8%; top: 10%; transform: rotate(-4deg); }
        .shelf-2 { right: 8%; top: 20%; transform: rotate(4deg); }
        .shelf-3 { left: 28%; bottom: 8%; transform: rotate(-1deg); }

        .dbx-template-grid {
          position: absolute;
          inset: 12%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          opacity: .24;
        }

        .dbx-template-grid span {
          border: 1px solid color-mix(in srgb, var(--dbx-a) 28%, transparent);
          border-radius: 16px;
        }

        .dbx-billing-universe article {
          position: absolute;
          width: 180px;
        }

        .plan-1 { left: 9%; bottom: 12%; }
        .plan-2 { left: 36%; top: 12%; transform: scale(1.08); border-color: color-mix(in srgb, var(--dbx-a) 42%, transparent) !important; }
        .plan-3 { right: 9%; bottom: 12%; }

        .dbx-billing-universe article strong {
          display: block;
          margin-top: 12px;
          color: white;
          font-size: 34px;
          font-weight: 1000;
        }

        .dbx-revenue-curve {
          position: absolute;
          left: 9%;
          right: 9%;
          bottom: 10%;
          display: flex;
          align-items: end;
          gap: 10px;
          height: 120px;
          opacity: .42;
        }

        .dbx-revenue-curve span {
          flex: 1;
          height: var(--bar-height, 48px);
          border-radius: 999px 999px 0 0;
          background: linear-gradient(180deg, var(--dbx-a), transparent);
        }

        .dbx-profile-card {
          position: absolute;
          left: 9%;
          top: 12%;
          width: 240px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 28px;
          background: rgba(15,23,42,.72);
          padding: 18px;
        }

        .dbx-profile-card span {
          display: grid;
          place-items: center;
          width: 70px;
          height: 70px;
          border-radius: 26px;
          background: linear-gradient(135deg, var(--dbx-a), var(--dbx-b));
          color: white;
          font-size: 28px;
          font-weight: 1000;
        }

        .dbx-settings-universe article {
          position: absolute;
          right: 9%;
          width: 230px;
        }

        .dbx-settings-universe article:nth-of-type(1) { top: 16%; }
        .dbx-settings-universe article:nth-of-type(2) { top: 38%; }
        .dbx-settings-universe article:nth-of-type(3) { top: 60%; }

        .dbx-settings-universe article span {
          display: block;
          width: 48px;
          height: 24px;
          margin-top: 10px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--dbx-a), var(--dbx-b));
        }

        .dbx-status-pulse {
          position: absolute;
          left: 50%;
          top: 42%;
          width: 180px;
          height: 180px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(circle, rgba(110,231,183,.46), rgba(2,6,23,.9) 62%);
          box-shadow: 0 0 100px rgba(110,231,183,.28);
        }

        .dbx-status-pulse span {
          position: absolute;
          inset: -24px;
          border-radius: inherit;
          border: 1px solid rgba(110,231,183,.26);
          animation: dbxPing 2.2s ease-out infinite;
        }

        .dbx-support-universe article {
          position: absolute;
          width: 190px;
        }

        .ops-1 { left: 9%; top: 14%; }
        .ops-2 { right: 9%; top: 32%; }
        .ops-3 { left: 28%; bottom: 10%; }

        .dbx-creator-core {
          width: 236px;
          height: 236px;
        }

        .dbx-creator-core span {
          display: grid;
          place-items: center;
          width: 74px;
          height: 74px;
          border-radius: 28px;
          background: linear-gradient(135deg, var(--dbx-a), var(--dbx-b));
          font-size: 30px;
          font-weight: 1000;
        }

        .dbx-creator-core strong {
          max-width: 150px;
          margin-top: 12px;
          color: rgba(226,232,240,.82);
          font-size: 12px;
          line-height: 1.5;
        }

        .dbx-universe strong {
          display: block;
          color: white;
          font-weight: 1000;
        }

        .dbx-universe em {
          display: block;
          margin-top: 7px;
          color: rgba(203,213,225,.64);
          font-size: 11px;
          font-style: normal;
          line-height: 1.45;
        }

        .dbx-sphere {
          position: absolute;
          border-radius: 999px;
          background:
            radial-gradient(circle at 30% 24%, rgba(255,255,255,.9), transparent 12%),
            radial-gradient(circle at 36% 34%, var(--dbx-a), transparent 34%),
            radial-gradient(circle at 68% 68%, var(--dbx-b), transparent 38%),
            #020617;
          box-shadow: 0 0 90px color-mix(in srgb, var(--dbx-a) 28%, transparent), inset 0 0 70px rgba(255,255,255,.08);
          animation: dbxFloat 8s ease-in-out infinite alternate;
        }

        .dbx-sphere-main {
          width: 250px;
          height: 250px;
          left: calc(50% - 125px);
          top: calc(50% - 145px);
        }

        .dbx-sphere-small {
          width: 92px;
          height: 92px;
          right: 12%;
          top: 14%;
          animation-delay: -3s;
        }

        .dbx-orbit {
          position: absolute;
          inset: 12%;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--dbx-a) 24%, transparent);
          animation: dbxSpin 18s linear infinite;
        }

        .dbx-orbit-b {
          inset: 22%;
          border-style: dashed;
          border-color: color-mix(in srgb, var(--dbx-b) 28%, transparent);
          animation-duration: 24s;
          animation-direction: reverse;
        }

        .dbx-photo-card {
          position: absolute;
          width: 190px;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 24px;
          background: rgba(15,23,42,.72);
          padding: 10px;
          box-shadow: 0 22px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(18px);
        }

        .dbx-photo-1 { left: 6%; top: 12%; transform: rotate(-5deg); }
        .dbx-photo-2 { right: 6%; top: 36%; transform: rotate(5deg); }
        .dbx-photo-3 { left: 30%; bottom: 8%; transform: rotate(-1deg); }

        .dbx-photo-card div {
          position: relative;
          height: 118px;
          overflow: hidden;
          border-radius: 18px;
          background:
            radial-gradient(circle at 24% 24%, color-mix(in srgb, var(--dbx-a) 62%, transparent), transparent 35%),
            radial-gradient(circle at 80% 24%, color-mix(in srgb, var(--dbx-b) 48%, transparent), transparent 42%),
            linear-gradient(140deg, #020617, #172554 50%, #020617);
        }

        .dbx-photo-card[data-visual="photo"] div,
        .db-section-experience[data-visual="photo"] .dbx-photo-card div {
          background:
            radial-gradient(circle at 24% 24%, #f0d288, transparent 32%),
            radial-gradient(circle at 80% 24%, #f3de96, transparent 38%),
            linear-gradient(140deg, #082f49, #111827 45%, #020617);
        }

        .dbx-photo-card div span {
          position: absolute;
          left: 14%;
          right: 12%;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.92), transparent);
        }

        .dbx-photo-card div span:nth-child(1) { top: 32%; transform: rotate(-8deg); }
        .dbx-photo-card div span:nth-child(2) { top: 54%; transform: rotate(5deg); opacity: .56; }
        .dbx-photo-card div span:nth-child(3) { top: 72%; transform: rotate(-2deg); opacity: .36; }

        .dbx-photo-card strong,
        .dbx-photo-card em {
          display: block;
          margin-top: 8px;
        }

        .dbx-photo-card strong {
          color: white;
          font-size: 13px;
          font-weight: 950;
        }

        .dbx-photo-card em {
          color: rgba(203,213,225,.66);
          font-size: 11px;
          font-style: normal;
        }

        .dbx-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .dbx-stats article,
        .dbx-panel {
          border: 1px solid rgba(148,163,184,.16);
          border-radius: 28px;
          background:
            linear-gradient(135deg, rgba(15,23,42,.84), rgba(6,11,26,.72)),
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--dbx-a) 12%, transparent), transparent 42%);
          box-shadow: 0 24px 90px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(18px);
        }

        .dbx-stats article {
          padding: 20px;
        }

        .dbx-stats span,
        .dbx-panel-head span {
          display: block;
          color: rgba(148,163,184,.9);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .dbx-stats strong {
          display: block;
          margin-top: 8px;
          color: white;
          font-size: clamp(28px, 3vw, 48px);
          font-weight: 1000;
          letter-spacing: -.05em;
        }

        .dbx-stats p,
        .dbx-feature-list p {
          margin: 8px 0 0;
          color: rgba(203,213,225,.68);
          font-size: 13px;
        }

        .dbx-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr);
          gap: 16px;
          margin-top: 18px;
          padding-bottom: 34px;
        }

        .dbx-panel {
          padding: 20px;
        }

        .dbx-prompt-lab {
          grid-row: span 2;
        }

        .dbx-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .dbx-panel-head strong {
          color: var(--dbx-a);
          font-size: 12px;
          font-weight: 950;
        }

        .dbx-prompt-lab textarea {
          min-height: 154px;
          width: 100%;
          resize: vertical;
          border: 1px solid rgba(240, 210, 136,.2);
          border-radius: 24px;
          background: rgba(2,6,23,.72);
          color: white;
          padding: 18px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        }

        .dbx-lab-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .dbx-prompt-lab pre {
          min-height: 230px;
          max-height: 360px;
          overflow: auto;
          margin: 14px 0 0;
          border: 1px solid rgba(148,163,184,.14);
          border-radius: 24px;
          background: rgba(0,0,0,.34);
          color: rgba(226,232,240,.86);
          padding: 18px;
          white-space: pre-wrap;
          font-size: 12px;
          line-height: 1.7;
        }

        .dbx-feature-list {
          display: grid;
          gap: 12px;
        }

        .dbx-feature-list div,
        .dbx-step,
        .dbx-project-list button {
          border: 1px solid rgba(148,163,184,.13);
          border-radius: 22px;
          background: rgba(255,255,255,.035);
          padding: 14px;
        }

        .dbx-feature-list strong {
          display: block;
          margin-top: 9px;
          color: white;
          font-size: 15px;
          font-weight: 950;
        }

        .dbx-step {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 10px;
        }

        .dbx-step i {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--dbx-a) 18%, transparent);
          color: var(--dbx-a);
          font-style: normal;
          font-weight: 1000;
        }

        .dbx-step strong,
        .dbx-step em {
          display: block;
        }

        .dbx-step strong {
          color: white;
          font-weight: 950;
        }

        .dbx-step em {
          color: rgba(203,213,225,.62);
          font-size: 12px;
          font-style: normal;
        }

        .dbx-project-list {
          display: grid;
          gap: 10px;
        }

        .dbx-project-list button {
          width: 100%;
          text-align: left;
          color: white;
        }

        .dbx-project-list strong,
        .dbx-project-list span,
        .dbx-project-list em {
          display: block;
        }

        .dbx-project-list span {
          width: max-content;
          margin-top: 10px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--dbx-a) 16%, transparent);
          color: var(--dbx-a);
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .dbx-project-list em {
          margin-top: 8px;
          color: rgba(203,213,225,.62);
          font-size: 12px;
          font-style: normal;
        }

        .dbx-new-project {
          width: 100%;
          margin-top: 12px;
        }

        .db-section-experience[data-visual="code"] .dbx-visual {
          background:
            repeating-linear-gradient(180deg, rgba(251,191,36,.12) 0 1px, transparent 1px 24px),
            radial-gradient(circle at 50% 42%, rgba(251,191,36,.18), transparent 48%),
            #020617;
        }

        .db-section-experience[data-visual="cinema"] .dbx-visual {
          background:
            linear-gradient(180deg, rgba(251,113,133,.16), transparent 42%),
            repeating-linear-gradient(90deg, transparent 0 38px, rgba(255,255,255,.08) 39px 40px),
            #020617;
        }

        .db-section-experience[data-visual="templates"] .dbx-photo-card,
        .db-section-experience[data-visual="projects"] .dbx-photo-card {
          width: 220px;
        }

        @keyframes dbxBeam {
          from { opacity: .22; filter: saturate(1); }
          50% { opacity: .82; filter: saturate(1.5); }
          to { opacity: .34; filter: saturate(1.15); }
        }

        @keyframes dbxFloat {
          from { transform: translate3d(-1vw, .8vh, 0) scale(.96); }
          to { transform: translate3d(1.2vw, -1vh, 0) scale(1.04); }
        }

        @keyframes dbxSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes dbxUniverseGlow {
          from { transform: translate3d(-2%, -1%, 0) scale(.98); opacity: .52; }
          to { transform: translate3d(2%, 1.4%, 0) scale(1.08); opacity: .86; }
        }

        @keyframes dbxBrainMorph {
          from { border-radius: 42% 58% 46% 54%; transform: translate(-50%, -50%) rotate(-2deg) scale(.97); }
          50% { border-radius: 55% 45% 58% 42%; }
          to { border-radius: 48% 52% 42% 58%; transform: translate(-50%, -50%) rotate(2deg) scale(1.04); }
        }

        @keyframes dbxPulseDot {
          from { opacity: .24; transform: scale(.7); }
          50% { opacity: 1; transform: scale(1.35); }
          to { opacity: .38; transform: scale(.9); }
        }

        @keyframes dbxWave {
          from { transform: scaleY(.72); opacity: .58; }
          to { transform: scaleY(1.18); opacity: 1; }
        }

        @keyframes dbxPing {
          from { transform: scale(.72); opacity: .92; }
          to { transform: scale(1.45); opacity: 0; }
        }

        @media (max-width: 1180px) {
          .dbx-hero,
          .dbx-main-grid {
            grid-template-columns: 1fr;
          }

          .dbx-stats {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .db-section-experience {
            padding: 12px;
          }

          .dbx-hero {
            border-radius: 26px;
            padding: 20px;
          }

          .dbx-copy h1 {
            font-size: 42px;
          }

          .dbx-visual {
            min-height: 300px;
          }

          .dbx-photo-card {
            width: 160px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dbx-background span,
          .dbx-sphere,
          .dbx-orbit,
          .dbx-universe::before,
          .dbx-brain-core,
          .dbx-brain-core span,
          .dbx-neural-web i,
          .dbx-project-universe i,
          .dbx-lens-orb,
          .dbx-photo-image span,
          .dbx-play-screen,
          .dbx-guard-rings span,
          .dbx-radar span,
          .dbx-radar::after,
          .dbx-page-orbit span,
          .dbx-voice-wave span,
          .dbx-token-wheel,
          .dbx-status-pulse span {
            animation: none !important;
          }
        }

        .dbx-trust-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 22px;
          max-width: 920px;
        }

        .dbx-trust-row span,
        .dbx-visual-hud,
        .dbx-investor-proof div,
        .dbx-stage-script li {
          border: 1px solid rgba(148,163,184,.16);
          background: rgba(2,6,23,.44);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 70px rgba(0,0,0,.28);
          backdrop-filter: blur(18px);
        }

        .dbx-trust-row span {
          border-radius: 18px;
          padding: 12px;
        }

        .dbx-trust-row strong,
        .dbx-visual-hud span,
        .dbx-investor-proof span,
        .dbx-stage-script li span {
          display: block;
          color: color-mix(in srgb, var(--dbx-a) 82%, white);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .dbx-trust-row em,
        .dbx-visual-hud em {
          display: block;
          margin-top: 5px;
          overflow: hidden;
          color: rgba(226,232,240,.84);
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dbx-visual-hud {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 18px;
          z-index: 5;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px 14px;
          align-items: center;
          border-radius: 22px;
          padding: 14px;
        }

        .dbx-visual-hud strong {
          grid-row: span 2;
          color: white;
          font-size: 12px;
          font-weight: 1000;
          letter-spacing: .18em;
        }

        .dbx-investor-room,
        .dbx-stage-script {
          min-height: 320px;
        }

        .dbx-investor-proof {
          display: grid;
          gap: 12px;
        }

        .dbx-investor-proof div {
          border-radius: 22px;
          padding: 16px;
        }

        .dbx-investor-proof strong {
          display: block;
          margin-top: 8px;
          color: white;
          font-size: 26px;
          font-weight: 1000;
          letter-spacing: -.04em;
        }

        .dbx-investor-proof p {
          margin: 6px 0 0;
          color: rgba(203,213,225,.72);
          font-size: 12px;
          line-height: 1.55;
        }

        .dbx-stage-script ol {
          display: grid;
          gap: 12px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .dbx-stage-script li {
          display: grid;
          grid-template-columns: 42px 1fr;
          gap: 12px;
          border-radius: 22px;
          padding: 14px;
        }

        .dbx-stage-script li span {
          display: flex;
          height: 34px;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: color-mix(in srgb, var(--dbx-a) 16%, transparent);
        }

        .dbx-stage-script p {
          margin: 0;
          color: rgba(226,232,240,.78);
          font-size: 13px;
          line-height: 1.65;
        }

        .dbx-panel:focus-within,
        .dbx-actions button:focus-visible,
        .dbx-lab-actions button:focus-visible,
        .dbx-project-list button:focus-visible,
        .dbx-new-project:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--dbx-a) 72%, white);
          outline-offset: 3px;
        }

      `}</style>
    </main>
  )
}

export default DigitalBridgeSectionExperience
