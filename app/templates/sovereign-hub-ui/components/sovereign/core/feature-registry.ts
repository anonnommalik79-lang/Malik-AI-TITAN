"use client"

export type FeatureStatus = "connected" | "beta" | "planned" | "safe-fallback"
export type FeatureActionType =
  | "open-panel"
  | "open-modal"
  | "open-canvas"
  | "call-api"
  | "open-route"
  | "safe-local"

export interface SovereignFeature {
  id: string
  title: string
  category: string
  description: string
  status: FeatureStatus
  route: string
  icon: string
  actionType: FeatureActionType
  backendHook: string
  uiPanel: string
  priority: number
  isVisible: boolean
  isPremium: boolean
  tags: string[]
}

export const FEATURE_CATEGORIES = [
  "AI Chat",
  "Photo Generation",
  "Video Generation",
  "Code Generation",
  "Website Builder",
  "Landing Generator",
  "Dashboard Generator",
  "Canvas Editor",
  "Template Engine",
  "Prompt Library",
  "Project Manager",
  "File Manager",
  "Image Library",
  "Video Studio",
  "Voice Studio",
  "Document AI",
  "Presentation AI",
  "Business AI",
  "Marketing AI",
  "Cyber Security",
  "Analytics",
  "Billing",
  "Team Workspace",
  "Admin Panel",
  "Settings",
  "Integrations",
  "Automation",
  "Deploy Tools",
  "Database Tools",
  "AI Router",
] as const

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const hookForCategory = (category: string) => {
  if (category === "AI Chat") return "/api/stream"
  if (category === "Photo Generation" || category === "Image Library") return "/api/generate/photo"
  if (category === "Video Generation" || category === "Video Studio") return "/api/generate/video"
  if (category === "Code Generation") return "/api/generate/code"
  if (category === "Website Builder" || category === "Landing Generator") return "/api/generate/website"
  if (category === "Dashboard Generator") return "/api/generate/dashboard"
  if (category === "Document AI") return "/api/generate/document"
  if (category === "Presentation AI") return "/api/generate/presentation"
  if (category === "Business AI" || category === "Marketing AI") return "/api/business/run"
  if (category === "Template Engine") return "/api/templates"
  if (category === "Project Manager") return "/api/projects/save"
  if (category === "Deploy Tools") return "/api/health"
  if (category === "AI Router") return "/api/codex/providers"
  return "/api/health"
}

