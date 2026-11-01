import test from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader()
const { classifyFreshness } = load("lib/ai/freshness-intent.ts")
const { shouldUseWeb } = load("lib/ai/web-search-policy.ts")
const evidence = load("lib/live-intelligence/evidence.ts")
const { runLiveSearch, EvidenceSearchCache, ProviderCircuits } = load("lib/live-intelligence/search-engine.ts")
const filters = existsSync("lib/live-intelligence/search-time-filters.ts") ? load("lib/live-intelligence/search-time-filters.ts") : {}
const NOW = new Date("2026-11-01T06:00:00.000Z"), day = 86400000
const source = (age, extra = {}) => ({ title: "Latest developments", url: "https://reuters.com/fixture/latest", domain: "reuters.com", snippet: "Public news fixture only; no model answer.", provider: "fixture", publishedAt: new Date(NOW.getTime() - age).toISOString(), ...extra })
const assessed = (prompt, sources) => evidence.assessSources(prompt, sources, classifyFreshness(prompt, NOW))
for (const prompt of ["Последние новости NVIDIA", "Какие новости Казахстана?", "Свежие новости медицины", "Расскажи новости бизнеса", "Что нового у OpenAI?", "Что новенького в науке?", "Latest news about energy", "What's new at Google?", "Recent sports news", "Соңғы жаңалықтар қандай?", "Қазақстан жаңалықтары", "Жаңа технология жаңалықтары"]) {
  test(`automatic recent-news evidence window: ${prompt}`, () => {
    const intent = classifyFreshness(prompt, NOW)
    assert.equal(intent.needsSearch, true)
    assert.equal(shouldUseWeb(prompt, { research: false }), true, "the optional Web button must not suppress current evidence")
    assert.equal(intent.window?.label, "last-seven-days")
    assert.ok(intent.ttlMs <= 60000)
    const old = assessed(prompt, [source(9 * day)]), undated = assessed(prompt, [source(0, { publishedAt: undefined, checkedAt: NOW.toISOString() })])
    assert.equal(evidence.currentEvidenceAvailable(old, intent), false)
    assert.equal(evidence.currentEvidenceAvailable(undated, intent), false)
  })
}
for (const [prompt, label] of [["Новости сегодня", "today"], ["News yesterday", "yesterday"], ["Жаңалықтар соңғы 24 сағат", "last-24-hours"]]) {
  test(`explicit news period is preserved: ${prompt}`, () => assert.equal(classifyFreshness(prompt, NOW).window?.label, label))
}
for (const prompt of ["Реши 17 * 23", "Напиши стих", "Объясни теорему Пифагора", "Напиши React компонент кнопки", "Explain CUDA", "Өлең жаз", "Переведи: latest news", "Без интернета: последние новости"]) {
  test(`ordinary task/opt-out preserved: ${prompt}`, () => assert.equal(classifyFreshness(prompt, NOW).needsSearch, false))
}
test("news are ordered by event/publication date ahead of source authority", () => {
  const items = assessed("Последние новости AI", [source(5 * day, { url: "https://openai.com/fixture/older" }), source(3600000)])
  assert.equal(items[0].url, "https://reuters.com/fixture/latest")
})
test("a new check/update/crawl timestamp cannot refresh an old news event", () => {
  const intent = classifyFreshness("Последние новости", NOW)
  const items = assessed("Последние новости", [source(180 * day, { checkedAt: NOW.toISOString(), readAt: NOW.toISOString(), updatedAt: NOW.toISOString(), indexedAt: NOW.toISOString() })])
  assert.equal(evidence.currentEvidenceAvailable(items, intent), false)
})
test("fresh unrelated evidence cannot validate a cited old news item", () => {
  const prompt = "Последние новости AI", intent = classifyFreshness(prompt, NOW)
  const items = assessed(prompt, [source(0), source(90 * day, { url: "https://openai.com/fixture/old" })])
  const index = items.findIndex(item => item.url.endsWith("/old")) + 1
  const answer = evidence.finalizeFreshAnswer(`Old unsupported announcement [${index}].`, intent, items)
  assert.equal(answer, evidence.unavailableFreshAnswer(intent))
})
test("fallback continues past stale/undated primary results", async () => {
  for (const publishedAt of [source(9 * day).publishedAt, undefined]) {
    const called = []
    const result = await runLiveSearch({ prompt: "Последние новости бизнеса", queries: ["business news"], now: () => NOW.getTime(), cache: new EvidenceSearchCache(), circuits: new ProviderCircuits(), providers: [
      { name: "primary", run: async () => { called.push("primary"); return [source(0, { publishedAt, url: "https://company.example/fixture/old" })] } },
      { name: "fallback", run: async () => { called.push("fallback"); return [source(3600000)] } },
    ] })
    assert.deepEqual(called, ["primary", "fallback"])
    assert.ok(result.sources.every(item => item.freshness === "recent"))
  }
})
test("news cache expires within one minute and revalidates the rolling window", async () => {
  let time = NOW.getTime(), calls = 0
  const options = { prompt: "Последние новости технологий", queries: ["technology news"], now: () => time, cache: new EvidenceSearchCache(), circuits: new ProviderCircuits(), providers: [{ name: "primary", run: async () => { calls++; return [source(3600000)] } }] }
  await runLiveSearch(options); time += 61000; await runLiveSearch(options)
  assert.equal(calls, 2)
})
test("no fresh result returns no stale news as current evidence", async () => {
  const result = await runLiveSearch({ prompt: "Последние новости", queries: ["news"], now: () => NOW.getTime(), cache: new EvidenceSearchCache(), circuits: new ProviderCircuits(), providers: [{ name: "old-only", run: async () => [source(40 * day)] }] })
  assert.deepEqual(result.sources, [])
})
test("provider time filters share the actual user's period", () => {
  assert.equal(typeof filters.searchTimeFilters, "function")
  const value = filters.searchTimeFilters(classifyFreshness("Последние новости", NOW))
  assert.equal(value.serper.tbs, "qdr:w")
  assert.equal(value.tavily.time_range, "week")
  assert.match(value.brave, /^2026-10-25to2026-11-01$/)
  const today = filters.searchTimeFilters(classifyFreshness("Новости сегодня", NOW))
  assert.equal(today.serper.tbs, "qdr:d")
  assert.equal(today.tavily.time_range, "day")
  assert.deepEqual(filters.searchTimeFilters(classifyFreshness("Напиши стих", NOW)), { serper: {}, tavily: {} })
})
test("an explicit year window includes valid earlier events in that year", () => {
  const prompt = "Новости AI this year", intent = classifyFreshness(prompt, NOW)
  assert.equal(intent.window.label, "this-year")
  assert.equal(evidence.currentEvidenceAvailable(assessed(prompt, [source(180 * day)]), intent), true)
})
test("as-of stable release is distinct from a release announced today", () => {
  assert.equal(classifyFreshness("Какая последняя стабильная версия Next.js сегодня?", NOW).window, undefined)
  assert.equal(classifyFreshness("Which AI models were released today?", NOW).window.label, "today")
})
test("historical news does not receive a current seven-day window", () => {
  assert.equal(classifyFreshness("Новости в 2020 году", NOW).window, undefined)
})
test("explicit no-web and server disable still win over automatic news search", () => {
  assert.equal(shouldUseWeb("Последние новости", { disableResearch: true }), false)
  assert.equal(shouldUseWeb("Без интернета: последние новости", { forceResearch: true }), false)
})
for (const prompt of ["Кто сейчас CEO NVIDIA?", "Какие ограничения Gemini API действуют сейчас?", "What Gemini API limits apply now?", "Қазір Gemini API қандай шектеулері бар?", "Проверь текущую версию Next.js", "Сколько сейчас стоит iPhone?"]) {
  test(`changing facts require evidence with Web unchecked: ${prompt}`, () => assert.equal(shouldUseWeb(prompt, { research: false }), true))
}

