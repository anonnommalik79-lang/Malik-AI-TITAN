export type PluginCategory = "AI" | "Dev" | "Work" | "Automation" | "Research" | "Media" | "Business" | "Data"
export type PluginAccess = "open" | "connect"
export type PluginTier = "free" | "freemium"

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
}

export const PLUGIN_CATEGORIES: Array<{ id: "All" | PluginCategory; label: string }> = [
  { id: "All", label: "Все" },
  { id: "AI", label: "AI" },
  { id: "Work", label: "Работа" },
  { id: "Dev", label: "Код" },
  { id: "Research", label: "Исследования" },
  { id: "Automation", label: "Автоматизация" },
  { id: "Business", label: "Бизнес" },
  { id: "Media", label: "Медиа" },
  { id: "Data", label: "Данные" },
]

const RAW_PLUGINS: Array<[string, string, string, PluginCategory]> = [
  ["openai", "OpenAI", "openai", "AI"],
  ["anthropic", "Claude", "anthropic", "AI"],
  ["gemini", "Google Gemini", "googlegemini", "AI"],
  ["perplexity", "Perplexity", "perplexity", "AI"],
  ["mistral", "Mistral AI", "mistralai", "AI"],
  ["groq", "Groq", "groq", "AI"],
  ["huggingface", "Hugging Face", "huggingface", "AI"],
  ["replicate", "Replicate", "replicate", "AI"],
  ["ollama", "Ollama", "ollama", "AI"],
  ["langchain", "LangChain", "langchain", "AI"],
  ["github", "GitHub", "github", "Dev"],
  ["gitlab", "GitLab", "gitlab", "Dev"],
  ["stackoverflow", "Stack Overflow", "stackoverflow", "Dev"],
  ["mdn", "MDN Web Docs", "mdnwebdocs", "Dev"],
  ["vercel", "Vercel", "vercel", "Dev"],
  ["cloudflare", "Cloudflare", "cloudflare", "Dev"],
  ["netlify", "Netlify", "netlify", "Dev"],
  ["supabase", "Supabase", "supabase", "Dev"],
  ["firebase", "Firebase", "firebase", "Dev"],
  ["postgresql", "PostgreSQL", "postgresql", "Dev"],
  ["mongodb", "MongoDB", "mongodb", "Dev"],
  ["redis", "Redis", "redis", "Dev"],
  ["docker", "Docker", "docker", "Dev"],
  ["kubernetes", "Kubernetes", "kubernetes", "Dev"],
  ["sentry", "Sentry", "sentry", "Dev"],
  ["grafana", "Grafana", "grafana", "Dev"],
  ["datadog", "Datadog", "datadog", "Dev"],
  ["postman", "Postman", "postman", "Dev"],
  ["npm", "npm", "npm", "Dev"],
  ["pypi", "PyPI", "pypi", "Dev"],
  ["notion", "Notion", "notion", "Work"],
  ["googledrive", "Google Drive", "googledrive", "Work"],
  ["gmail", "Gmail", "gmail", "Work"],
  ["googlecalendar", "Google Calendar", "googlecalendar", "Work"],
  ["googlesheets", "Google Sheets", "googlesheets", "Work"],
  ["googledocs", "Google Docs", "googledocs", "Work"],
  ["googleslides", "Google Slides", "googleslides", "Work"],
  ["slack", "Slack", "slack", "Work"],
  ["discord", "Discord", "discord", "Work"],
  ["telegram", "Telegram", "telegram", "Work"],
  ["whatsapp", "WhatsApp", "whatsapp", "Work"],
  ["dropbox", "Dropbox", "dropbox", "Work"],
  ["onedrive", "Microsoft OneDrive", "microsoftonedrive", "Work"],
  ["outlook", "Microsoft Outlook", "microsoftoutlook", "Work"],
  ["teams", "Microsoft Teams", "microsoftteams", "Work"],
  ["trello", "Trello", "trello", "Work"],
  ["asana", "Asana", "asana", "Work"],
  ["linear", "Linear", "linear", "Work"],
  ["jira", "Jira", "jira", "Work"],
  ["clickup", "ClickUp", "clickup", "Work"],
  ["monday", "monday.com", "mondaydotcom", "Work"],
  ["airtable", "Airtable", "airtable", "Work"],
  ["miro", "Miro", "miro", "Work"],
  ["figma", "Figma", "figma", "Work"],
  ["canva", "Canva", "canva", "Work"],
  ["zapier", "Zapier", "zapier", "Automation"],
  ["make", "Make", "make", "Automation"],
  ["n8n", "n8n", "n8n", "Automation"],
  ["pipedream", "Pipedream", "pipedream", "Automation"],
  ["ifttt", "IFTTT", "ifttt", "Automation"],
  ["wikipedia", "Wikipedia", "wikipedia", "Research"],
  ["arxiv", "arXiv", "arxiv", "Research"],
  ["pubmed", "PubMed", "pubmed", "Research"],
  ["semanticscholar", "Semantic Scholar", "semanticscholar", "Research"],
  ["openalex", "OpenAlex", "openalex", "Research"],
  ["crossref", "Crossref", "crossref", "Research"],
  ["reddit", "Reddit", "reddit", "Research"],
  ["youtube", "YouTube", "youtube", "Research"],
  ["medium", "Medium", "medium", "Research"],
  ["devto", "DEV Community", "devdotto", "Research"],
  ["hackernews", "Hacker News", "ycombinator", "Research"],
  ["rss", "RSS", "rss", "Research"],
  ["spotify", "Spotify", "spotify", "Media"],
  ["soundcloud", "SoundCloud", "soundcloud", "Media"],
  ["vimeo", "Vimeo", "vimeo", "Media"],
  ["unsplash", "Unsplash", "unsplash", "Media"],
  ["pexels", "Pexels", "pexels", "Media"],
  ["pixabay", "Pixabay", "pixabay", "Media"],
  ["giphy", "GIPHY", "giphy", "Media"],
  ["shopify", "Shopify", "shopify", "Business"],
  ["woocommerce", "WooCommerce", "woocommerce", "Business"],
  ["stripe", "Stripe", "stripe", "Business"],
  ["paypal", "PayPal", "paypal", "Business"],
  ["wise", "Wise", "wise", "Business"],
  ["hubspot", "HubSpot", "hubspot", "Business"],
  ["salesforce", "Salesforce", "salesforce", "Business"],
  ["zendesk", "Zendesk", "zendesk", "Business"],
  ["intercom", "Intercom", "intercom", "Business"],
  ["mailchimp", "Mailchimp", "mailchimp", "Business"],
  ["brevo", "Brevo", "brevo", "Business"],
  ["twilio", "Twilio", "twilio", "Business"],
  ["sendgrid", "SendGrid", "sendgrid", "Business"],
  ["openstreetmap", "OpenStreetMap", "openstreetmap", "Data"],
  ["mapbox", "Mapbox", "mapbox", "Data"],
  ["openweather", "OpenWeather", "openweathermap", "Data"],
  ["coingecko", "CoinGecko", "coingecko", "Data"],
  ["tradingview", "TradingView", "tradingview", "Data"],
  ["yahoofinance", "Yahoo Finance", "yahoo", "Data"],
  ["kaggle", "Kaggle", "kaggle", "Data"],
  ["wolfram", "Wolfram", "wolfram", "Data"],
]

