import type { MalikModelId } from "@/lib/ai/malik-models"
import type { MalikResearchProgress, MalikWebSource } from "@/lib/ai/web-research-types"
import { fetchPageText } from "@/lib/malik-research/fetch-page"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import { shouldUseWeb } from "@/lib/ai/web-search-policy"
import { buildMalikResponseSystemPrompt, cleanModelText } from "@/lib/ai/response-intelligence"

type ProviderAttempt = {
  provider: string
  model: string
  ok: boolean
  status?: number
  error?: string
  latencyMs?: number
}

type SourceItem = MalikWebSource

type ResearchEmitter = (progress: MalikResearchProgress) => void

type GodAnswer = {
  content: string
  provider: string
  model: string
  usedWeb: boolean
  sources: SourceItem[]
  attempts: ProviderAttempt[]
  selectedModelId?: MalikModelId
}

const CACHE = new Map<string, { expiresAt: number; value: GodAnswer }>()
const SEARCH_CACHE_VERSION = "multi-query-v3"

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function cleanText(value: unknown) {
  return cleanModelText(value)
}

function cleanInlineText(value: unknown) {
  return cleanModelText(value).replace(/\s+/g, " ").trim()
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "unknown"
  }
}

function extractPrompt(body: any) {
  // Dashboard sends its orchestration instructions in `question`, but live
  // search and the selected model must receive the user's clean request. This
  // prevents internal runtime text from polluting search queries or being
  // echoed into the conversation.
  if (typeof body?.originalQuestion === "string" && body.originalQuestion.trim()) return body.originalQuestion.trim()
  if (typeof body?.prompt === "string" && body.prompt.trim()) return body.prompt.trim()
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim()
  if (typeof body?.question === "string" && body.question.trim()) return body.question.trim()
  if (typeof body?.input === "string" && body.input.trim()) return body.input.trim()
  if (typeof body?.text === "string" && body.text.trim()) return body.text.trim()
  if (typeof body?.content === "string" && body.content.trim()) return body.content.trim()

  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = typeof messages[i]?.content === "string" ? messages[i].content.trim() : ""
    if (content) return content
  }

  return ""
}

function cacheKey(prompt: string) {
  return `${SEARCH_CACHE_VERSION}:${prompt.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 420)}`
}

function getCache(prompt: string) {
  const key = cacheKey(prompt)
  const item = CACHE.get(key)
  if (!item) return null
  if (Date.now() > item.expiresAt) {
    CACHE.delete(key)
    return null
  }
  return item.value
}

function setCache(prompt: string, value: GodAnswer) {
  const ttl = Number(process.env.MALIK_GOD_CACHE_TTL_MS || process.env.RESEARCH_CACHE_TTL_MS || 1000 * 60 * 20)
  CACHE.set(cacheKey(prompt), { expiresAt: Date.now() + ttl, value })
}

function isTinyCasual(prompt: string) {
  const p = prompt.toLowerCase().trim()
  return (
    !p ||
    p.length < 8 ||
    /^(привет|салам|сәлем|hi|hello|hey|йо|ку|здарова|ассалаумағалейкум|assalamu|как дела|қалайсың|ты тут|алло)[\s.!?]*$/i.test(p)
  )
}

function isIdentity(prompt: string) {
  const p = prompt.toLowerCase()
  return p.includes("кто ты") || p.includes("что ты") || p.includes("who are you") || p.includes("what are you") || p.includes("сен кім")
}

function isCapabilities(prompt: string) {
  const p = prompt.toLowerCase()
  return p.includes("что умеешь") || p.includes("what can you do") || p.includes("на что способен")
}

function localSmart(prompt: string) {
  if (isTinyCasual(prompt)) return "Привет, брат. Я здесь. Чем помогаю?"
  if (isIdentity(prompt)) return "Я MALIK AI V6.5 TITAN — твой AI-командный центр для ответов, кода, идей, дизайна, анализа, поиска свежей информации и запуска проектов."
  if (isCapabilities(prompt)) return "Я могу отвечать, писать код, анализировать файлы, искать свежую информацию через открытые источники, помогать с бизнесом, дизайном, проектами и запуском MALIK AI."
  return ""
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "MALIK-AI-GITHUB-ROUTER/13",
        accept: "application/json,text/plain,text/markdown,*/*",
        ...(init.headers || {}),
      },
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
  }
}

