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

const USER_AGENT = "Malik-AI-Plugin-Runtime/1.0"

function domain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return "unknown" }
}

function source(title: string, url: string, provider: string, snippet = ""): MalikPluginSource {
  return { title, url, domain: domain(url), provider, snippet }
}

function clean(value: unknown, max = 220) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim().slice(0, max)
}

function escQuery(value: string, max = 180) {
  return clean(value, max) || "latest"
}

async function request(url: string, init: RequestInit = {}, timeoutMs = 12000) {
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
    let json: any = null
    try { json = JSON.parse(text) } catch {}
    if (!response.ok) {
      const message = clean(json?.message || json?.error?.message || json?.error || text || `HTTP ${response.status}`, 360)
      throw Object.assign(new Error(message || `HTTP ${response.status}`), { status: response.status })
    }
    return { response, text, json, latencyMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

function formatExecution(plugin: MalikPlugin, output: ToolOutput, connected?: boolean): MalikPluginExecution {
  const body = output.lines.length ? output.lines.map((line, index) => `${index + 1}. ${line}`).join("\n") : "Данных по этому запросу не найдено."
  return {
    content: `### ${output.heading}\n${body}`,
    provider: `plugin:${plugin.id}`,
    model: "malik-plugin-runtime-v1",
    usedWeb: false,
    sources: output.sources || [],
    attempts: [{ provider: plugin.id, model: "live-api", ok: true }],
    pluginId: plugin.id,
    pluginName: plugin.name,
    connected,
  }
}

function connectRequired(plugin: MalikPlugin, reason = "Плагин ещё не подключён"): MalikPluginExecution {
  const url = `/api/plugins/connect?id=${encodeURIComponent(plugin.id)}&return_to=${encodeURIComponent("/dashboard")}`
  return {
    content: `### ${plugin.name}\n${reason}. Подключение выполняется через официальный OAuth/API и WorkOS Pipes.\n\nПодключить: ${url}`,
    provider: `plugin:${plugin.id}`,
    model: "malik-plugin-runtime-v1",
    usedWeb: false,
    sources: [],
    attempts: [{ provider: plugin.id, model: "workos-pipes", ok: false, error: "not_connected" }],
    pluginId: plugin.id,
    pluginName: plugin.name,
    connected: false,
  }
}

function publicSources(items: any[], provider: string, titleKey: string, urlKey: string, snippetKey?: string) {
  return items
    .map((item) => {
      const title = clean(item?.[titleKey] || item?.title || item?.name)
      const url = String(item?.[urlKey] || item?.url || item?.link || "")
      if (!title || !/^https?:\/\//.test(url)) return null
      return source(title, url, provider, snippetKey ? clean(item?.[snippetKey]) : "")
    })
    .filter(Boolean) as MalikPluginSource[]
}

async function runPublic(plugin: MalikPlugin, rawQuery: string): Promise<ToolOutput> {
  const q = escQuery(rawQuery)

  if (plugin.id === "wikipedia") {
    const lang = /[а-яёәіңғүұқөһ]/i.test(q) ? "ru" : "en"
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
    url.searchParams.set("action", "query")
    url.searchParams.set("list", "search")
    url.searchParams.set("srsearch", q)
    url.searchParams.set("srlimit", "8")
    url.searchParams.set("format", "json")
    url.searchParams.set("origin", "*")
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.query?.search) ? json.query.search : []
    const sources = items.map((item: any) => source(item.title, `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/ /g, "_"))}`, "wikipedia", clean(item.snippet)))
    return { heading: "Wikipedia — живой поиск", lines: sources.map((x) => `${x.title} — ${x.snippet || x.url}`), sources }
  }

  if (plugin.id === "stackoverflow") {
    const url = new URL("https://api.stackexchange.com/2.3/search/advanced")
    url.searchParams.set("site", "stackoverflow")
    url.searchParams.set("pagesize", "8")
    url.searchParams.set("order", "desc")
    url.searchParams.set("sort", "relevance")
    url.searchParams.set("q", q)
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.items) ? json.items : []
    const sources = items.map((item: any) => source(clean(item.title), item.link, "stackoverflow", `score ${item.score ?? 0}`))
    return { heading: "Stack Overflow — результаты", lines: sources.map((x) => `${x.title} — ${x.url}`), sources }
  }

  if (plugin.id === "npm") {
    const url = new URL("https://registry.npmjs.org/-/v1/search")
    url.searchParams.set("text", q)
    url.searchParams.set("size", "8")
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.objects) ? json.objects.map((x: any) => x.package) : []
    const sources = items.map((item: any) => source(item.name, item.links?.npm || `https://www.npmjs.com/package/${encodeURIComponent(item.name)}`, "npm", clean(item.description)))
    return { heading: "npm — пакеты", lines: items.map((item: any) => `${item.name}${item.version ? ` @ ${item.version}` : ""} — ${clean(item.description)}`), sources }
  }

  if (plugin.id === "arxiv") {
    const url = new URL("https://export.arxiv.org/api/query")
    url.searchParams.set("search_query", `all:${q}`)
    url.searchParams.set("start", "0")
    url.searchParams.set("max_results", "8")
    const { text } = await request(url.toString(), { headers: { Accept: "application/atom+xml" } })
    const entries = Array.from(text.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)).map((match) => match[1])
    const items = entries.map((block) => ({
      title: clean(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
      url: clean(block.match(/<id>([\s\S]*?)<\/id>/i)?.[1], 500),
      summary: clean(block.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1], 260),
    })).filter((x) => x.title && x.url)
    const sources = publicSources(items, "arxiv", "title", "url", "summary")
    return { heading: "arXiv — статьи", lines: items.map((x) => `${x.title} — ${x.summary}`), sources }
  }

  if (plugin.id === "pubmed") {
    const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi")
    searchUrl.searchParams.set("db", "pubmed")
    searchUrl.searchParams.set("term", q)
    searchUrl.searchParams.set("retmode", "json")
    searchUrl.searchParams.set("retmax", "8")
    const { json: searchJson } = await request(searchUrl.toString())
    const ids = Array.isArray(searchJson?.esearchresult?.idlist) ? searchJson.esearchresult.idlist : []
    if (!ids.length) return { heading: "PubMed — статьи", lines: [] }
    const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi")
    summaryUrl.searchParams.set("db", "pubmed")
    summaryUrl.searchParams.set("id", ids.join(","))
    summaryUrl.searchParams.set("retmode", "json")
    const { json } = await request(summaryUrl.toString())
    const items = ids.map((id: string) => json?.result?.[id]).filter(Boolean)
    const sources = items.map((item: any) => source(clean(item.title), `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`, "pubmed", clean(item.pubdate)))
    return { heading: "PubMed — статьи", lines: items.map((item: any) => `${clean(item.title)} — ${clean(item.pubdate)}; ${clean((item.authors || []).slice(0, 3).map((a: any) => a.name).join(", "))}`), sources }
  }

  if (plugin.id === "semanticscholar") {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search")
    url.searchParams.set("query", q)
    url.searchParams.set("limit", "8")
    url.searchParams.set("fields", "title,authors,year,url,abstract,citationCount")
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.data) ? json.data : []
    const sources = publicSources(items, "semantic-scholar", "title", "url", "abstract")
    return { heading: "Semantic Scholar — статьи", lines: items.map((x: any) => `${clean(x.title)} — ${x.year || ""}, citations ${x.citationCount ?? 0}`), sources }
  }

  if (plugin.id === "openalex") {
    const url = new URL("https://api.openalex.org/works")
    url.searchParams.set("search", q)
    url.searchParams.set("per-page", "8")
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.results) ? json.results : []
    const mapped = items.map((x: any) => ({ title: x.display_name, url: x.doi || x.id, year: x.publication_year, cited: x.cited_by_count }))
    const sources = publicSources(mapped, "openalex", "title", "url")
    return { heading: "OpenAlex — работы", lines: mapped.map((x: any) => `${clean(x.title)} — ${x.year || ""}, cited ${x.cited ?? 0}`), sources }
  }

  if (plugin.id === "crossref") {
    const url = new URL("https://api.crossref.org/works")
    url.searchParams.set("query", q)
    url.searchParams.set("rows", "8")
    const { json } = await request(url.toString())
    const items = Array.isArray(json?.message?.items) ? json.message.items : []
    const mapped = items.map((x: any) => ({ title: Array.isArray(x.title) ? x.title[0] : x.title, url: x.URL, type: x.type, publisher: x.publisher }))
    const sources = publicSources(mapped, "crossref", "title", "url")
    return { heading: "Crossref — публикации", lines: mapped.map((x: any) => `${clean(x.title)} — ${clean(x.publisher || x.type)}`), sources }
  }

  if (plugin.id === "devto") {
    const { json } = await request("https://dev.to/api/articles?per_page=50", { headers: { Accept: "application/vnd.forem.api-v1+json" } })
    const all = Array.isArray(json) ? json : []
    const needles = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2)
    const filtered = all.filter((x: any) => {
      if (!needles.length || q === "latest") return true
      const hay = `${x.title || ""} ${x.description || ""} ${(x.tag_list || []).join(" ")}`.toLowerCase()
      return needles.some((needle) => hay.includes(needle))
    }).slice(0, 8)
    const items = filtered.length ? filtered : all.slice(0, 8)
    const sources = publicSources(items, "devto", "title", "url", "description")
    return { heading: "DEV Community — статьи", lines: items.map((x: any) => `${clean(x.title)} — ${clean(x.user?.name || x.readable_publish_date)}`), sources }
  }

  if (plugin.id === "hackernews") {
    const { json: ids } = await request("https://hacker-news.firebaseio.com/v0/topstories.json")
    const topIds = Array.isArray(ids) ? ids.slice(0, 35) : []
    const stories = (await Promise.all(topIds.map(async (id: number) => {
      try { return (await request(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 6000)).json } catch { return null }
    }))).filter(Boolean)
    const needles = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2)
    const matches = stories.filter((x: any) => !needles.length || q === "latest" || needles.some((needle) => String(x.title || "").toLowerCase().includes(needle)))
    const items = (matches.length ? matches : stories).slice(0, 8)
    const mapped = items.map((x: any) => ({ title: x.title, url: x.url || `https://news.ycombinator.com/item?id=${x.id}`, score: x.score }))
    const sources = publicSources(mapped, "hackernews", "title", "url")
    return { heading: "Hacker News — топ", lines: mapped.map((x: any) => `${clean(x.title)} — ${x.score ?? 0} points`), sources }
  }

  if (plugin.id === "openstreetmap") {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", q)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("limit", "8")
    url.searchParams.set("addressdetails", "1")
    const { json } = await request(url.toString(), { headers: { "Accept-Language": "ru,en;q=0.8" } })
    const items = Array.isArray(json) ? json : []
    const sources = items.map((x: any) => source(clean(x.display_name), `https://www.openstreetmap.org/?mlat=${encodeURIComponent(x.lat)}&mlon=${encodeURIComponent(x.lon)}#map=16/${encodeURIComponent(x.lat)}/${encodeURIComponent(x.lon)}`, "openstreetmap"))
    return { heading: "OpenStreetMap — места", lines: items.map((x: any) => `${clean(x.display_name)} — ${x.lat}, ${x.lon}`), sources }
  }

  throw new Error(`Public runner is not implemented for ${plugin.id}`)
}