// Execute the real shared search adapters. Only their HTTP transport is a
// fixture; no fabricated model output is returned or scored.
for (const provider of ["serper", "brave", "tavily", "all-fail"]) {
  test(`actual adapter request filters and sequential fallback: ${provider}`, async () => {
    const keys = ["SERPER_API_KEY", "BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY", "JINA_SEARCH_DISABLED", "SEARXNG_URL"]
    const saved = Object.fromEntries(keys.map(key => [key, process.env[key]])), calls = []
    let active = 0, maximum = 0
    try {
      for (const key of keys) delete process.env[key]
      const keyNames = { serper: "SERPER_API_KEY", brave: "BRAVE_SEARCH_API_KEY", tavily: "TAVILY_API_KEY" }
      for (const [name, key] of Object.entries(keyNames)) if (provider === name || provider === "all-fail") process.env[key] = "fixture-only-not-a-real-key"
      process.env.JINA_SEARCH_DISABLED = "true"
      const utils = load("lib/malik-research/utils.ts")
      const transport = async (url, init) => {
        calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
        active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--
        const published = new Date(Date.now() - 3600000)
        if (String(url).includes("news.google.com")) return new Response(`<rss><channel><item><title>Fixture technology news</title><link>https://reuters.com/fixture/rss</link><pubDate>${published.toUTCString()}</pubDate><description>Fixture only, no live claim.</description></item></channel></rss>`)
        if (provider === "all-fail") return new Response("", { status: 503 })
        const item = { title: "Fixture technology news", url: "https://reuters.com/fixture/latest", link: "https://reuters.com/fixture/latest", snippet: "Fixture news", content: "Fixture news", description: "Fixture news", date: published.toISOString(), published_date: published.toISOString(), page_age: published.toISOString() }
        return Response.json({ organic: [item], results: [item], web: { results: [item] } })
      }
      const io = { ...utils, fetchWithTimeout: transport }
      const adapters = workTestLoader({ "./utils": io, "../malik-research/utils": io })("lib/malik-research/search.ts")
      const results = await adapters.searchWeb("latest technology news")
      assert.ok(results.length > 0); assert.equal(maximum, 1)
      if (provider === "serper") assert.equal(calls[0].body.tbs, "qdr:w")
      if (provider === "tavily") { assert.equal(calls[0].body.time_range, "week"); assert.equal(calls[0].body.topic, "news") }
      if (provider === "brave") {
        assert.match(new URL(calls[0].url).searchParams.get("freshness"), /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/)
        assert.equal(results[0].provider, "google-news", "web crawl age is not a news publication date")
      }
      if (provider === "all-fail") {
        assert.deepEqual(calls.slice(0, 3).map(call => new URL(call.url).hostname), ["google.serper.dev", "api.search.brave.com", "api.tavily.com"])
        assert.equal(calls.length, 4); assert.equal(results[0].provider, "google-news")
      }
    } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
  })
}
test("RSS preserves long article URLs instead of applying title truncation", async () => {
  assert.equal(existsSync("lib/live-intelligence/news-search.ts"), true)
  const utils = load("lib/malik-research/utils.ts"), link = `https://news.google.com/rss/articles/${"A".repeat(650)}?oc=5`
  const io = { ...utils, fetchWithTimeout: async () => new Response(`<rss><channel><item><title>Long-link fixture</title><link>${link}</link><pubDate>${NOW.toUTCString()}</pubDate></item></channel></rss>`) }
  const feeds = workTestLoader({ "../malik-research/utils": io })("lib/live-intelligence/news-search.ts")
  const result = await feeds.searchNewsFeed("latest news", 1, undefined, classifyFreshness("latest news", NOW))
  assert.equal(result[0].url, link)
})
test("RSS sorts the complete candidate pool before applying the result limit", async () => {
  assert.equal(existsSync("lib/live-intelligence/news-search.ts"), true)
  const utils = load("lib/malik-research/utils.ts")
  const item = (id, age) => `<item><title>News ${id}</title><link>https://reuters.com/fixture/${id}</link><pubDate>${new Date(NOW.getTime() - age).toUTCString()}</pubDate></item>`
  const io = { ...utils, fetchWithTimeout: async () => new Response(`<rss><channel>${item("older-first", 3 * day)}${item("newest-later", 3600000)}</channel></rss>`) }
  const feeds = workTestLoader({ "../malik-research/utils": io })("lib/live-intelligence/news-search.ts")
  const result = await feeds.searchNewsFeed("latest news", 1, undefined, classifyFreshness("latest news", NOW))
  assert.equal(result.length, 1); assert.equal(result[0].url, "https://reuters.com/fixture/newest-later")
})