function normalizeSource(item: Partial<SourceItem>, provider: string): SourceItem | null {
  const url = String(item.url || "").trim()
  if (!url.startsWith("http")) return null
  return {
    title: cleanInlineText(item.title || url).slice(0, 180),
    url,
    domain: item.domain || getDomain(url),
    snippet: cleanInlineText(item.snippet || "").slice(0, 650),
    provider,
  }
}

function uniqueSources(items: SourceItem[], limit: number) {
  const seen = new Set<string>()
  const out: SourceItem[] = []

  for (const item of items) {
    const key = item.url.split("#")[0].replace(/\/$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }

  return out
}

function diverseSources(items: SourceItem[], limit: number) {
  const domains = new Set<string>()
  const out: SourceItem[] = []

  for (const item of items) {
    const rawDomain = item.domain.toLowerCase().replace(/^www\./, "")
    const domain = rawDomain.endsWith(".wikipedia.org")
      ? "wikipedia.org"
      : rawDomain.endsWith(".google.com")
        ? "google.com"
        : rawDomain
    if (domains.has(domain)) continue
    domains.add(domain)
    out.push(item)
    if (out.length >= limit) break
  }

  return out
}

async function searchSerper(query: string, limit: number): Promise<SourceItem[]> {
  const key = env("SERPER_API_KEY")
  if (!key) return []

  const res = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: Math.min(limit, 10) }),
    },
    7000
  )

  if (!res.ok) return []
  const data: any = await res.json().catch(() => null)
  const organic = Array.isArray(data?.organic) ? data.organic : []

  return uniqueSources(
    organic
      .map((x: any) => normalizeSource({ title: x.title, url: x.link, snippet: x.snippet }, "serper"))
      .filter(Boolean) as SourceItem[],
    limit
  )
}

async function searchTavily(query: string, limit: number): Promise<SourceItem[]> {
  const key = env("TAVILY_API_KEY")
  if (!key) return []

  async function request(useBearer: boolean) {
    return fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(useBearer ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          ...(useBearer ? {} : { api_key: key }),
          query,
          search_depth: "basic",
          max_results: Math.min(limit, 10),
          include_answer: false,
          include_raw_content: false,
        }),
      },
      8000
    )
  }

  let res = await request(false)
  if (!res.ok && [401, 403, 422].includes(res.status)) res = await request(true)
  if (!res.ok) return []

  const data: any = await res.json().catch(() => null)
  const results = Array.isArray(data?.results) ? data.results : []

  return uniqueSources(
    results
      .map((x: any) => normalizeSource({ title: x.title, url: x.url, snippet: x.content }, "tavily"))
      .filter(Boolean) as SourceItem[],
    limit
  )
}

async function searchBrave(query: string, limit: number): Promise<SourceItem[]> {
  const key = env("BRAVE_SEARCH_API_KEY")
  if (!key) return []

  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", String(Math.min(limit, 10)))

  const res = await fetchWithTimeout(url.toString(), { headers: { "X-Subscription-Token": key, accept: "application/json" } }, 8000)
  if (!res.ok) return []

  const data: any = await res.json().catch(() => null)
  const results = Array.isArray(data?.web?.results) ? data.web.results : []

  return uniqueSources(
    results
      .map((x: any) => normalizeSource({ title: x.title, url: x.url, snippet: x.description }, "brave"))
      .filter(Boolean) as SourceItem[],
    limit
  )
}

function decodeSearchText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

async function searchBingRss(query: string, limit: number): Promise<SourceItem[]> {
  const url = new URL("https://www.bing.com/search")
  url.searchParams.set("format", "rss")
  url.searchParams.set("q", query)
  url.searchParams.set("count", String(Math.min(limit, 10)))
  const res = await fetchWithTimeout(url.toString(), {}, 9000)
  if (!res.ok) return []
  const xml = await res.text()
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
  return uniqueSources(items.map((match) => {
    const block = match[1]
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ""
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""
    const snippet = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""
    return normalizeSource({
      title: decodeSearchText(title),
      url: decodeSearchText(link),
      snippet: decodeSearchText(snippet),
    }, "bing-rss")
  }).filter(Boolean) as SourceItem[], limit)
}