function bearer(token: string, extra: HeadersInit = {}): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra }
}

function arrayLines(items: any[], renderer: (item: any) => string, limit = 10) {
  return items.slice(0, limit).map(renderer).filter(Boolean)
}

async function runConnected(plugin: MalikPlugin, token: string, rawQuery: string): Promise<ToolOutput> {
  const q = escQuery(rawQuery)

  if (plugin.id === "github") {
    const { json } = await request("https://api.github.com/user/repos?per_page=10&sort=updated&affiliation=owner,collaborator,organization_member", { headers: bearer(token, { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }) })
    const items = Array.isArray(json) ? json : []
    const sources = items.map((x: any) => source(x.full_name, x.html_url, "github", clean(x.description)))
    return { heading: "GitHub — последние репозитории", lines: arrayLines(items, (x) => `${x.full_name} — ${x.private ? "private" : "public"}${x.description ? `; ${clean(x.description)}` : ""}`), sources }
  }

  if (plugin.id === "gitlab") {
    const { json } = await request("https://gitlab.com/api/v4/projects?membership=true&simple=true&order_by=last_activity_at&sort=desc&per_page=10", { headers: bearer(token) })
    const items = Array.isArray(json) ? json : []
    const sources = items.map((x: any) => source(x.path_with_namespace, x.web_url, "gitlab", clean(x.description)))
    return { heading: "GitLab — проекты", lines: arrayLines(items, (x) => `${x.path_with_namespace} — ${clean(x.description)}`), sources }
  }

  if (plugin.id === "notion") {
    const body: any = { page_size: 10, sort: { direction: "descending", timestamp: "last_edited_time" } }
    if (q !== "latest" && q.length < 100) body.query = q
    const { json } = await request("https://api.notion.com/v1/search", { method: "POST", headers: bearer(token, { "Content-Type": "application/json", "Notion-Version": "2022-06-28" }), body: JSON.stringify(body) })
    const items = Array.isArray(json?.results) ? json.results : []
    const name = (x: any) => clean(x?.properties?.title?.title?.[0]?.plain_text || x?.properties?.Name?.title?.[0]?.plain_text || x?.url || x?.id)
    const sources = items.filter((x: any) => x.url).map((x: any) => source(name(x), x.url, "notion"))
    return { heading: "Notion — страницы и базы", lines: arrayLines(items, (x) => `${name(x)} — ${x.object || "item"}`), sources }
  }

  if (plugin.id === "googledrive") {
    const url = new URL("https://www.googleapis.com/drive/v3/files")
    url.searchParams.set("pageSize", "10")
    url.searchParams.set("orderBy", "modifiedTime desc")
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)")
    url.searchParams.set("q", "trashed = false")
    const { json } = await request(url.toString(), { headers: bearer(token) })
    const items = Array.isArray(json?.files) ? json.files : []
    const sources = items.filter((x: any) => x.webViewLink).map((x: any) => source(x.name, x.webViewLink, "google-drive", x.mimeType))
    return { heading: "Google Drive — последние файлы", lines: arrayLines(items, (x) => `${x.name} — ${x.mimeType}; ${x.modifiedTime || ""}`), sources }
  }

  if (plugin.id === "gmail") {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("maxResults", "8")
    if (q !== "latest") url.searchParams.set("q", q)
    const { json } = await request(url.toString(), { headers: bearer(token) })
    const ids = Array.isArray(json?.messages) ? json.messages.slice(0, 8) : []
    const messages = (await Promise.all(ids.map(async (item: any) => {
      try {
        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        return (await request(detailUrl, { headers: bearer(token) }, 7000)).json
      } catch { return null }
    }))).filter(Boolean)
    const header = (message: any, key: string) => clean((message?.payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === key.toLowerCase())?.value)
    return { heading: "Gmail — сообщения", lines: arrayLines(messages, (m) => `${header(m, "Subject") || "(без темы)"} — ${header(m, "From")}; ${header(m, "Date")}`) }
  }

  if (plugin.id === "googlecalendar") {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("maxResults", "10")
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("timeMin", new Date().toISOString())
    const { json } = await request(url.toString(), { headers: bearer(token) })
    const items = Array.isArray(json?.items) ? json.items : []
    const sources = items.filter((x: any) => x.htmlLink).map((x: any) => source(x.summary || "Calendar event", x.htmlLink, "google-calendar"))
    return { heading: "Google Calendar — ближайшие события", lines: arrayLines(items, (x) => `${clean(x.summary || "Без названия")} — ${x.start?.dateTime || x.start?.date || ""}`), sources }
  }

  if (plugin.id === "slack") {
    const { json } = await request("https://slack.com/api/conversations.list?limit=30&types=public_channel,private_channel", { headers: bearer(token) })
    if (json?.ok === false) throw new Error(json?.error || "Slack API error")
    const items = Array.isArray(json?.channels) ? json.channels : []
    return { heading: "Slack — каналы", lines: arrayLines(items, (x) => `#${x.name} — ${clean(x.topic?.value || x.purpose?.value)}`) }
  }

  if (plugin.id === "discord") {
    const { json } = await request("https://discord.com/api/v10/users/@me/guilds?limit=20", { headers: bearer(token) })
    const items = Array.isArray(json) ? json : []
    return { heading: "Discord — серверы", lines: arrayLines(items, (x) => `${x.name} — id ${x.id}`) }
  }

  if (plugin.id === "telegram") {
    const { json } = await request(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`)
    if (!json?.ok) throw new Error(json?.description || "Telegram Bot API error")
    const b = json.result || {}
    return { heading: "Telegram Bot — подключено", lines: [`@${b.username || "bot"} — ${clean([b.first_name, b.last_name].filter(Boolean).join(" "))}; id ${b.id}`] }
  }

  if (plugin.id === "dropbox") {
    const { json } = await request("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: bearer(token, { "Content-Type": "application/json" }), body: JSON.stringify({ path: "", limit: 10 }) })
    const items = Array.isArray(json?.entries) ? json.entries : []
    return { heading: "Dropbox — файлы", lines: arrayLines(items, (x) => `${x.name} — ${x[".tag"] || "item"}`) }
  }

  if (["onedrive", "outlook", "teams"].includes(plugin.id)) {
    const endpoint = plugin.id === "onedrive"
      ? "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=10&$select=id,name,webUrl,lastModifiedDateTime,folder,file"
      : plugin.id === "outlook"
        ? "https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=id,subject,from,receivedDateTime,webLink"
        : "https://graph.microsoft.com/v1.0/me/joinedTeams?$top=20"
    const { json } = await request(endpoint, { headers: bearer(token) })
    const items = Array.isArray(json?.value) ? json.value : []
    const sources = items.filter((x: any) => x.webUrl || x.webLink).map((x: any) => source(x.name || x.subject || x.displayName, x.webUrl || x.webLink, plugin.id))
    const lines = plugin.id === "onedrive"
      ? arrayLines(items, (x) => `${x.name} — ${x.folder ? "folder" : "file"}; ${x.lastModifiedDateTime || ""}`)
      : plugin.id === "outlook"
        ? arrayLines(items, (x) => `${clean(x.subject || "(без темы)")} — ${clean(x.from?.emailAddress?.name || x.from?.emailAddress?.address)}; ${x.receivedDateTime || ""}`)
        : arrayLines(items, (x) => `${clean(x.displayName)} — ${clean(x.description)}`)
    return { heading: `${plugin.name} — живые данные`, lines, sources }
  }

  if (plugin.id === "asana") {
    const { json } = await request("https://app.asana.com/api/1.0/workspaces?limit=20", { headers: bearer(token) })
    const items = Array.isArray(json?.data) ? json.data : []
    return { heading: "Asana — рабочие пространства", lines: arrayLines(items, (x) => `${x.name} — gid ${x.gid}`) }
  }

  if (plugin.id === "linear") {
    const gql = `query MalikPlugin { viewer { name email assignedIssues(first: 10, orderBy: updatedAt) { nodes { identifier title url state { name } updatedAt } } } }`
    const { json } = await request("https://api.linear.app/graphql", { method: "POST", headers: bearer(token, { "Content-Type": "application/json" }), body: JSON.stringify({ query: gql }) })
    if (json?.errors?.length) throw new Error(clean(json.errors[0]?.message))
    const items = Array.isArray(json?.data?.viewer?.assignedIssues?.nodes) ? json.data.viewer.assignedIssues.nodes : []
    const sources = items.filter((x: any) => x.url).map((x: any) => source(`${x.identifier} ${x.title}`, x.url, "linear"))
    return { heading: "Linear — назначенные задачи", lines: arrayLines(items, (x) => `${x.identifier} ${clean(x.title)} — ${x.state?.name || ""}`), sources }
  }

  if (plugin.id === "jira") {
    const { json: resources } = await request("https://api.atlassian.com/oauth/token/accessible-resources", { headers: bearer(token) })
    const cloud = Array.isArray(resources) ? resources[0] : null
    if (!cloud?.id) throw new Error("Jira cloud resource is unavailable")
    const url = new URL(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloud.id)}/rest/api/3/search/jql`)
    url.searchParams.set("jql", "assignee = currentUser() ORDER BY updated DESC")
    url.searchParams.set("maxResults", "10")
    url.searchParams.set("fields", "summary,status,updated")
    const { json } = await request(url.toString(), { headers: bearer(token) })
    const items = Array.isArray(json?.issues) ? json.issues : []
    const sources = items.map((x: any) => source(`${x.key} ${clean(x.fields?.summary)}`, `${cloud.url}/browse/${x.key}`, "jira"))
    return { heading: "Jira — назначенные задачи", lines: arrayLines(items, (x) => `${x.key} ${clean(x.fields?.summary)} — ${x.fields?.status?.name || ""}`), sources }
  }

  if (plugin.id === "clickup") {
    const { json } = await request("https://api.clickup.com/api/v2/team", { headers: bearer(token) })
    const items = Array.isArray(json?.teams) ? json.teams : []
    return { heading: "ClickUp — workspaces", lines: arrayLines(items, (x) => `${x.name} — id ${x.id}`) }
  }

  if (plugin.id === "airtable") {
    const { json } = await request("https://api.airtable.com/v0/meta/bases?pageSize=20", { headers: bearer(token) })
    const items = Array.isArray(json?.bases) ? json.bases : []
    return { heading: "Airtable — базы", lines: arrayLines(items, (x) => `${x.name} — ${x.permissionLevel || "access"}`) }
  }

  if (plugin.id === "miro") {
    const { json } = await request("https://api.miro.com/v2/boards?limit=20&sort=last_modified", { headers: bearer(token) })
    const items = Array.isArray(json?.data) ? json.data : []
    const sources = items.filter((x: any) => x.viewLink).map((x: any) => source(x.name, x.viewLink, "miro"))
    return { heading: "Miro — доски", lines: arrayLines(items, (x) => `${x.name} — ${x.modifiedAt || ""}`), sources }
  }

  if (plugin.id === "figma") {
    const { json } = await request("https://api.figma.com/v1/me", { headers: bearer(token) })
    return { heading: "Figma — аккаунт подключён", lines: [`${clean(json?.handle || json?.email || "Figma user")} — ${clean(json?.email)}`] }
  }

  if (plugin.id === "canva") {
    const { json } = await request("https://api.canva.com/rest/v1/users/me/profile", { headers: bearer(token) })
    return { heading: "Canva — аккаунт подключён", lines: [`${clean(json?.profile?.display_name || "Canva user")}`] }
  }

  if (plugin.id === "netlify") {
    const { json } = await request("https://api.netlify.com/api/v1/sites?per_page=10", { headers: bearer(token) })
    const items = Array.isArray(json) ? json : []
    const sources = items.filter((x: any) => x.admin_url || x.url).map((x: any) => source(x.name, x.admin_url || x.url, "netlify"))
    return { heading: "Netlify — сайты", lines: arrayLines(items, (x) => `${x.name} — ${x.url || x.ssl_url || ""}`), sources }
  }

  if (plugin.id === "cloudflare") {
    const { json } = await request("https://api.cloudflare.com/client/v4/accounts?per_page=20", { headers: bearer(token) })
    if (json?.success === false) throw new Error(clean(json?.errors?.[0]?.message || "Cloudflare API error"))
    const items = Array.isArray(json?.result) ? json.result : []
    return { heading: "Cloudflare — аккаунты", lines: arrayLines(items, (x) => `${x.name} — id ${x.id}`) }
  }

  if (plugin.id === "sentry") {
    const { json } = await request("https://sentry.io/api/0/organizations/", { headers: bearer(token) })
    const items = Array.isArray(json) ? json : []
    return { heading: "Sentry — организации", lines: arrayLines(items, (x) => `${x.name || x.slug} — ${x.slug}`) }
  }

  if (plugin.id === "reddit") {
    const { json } = await request("https://oauth.reddit.com/api/v1/me", { headers: bearer(token, { "User-Agent": USER_AGENT }) })
    return { heading: "Reddit — аккаунт подключён", lines: [`u/${clean(json?.name || "user")} — karma ${Number(json?.total_karma ?? 0)}`] }
  }

  if (plugin.id === "hubspot") {
    const { json } = await request("https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=firstname,lastname,email,lastmodifieddate", { headers: bearer(token) })
    const items = Array.isArray(json?.results) ? json.results : []
    return { heading: "HubSpot — контакты", lines: arrayLines(items, (x) => `${clean([x.properties?.firstname, x.properties?.lastname].filter(Boolean).join(" ") || x.properties?.email)} — ${clean(x.properties?.email)}`) }
  }

  if (plugin.id === "intercom") {
    const { json } = await request("https://api.intercom.io/me", { headers: bearer(token, { "Intercom-Version": "2.13" }) })
    return { heading: "Intercom — аккаунт подключён", lines: [`${clean(json?.name || json?.email || "Intercom user")} — ${clean(json?.email)}`] }
  }

  if (plugin.id === "mailchimp") {
    const { json: metadata } = await request("https://login.mailchimp.com/oauth2/metadata", { headers: { Authorization: `OAuth ${token}`, Accept: "application/json" } })
    const dc = clean(metadata?.dc, 40)
    if (!dc) throw new Error("Mailchimp data center is unavailable")
    const { json } = await request(`https://${dc}.api.mailchimp.com/3.0/lists?count=10`, { headers: bearer(token) })
    const items = Array.isArray(json?.lists) ? json.lists : []
    return { heading: "Mailchimp — audiences", lines: arrayLines(items, (x) => `${x.name} — ${x.stats?.member_count ?? 0} members`) }
  }

  if (plugin.id === "stripe") {
    const { json } = await request("https://api.stripe.com/v1/customers?limit=10", { headers: bearer(token) })
    const items = Array.isArray(json?.data) ? json.data : []
    return { heading: "Stripe — клиенты", lines: arrayLines(items, (x) => `${clean(x.name || x.email || x.id)} — ${clean(x.email)}`) }
  }

  if (plugin.id === "replicate") {
    const { json } = await request("https://api.replicate.com/v1/predictions", { headers: bearer(token) })
    const items = Array.isArray(json?.results) ? json.results : []
    return { heading: "Replicate — последние predictions", lines: arrayLines(items, (x) => `${x.id} — ${x.status || "unknown"}; ${clean(x.model || x.version)}`) }
  }

  if (plugin.id === "huggingface") {
    const { json } = await request("https://huggingface.co/api/whoami-v2", { headers: bearer(token) })
    return { heading: "Hugging Face — аккаунт подключён", lines: [`${clean(json?.fullname || json?.name || "Hugging Face user")} — ${clean(json?.name)}`] }
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
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const parsed = parsePluginCommand(messages[i]?.content)
    if (parsed) return parsed
  }
  return null
}

