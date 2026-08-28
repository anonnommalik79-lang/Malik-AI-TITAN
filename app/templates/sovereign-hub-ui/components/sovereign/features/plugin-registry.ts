export type PluginCategory = "AI" | "Dev" | "Work" | "Automation" | "Research" | "Media" | "Business" | "Data"
export type PluginAccess = "open" | "connect"
export type PluginTier = "free" | "freemium"
export type PluginRuntime = "public" | "pipes"

export interface MalikPlugin {
  id: string
  name: string
  iconSlug: string
  category: PluginCategory
  access: PluginAccess
  tier: PluginTier
  featured: boolean
  description: string
  capabilities: string[]
  prompt: string
  runtime: PluginRuntime
  providerSlug?: string
}

export const PLUGIN_CATEGORIES: Array<{ id: "All" | PluginCategory; label: string }> = [
  { id: "All", label: "Все" },
  { id: "AI", label: "AI" },
  { id: "Work", label: "Работа" },
  { id: "Dev", label: "Код" },
  { id: "Research", label: "Исследования" },
  { id: "Business", label: "Бизнес" },
  { id: "Media", label: "Медиа" },
  { id: "Data", label: "Данные" },
]

type RawPlugin = {
  id: string
  name: string
  iconSlug: string
  category: PluginCategory
  runtime: PluginRuntime
  providerSlug?: string
  tier?: PluginTier
  featured?: boolean
}

/**
 * Audited 2026-08-28.
 *
 * IMPORTANT: this marketplace intentionally lists only integrations that have
 * a real server-side execution path in Malik AI. We removed decorative cards,
 * model-router duplicates, unsupported APIs and local-only infrastructure.
 *
 * `pipes` plugins use WorkOS Pipes for OAuth/token refresh/credential storage.
 * `public` plugins call a documented public HTTP API directly from the server.
 */
const RAW_PLUGINS: RawPlugin[] = [
  // AI services that are useful as tools (not duplicate chat model selectors).
  { id: "huggingface", name: "Hugging Face", iconSlug: "huggingface", category: "AI", runtime: "pipes", providerSlug: "hugging-face", tier: "freemium", featured: true },
  { id: "replicate", name: "Replicate", iconSlug: "replicate", category: "AI", runtime: "pipes", providerSlug: "replicate", tier: "freemium" },

  // Developer tools.
  { id: "github", name: "GitHub", iconSlug: "github", category: "Dev", runtime: "pipes", providerSlug: "github", tier: "free", featured: true },
  { id: "gitlab", name: "GitLab", iconSlug: "gitlab", category: "Dev", runtime: "pipes", providerSlug: "gitlab", tier: "free" },
  { id: "stackoverflow", name: "Stack Overflow", iconSlug: "stackoverflow", category: "Dev", runtime: "public", tier: "free" },
  { id: "netlify", name: "Netlify", iconSlug: "netlify", category: "Dev", runtime: "pipes", providerSlug: "netlify", tier: "free" },
  { id: "cloudflare", name: "Cloudflare", iconSlug: "cloudflare", category: "Dev", runtime: "pipes", providerSlug: "cloudflare", tier: "free" },
  { id: "sentry", name: "Sentry", iconSlug: "sentry", category: "Dev", runtime: "pipes", providerSlug: "sentry", tier: "free" },
  { id: "npm", name: "npm", iconSlug: "npm", category: "Dev", runtime: "public", tier: "free" },

  // Work / productivity.
  { id: "notion", name: "Notion", iconSlug: "notion", category: "Work", runtime: "pipes", providerSlug: "notion", tier: "free", featured: true },
  { id: "googledrive", name: "Google Drive", iconSlug: "googledrive", category: "Work", runtime: "pipes", providerSlug: "google-drive", tier: "free", featured: true },
  { id: "gmail", name: "Gmail", iconSlug: "gmail", category: "Work", runtime: "pipes", providerSlug: "gmail", tier: "free", featured: true },
  { id: "googlecalendar", name: "Google Calendar", iconSlug: "googlecalendar", category: "Work", runtime: "pipes", providerSlug: "google-calendar", tier: "free", featured: true },
  { id: "slack", name: "Slack", iconSlug: "slack", category: "Work", runtime: "pipes", providerSlug: "slack", tier: "free", featured: true },
  { id: "discord", name: "Discord", iconSlug: "discord", category: "Work", runtime: "pipes", providerSlug: "discord", tier: "free" },
  { id: "telegram", name: "Telegram Bot", iconSlug: "telegram", category: "Work", runtime: "pipes", providerSlug: "telegram-bot", tier: "free" },
  { id: "dropbox", name: "Dropbox", iconSlug: "dropbox", category: "Work", runtime: "pipes", providerSlug: "dropbox", tier: "free" },
  { id: "onedrive", name: "Microsoft OneDrive", iconSlug: "microsoftonedrive", category: "Work", runtime: "pipes", providerSlug: "microsoft-onedrive", tier: "free" },
  { id: "outlook", name: "Microsoft Outlook", iconSlug: "microsoftoutlook", category: "Work", runtime: "pipes", providerSlug: "microsoft-outlook", tier: "free" },
  { id: "teams", name: "Microsoft Teams", iconSlug: "microsoftteams", category: "Work", runtime: "pipes", providerSlug: "microsoft-teams", tier: "free" },
  { id: "asana", name: "Asana", iconSlug: "asana", category: "Work", runtime: "pipes", providerSlug: "asana", tier: "free" },
  { id: "linear", name: "Linear", iconSlug: "linear", category: "Work", runtime: "pipes", providerSlug: "linear", tier: "free" },
  { id: "jira", name: "Jira", iconSlug: "jira", category: "Work", runtime: "pipes", providerSlug: "jira", tier: "free" },
  { id: "clickup", name: "ClickUp", iconSlug: "clickup", category: "Work", runtime: "pipes", providerSlug: "clickup", tier: "free" },
  { id: "airtable", name: "Airtable", iconSlug: "airtable", category: "Work", runtime: "pipes", providerSlug: "airtable", tier: "free" },
  { id: "miro", name: "Miro", iconSlug: "miro", category: "Work", runtime: "pipes", providerSlug: "miro", tier: "free" },
  { id: "figma", name: "Figma", iconSlug: "figma", category: "Work", runtime: "pipes", providerSlug: "figma", tier: "free", featured: true },
  { id: "canva", name: "Canva", iconSlug: "canva", category: "Media", runtime: "pipes", providerSlug: "canva", tier: "free" },

  // Research / open data.
  { id: "wikipedia", name: "Wikipedia", iconSlug: "wikipedia", category: "Research", runtime: "public", tier: "free", featured: true },
  { id: "arxiv", name: "arXiv", iconSlug: "arxiv", category: "Research", runtime: "public", tier: "free", featured: true },
  { id: "pubmed", name: "PubMed", iconSlug: "pubmed", category: "Research", runtime: "public", tier: "free" },
  { id: "semanticscholar", name: "Semantic Scholar", iconSlug: "semanticscholar", category: "Research", runtime: "public", tier: "free" },
  { id: "openalex", name: "OpenAlex", iconSlug: "openalex", category: "Research", runtime: "public", tier: "free" },
  { id: "crossref", name: "Crossref", iconSlug: "crossref", category: "Research", runtime: "public", tier: "free" },
  { id: "reddit", name: "Reddit", iconSlug: "reddit", category: "Research", runtime: "pipes", providerSlug: "reddit", tier: "free" },
  { id: "devto", name: "DEV Community", iconSlug: "devdotto", category: "Research", runtime: "public", tier: "free" },
  { id: "hackernews", name: "Hacker News", iconSlug: "ycombinator", category: "Research", runtime: "public", tier: "free" },

  // Business.
  { id: "hubspot", name: "HubSpot", iconSlug: "hubspot", category: "Business", runtime: "pipes", providerSlug: "hubspot", tier: "free" },
  { id: "intercom", name: "Intercom", iconSlug: "intercom", category: "Business", runtime: "pipes", providerSlug: "intercom", tier: "freemium" },
  { id: "mailchimp", name: "Mailchimp", iconSlug: "mailchimp", category: "Business", runtime: "pipes", providerSlug: "mailchimp", tier: "free" },
  { id: "stripe", name: "Stripe", iconSlug: "stripe", category: "Business", runtime: "pipes", providerSlug: "stripe", tier: "free" },

  // Data.
  { id: "openstreetmap", name: "OpenStreetMap", iconSlug: "openstreetmap", category: "Data", runtime: "public", tier: "free" },
]