async function searchGoogleNews(query: string, limit: number): Promise<SourceItem[]> {
  const isRussian = /[а-яё]/i.test(query)
  const url = new URL("https://news.google.com/rss/search")
  url.searchParams.set("q", query)
  url.searchParams.set("hl", isRussian ? "ru" : "en-US")
  url.searchParams.set("gl", isRussian ? "KZ" : "US")
  url.searchParams.set("ceid", isRussian ? "KZ:ru" : "US:en")

  const res = await fetchWithTimeout(url.toString(), {}, 9000)
  if (!res.ok) return []
  const xml = await res.text()
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))

  return uniqueSources(items.map((match) => {
    const block = match[1]
    const title = decodeSearchText(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "")
    const link = decodeSearchText(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "")
    const snippet = decodeSearchText(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "")
    const publisher = decodeSearchText(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "")
    return normalizeSource({
      title,
      url: link,
      snippet: publisher ? `${publisher}. ${snippet}` : snippet,
    }, "google-news")
  }).filter(Boolean) as SourceItem[], limit)
}

async function searchWikipedia(query: string, limit: number): Promise<SourceItem[]> {
  const language = /[а-яё]/i.test(query) ? "ru" : "en"
  const base = `https://${language}.wikipedia.org/w/api.php`
  const url = new URL(base)
  url.searchParams.set("action", "query")
  url.searchParams.set("list", "search")
  url.searchParams.set("srsearch", query)
  url.searchParams.set("srlimit", String(Math.min(limit, 8)))
  url.searchParams.set("format", "json")
  url.searchParams.set("origin", "*")
  const res = await fetchWithTimeout(url.toString(), {}, 8000)
  if (!res.ok) return []
  const data: any = await res.json().catch(() => null)
  const results = Array.isArray(data?.query?.search) ? data.query.search : []
  return uniqueSources(results.map((item: any) => normalizeSource({
    title: item.title,
    url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(item.title || "").replace(/ /g, "_"))}`,
    snippet: decodeSearchText(String(item.snippet || "")),
  }, "wikipedia" )).filter(Boolean) as SourceItem[], limit)
}

async function searchGdelt(query: string, limit: number): Promise<SourceItem[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc")
  url.searchParams.set("query", query)
  url.searchParams.set("mode", "artlist")
  url.searchParams.set("format", "json")
  url.searchParams.set("maxrecords", String(Math.min(limit, 10)))
  const res = await fetchWithTimeout(url.toString(), {}, 9000)
  if (!res.ok) return []
  const data: any = await res.json().catch(() => null)
  const articles = Array.isArray(data?.articles) ? data.articles : []
  return uniqueSources(articles.map((item: any) => normalizeSource({
    title: item.title,
    url: item.url,
    domain: item.domain,
    snippet: item.socialimage ? `News result from ${item.domain || getDomain(item.url)}` : "",
    publishedAt: item.seendate,
  } as MalikWebSource, "gdelt")).filter(Boolean) as SourceItem[], limit)
}

function parseJina(text: string, limit: number) {
  const blocks = text.split(/\n(?=Title:\s)/g).map((x) => x.trim()).filter(Boolean)
  const out: SourceItem[] = []

  for (const block of blocks) {
    const title = block.match(/^Title:\s*(.+)$/im)?.[1]?.trim()
    const url = block.match(/^URL Source:\s*(https?:\/\/\S+)/im)?.[1]?.trim() || block.match(/(https?:\/\/[^\s)]+)/i)?.[1]?.trim()
    if (!title || !url) continue
    const snippet = block
      .replace(/^Title:.*$/gim, "")
      .replace(/^URL Source:.*$/gim, "")
      .replace(/^Markdown Content:.*$/gim, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 650)

    const item = normalizeSource({ title, url, snippet }, "jina")
    if (item) out.push(item)
    if (out.length >= limit) break
  }

  return out
}

async function searchJina(query: string, limit: number): Promise<SourceItem[]> {
  if (env("JINA_SEARCH_DISABLED") === "true") return []

  const base = (env("JINA_SEARCH_URL") || "https://s.jina.ai/").replace(/\/+$/, "")
  const res = await fetchWithTimeout(`${base}/${encodeURIComponent(query)}`, {}, 8000)
  if (!res.ok) return []

  return uniqueSources(parseJina(await res.text(), limit), limit)
}

function collectGroqSources(message: any, limit: number): SourceItem[] {
  const found: SourceItem[] = []
  const add = (value: any, provider = "groq-browser-search") => {
    if (!value) return
    if (typeof value === "string") {
      found.push(...parseJina(value, limit))
      const markdownLinks = Array.from(value.matchAll(/\[([^\]]{2,180})\]\((https?:\/\/[^\s)]+)\)/g))
      for (const match of markdownLinks) {
        const source = normalizeSource({ title: match[1], url: match[2] }, provider)
        if (source) found.push(source)
      }
      const looseUrls = value.match(/https?:\/\/[^\s<>"')\]]+/g) || []
      for (const rawUrl of looseUrls) {
        const url = rawUrl.replace(/[.,;:!?]+$/, "")
        const source = normalizeSource({ title: getDomain(url), url }, provider)
        if (source) found.push(source)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => add(item, provider))
      return
    }
    if (typeof value !== "object") return

    const url = value.url || value.link || value.href || value.source_url
    if (url) {
      const source = normalizeSource({
        title: value.title || value.name || value.source || url,
        url,
        snippet: value.snippet || value.content || value.text || value.description,
        publishedAt: value.publishedAt || value.published_at || value.date,
      } as MalikWebSource, provider)
      if (source) found.push(source)
    }

    for (const key of ["search_results", "results", "citations", "sources", "output"]) {
      if (value[key] && value[key] !== value) add(value[key], provider)
    }
  }

  add(message?.executed_tools)
  add(message?.citations)
  add(message?.content)
  return uniqueSources(found, limit)
}

async function searchGroqBrowser(query: string, limit: number): Promise<SourceItem[]> {
  const key = env("GROQ_API_KEY")
  if (!key) return []

  const baseUrl = (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")
  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{
          role: "user",
          content: `Search the public web for this request and collect reliable primary sources. Do not answer from memory. Query: ${query}`,
        }],
        tools: [{ type: "browser_search" }],
        max_tokens: 700,
        temperature: 0.1,
      }),
    },
    Number(process.env.MALIK_WEB_SEARCH_TIMEOUT_MS || 20000)
  )

  if (!res.ok) return []
  const data: any = await res.json().catch(() => null)
  return collectGroqSources(data?.choices?.[0]?.message, limit)
}

function extractNamedSubject(value: string) {
  // JavaScript's `\b` is ASCII-only and does not recognize Cyrillic word
  // boundaries. Use whitespace/start anchors so requests such as
  // "поищи кто такой трамп" are parsed correctly.
  return value.match(/(?:^|\s)(?:кто\s+(?:такой|такая|такие)|who\s+is)\s+([^?.!,]{2,90}?)(?=\s+(?:и|его|ее|её|чем|что|где|когда|and|his|her|what|where|when)(?:\s|[?.!,]|$)|[?.!,]|$)/i)?.[1]?.trim() || ""
}

function knownPersonSearchName(value: string) {
  if (/эпштейн/i.test(value)) return "Jeffrey Epstein"
  if (/трамп/i.test(value)) return "Donald Trump"
  if (/байден/i.test(value)) return "Joe Biden"
  if (/путин/i.test(value)) return "Vladimir Putin"
  if (/токаев/i.test(value)) return "Kassym-Jomart Tokayev"
  if (/зеленск/i.test(value)) return "Volodymyr Zelenskyy"
  if (/илон\s+маск|маск/i.test(value)) return "Elon Musk"
  return ""
}

function buildQueries(prompt: string) {
  const year = new Date().getFullYear()
  const q = prompt
    .replace(/\[(?:system|assistant|developer|internal)[^\]]*\][\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260)
  const queries = [q]

  const namedSubject = extractNamedSubject(q)
  const internationalName = knownPersonSearchName(q)
  if (namedSubject) {
    queries.push(`"${namedSubject}" биография деятельность факты`)
  }
  if (internationalName) {
    queries.push(`"${internationalName}" official biography career facts`)
  }

  if (!namedSubject && !/\b202[0-9]\b/.test(q)) queries.push(`${q} ${year}`)
  if (!namedSubject) queries.push(`${q} official source`)

  if (/(президент|president|usa|сша|united states|white house)/i.test(q)) {
    queries.push(`current president of the United States official ${year}`)
    queries.push(`White House president United States ${year}`)
  }

  if (/(хакатон|соревн|конкурс|акселератор|startup|hackathon|competition|ai)/i.test(q)) {
    queries.push(`AI hackathon accelerator competition Kazakhstan online ${year}`)
  }

  return Array.from(new Set(queries)).slice(0, Number(process.env.MALIK_GOD_MAX_SEARCH_QUERIES || 3))
}

const SEARCH_STOP_WORDS = new Set([
  "about", "answer", "briefly", "cite", "current", "find", "from", "latest", "please", "show", "source", "sources", "that", "what", "when", "where", "which", "with",
  "актуально", "где", "дай", "его", "источник", "источники", "какой", "кратко", "кто", "найди", "ответь", "покажи", "поищи", "про", "сейчас", "ссылки", "такой", "текущий", "через",
])

function searchTokens(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter((token) => !SEARCH_STOP_WORDS.has(token))))
    .slice(0, 18)
}

function knownNameAliases(value: string) {
  const aliases: string[] = []
  // Search indexes often store internationally known names only in Latin.
  // Keep aliases explicit so they improve recall without broadening unrelated
  // queries or allowing arbitrary off-topic results through the filter.
  if (/эпштейн/i.test(value)) aliases.push("jeffrey", "epstein")
  if (/трамп/i.test(value)) aliases.push("donald", "trump")
  if (/байден/i.test(value)) aliases.push("joe", "biden")
  if (/путин/i.test(value)) aliases.push("vladimir", "putin")
  if (/токаев/i.test(value)) aliases.push("kassym-jomart", "tokayev")
  if (/зеленск/i.test(value)) aliases.push("volodymyr", "zelenskyy")
  if (/илон\s+маск|маск/i.test(value)) aliases.push("elon", "musk")
  return aliases
}

function identityTokensForNamedSubject(namedSubject: string, prompt: string) {
  const subjectTokens = searchTokens(namedSubject)
  const identity = subjectTokens.length ? [subjectTokens[subjectTokens.length - 1]] : []
  if (/эпштейн/i.test(prompt)) identity.push("epstein")
  if (/трамп/i.test(prompt)) identity.push("trump")
  if (/байден/i.test(prompt)) identity.push("biden")
  if (/путин/i.test(prompt)) identity.push("putin")
  if (/токаев/i.test(prompt)) identity.push("tokayev")
  if (/зеленск/i.test(prompt)) identity.push("zelenskyy")
  if (/илон\s+маск|маск/i.test(prompt)) identity.push("musk")
  return Array.from(new Set(identity))
}

function rankSourcesForPrompt(prompt: string, sources: SourceItem[]) {
  const tokens = Array.from(new Set([...searchTokens(prompt), ...knownNameAliases(prompt)]))
  const namedSubject = extractNamedSubject(prompt)
  const subjectTokens = Array.from(new Set([...searchTokens(namedSubject), ...knownNameAliases(prompt)]))
  const identityTokens = identityTokensForNamedSubject(namedSubject, prompt)
  const softwareNoise = /\b(?:winrar|winzip|7-zip|softonic|архиватор|zip files?|unzip|download)\b/i
  const promptAsksForSoftware = softwareNoise.test(prompt)

  const scored = sources.map((source, index) => {
    const title = source.title.toLowerCase()
    const body = `${source.snippet || ""} ${source.domain} ${source.url}`.toLowerCase()
    const identityHaystack = `${title} ${source.url}`.toLowerCase()
    let score = 0
    let matched = 0
    let subjectMatched = 0
    for (const token of tokens) {
      const titleHit = title.includes(token)
      const bodyHit = body.includes(token)
      if (titleHit || bodyHit) matched += 1
      if (titleHit) score += 7
      if (bodyHit) score += 3
      if (subjectTokens.includes(token) && (titleHit || bodyHit)) subjectMatched += 1
    }
    if (score > 0 && (/\.(gov|gov\.[a-z]{2}|edu|ac\.[a-z]{2})$/i.test(source.domain) || /(?:wikipedia|britannica|reuters|apnews|bbc)\./i.test(source.domain))) score += 4
    if (!promptAsksForSoftware && softwareNoise.test(`${title} ${body}`)) score -= 40

    const subjectRelevant = subjectTokens.length === 0 || subjectMatched >= Math.max(1, Math.ceil(subjectTokens.length / 2))
    const identityRelevant = identityTokens.length === 0 || identityTokens.some((token) => identityHaystack.includes(token))
    const relevant = score > 0 && matched > 0 && subjectRelevant && identityRelevant
    return { source, score, index, relevant }
  }).sort((a, b) => b.score - a.score || a.index - b.index)

  // Never fill the UI with unrelated links. An empty set is safer than
  // presenting stale or off-topic results as if MALIK AI had read them.
  return scored.filter((item) => item.relevant).map((item) => item.source)
}

async function gatherSources(prompt: string, emit?: ResearchEmitter): Promise<SourceItem[]> {
  const queries = buildQueries(prompt)
  const perQuery = Number(process.env.MALIK_GOD_SEARCH_PER_QUERY || 6)

  emit?.({
    kind: "plan",
    text: `Планирую поиск по открытым источникам · ${queries.length} запрос${queries.length === 1 ? "" : "а"}`,
  })

  const batches = await Promise.allSettled(
    queries.map(async (query) => {
      emit?.({ kind: "search", text: `Ищу через Google News и открытый веб · ${query}` })
      const settled = await Promise.allSettled([
        searchSerper(query, perQuery),
        searchTavily(query, perQuery),
        searchBrave(query, perQuery),
        searchJina(query, perQuery),
        searchGoogleNews(query, perQuery),
        searchBingRss(query, perQuery),
        searchWikipedia(query, perQuery),
        searchGdelt(query, perQuery),
      ])
      return settled.flatMap((item) => item.status === "fulfilled" ? item.value : [])
    })
  )

  const all: SourceItem[] = []
  for (const batch of batches) {
    if (batch.status === "fulfilled") all.push(...batch.value)
  }

  const maxSearchResults = Number(process.env.MALIK_GOD_MAX_SEARCH_RESULTS || 16)
  // Deduplicate the complete provider pool first. Truncating before ranking
  // allowed one noisy provider to crowd Wikipedia and other relevant sources
  // out of consideration.
  let unique = diverseSources(
    rankSourcesForPrompt(prompt, uniqueSources(all, Math.max(maxSearchResults * 8, 96))),
    maxSearchResults,
  )

  if (unique.length < 3) {
    emit?.({ kind: "search", text: "Расширяю поиск через Malik Web Scout · Groq Browser Search" })
    try {
      unique = diverseSources(
        rankSourcesForPrompt(prompt, uniqueSources([...unique, ...(await searchGroqBrowser(prompt, perQuery))], Math.max(maxSearchResults * 3, 48))),
        maxSearchResults,
      )
    } catch {
      // Other providers may still have returned usable evidence.
    }
  }

  for (const source of unique.slice(0, 10)) {
    emit?.({
      kind: "source",
      text: `Найден источник · ${source.domain}`,
      domain: source.domain,
      title: source.title,
      url: source.url,
      provider: source.provider,
      source,
    })
  }

  const maxSources = Number(process.env.MALIK_GOD_MAX_SOURCES || 8)
  const preferred = unique.slice(0, Math.min(maxSources, 6))
  const read = await Promise.allSettled(preferred.map(async (source) => {
    emit?.({
      kind: "reading",
      text: `Читаю · ${source.domain}`,
      domain: source.domain,
      title: source.title,
      url: source.url,
      provider: source.provider,
      source,
    })
    const page = await fetchPageText(source)
    return page
      ? { ...source, title: page.title || source.title, snippet: page.text.slice(0, 2200) }
      : source
  }))

  const sources = read.flatMap((item) => item.status === "fulfilled" ? [item.value] : [])
  const finalSources = uniqueSources([...sources, ...unique], maxSources)
  emit?.({
    kind: "done",
    text: finalSources.length
      ? `Прочитано и отобрано источников · ${finalSources.length}`
      : "Открытые источники не вернули доступных страниц",
  })
  return finalSources
}

function sourceContext(sources: SourceItem[]) {
  if (!sources.length) return ""
  return sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nDomain: ${s.domain}\nSnippet: ${s.snippet || ""}`)
    .join("\n\n")
}

function systemPrompt(usedWeb: boolean, prompt: string) {
  return buildMalikResponseSystemPrompt({ prompt, usedWeb })
}

type ProviderConfig = {
  provider: string
  key: string
  baseUrl: string
  model: string
  headers?: Record<string, string>
}

async function callOpenAICompatible(config: ProviderConfig, prompt: string, usedWeb: boolean, sources: SourceItem[]): Promise<{ content: string; attempt: ProviderAttempt }> {
  const started = Date.now()
  const attemptBase = { provider: config.provider, model: config.model, ok: false, latencyMs: 0 }

  if (!config.key) {
    return { content: "", attempt: { ...attemptBase, error: "missing-key", latencyMs: 0 } }
  }

  const userContent = usedWeb ? `Question:\n${prompt}\n\nWeb sources:\n${sourceContext(sources)}` : prompt

  try {
    const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.key}`,
          "content-type": "application/json; charset=utf-8",
          ...config.headers,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt(usedWeb, prompt) },
            { role: "user", content: userContent },
          ],
          max_tokens: Number(process.env.MALIK_GOD_MAX_OUTPUT_TOKENS || 2200),
          temperature: Number(process.env.MALIK_GOD_TEMPERATURE || 0.4),
          stream: false,
        }),
      },
      Number(process.env.MALIK_GOD_PROVIDER_TIMEOUT_MS || 18000)
    )

    const latencyMs = Date.now() - started

    if (!res.ok) {
      const error = (await res.text().catch(() => "")).slice(0, 360)
      return { content: "", attempt: { ...attemptBase, status: res.status, error, latencyMs } }
    }

    const data: any = await res.json().catch(() => null)
    const content = cleanText(data?.choices?.[0]?.message?.content || "")

    if (!content) return { content: "", attempt: { ...attemptBase, status: res.status, error: "empty-output", latencyMs } }

    return { content, attempt: { ...attemptBase, ok: true, status: res.status, latencyMs } }
  } catch (error: any) {
    return { content: "", attempt: { ...attemptBase, error: String(error?.message || error), latencyMs: Date.now() - started } }
  }
}

function providerConfigs() {
  return {
    github: {
      provider: "github-models",
      key: env("GITHUB_TOKEN") || env("GITHUB_MODELS_TOKEN"),
      baseUrl: env("GITHUB_MODELS_ENDPOINT") || "https://models.github.ai/inference",
      model: env("GITHUB_MODEL") || "gpt-4o",
    },
    openrouter: {
      provider: "openrouter",
      key: env("OPENROUTER_API_KEY"),
      baseUrl: "https://openrouter.ai/api/v1",
      model: (env("OPENROUTER_MODEL_ORDER") || "moonshotai/kimi-k2,qwen/qwen-max,z-ai/glm-4.5,deepseek/deepseek-chat").split(",")[0].trim(),
      headers: {
        "HTTP-Referer": env("MALIK_SITE_URL") || "https://malikaiworld.world",
        "X-Title": "MALIK AI V6.5 TITAN",
      },
    },
    deepseek: {
      provider: "deepseek",
      key: env("DEEPSEEK_API_KEY"),
      baseUrl: env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
      model: env("DEEPSEEK_MODEL") || "deepseek-chat",
    },
  } satisfies Record<string, ProviderConfig>
}

async function callOpenRouterModels(prompt: string, usedWeb: boolean, sources: SourceItem[]) {
  const key = env("OPENROUTER_API_KEY")
  const models = (env("OPENROUTER_MODEL_ORDER") || "moonshotai/kimi-k2,qwen/qwen-max,z-ai/glm-4.5,deepseek/deepseek-chat")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

  const attempts: ProviderAttempt[] = []

  for (const model of models) {
    const result = await callOpenAICompatible(
      {
        provider: "openrouter",
        key,
        baseUrl: "https://openrouter.ai/api/v1",
        model,
        headers: {
          "HTTP-Referer": env("MALIK_SITE_URL") || "https://malikaiworld.world",
          "X-Title": "MALIK AI V6.5 TITAN",
        },
      },
      prompt,
      usedWeb,
      sources
    )

    attempts.push(result.attempt)
    if (result.content) return { content: result.content, provider: "openrouter", model, attempts }
  }

  return { content: "", provider: "openrouter", model: "none", attempts }
}

async function callProviderChain(prompt: string, usedWeb: boolean, sources: SourceItem[]) {
  const attempts: ProviderAttempt[] = []
  const configs = providerConfigs()

  const chain = (env("MALIK_GOD_PROVIDER_CHAIN") || env("MALIK_PROVIDER_ORDER") || "github,openrouter,deepseek")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  for (const name of chain) {
    if (name === "openrouter") {
      const result = await callOpenRouterModels(prompt, usedWeb, sources)
      attempts.push(...result.attempts)
      if (result.content) return { content: result.content, provider: result.provider, model: result.model, attempts }
      continue
    }

    const config = configs[name as keyof typeof configs]
    if (!config) continue

    const result = await callOpenAICompatible(config, prompt, usedWeb, sources)
    attempts.push(result.attempt)
    if (result.content) return { content: result.content, provider: config.provider, model: config.model, attempts }
  }

  return { content: "", provider: "none", model: "none", attempts }
}

function sourceFallback(sources: SourceItem[], attempts: ProviderAttempt[]) {
  if (sources.length) {
    const lines = sources
      .slice(0, 8)
      .map((s, i) => `${i + 1}. ${s.title}\n${s.url}\n${s.snippet || ""}`)
      .join("\n\n")

    return {
      content: [
        "Я нашёл свежие источники, но все LLM-провайдеры сейчас не вернули нормальный ответ. Даю быстрый fallback по источникам:",
        "",
        lines,
      ].join("\n"),
      provider: "source-fallback",
      model: "search-snippets",
      usedWeb: true,
      sources,
      attempts,
    }
  }

  return {
    content: "Сейчас ни один LLM/API не вернул нормальный ответ. Проверь Render env: GITHUB_TOKEN, GITHUB_MODEL, OPENROUTER_API_KEY, DEEPSEEK_API_KEY.",
    provider: "hard-fallback",
    model: "none",
    usedWeb: false,
    sources: [],
    attempts,
  }
}

export async function malikGodAnswer(
  body: any,
  selection?: { modelId: MalikModelId },
  emitResearch?: ResearchEmitter,
): Promise<GodAnswer> {
  const prompt = extractPrompt(body)

  if (selection) {
    const usedWeb = shouldUseWeb(prompt, body)
    const sources = usedWeb ? await gatherSources(prompt, emitResearch) : []
    const strictPrompt = usedWeb
      ? `Question:\n${prompt}\n\nWeb sources:\n${sourceContext(sources)}`
      : prompt
    const result = await runStrictMalikModel({
      modelId: selection.modelId,
      prompt: strictPrompt,
      systemPrompt: systemPrompt(usedWeb, prompt),
      history: Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : [],
      attachments: Array.isArray(body?.attachments) ? body.attachments : [],
      maxTokens: Number(body?.maxTokens) || undefined,
      temperature: typeof body?.temperature === "number" ? body.temperature : undefined,
    })
    return {
      content: cleanText(result.content),
      provider: result.provider,
      model: result.model,
      selectedModelId: result.selectedModelId,
      usedWeb,
      sources,
      attempts: [{
        provider: result.provider,
        model: result.model,
        ok: true,
        status: 200,
        latencyMs: result.latencyMs,
      }],
    }
  }

  const local = localSmart(prompt)

  if (local) {
    return { content: local, provider: "local-smart", model: "instant", usedWeb: false, sources: [], attempts: [] }
  }

  const usedWeb = shouldUseWeb(prompt, body)
  const cache = usedWeb ? getCache(prompt) : null
  if (cache) {
    cache.sources.forEach((source) => emitResearch?.({
      kind: "source",
      text: `Источник из проверенного кэша · ${source.domain}`,
      domain: source.domain,
      title: source.title,
      url: source.url,
      provider: source.provider,
      source,
    }))
    emitResearch?.({ kind: "done", text: `Источники восстановлены из кэша · ${cache.sources.length}` })
    return { ...cache, provider: `${cache.provider}-cache` }
  }

  const sources = usedWeb ? await gatherSources(prompt, emitResearch) : []
  const result = await callProviderChain(prompt, usedWeb, sources)

  let answer: GodAnswer
  if (result.content) {
    answer = { content: result.content, provider: result.provider, model: result.model, usedWeb, sources, attempts: result.attempts }
  } else {
    answer = sourceFallback(sources, result.attempts)
  }

  if (usedWeb) setCache(prompt, answer)
  return answer
}

export function asPlainText(answer: GodAnswer) {
  const debug = env("MALIK_GOD_SHOW_PROVIDER") === "true"
  if (!debug) return answer.content

  const sourceText = answer.sources.length ? `\n\nSources:\n${answer.sources.map((s, i) => `${i + 1}. ${s.url}`).join("\n")}` : ""
  return `${answer.content}\n\n[provider=${answer.provider}; model=${answer.model}; web=${answer.usedWeb}]${sourceText}`
}

export function asJson(answer: GodAnswer) {
  return {
    ok: true,
    content: asPlainText(answer),
    provider: answer.provider,
    model: answer.model,
    selectedModelId: answer.selectedModelId,
    usedWeb: answer.usedWeb,
    sources: answer.sources,
    attempts: answer.attempts,
  }
}