export async function runMalikPlugin(pluginId: string, query: string): Promise<MalikPluginExecution> {
  const plugin = getMalikPlugin(pluginId)
  if (!plugin) {
    return {
      content: `Плагин ${pluginId} не найден или удалён после аудита.`,
      provider: "plugin:unknown",
      model: "malik-plugin-runtime-v1",
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
      return formatExecution(plugin, await runPublic(plugin, query), true)
    }

    const user = await getPluginSessionUser()
    if (!user?.id) return connectRequired(plugin, "Сначала войди в Malik AI")

    const credential = await getPipesCredential(user.id, String(plugin.providerSlug || ""))
    if (!credential.active || !credential.value) {
      return connectRequired(plugin, credential.error === "needs_reauthorization" ? "Нужно повторно разрешить доступ" : "Плагин ещё не подключён")
    }

    return formatExecution(plugin, await runConnected(plugin, credential.value, query), true)
  } catch (error: any) {
    const message = clean(error?.message || error || "Plugin execution failed", 500)
    return {
      content: `### ${plugin.name}\nНе удалось выполнить живой запрос: ${message}`,
      provider: `plugin:${plugin.id}`,
      model: "malik-plugin-runtime-v1",
      usedWeb: false,
      sources: [],
      attempts: [{ provider: plugin.id, model: "live-api", ok: false, status: Number(error?.status) || undefined, error: message }],
      pluginId: plugin.id,
      pluginName: plugin.name,
      connected: plugin.runtime === "public" ? true : undefined,
    }
  }
}