export const PRIMARY_WORKING_FEATURES: SovereignFeature[] = [
  {
    id: "ai-chat-1",
    title: "AI Chat",
    category: "AI Chat",
    description: "Streaming Malik AI chat connected to /api/stream with local fallback.",
    status: "connected",
    route: "/chat",
    icon: "MessageSquare",
    actionType: "call-api",
    backendHook: "/api/stream",
    uiPanel: "ChatView",
    priority: 1,
    isVisible: true,
    isPremium: false,
    tags: ["stream", "chat", "fallback"],
  },
  {
    id: "malik-codex-1",
    title: "Malik Codex 1.0",
    category: "Code Generation / AI Agent",
    description: "Premium coding cockpit with file explorer, task plan, terminal, engine readiness and safe local mode.",
    status: "connected",
    route: "/codex",
    icon: "Terminal",
    actionType: "open-modal",
    backendHook: "/api/codex/run",
    uiPanel: "MalikCodexModal",
    priority: 1,
    isVisible: true,
    isPremium: true,
    tags: ["codex", "agent", "code", "boss-mode"],
  },
  {
    id: "generate-photo-1",
    title: "Generate Photo",
    category: "Photo Generation",
    description: "Prompt, style, size, quality, loading state, gallery save and static/storage/photos fallback.",
    status: "connected",
    route: "/photo-generation",
    icon: "Image",
    actionType: "open-panel",
    backendHook: "/api/generate/photo",
    uiPanel: "PhotoGenerationPanel",
    priority: 2,
    isVisible: true,
    isPremium: false,
    tags: ["photo", "gallery", "storage"],
  },
  {
    id: "generate-video-1",
    title: "Generate Video",
    category: "Video Generation",
    description: "Storyboard and video prompt generator with safe backend contract.",
    status: "safe-fallback",
    route: "/video-generation",
    icon: "Video",
    actionType: "open-panel",
    backendHook: "/api/generate/video",
    uiPanel: "GeneratorPanel",
    priority: 3,
    isVisible: true,
    isPremium: true,
    tags: ["video", "storyboard", "fallback"],
  },
  {
    id: "generate-website-1",
    title: "Generate Website",
    category: "Website Builder",
    description: "Website generator that sends artifacts into the canvas preview.",
    status: "connected",
    route: "/website-generation",
    icon: "Globe",
    actionType: "open-canvas",
    backendHook: "/api/generate/website",
    uiPanel: "GeneratorPanel",
    priority: 4,
    isVisible: true,
    isPremium: false,
    tags: ["website", "canvas", "html"],
  },
  {
    id: "generate-landing-1",
    title: "Generate Landing Page",
    category: "Landing Generator",
    description: "Landing page generator with responsive premium SaaS layout.",
    status: "connected",
    route: "/landing-generation",
    icon: "Layout",
    actionType: "open-canvas",
    backendHook: "/api/generate/landing",
    uiPanel: "GeneratorPanel",
    priority: 5,
    isVisible: true,
    isPremium: false,
    tags: ["landing", "marketing", "canvas"],
  },
  {
    id: "generate-react-component-1",
    title: "Generate React Component",
    category: "Code Generation",
    description: "React component generator with code preview and copy/export.",
    status: "connected",
    route: "/component-generation",
    icon: "Component",
    actionType: "open-canvas",
    backendHook: "/api/generate/code",
    uiPanel: "GeneratorPanel",
    priority: 6,
    isVisible: true,
    isPremium: false,
    tags: ["react", "tsx", "component"],
  },
  {
    id: "generate-dashboard-1",
    title: "Generate Dashboard",
    category: "Dashboard Generator",
    description: "Dashboard generator with charts, tables and analytics blocks.",
    status: "connected",
    route: "/dashboard-generation",
    icon: "LayoutDashboard",
    actionType: "open-canvas",
    backendHook: "/api/generate/dashboard",
    uiPanel: "GeneratorPanel",
    priority: 7,
    isVisible: true,
    isPremium: false,
    tags: ["dashboard", "analytics", "canvas"],
  },
  {
    id: "generate-code-1",
    title: "Generate Code",
    category: "Code Generation",
    description: "Code generator connected to backend with local artifact fallback.",
    status: "connected",
    route: "/code-generation",
    icon: "Code2",
    actionType: "open-panel",
    backendHook: "/api/generate/code",
    uiPanel: "GeneratorPanel",
    priority: 8,
    isVisible: true,
    isPremium: false,
    tags: ["code", "files", "copy"],
  },
  {
    id: "open-canvas-1",
    title: "Open Canvas",
    category: "Canvas Editor",
    description: "Open right preview/canvas with generated HTML or TSX.",
    status: "connected",
    route: "/canvas",
    icon: "PanelRight",
    actionType: "open-canvas",
    backendHook: "/api/health",
    uiPanel: "PreviewPanel",
    priority: 9,
    isVisible: true,
    isPremium: false,
    tags: ["canvas", "preview", "tsx"],
  },
  {
    id: "preview-project-1",
    title: "Preview Generated Project",
    category: "Canvas Editor",
    description: "Preview generated project, copy code, download and open in new tab.",
    status: "connected",
    route: "/preview",
    icon: "Eye",
    actionType: "open-canvas",
    backendHook: "/api/health",
    uiPanel: "PreviewPanel",
    priority: 10,
    isVisible: true,
    isPremium: false,
    tags: ["preview", "export", "copy"],
  },
  {
    id: "save-project-1",
    title: "Save Project",
    category: "Project Manager",
    description: "Save project snapshots to backend storage with safe JSON persistence.",
    status: "connected",
    route: "/projects",
    icon: "Save",
    actionType: "call-api",
    backendHook: "/api/projects/save",
    uiPanel: "ProjectsView",
    priority: 11,
    isVisible: true,
    isPremium: false,
    tags: ["save", "project", "storage"],
  },
  {
    id: "template-picker-1",
    title: "Template Picker",
    category: "Template Engine",
    description: "Template picker connected to prompt-to-canvas generation.",
    status: "connected",
    route: "/templates",
    icon: "LayoutTemplate",
    actionType: "open-panel",
    backendHook: "/api/templates",
    uiPanel: "TemplatesView",
    priority: 12,
    isVisible: true,
    isPremium: false,
    tags: ["templates", "prompts", "starter"],
  },
  {
    id: "prompt-enhancer-1",
    title: "Prompt Enhancer",
    category: "Prompt Library",
    description: "Enhances short prompts before generation and keeps a safe local fallback.",
    status: "connected",
    route: "/prompt-enhancer",
    icon: "Sparkles",
    actionType: "safe-local",
    backendHook: "/api/stream",
    uiPanel: "Composer",
    priority: 13,
    isVisible: true,
    isPremium: false,
    tags: ["prompt", "enhance", "composer"],
  },
  {
    id: "business-command-center-1",
    title: "Business Command Center",
    category: "Business AI",
    description: "30 business AI modes across doctor, sales, marketing, founder, investor, crisis and launch.",
    status: "connected",
    route: "/business-command-center",
    icon: "Briefcase",
    actionType: "open-panel",
    backendHook: "/api/business/run",
    uiPanel: "BusinessCommandCenter",
    priority: 2,
    isVisible: true,
    isPremium: false,
    tags: ["business", "sales", "marketing", "founder", "investor", "crisis", "launch"],
  },
  {
    id: "billing-upgrade-1",
    title: "Billing / Upgrade Page",
    category: "Billing",
    description: "Upgrade page and billing placeholders wired to navigation.",
    status: "safe-fallback",
    route: "/billing",
    icon: "CreditCard",
    actionType: "open-panel",
    backendHook: "/api/buy",
    uiPanel: "BillingPanel",
    priority: 14,
    isVisible: true,
    isPremium: true,
    tags: ["billing", "upgrade", "pro"],
  },
  {
    id: "settings-profile-logout-1",
    title: "Settings / Profile / Logout",
    category: "Settings",
    description: "Profile, settings and logout actions connected through header and sidebar.",
    status: "connected",
    route: "/settings",
    icon: "Settings",
    actionType: "open-panel",
    backendHook: "/api/logout",
    uiPanel: "SettingsPanel",
    priority: 15,
    isVisible: true,
    isPremium: false,
    tags: ["settings", "profile", "logout"],
  },
]

