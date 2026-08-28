export type PluginBrand = {
  domain: string
  displayName?: string
}

/** Brand/icon sources for the audited live plugin catalog only. */
export const PLUGIN_BRANDS: Record<string, PluginBrand> = {
  huggingface: { domain: "huggingface.co" },
  replicate: { domain: "replicate.com" },

  github: { domain: "github.com" },
  gitlab: { domain: "gitlab.com" },
  stackoverflow: { domain: "stackoverflow.com" },
  netlify: { domain: "netlify.com" },
  cloudflare: { domain: "cloudflare.com" },
  sentry: { domain: "sentry.io" },
  npm: { domain: "npmjs.com" },

  notion: { domain: "notion.so" },
  googledrive: { domain: "drive.google.com", displayName: "Google Drive" },
  gmail: { domain: "gmail.com" },
  googlecalendar: { domain: "calendar.google.com", displayName: "Google Calendar" },
  slack: { domain: "slack.com" },
  discord: { domain: "discord.com" },
  telegram: { domain: "telegram.org", displayName: "Telegram Bot" },
  dropbox: { domain: "dropbox.com" },
  onedrive: { domain: "onedrive.live.com", displayName: "Microsoft OneDrive" },
  outlook: { domain: "outlook.com", displayName: "Microsoft Outlook" },
  teams: { domain: "teams.microsoft.com", displayName: "Microsoft Teams" },
  asana: { domain: "asana.com" },
  linear: { domain: "linear.app" },
  jira: { domain: "atlassian.com" },
  clickup: { domain: "clickup.com" },
  airtable: { domain: "airtable.com" },
  miro: { domain: "miro.com" },
  figma: { domain: "figma.com" },
  canva: { domain: "canva.com" },

  wikipedia: { domain: "wikipedia.org" },
  arxiv: { domain: "arxiv.org" },
  pubmed: { domain: "pubmed.ncbi.nlm.nih.gov" },
  semanticscholar: { domain: "semanticscholar.org", displayName: "Semantic Scholar" },
  openalex: { domain: "openalex.org" },
  crossref: { domain: "crossref.org" },
  reddit: { domain: "reddit.com" },
  devto: { domain: "dev.to", displayName: "DEV Community" },
  hackernews: { domain: "news.ycombinator.com", displayName: "Hacker News" },

  hubspot: { domain: "hubspot.com" },
  intercom: { domain: "intercom.com" },
  mailchimp: { domain: "mailchimp.com" },
  stripe: { domain: "stripe.com" },

  openstreetmap: { domain: "openstreetmap.org", displayName: "OpenStreetMap" },
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
