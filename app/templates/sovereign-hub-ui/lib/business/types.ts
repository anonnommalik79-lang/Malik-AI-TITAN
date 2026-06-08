export type BusinessSectionId =
  | "business-doctor"
  | "sales-booster"
  | "marketing-war-room"
  | "founder-commander"
  | "investor-mode"
  | "crisis-mode"
  | "launch-engine"
  | "newsroom-desk"
  | "social-media-desk"
  | "broadcast-desk"
  | "media-language"
  | "demo-day"

export type BusinessOutputFormat =
  | "standard"
  | "score"
  | "scripts"
  | "checklist"
  | "battle"
  | "launch"
  | "article"
  | "social"
  | "tv-script"
  | "interview"
  | "factcheck"
  | "pitch-deck"
  | "demo-script"
  | "social-pack"

export type BusinessModeId =
  | "ceo-decision"
  | "business-xray"
  | "money-leak"
  | "customer-pain"
  | "market-entry"
  | "one-person-company"
  | "founder-daily"
  | "business-war-map"
  | "revenue-engine"
  | "ai-sales-manager"
  | "objection-killer"
  | "conversation-analyzer"
  | "offer-ab"
  | "trust-builder"
  | "landing-doctor"
  | "conversion-booster"
  | "ad-killer-pack"
  | "tiktok-reels-engine"
  | "brand-voice"
  | "competitor-legal"
  | "pmf-scanner"
  | "mvp-cut"
  | "feature-priority"
  | "investor-qa"
  | "pitch-battle"
  | "crisis-commander"
  | "reputation-defender"
  | "automation-finder"
  | "team-task-commander"
  | "launch-domination"
  | "news-article"
  | "breaking-news"
  | "longread-report"
  | "headline-lab"
  | "fact-check"
  | "interview-kit"
  | "press-release"
  | "social-cuts"
  | "social-multipack"
  | "reels-script"
  | "telegram-post"
  | "tv-script"
  | "teleprompter"
  | "video-storyboard"
  | "translate-kz-ru-en"
  | "kazakh-editor"
  | "rewrite-style"
  | "db-pitch-deck"
  | "db-demo-script"
  | "db-jury-simulator"
  | "db-one-pager"
  | "db-traction-story"
  | "db-winning-narrative"

export type BusinessMode = {
  id: BusinessModeId
  sectionId: BusinessSectionId
  title: string
  titleRu: string
  description: string
  descriptionRu: string
  outputFormat: BusinessOutputFormat
  taskHint: string
  expertRole: string
}

export type BusinessSection = {
  id: BusinessSectionId
  title: string
  titleRu: string
  subtitle: string
  subtitleRu: string
  accent: "cyan" | "emerald" | "violet" | "amber" | "rose" | "blue"
}

export type BusinessRunContext = {
  website?: string
  instagram?: string
  prices?: string
  industry?: string
  revenue?: string
  teamSize?: string
  language?: "ru" | "kz" | "en"
  extra?: string
  // Newsroom / media context
  outlet?: string
  audience?: string
  region?: string
  beat?: string
}