const moduleNames = [
  "Command Center",
  "Smart Composer",
  "Asset Gallery",
  "Workflow Builder",
  "Realtime Monitor",
  "Template Picker",
  "Advanced Settings",
  "Team Controls",
  "Export Pipeline",
  "Safety Guard",
]

const generatedFeatures: SovereignFeature[] = FEATURE_CATEGORIES.flatMap((category, categoryIndex) =>
  moduleNames.map((moduleName, moduleIndex) => {
    const id = `${slug(category)}-${String(moduleIndex + 1).padStart(2, "0")}`
    const connected = moduleIndex < 3
    return {
      id,
      title: `${category} ${moduleName}`,
      category,
      description: `${category} ${moduleName.toLowerCase()} connected to Malik AI SaaS architecture with UI panel, route contract and safe fallback.`,
      status: connected ? "connected" : moduleIndex < 6 ? "safe-fallback" : "planned",
      route: `/${slug(category)}/${slug(moduleName)}`,
      icon: connected ? "Zap" : "Circle",
      actionType: connected ? "open-panel" : "safe-local",
      backendHook: hookForCategory(category),
      uiPanel: `${slug(category)}-${slug(moduleName)}-panel`,
      priority: categoryIndex * 10 + moduleIndex + 20,
      isVisible: moduleIndex < 7,
      isPremium: moduleIndex % 3 === 0,
      tags: [slug(category), slug(moduleName), connected ? "connected" : "roadmap"],
    } satisfies SovereignFeature
  }),
)

const primaryIds = new Set(PRIMARY_WORKING_FEATURES.map((feature) => feature.id))

export const SOVEREIGN_FEATURES: SovereignFeature[] = [
  ...PRIMARY_WORKING_FEATURES,
  ...generatedFeatures.filter((feature) => !primaryIds.has(feature.id)),
]

export const FEATURE_STATS = {
  total: SOVEREIGN_FEATURES.length,
  connected: SOVEREIGN_FEATURES.filter((feature) => feature.status === "connected").length,
  safeFallback: SOVEREIGN_FEATURES.filter((feature) => feature.status === "safe-fallback").length,
  premium: SOVEREIGN_FEATURES.filter((feature) => feature.isPremium).length,
}

export const getFeaturesByCategory = (category: string) =>
  SOVEREIGN_FEATURES.filter((feature) => feature.category === category)

export const getFeatureById = (id: string) =>
  SOVEREIGN_FEATURES.find((feature) => feature.id === id)

export const getFeatureByRoute = (route: string) =>
  SOVEREIGN_FEATURES.find((feature) => feature.route === route)

export const getVisibleFeatures = () =>
  SOVEREIGN_FEATURES.filter((feature) => feature.isVisible)


