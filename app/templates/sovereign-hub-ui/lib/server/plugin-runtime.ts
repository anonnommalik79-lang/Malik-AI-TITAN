import { getMalikPlugin, type MalikPlugin } from "@/components/sovereign/features/plugin-registry"
import { getPluginSessionUser, getPipesCredential } from "@/lib/server/plugin-pipes"

export type MalikPluginSource = {
  title: string
  url: string
  domain: string
  snippet?: string
  provider: string
}

export type MalikPluginExecution = {
  content: string
  provider: string
  model: string
  usedWeb: boolean
  sources: MalikPluginSource[]
  attempts: Array<{ provider: string; model: string; ok: boolean; status?: number; error?: string; latencyMs?: number }>
  pluginId: string
  pluginName: string
  connected?: boolean
}

type ToolOutput = {
  heading: string
  lines: string[]
  sources?: MalikPluginSource[]
}

const USER_AGENT = "Malik-AI-Plugin-Runtime/1.1 (+https://malikaiworld.world)"

function clean(value: unknown, max = 260) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

function query(value: string, max = 180) {
  return clean(value, max) || "latest"
}

function array<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "unknown"
  }
}

function source(title: unknown, url: unknown, provider: string, snippet?: unknown): MalikPluginSource | null {
  const safeTitle = clean(title)
  const safeUrl = String(url ?? "").trim()
  if (!safeTitle || !/^https?:\/\//i.test(safeUrl)) return null
  return {
    title: safeTitle,
    url: safeUrl,
    domain: hostname(safeUrl),
    provider,
    snippet: snippet ? clean(snippet) : undefined,
  }
}

function sourceList(items: Array<MalikPluginSource | null>) {
  return items.filter((item): item is MalikPluginSource => Boolean(item))
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,application/atom+xml,application/xml,*/*",
        "User-Agent": USER_AGENT,
        ...(init.headers || {}),
      },
    })
    const text = await response.text()
    if (!response.ok) {
      let detail = text
      try {
        const parsed = JSON.parse(text)
        detail = parsed?.message || parsed?.error?.message || parsed?.error || text
      } catch {}
      const error = Object.assign(new Error(clean(detail || `HTTP ${response.status}`, 500)), { status: response.status })
      throw error
    }
    return { response, text, latencyMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<any> {
  const { text } = await fetchText(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } }, timeoutMs)
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("Provider returned invalid JSON")
  }
}

function bearer(token: string, extra: HeadersInit = {}): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra }
}

function output(plugin: MalikPlugin, tool: ToolOutput, connected = true): MalikPluginExecution {
  const body = tool.lines.length
    ? tool.lines.slice(0, 12).map((line, index) => `${index + 1}. ${line}`).join("\n")
    : "Данных по этому запросу не найдено."
  return {
    content: `### ${tool.heading}\n${body}`,
    provider: `plugin:${plugin.id}`,
    model: "malik-plugin-runtime-v1.1",
    usedWeb: false,
    sources: tool.sources || [],
    attempts: [{ provider: plugin.id, model: "live-api", ok: true }],
    pluginId: plugin.id,
    pluginName: plugin.name,
    connected,
  }
}

function connectRequired(plugin: MalikPlugin, reason = "Плагин ещё не подключён"): MalikPluginExecution {
  const connectUrl = `/api/plugins/connect?id=${encodeURIComponent(plugin.id)}&return_to=${encodeURIComponent("/dashboard")}`
  return {
    content: `### ${plugin.name}\n${reason}. Подключи официальный аккаунт или API‑ключ и повтори запрос.\n\nПодключить: ${connectUrl}`,
    provider: `plugin:${plugin.id}`,
    model: "malik-plugin-runtime-v1.1",
    usedWeb: false,
    sources: [],
    attempts: [{ provider: plugin.id, model: "workos-pipes", ok: false, error: "not_connected" }],
    pluginId: plugin.id,
    pluginName: plugin.name,
    connected: false,
  }
}

async function runPublic(plugin: MalikPlugin, rawQuery: string): Promise<ToolOutput> {
  const q = query(rawQuery)

  if (plugin.id === "wikipedia") {
    const lang = /[а-яёәіңғүұқөһ]/i.test(q) ? "ru" : "en"
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
    url.searchParams.set("action", "query")
    url.searchParams.set("list", "search")
    url.searchParams.set("srsearch", q)
    url.searchParams.set("srlimit", "8")
    url.searchParams.set("format", "json")
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.query?.search)
    const sources = sourceList(items.map((item: any) => source(
      item.title,
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(item.title || "").replace(/ /g, "_"))}`,
      "wikipedia",
      item.snippet,
    )))
    return { heading: "Wikipedia — живой поиск", lines: sources.map((item: MalikPluginSource) => `${item.title} — ${item.snippet || item.url}`), sources }
  }

  if (plugin.id === "stackoverflow") {
    const url = new URL("https://api.stackexchange.com/2.3/search/advanced")
    url.searchParams.set("site", "stackoverflow")
    url.searchParams.set("pagesize", "8")
    url.searchParams.set("order", "desc")
    url.searchParams.set("sort", "relevance")
    url.searchParams.set("q", q)
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.items)
    const sources = sourceList(items.map((item: any) => source(item.title, item.link, "stackoverflow", `score ${item.score ?? 0}`)))
    return { heading: "Stack Overflow — результаты", lines: sources.map((item: MalikPluginSource) => `${item.title} — ${item.url}`), sources }
  }

  if (plugin.id === "npm") {
    const url = new URL("https://registry.npmjs.org/-/v1/search")
    url.searchParams.set("text", q)
    url.searchParams.set("size", "8")
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.objects).map((item: any) => item?.package).filter(Boolean)
    const sources = sourceList(items.map((item: any) => source(item.name, item.links?.npm || `https://www.npmjs.com/package/${encodeURIComponent(item.name)}`, "npm", item.description)))
    return { heading: "npm — пакеты", lines: items.map((item: any) => `${clean(item.name)}${item.version ? ` @ ${clean(item.version)}` : ""} — ${clean(item.description)}`), sources }
  }

  if (plugin.id === "arxiv") {
    const url = new URL("https://export.arxiv.org/api/query")
    url.searchParams.set("search_query", `all:${q}`)
    url.searchParams.set("start", "0")
    url.searchParams.set("max_results", "8")
    const { text } = await fetchText(url.toString(), { headers: { Accept: "application/atom+xml" } })
    const entries = Array.from(text.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)).map((match: RegExpMatchArray) => match[1])
    const items = entries.map((block: string) => ({
      title: clean(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
      url: clean(block.match(/<id>([\s\S]*?)<\/id>/i)?.[1], 500),
      summary: clean(block.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1], 260),
    })).filter((item) => item.title && item.url)
    const sources = sourceList(items.map((item) => source(item.title, item.url, "arxiv", item.summary)))
    return { heading: "arXiv — статьи", lines: items.map((item) => `${item.title} — ${item.summary}`), sources }
  }

  if (plugin.id === "pubmed") {
    const search = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi")
    search.searchParams.set("db", "pubmed")
    search.searchParams.set("term", q)
    search.searchParams.set("retmode", "json")
    search.searchParams.set("retmax", "8")
    const first = await fetchJson(search.toString())
    const ids = array<string>(first?.esearchresult?.idlist)
    if (!ids.length) return { heading: "PubMed — статьи", lines: [] }
    const summary = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi")
    summary.searchParams.set("db", "pubmed")
    summary.searchParams.set("id", ids.join(","))
    summary.searchParams.set("retmode", "json")
    const data = await fetchJson(summary.toString())
    const items = ids.map((id: string) => data?.result?.[id]).filter(Boolean)
    const sources = sourceList(items.map((item: any) => source(item.title, `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`, "pubmed", item.pubdate)))
    return { heading: "PubMed — статьи", lines: items.map((item: any) => `${clean(item.title)} — ${clean(item.pubdate)}`), sources }
  }

  if (plugin.id === "semanticscholar") {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search")
    url.searchParams.set("query", q)
    url.searchParams.set("limit", "8")
    url.searchParams.set("fields", "title,authors,year,url,abstract,citationCount")
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.data)
    const sources = sourceList(items.map((item: any) => source(item.title, item.url, "semantic-scholar", item.abstract)))
    return { heading: "Semantic Scholar — статьи", lines: items.map((item: any) => `${clean(item.title)} — ${item.year || ""}, citations ${item.citationCount ?? 0}`), sources }
  }

  if (plugin.id === "openalex") {
    const url = new URL("https://api.openalex.org/works")
    url.searchParams.set("search", q)
    url.searchParams.set("per-page", "8")
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.results)
    const sources = sourceList(items.map((item: any) => source(item.display_name, item.doi || item.id, "openalex")))
    return { heading: "OpenAlex — работы", lines: items.map((item: any) => `${clean(item.display_name)} — ${item.publication_year || ""}, cited ${item.cited_by_count ?? 0}`), sources }
  }

  if (plugin.id === "crossref") {
    const url = new URL("https://api.crossref.org/works")
    url.searchParams.set("query", q)
    url.searchParams.set("rows", "8")
    const data = await fetchJson(url.toString())
    const items = array<any>(data?.message?.items)
    const sources = sourceList(items.map((item: any) => source(array<string>(item.title)[0] || item.title, item.URL, "crossref", item.publisher)))
    return { heading: "Crossref — публикации", lines: items.map((item: any) => `${clean(array<string>(item.title)[0] || item.title)} — ${clean(item.publisher || item.type)}`), sources }
  }

  if (plugin.id === "devto") {
    const all = array<any>(await fetchJson("https://dev.to/api/articles?per_page=50", { headers: { Accept: "application/vnd.forem.api-v1+json" } }))
    const needles = q.toLowerCase().split(/\s+/).filter((needle: string) => needle.length > 2)
    const matches = all.filter((item: any) => {
      if (q === "latest" || !needles.length) return true
      const hay = `${item.title || ""} ${item.description || ""} ${array<string>(item.tag_list).join(" ")}`.toLowerCase()
      return needles.some((needle: string) => hay.includes(needle))
    })
    const items = (matches.length ? matches : all).slice(0, 8)
    const sources = sourceList(items.map((item: any) => source(item.title, item.url, "devto", item.description)))
    return { heading: "DEV Community — статьи", lines: items.map((item: any) => `${clean(item.title)} — ${clean(item.user?.name || item.readable_publish_date)}`), sources }
  }

  if (plugin.id === "hackernews") {
    const ids = array<number>(await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json")).slice(0, 30)
    const stories = (await Promise.all(ids.map(async (id: number) => {
      try { return await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 6000) } catch { return null }
    }))).filter(Boolean)
    const needles = q.toLowerCase().split(/\s+/).filter((needle: string) => needle.length > 2)
    const matches = stories.filter((item: any) => q === "latest" || !needles.length || needles.some((needle: string) => String(item?.title || "").toLowerCase().includes(needle)))
    const items = (matches.length ? matches : stories).slice(0, 8)
    const sources = sourceList(items.map((item: any) => source(item.title, item.url || `https://news.ycombinator.com/item?id=${item.id}`, "hackernews", `score ${item.score ?? 0}`)))
    return { heading: "Hacker News — топ", lines: items.map((item: any) => `${clean(item.title)} — ${item.score ?? 0} points`), sources }
  }

  if (plugin.id === "openstreetmap") {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", q)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("limit", "8")
    url.searchParams.set("addressdetails", "1")
    const items = array<any>(await fetchJson(url.toString(), { headers: { "Accept-Language": "ru,en;q=0.8" } }))
    const sources = sourceList(items.map((item: any) => source(
      item.display_name,
      `https://www.openstreetmap.org/?mlat=${encodeURIComponent(item.lat)}&mlon=${encodeURIComponent(item.lon)}#map=16/${encodeURIComponent(item.lat)}/${encodeURIComponent(item.lon)}`,
      "openstreetmap",
    )))
    return { heading: "OpenStreetMap — места", lines: items.map((item: any) => `${clean(item.display_name)} — ${item.lat}, ${item.lon}`), sources }
  }

  throw new Error(`Public runner is not implemented for ${plugin.id}`)
}

async function runConnected(plugin: MalikPlugin, token: string, rawQuery: string): Promise<ToolOutput> {
  const q = query(rawQuery)

  if (plugin.id === "github") {
    const items = array<any>(await fetchJson("https://api.github.com/user/repos?per_page=10&sort=updated&affiliation=owner,collaborator,organization_member", { headers: bearer(token, { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }) }))
    const sources = sourceList(items.map((item: any) => source(item.full_name, item.html_url, "github", item.description)))
    return { heading: "GitHub — последние репозитории", lines: items.map((item: any) => `${clean(item.full_name)} — ${item.private ? "private" : "public"}${item.description ? `; ${clean(item.description)}` : ""}`), sources }
  }

  if (plugin.id === "gitlab") {
    const items = array<any>(await fetchJson("https://gitlab.com/api/v4/projects?membership=true&simple=true&order_by=last_activity_at&sort=desc&per_page=10", { headers: bearer(token) }))
    const sources = sourceList(items.map((item: any) => source(item.path_with_namespace, item.web_url, "gitlab", item.description)))
    return { heading: "GitLab — проекты", lines: items.map((item: any) => `${clean(item.path_with_namespace)} — ${clean(item.description)}`), sources }
  }

  if (plugin.id === "notion") {
    const body: Record<string, unknown> = { page_size: 10, sort: { direction: "descending", timestamp: "last_edited_time" } }
    if (q !== "latest" && q.length < 100) body.query = q
    const data = await fetchJson("https://api.notion.com/v1/search", {
      method: "POST",
      headers: bearer(token, { "Content-Type": "application/json", "Notion-Version": "2022-06-28" }),
      body: JSON.stringify(body),
    })
    const items = array<any>(data?.results)
    const title = (item: any) => clean(item?.properties?.title?.title?.[0]?.plain_text || item?.properties?.Name?.title?.[0]?.plain_text || item?.url || item?.id)
    const sources = sourceList(items.map((item: any) => source(title(item), item.url, "notion")))
    return { heading: "Notion — страницы и базы", lines: items.map((item: any) => `${title(item)} — ${clean(item.object || "item")}`), sources }
  }

  if (plugin.id === "googledrive") {
    const url = new URL("https://www.googleapis.com/drive/v3/files")
    url.searchParams.set("pageSize", "10")
    url.searchParams.set("orderBy", "modifiedTime desc")
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)")
    url.searchParams.set("q", "trashed = false")
    const data = await fetchJson(url.toString(), { headers: bearer(token) })
    const items = array<any>(data?.files)
    const sources = sourceList(items.map((item: any) => source(item.name, item.webViewLink, "google-drive", item.mimeType)))
    return { heading: "Google Drive — последние файлы", lines: items.map((item: any) => `${clean(item.name)} — ${clean(item.mimeType)}; ${clean(item.modifiedTime)}`), sources }
  }

  if (plugin.id === "gmail") {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    listUrl.searchParams.set("maxResults", "8")
    if (q !== "latest") listUrl.searchParams.set("q", q)
    const list = await fetchJson(listUrl.toString(), { headers: bearer(token) })
    const ids = array<any>(list?.messages).slice(0, 8)
    const messages = (await Promise.all(ids.map(async (item: any) => {
      try {
        return await fetchJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: bearer(token) }, 7000)
      } catch { return null }
    }))).filter(Boolean)
    const header = (message: any, key: string) => clean(array<any>(message?.payload?.headers).find((entry: any) => String(entry?.name || "").toLowerCase() === key.toLowerCase())?.value)
    return { heading: "Gmail — сообщения", lines: messages.map((message: any) => `${header(message, "Subject") || "(без темы)"} — ${header(message, "From")}; ${header(message, "Date")}`) }
  }

  if (plugin.id === "googlecalendar") {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("maxResults", "10")
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("timeMin", new Date().toISOString())
    const data = await fetchJson(url.toString(), { headers: bearer(token) })
    const items = array<any>(data?.items)
    const sources = sourceList(items.map((item: any) => source(item.summary || "Calendar event", item.htmlLink, "google-calendar")))
    return { heading: "Google Calendar — ближайшие события", lines: items.map((item: any) => `${clean(item.summary || "Без названия")} — ${clean(item.start?.dateTime || item.start?.date)}`), sources }
  }

  if (plugin.id === "slack") {
    const data = await fetchJson("https://slack.com/api/conversations.list?limit=30&types=public_channel,private_channel", { headers: bearer(token) })
    if (data?.ok === false) throw new Error(clean(data?.error || "Slack API error"))
    const items = array<any>(data?.channels)
    return { heading: "Slack — каналы", lines: items.map((item: any) => `#${clean(item.name)} — ${clean(item.topic?.value || item.purpose?.value)}`) }
  }

  if (plugin.id === "discord") {
    const items = array<any>(await fetchJson("https://discord.com/api/v10/users/@me/guilds?limit=20", { headers: bearer(token) }))
    return { heading: "Discord — серверы", lines: items.map((item: any) => `${clean(item.name)} — id ${clean(item.id)}`) }
  }

  if (plugin.id === "telegram") {
    const data = await fetchJson(`https://api.telegram.org/bot${token}/getMe`)
    if (!data?.ok) throw new Error(clean(data?.description || "Telegram Bot API error"))
    const bot = data?.result || {}
    return { heading: "Telegram Bot — подключено", lines: [`@${clean(bot.username || "bot")} — ${clean([bot.first_name, bot.last_name].filter(Boolean).join(" "))}; id ${clean(bot.id)}`] }
  }

  if (plugin.id === "dropbox") {
    const data = await fetchJson("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: bearer(token, { "Content-Type": "application/json" }), body: JSON.stringify({ path: "", limit: 10 }) })
    const items = array<any>(data?.entries)
    return { heading: "Dropbox — файлы", lines: items.map((item: any) => `${clean(item.name)} — ${clean(item[".tag"] || "item")}`) }
  }

  if (plugin.id === "onedrive" || plugin.id === "outlook" || plugin.id === "teams") {
    const endpoint = plugin.id === "onedrive"
      ? "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=10&$select=id,name,webUrl,lastModifiedDateTime,folder,file"
      : plugin.id === "outlook"
        ? "https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=id,subject,from,receivedDateTime,webLink"
        : "https://graph.microsoft.com/v1.0/me/joinedTeams?$top=20"
    const data = await fetchJson(endpoint, { headers: bearer(token) })
    const items = array<any>(data?.value)
    const sources = sourceList(items.map((item: any) => source(item.name || item.subject || item.displayName, item.webUrl || item.webLink, plugin.id)))
    const resultLines = plugin.id === "onedrive"
      ? items.map((item: any) => `${clean(item.name)} — ${item.folder ? "folder" : "file"}; ${clean(item.lastModifiedDateTime)}`)
      : plugin.id === "outlook"
        ? items.map((item: any) => `${clean(item.subject || "(без темы)")} — ${clean(item.from?.emailAddress?.name || item.from?.emailAddress?.address)}; ${clean(item.receivedDateTime)}`)
        : items.map((item: any) => `${clean(item.displayName)} — ${clean(item.description)}`)
    return { heading: `${plugin.name} — живые данные`, lines: resultLines, sources }
  }

  if (plugin.id === "asana") {
    const data = await fetchJson("https://app.asana.com/api/1.0/workspaces?limit=20", { headers: bearer(token) })
    const items = array<any>(data?.data)
    return { heading: "Asana — рабочие пространства", lines: items.map((item: any) => `${clean(item.name)} — gid ${clean(item.gid)}`) }
  }

  if (plugin.id === "linear") {
    const gql = "query MalikPlugin { viewer { name email assignedIssues(first: 10, orderBy: updatedAt) { nodes { identifier title url state { name } updatedAt } } } }"
    const data = await fetchJson("https://api.linear.app/graphql", { method: "POST", headers: bearer(token, { "Content-Type": "application/json" }), body: JSON.stringify({ query: gql }) })
    if (array<any>(data?.errors).length) throw new Error(clean(data.errors[0]?.message))
    const items = array<any>(data?.data?.viewer?.assignedIssues?.nodes)
    const sources = sourceList(items.map((item: any) => source(`${item.identifier} ${item.title}`, item.url, "linear")))
    return { heading: "Linear — назначенные задачи", lines: items.map((item: any) => `${clean(item.identifier)} ${clean(item.title)} — ${clean(item.state?.name)}`), sources }
  }

  if (plugin.id === "jira") {
    const resources = array<any>(await fetchJson("https://api.atlassian.com/oauth/token/accessible-resources", { headers: bearer(token) }))
    const cloud = resources[0]
    if (!cloud?.id) throw new Error("Jira cloud resource is unavailable")
    const url = new URL(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloud.id)}/rest/api/3/search/jql`)
    url.searchParams.set("jql", "assignee = currentUser() ORDER BY updated DESC")
    url.searchParams.set("maxResults", "10")
    url.searchParams.set("fields", "summary,status,updated")
    const data = await fetchJson(url.toString(), { headers: bearer(token) })
    const items = array<any>(data?.issues)
    const sources = sourceList(items.map((item: any) => source(`${item.key} ${clean(item.fields?.summary)}`, `${cloud.url}/browse/${item.key}`, "jira")))
    return { heading: "Jira — назначенные задачи", lines: items.map((item: any) => `${clean(item.key)} ${clean(item.fields?.summary)} — ${clean(item.fields?.status?.name)}`), sources }
  }

  if (plugin.id === "clickup") {
    const data = await fetchJson("https://api.clickup.com/api/v2/team", { headers: bearer(token) })
    const items = array<any>(data?.teams)
    return { heading: "ClickUp — workspaces", lines: items.map((item: any) => `${clean(item.name)} — id ${clean(item.id)}`) }
  }

  if (plugin.id === "airtable") {
    const data = await fetchJson("https://api.airtable.com/v0/meta/bases?pageSize=20", { headers: bearer(token) })
    const items = array<any>(data?.bases)
    return { heading: "Airtable — базы", lines: items.map((item: any) => `${clean(item.name)} — ${clean(item.permissionLevel || "access")}`) }
  }

  if (plugin.id === "miro") {
    const data = await fetchJson("https://api.miro.com/v2/boards?limit=20&sort=last_modified", { headers: bearer(token) })
    const items = array<any>(data?.data)
    const sources = sourceList(items.map((item: any) => source(item.name, item.viewLink, "miro")))
    return { heading: "Miro — доски", lines: items.map((item: any) => `${clean(item.name)} — ${clean(item.modifiedAt)}`), sources }
  }

  if (plugin.id === "figma") {
    const data = await fetchJson("https://api.figma.com/v1/me", { headers: bearer(token) })
    return { heading: "Figma — аккаунт подключён", lines: [`${clean(data?.handle || data?.email || "Figma user")} — ${clean(data?.email)}`] }
  }

  if (plugin.id === "canva") {
    const data = await fetchJson("https://api.canva.com/rest/v1/users/me/profile", { headers: bearer(token) })
    return { heading: "Canva — аккаунт подключён", lines: [clean(data?.profile?.display_name || "Canva user")] }
  }

  if (plugin.id === "netlify") {
    const items = array<any>(await fetchJson("https://api.netlify.com/api/v1/sites?per_page=10", { headers: bearer(token) }))
    const sources = sourceList(items.map((item: any) => source(item.name, item.admin_url || item.url, "netlify")))
    return { heading: "Netlify — сайты", lines: items.map((item: any) => `${clean(item.name)} — ${clean(item.url || item.ssl_url)}`), sources }
  }

  if (plugin.id === "cloudflare") {
    const data = await fetchJson("https://api.cloudflare.com/client/v4/accounts?per_page=20", { headers: bearer(token) })
    if (data?.success === false) throw new Error(clean(array<any>(data?.errors)[0]?.message || "Cloudflare API error"))
    const items = array<any>(data?.result)
    return { heading: "Cloudflare — аккаунты", lines: items.map((item: any) => `${clean(item.name)} — id ${clean(item.id)}`) }
  }

  if (plugin.id === "sentry") {
    const items = array<any>(await fetchJson("https://sentry.io/api/0/organizations/", { headers: bearer(token) }))
    return { heading: "Sentry — организации", lines: items.map((item: any) => `${clean(item.name || item.slug)} — ${clean(item.slug)}`) }
  }

  if (plugin.id === "reddit") {
    const data = await fetchJson("https://oauth.reddit.com/api/v1/me", { headers: bearer(token, { "User-Agent": USER_AGENT }) })
    return { heading: "Reddit — аккаунт подключён", lines: [`u/${clean(data?.name || "user")} — karma ${Number(data?.total_karma ?? 0)}`] }
  }

  if (plugin.id === "hubspot") {
    const data = await fetchJson("https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=firstname,lastname,email,lastmodifieddate", { headers: bearer(token) })
    const items = array<any>(data?.results)
    return { heading: "HubSpot — контакты", lines: items.map((item: any) => `${clean([item.properties?.firstname, item.properties?.lastname].filter(Boolean).join(" ") || item.properties?.email)} — ${clean(item.properties?.email)}`) }
  }

  if (plugin.id === "intercom") {
    const data = await fetchJson("https://api.intercom.io/me", { headers: bearer(token, { "Intercom-Version": "2.13" }) })
    return { heading: "Intercom — аккаунт подключён", lines: [`${clean(data?.name || data?.email || "Intercom user")} — ${clean(data?.email)}`] }
  }

  if (plugin.id === "mailchimp") {
    const metadata = await fetchJson("https://login.mailchimp.com/oauth2/metadata", { headers: { Authorization: `OAuth ${token}` } })
    const dc = clean(metadata?.dc, 40)
    if (!dc) throw new Error("Mailchimp data center is unavailable")
    const data = await fetchJson(`https://${dc}.api.mailchimp.com/3.0/lists?count=10`, { headers: bearer(token) })
    const items = array<any>(data?.lists)
    return { heading: "Mailchimp — audiences", lines: items.map((item: any) => `${clean(item.name)} — ${Number(item.stats?.member_count ?? 0)} members`) }
  }

  if (plugin.id === "stripe") {
    const data = await fetchJson("https://api.stripe.com/v1/customers?limit=10", { headers: bearer(token) })
    const items = array<any>(data?.data)
    return { heading: "Stripe — клиенты", lines: items.map((item: any) => `${clean(item.name || item.email || item.id)} — ${clean(item.email)}`) }
  }

  if (plugin.id === "replicate") {
    const data = await fetchJson("https://api.replicate.com/v1/predictions", { headers: bearer(token) })
    const items = array<any>(data?.results)
    return { heading: "Replicate — последние predictions", lines: items.map((item: any) => `${clean(item.id)} — ${clean(item.status || "unknown")}; ${clean(item.model || item.version)}`) }
  }

  if (plugin.id === "huggingface") {
    const data = await fetchJson("https://huggingface.co/api/whoami-v2", { headers: bearer(token) })
    return { heading: "Hugging Face — аккаунт подключён", lines: [`${clean(data?.fullname || data?.name || "Hugging Face user")} — ${clean(data?.name)}`] }
  }

  throw new Error(`Connected runner is not implemented for ${plugin.id}`)
}

export function parsePluginCommand(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  const match = text.match(/^\/plugin\s+([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i)
  if (!match) return null
  return { id: match[1].toLowerCase(), query: String(match[2] || "").trim() }
}

export function parsePluginCommandFromBody(body: any) {
  const candidates = [body?.originalQuestion, body?.prompt, body?.message, body?.question, body?.input, body?.text, body?.content]
  for (const candidate of candidates) {
    const parsed = parsePluginCommand(candidate)
    if (parsed) return parsed
  }
  const messages = array<any>(body?.messages)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const parsed = parsePluginCommand(messages[index]?.content)
    if (parsed) return parsed
  }
  return null
}

export async function runMalikPlugin(pluginId: string, rawQuery: string): Promise<MalikPluginExecution> {
  const plugin = getMalikPlugin(pluginId)
  if (!plugin) {
    return {
      content: `Плагин ${clean(pluginId)} не найден или удалён после аудита.`,
      provider: "plugin:unknown",
      model: "malik-plugin-runtime-v1.1",
      usedWeb: false,
      sources: [],
      attempts: [{ provider: pluginId, model: "live-api", ok: false, error: "plugin_not_found" }],
      pluginId,
      pluginName: pluginId,
      connected: false,
    }
  }

  try {
    if (plugin.runtime === "public") {
      return output(plugin, await runPublic(plugin, rawQuery), true)
    }

    const user = await getPluginSessionUser()
    if (!user?.id) return connectRequired(plugin, "Сначала войди в Malik AI")

    const credential = await getPipesCredential(user.id, String(plugin.providerSlug || ""))
    if (!credential.active || !credential.value) {
      const reason = credential.error === "needs_reauthorization" ? "Нужно повторно разрешить доступ" : "Плагин ещё не подключён"
      return connectRequired(plugin, reason)
    }

    return output(plugin, await runConnected(plugin, credential.value, rawQuery), true)
  } catch (error: any) {
    const message = clean(error?.message || error || "Plugin execution failed", 500)
    return {
      content: `### ${plugin.name}\nНе удалось выполнить живой запрос: ${message}`,
      provider: `plugin:${plugin.id}`,
      model: "malik-plugin-runtime-v1.1",
      usedWeb: false,
      sources: [],
      attempts: [{ provider: plugin.id, model: "live-api", ok: false, status: Number(error?.status) || undefined, error: message }],
      pluginId: plugin.id,
      pluginName: plugin.name,
      connected: plugin.runtime === "public" ? true : undefined,
    }
  }
}