const OPEN_IDS = new Set([
  "github", "gitlab", "stackoverflow", "mdn", "npm", "pypi",
  "wikipedia", "arxiv", "pubmed", "semanticscholar", "openalex", "crossref",
  "reddit", "youtube", "medium", "devto", "hackernews", "rss",
  "unsplash", "pexels", "pixabay", "openstreetmap", "openweather", "coingecko",
  "yahoofinance", "kaggle",
])

const FREE_IDS = new Set([
  ...OPEN_IDS,
  "ollama", "huggingface", "groq", "cloudflare", "supabase", "firebase",
  "postgresql", "mongodb", "redis", "docker", "kubernetes", "grafana", "postman",
  "notion", "googledrive", "gmail", "googlecalendar", "googlesheets", "googledocs",
  "googleslides", "slack", "discord", "telegram", "whatsapp", "dropbox", "trello",
  "figma", "canva", "n8n", "ifttt", "spotify", "soundcloud", "vimeo", "giphy",
])

const FEATURED_IDS = new Set([
  "github", "notion", "googledrive", "gmail", "googlecalendar", "slack",
  "figma", "wikipedia", "arxiv", "youtube", "openai", "gemini",
])

const CATEGORY_DESCRIPTION: Record<PluginCategory, string> = {
  AI: "модели, генерация, анализ и специализированные AI‑workflow без выхода из рабочего пространства",
  Dev: "код, репозитории, документация, инфраструктура и инженерные workflow внутри Malik AI",
  Work: "документы, задачи, сообщения и рабочий контекст в одном AI‑пространстве",
  Automation: "автоматизация цепочек, триггеров и повторяющихся действий через понятные AI‑сценарии",
  Research: "поиск, чтение и сравнение открытых источников с фокусом на проверяемые данные",
  Media: "поиск, разбор и подготовка медиа‑материалов для дальнейшей работы в Malik AI",
  Business: "продажи, платежи, CRM, поддержка и коммуникации как управляемые AI‑workflow",
  Data: "карты, рынки, погода, наборы данных и аналитика с понятными выводами",
}

