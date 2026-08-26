export type PluginBrand = {
  domain: string
  displayName?: string
}

/**
 * Brand source for every marketplace entry.
 *
 * The first icon source in the UI is the favicon published by the product's
 * own domain (served through Google's favicon cache so 100 third-party hosts
 * do not slow the marketplace). Simple Icons is only a fallback.
 *
 * Keep this table one-to-one with RAW_PLUGINS: 100 plugin ids, 100 domains.
 */
export const PLUGIN_BRANDS: Record<string, PluginBrand> = {
  openai: { domain: "chatgpt.com", displayName: "ChatGPT" },
  anthropic: { domain: "claude.ai" },
  gemini: { domain: "gemini.google.com" },
  perplexity: { domain: "perplexity.ai" },
  mistral: { domain: "mistral.ai" },
  groq: { domain: "groq.com" },
  huggingface: { domain: "huggingface.co" },
  replicate: { domain: "replicate.com" },
  ollama: { domain: "ollama.com" },
  langchain: { domain: "langchain.com" },

  github: { domain: "github.com" },
  gitlab: { domain: "gitlab.com" },
  stackoverflow: { domain: "stackoverflow.com" },
  mdn: { domain: "developer.mozilla.org" },
  vercel: { domain: "vercel.com" },
  cloudflare: { domain: "cloudflare.com" },
  netlify: { domain: "netlify.com" },
  supabase: { domain: "supabase.com" },
  firebase: { domain: "firebase.google.com" },
  postgresql: { domain: "postgresql.org" },
  mongodb: { domain: "mongodb.com" },
  redis: { domain: "redis.io" },
  docker: { domain: "docker.com" },
  kubernetes: { domain: "kubernetes.io" },
  sentry: { domain: "sentry.io" },
  grafana: { domain: "grafana.com" },
  datadog: { domain: "datadoghq.com" },
  postman: { domain: "postman.com" },
  npm: { domain: "npmjs.com" },
  pypi: { domain: "pypi.org" },

  notion: { domain: "notion.so" },
  googledrive: { domain: "drive.google.com" },
  gmail: { domain: "gmail.com" },
  googlecalendar: { domain: "calendar.google.com" },
  googlesheets: { domain: "sheets.google.com" },
  googledocs: { domain: "docs.google.com" },
  googleslides: { domain: "slides.google.com" },
  slack: { domain: "slack.com" },
  discord: { domain: "discord.com" },
  telegram: { domain: "telegram.org" },
  whatsapp: { domain: "whatsapp.com" },
  dropbox: { domain: "dropbox.com" },
  onedrive: { domain: "onedrive.live.com" },
  outlook: { domain: "outlook.com" },
  teams: { domain: "teams.microsoft.com" },
  trello: { domain: "trello.com" },
  asana: { domain: "asana.com" },
  linear: { domain: "linear.app" },
  jira: { domain: "atlassian.com" },
  clickup: { domain: "clickup.com" },
  monday: { domain: "monday.com" },
  airtable: { domain: "airtable.com" },
  miro: { domain: "miro.com" },
  figma: { domain: "figma.com" },
  canva: { domain: "canva.com" },

  zapier: { domain: "zapier.com" },
  make: { domain: "make.com" },
  n8n: { domain: "n8n.io" },
  pipedream: { domain: "pipedream.com" },
  ifttt: { domain: "ifttt.com" },

  wikipedia: { domain: "wikipedia.org" },
  arxiv: { domain: "arxiv.org" },
  pubmed: { domain: "pubmed.ncbi.nlm.nih.gov" },
  semanticscholar: { domain: "semanticscholar.org" },
  openalex: { domain: "openalex.org" },
  crossref: { domain: "crossref.org" },
  reddit: { domain: "reddit.com" },
  youtube: { domain: "youtube.com" },
  medium: { domain: "medium.com" },
  devto: { domain: "dev.to" },
  hackernews: { domain: "news.ycombinator.com" },
  rss: { domain: "rss.com" },

  spotify: { domain: "spotify.com" },
  soundcloud: { domain: "soundcloud.com" },
  vimeo: { domain: "vimeo.com" },
  unsplash: { domain: "unsplash.com" },
  pexels: { domain: "pexels.com" },
  pixabay: { domain: "pixabay.com" },
  giphy: { domain: "giphy.com" },

  shopify: { domain: "shopify.com" },
  woocommerce: { domain: "woocommerce.com" },
  stripe: { domain: "stripe.com" },
  paypal: { domain: "paypal.com" },
  wise: { domain: "wise.com" },
  hubspot: { domain: "hubspot.com" },
  salesforce: { domain: "salesforce.com" },
  zendesk: { domain: "zendesk.com" },
  intercom: { domain: "intercom.com" },
  mailchimp: { domain: "mailchimp.com" },
  brevo: { domain: "brevo.com" },
  twilio: { domain: "twilio.com" },
  sendgrid: { domain: "sendgrid.com" },

  openstreetmap: { domain: "openstreetmap.org" },
  mapbox: { domain: "mapbox.com" },
  openweather: { domain: "openweathermap.org" },
  coingecko: { domain: "coingecko.com" },
  tradingview: { domain: "tradingview.com" },
  yahoofinance: { domain: "finance.yahoo.com" },
  kaggle: { domain: "kaggle.com" },
  wolfram: { domain: "wolfram.com" },
}

export function pluginDisplayName(id: string, fallback: string) {
  return PLUGIN_BRANDS[id]?.displayName || fallback
}

export function officialPluginIconUrl(id: string) {
  const domain = PLUGIN_BRANDS[id]?.domain
  if (!domain) return ""
  return `https://www.google.com/s2/favicons?domain_url=https://${domain}&sz=128`
}

export const PLUGIN_BRAND_COUNT = Object.keys(PLUGIN_BRANDS).length
