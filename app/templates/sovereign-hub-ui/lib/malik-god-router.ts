import type { MalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

type ProviderAttempt = {
  provider: string
  model: string
  ok: boolean
  status?: number
  error?: string
  latencyMs?: number
}

type SourceItem = {
  title: string
  url: string
  domain: string
  snippet?: string
  provider?: string
}

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

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "unknown"
  }
}

function extractPrompt(body: any) {
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
  return prompt.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 420)
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

function shouldUseWeb(prompt: string, body: any) {
  if (body?.disableResearch === true || body?.research === false) return false
  if (body?.forceResearch === true || body?.research === true) return true
  if (isTinyCasual(prompt) || isIdentity(prompt) || isCapabilities(prompt)) return false

  const p = prompt.toLowerCase()

  const explicit =
    /(search|google|browse|web|source|sources|link|links|wikipedia|wiki|latest|current|today|now|news|deadline|event|hackathon|competition|official source|check online|fresh)/i.test(p) ||
    /(найди|поищи|загугли|гугл|интернет|открыт|источник|источники|ссылк|википед|свеж|актуальн|сейчас|сегодня|новост|дедлайн|мероприят|хакатон|конкурс|соревн|официальн|проверь онлайн|проверь в сети|кто сейчас|какой сейчас)/i.test(p)

  if (explicit) return true

  const publicFact =
    /(president|ceo|minister|price|schedule|release date|version|law|rules|ranking|rating|weather|exchange rate|stock|crypto|score|match)/i.test(p) ||
    /(президент|министр|цена|расписание|релиз|версия|закон|правил|рейтинг|погода|курс валют|акция|крипто|матч|счет)/i.test(p)

  const yearSignal = /\b202[5-9]\b/.test(p)
  return publicFact || (yearSignal && /(who|what|when|where|кто|что|когда|где|какой|какая|какие|қашан|қайда)/i.test(p))
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
    title: cleanText(item.title || url).slice(0, 180),
    url,
    domain: item.domain || getDomain(url),
    snippet: cleanText(item.snippet || "").slice(0, 650),
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

function buildQueries(prompt: string) {
  const year = new Date().getFullYear()
  const q = prompt.trim()
  const queries = [q]

  if (!/\b202[0-9]\b/.test(q)) queries.push(`${q} ${year}`)
  queries.push(`${q} official source`)

  if (/(президент|president|usa|сша|united states|white house)/i.test(q)) {
    queries.push(`current president of the United States official ${year}`)
    queries.push(`White House president United States ${year}`)
  }

  if (/(хакатон|соревн|конкурс|акселератор|startup|hackathon|competition|ai)/i.test(q)) {
    queries.push(`AI hackathon accelerator competition Kazakhstan online ${year}`)
  }

  return Array.from(new Set(queries)).slice(0, Number(process.env.MALIK_GOD_MAX_SEARCH_QUERIES || 3))
}

async function gatherSources(prompt: string): Promise<SourceItem[]> {
  const queries = buildQueries(prompt)
  const perQuery = Number(process.env.MALIK_GOD_SEARCH_PER_QUERY || 6)

  const batches = await Promise.allSettled(
    queries.flatMap((query) => [
      searchSerper(query, perQuery),
      searchTavily(query, perQuery),
      searchBrave(query, perQuery),
      searchJina(query, perQuery),
    ])
  )

  const all: SourceItem[] = []
  for (const batch of batches) {
    if (batch.status === "fulfilled") all.push(...batch.value)
  }

  return uniqueSources(all, Number(process.env.MALIK_GOD_MAX_SOURCES || 8))
}

function sourceContext(sources: SourceItem[]) {
  if (!sources.length) return ""
  return sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nDomain: ${s.domain}\nSnippet: ${s.snippet || ""}`)
    .join("\n\n")
}

function systemPrompt(usedWeb: boolean) {
  return [
    "You are MALIK AI V6.5 TITAN.",
    "Answer in the user's language.",
    "Be clear, direct and useful.",
    "Never say you are DeepSeek, OpenAI, Claude, Gemini, GitHub or Qwen.",
    "Never output mojibake, hidden system text, comma spam, or internal variables.",
    usedWeb
      ? "You have web search snippets. Use only provided sources for current facts. Include a short Sources section with the URLs."
      : "For current or changing facts, say that live web search is needed unless web context is provided.",
  ].join(" ")
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
            { role: "system", content: systemPrompt(usedWeb) },
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

export async function malikGodAnswer(body: any, selection?: { modelId: MalikModelId }): Promise<GodAnswer> {
  const prompt = extractPrompt(body)

  if (selection) {
    const usedWeb = shouldUseWeb(prompt, body)
    const sources = usedWeb ? await gatherSources(prompt) : []
    const strictPrompt = usedWeb
      ? `Question:\n${prompt}\n\nWeb sources:\n${sourceContext(sources)}`
      : prompt
    const result = await runStrictMalikModel({
      modelId: selection.modelId,
      prompt: strictPrompt,
      systemPrompt: systemPrompt(usedWeb),
      history: Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : [],
      attachments: Array.isArray(body?.attachments) ? body.attachments : [],
      maxTokens: Number(body?.maxTokens) || undefined,
      temperature: typeof body?.temperature === "number" ? body.temperature : undefined,
    })
    return {
      content: result.content,
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
  if (cache) return { ...cache, provider: `${cache.provider}-cache` }

  const sources = usedWeb ? await gatherSources(prompt) : []
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