const CATEGORY_CAPABILITIES: Record<PluginCategory, string[]> = {
  AI: ["Использовать как специализированный AI‑режим", "Сравнивать ответы и подходы", "Подготавливать запросы и результаты"],
  Dev: ["Искать технический контекст", "Разбирать код и ошибки", "Готовить изменения, команды и документацию"],
  Work: ["Суммировать рабочий контекст", "Готовить письма, задачи и документы", "Организовывать следующий шаг"],
  Automation: ["Проектировать автоматизации", "Строить триггеры и действия", "Проверять сценарии перед запуском"],
  Research: ["Искать по открытым источникам", "Сравнивать факты", "Формировать вывод со ссылками"],
  Media: ["Находить релевантные материалы", "Разбирать контент", "Готовить идеи, описания и сценарии"],
  Business: ["Анализировать бизнес‑контекст", "Готовить действия и коммуникации", "Строить понятные рабочие процессы"],
  Data: ["Искать и структурировать данные", "Сравнивать показатели", "Объяснять результаты простым языком"],
}

export const MALIK_PLUGINS: MalikPlugin[] = RAW_PLUGINS.map(([id, name, iconSlug, category]) => {
  const access: PluginAccess = OPEN_IDS.has(id) ? "open" : "connect"
  const tier: PluginTier = FREE_IDS.has(id) ? "free" : "freemium"
  const sourceRule = access === "open"
    ? "Используй открытые данные и веб‑источники, показывай источники и не выдумывай недоступные данные."
    : "Работай с тем контекстом, который доступен в Malik AI. Для приватных данных или действий в аккаунте явно скажи, если требуется OAuth/API‑подключение; ничего не имитируй."

  return {
    id,
    name,
    iconSlug,
    category,
    access,
    tier,
    featured: FEATURED_IDS.has(id),
    description: `${name} внутри Malik AI — ${CATEGORY_DESCRIPTION[category]}.`,
    capabilities: CATEGORY_CAPABILITIES[category],
    prompt: `Ты работаешь внутри Malik AI в режиме плагина ${name}. ${sourceRule}\n\nПомоги мне с задачей в ${name}: `,
  }
})

export const FEATURED_PLUGINS = MALIK_PLUGINS.filter((plugin) => plugin.featured)