const CATEGORY_DESCRIPTION: Record<PluginCategory, string> = {
  AI: "модели, генерация и AI‑ресурсы через реальный API",
  Dev: "репозитории, деплой, мониторинг и инженерные данные",
  Work: "документы, почта, задачи, сообщения и рабочие пространства",
  Automation: "автоматизация триггеров и повторяющихся действий",
  Research: "живой поиск и чтение проверяемых открытых источников",
  Media: "медиа‑активы и дизайн через официальный API",
  Business: "CRM, поддержка, маркетинг и платежные данные",
  Data: "карты и структурированные открытые данные",
}

const CATEGORY_CAPABILITIES: Record<PluginCategory, string[]> = {
  AI: ["Проверять подключение к аккаунту", "Получать живые данные сервиса", "Использовать результат внутри диалога"],
  Dev: ["Читать живые инженерные данные", "Искать нужные сущности", "Передавать результат Malik AI"],
  Work: ["Читать данные подключённого аккаунта", "Находить последние рабочие объекты", "Использовать контекст прямо в чате"],
  Automation: ["Читать доступные workflow", "Проверять состояние автоматизаций", "Работать через защищённый коннектор"],
  Research: ["Искать по реальному API", "Возвращать ссылки на источники", "Не имитировать недоступные данные"],
  Media: ["Подключать официальный аккаунт", "Читать доступные ресурсы", "Использовать данные внутри Malik AI"],
  Business: ["Подключать официальный аккаунт", "Получать живые бизнес‑данные", "Работать в пределах разрешений пользователя"],
  Data: ["Искать структурированные данные", "Возвращать координаты и ссылки", "Использовать открытый API"],
}

export const MALIK_PLUGINS: MalikPlugin[] = RAW_PLUGINS.map((item) => ({
  ...item,
  access: item.runtime === "public" ? "open" : "connect",
  tier: item.tier || "free",
  featured: Boolean(item.featured),
  description: `${item.name} внутри Malik AI — ${CATEGORY_DESCRIPTION[item.category]}.`,
  capabilities: CATEGORY_CAPABILITIES[item.category],
  // Machine-readable prefix is intercepted server-side by /api/ai/chat.
  prompt: `/plugin ${item.id} `,
}))

export const FEATURED_PLUGINS = MALIK_PLUGINS.filter((plugin) => plugin.featured)
export const MALIK_PLUGIN_COUNT = MALIK_PLUGINS.length

export function getMalikPlugin(id?: string | null) {
  const clean = String(id || "").trim().toLowerCase()
  return MALIK_PLUGINS.find((plugin) => plugin.id === clean) || null
}
