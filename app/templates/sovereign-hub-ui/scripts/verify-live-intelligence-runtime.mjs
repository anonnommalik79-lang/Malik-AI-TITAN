// Real router orchestration with fixture HTTP and model transports; no production credentials.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url), root = process.cwd()
const savedFetch = globalThis.fetch, savedEnv = { ...process.env }, savedInfo = console.info
const cache = new Map(), inferences = [], calls = [], tokens = []
let scenario = "success", checks = 0, modelDraft
const sources = [
  { title: "Introducing GPT-99 TEST FIXTURE model", link: "https://openai.com/fixture/gpt-99", snippet: "Fixture only: official AI model announcement", date: new Date(Date.now() - 3600_000).toISOString() },
  { title: "Google DeepMind Gemini 99 TEST FIXTURE model", link: "https://deepmind.google/fixture/gemini-99", snippet: "Fixture only: official AI model announcement", date: new Date(Date.now() - 3600_000).toISOString() },
  { title: "Казахстан: технологические новости TEST FIXTURE", link: "https://inform.kz/fixture/news", snippet: "Fixture only: новости Казахстана за последние 24 часа", date: new Date(Date.now() - 3600_000).toISOString() },
]
const bridgeUrl = "https://www.gov.kz/org/maidd/press/news/details/1305413?lang=ru"
const bridgeYear = new Date(Date.now() - 400 * 86400_000).getUTCFullYear()
const bridgeLead = { title: `Итоги AI & Digital Bridge ${bridgeYear}`, url: bridgeUrl, content: `AI & Digital Bridge ${bridgeYear} прошёл 1–3 октября.` }
const blockedEventPage = "https://example.com/blocked-nexus-recap"
const readableEventPage = "https://example.org/nexus-recap"
const currentEventYear = new Date().getUTCFullYear()
const nexusSummary = `Nexus Film Festival took place on January 1, ${currentEventYear}.`
const auroraArchiveUrl = "https://example.com/aurora-archive"
const auroraCurrentUrl = "https://example.org/aurora-latest"
const readUrls = [], queries = []
const stubs = {
  "@/lib/server/malik-model-router": { runStrictMalikModel: async (input) => {
    inferences.push(input)
    if (!/1547|17,5%|2020 году|без интернета/.test(input.taskPrompt)) assert.equal(input.onToken, undefined, "current answers must not expose unchecked drafts")
    const quote = scenario === "quote-repair" ? input.systemPrompt.includes("verification gate rejected") ? "Цена Atlas — 319 990 ₸ [1]." : "Цена Atlas — 449 990 ₸ [1]." : ""
    return { content: quote || modelDraft || (/1547/.test(input.taskPrompt) ? "1547 × 829 = 1 282 463" : "Подтверждённый ответ по тестовым данным [1]."), provider: "fixture", model: "fixture", selectedModelId: input.modelId, latencyMs: 0 }
  } },
  "@/lib/server/context-fusion": { requestedFusionConnectors: () => [], collectMalikConnectedContext: async () => ({ requested: false, sources: [], context: "" }) },
  "@/lib/server/science-context": { collectMalikScienceContext: async () => ({ sources: [], context: "", providers: [] }) },
  "@/lib/live-intelligence/index-reader": { indexedSources: async () => ({ sources: [], health: { status: "unavailable" } }) },
  "@/lib/malik-research/fetch-page": { fetchPageText: async (source) => {
    readUrls.push(source.url)
    if (scenario === "unread-event" || source.url === blockedEventPage || source.url.includes("/archived-metro-open") || source.url.includes("unread-retail.example")) return null
    if (scenario === "retail-recovery" && source.domain.startsWith("shop-")) {
      const price = source.domain.includes("shop-a") ? 599990 : 688900
      return { ...source, text: "Product details", readAt: new Date().toISOString(),
        retailOffer: { name: "iPhone 16 Pro Max 256GB White", price, currency: "KZT", availability: "in-stock" } }
    }
    const text = source.url === bridgeUrl ? "Обзор программы. ".repeat(240) + `AI & Digital Bridge ${bridgeYear} прошёл 1–3 октября в Астане.` : source.snippet
    return { ...source, text, readAt: new Date().toISOString() }
  } },
  "@/lib/work/math/model-plan": { planWorkMath: async () => null, mathPlanningInstruction: "", plannedMathInstruction: () => "", plannedMathReceiptText: () => "" },
}
function load(file) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }; cache.set(absolute, module)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (stubs[name]) return stubs[name]
    if (name === "server-only") return {}
    if (name.startsWith("@/") || name.startsWith(".")) { const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name); return load(target.endsWith(".ts") ? target : target + ".ts") }
    return require(name)
  }, module, module.exports)
  return module.exports
}
async function check(name, fn) { await fn(); checks++; console.log("PASS " + name) }
try {
  for (const key of ["SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_SEARCH_API_KEY"]) process.env[key] = "fixture-only"
  console.info = () => {}
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (scenario === "official-rate" && String(url).includes("nationalbank.kz")) {
      const date = new URL(String(url)).searchParams.get("fdate")
      return date ? new Response(`<rates><date>${date}</date><item><title>USD</title><description>512.34</description><quant>1</quant></item></rates>`) : new Response("", { status: 503 })
    }
    if (scenario === "opening" && String(url).includes("serper.dev")) {
      return Response.json({ organic: [
        ...(JSON.parse(init.body).q.includes('"В Алматы открылись станции метро"')
          ? [{ title: "В Алматы открылись станции метро — городской пресс-центр", link: "https://city.example.kz/metro-open", snippet: "В Алматы открылись станции метро 30.05.2022 Транспорт. Сегодня торжественно открылись две станции метро «Сарыарка» и «Бауыржан Момышулы»." }]
          : [{ title: "В Алматы открылись станции метро", link: "https://example.kz/archived-metro-open", snippet: "В Алматы сегодня открылись две станции метро «Сарыарка» и «Бауыржан Момышулы»." }]),
        { title: "Когда откроются станции метро в Алматы", link: "https://example.kz/metro-planned", snippet: "31 декабря 2026 года планируется открыть станции метро." },
      ] })
    }
    if (scenario === "football" && String(url).includes("serper.dev")) {
      const query = JSON.parse(init.body).q
      assert.ok(query.includes("КПЛ"))
      const year = new Date().getUTCFullYear()
      return Response.json({ organic: [
        { title: `Кайрат 1:4 Тобыл — КПЛ, 1 января ${year} г.`, link: "https://kffleague.kz/ru/matches/1088" },
        { title: `Кайрат 1:1 Алтай — КПЛ, 2 января ${year} г.`, link: "https://kffleague.kz/ru/matches/1120" },
        { title: `Кайрат 2:1 Алтай — КПЛ, 3 января ${year} г.`, link: "https://kffleague.kz/ru/matches/1109?tournament=cup" },
        { title: `Кайрат 2:0 Алтай — КПЛ, 1 января ${year+1} г.`, link: "https://kffleague.kz/ru/matches/3240" },
      ] })
    }
    if (scenario === "retail-recovery" && String(url).includes("serper.dev")) {
      const query = JSON.parse(init.body).q
      const rows = query.includes("-site:unread-retail.example") ? ["shop-a.example.kz", "shop-b.example.kz"] : ["unread-retail.example", "second.unread-retail.example"]
      return Response.json({ organic: rows.map(domain => ({ title: "iPhone 16 Pro Max 256GB в Алматы", link: "https://"+domain+"/16-max", snippet: "iPhone 16 Pro Max 256GB." })) })
    }
    if (scenario === "retail" && String(url).includes("serper.dev")) {
      return Response.json({ organic: [
        { title: "iPhone 16 Pro Max 256GB в Алматы — Store A", link: "https://shop-a.example.kz/16-pro-max", snippet: "iPhone 16 Pro Max 256GB, Алматы, 520 000 ₸. В наличии." },
        { title: "iPhone 16 Pro Max 256 GB в Алматы — Store B", link: "https://shop-b.example.kz/16-pro-max", snippet: "iPhone 16 Pro Max 256 GB, Алматы, 540 000 ₸. Нет в наличии." },
        { title: "Новости OpenAI", link: "https://openai.com/fixture/other", snippet: "Актуальные цены. Сравни модели." },
      ] })
    }
    if (scenario === "news-digest" && String(url).includes("news.google.com")) {
      const date = new Date(Date.now() - 15 * 60_000).toUTCString()
      return new Response(`<rss><channel>${["Спортсмены Казахстана получили награды", "В Казахстане открылась выставка", "В Казахстане объявили об итогах фестиваля"].map((title, index) =>
        `<item><title>${title}</title><link>https://news.google.com/rss/articles/fixture-${index}</link><pubDate>${date}</pubDate><description>${title}</description></item>`).join("")}</channel></rss>`)
    }
    if (scenario === "quote-repair" && String(url).includes("serper.dev")) {
      return Response.json({ organic: [{ title: "Телефон Atlas — цена в магазине", link: "https://shop.example.org/atlas", snippet: "Телефон Atlas продаётся по цене 319 990 ₸." }] })
    }
    if (scenario === "reposted-local-event") {
      if (String(url).includes("serper.dev")) {
        const query = JSON.parse(init.body).q
        queries.push(query)
        const official = query.includes("site:gov.kz")
        return Response.json({ organic: [{ title: `Open Data Forum ${currentEventYear}`,
          link: official ? "https://www.gov.kz/example/open-data-forum" : "https://www.facebook.com/example/post",
          snippet: `Open Data Forum took place on January 1, ${currentEventYear}, in Astana.`,
        }] })
      }
      return new Response("", { status: 503 })
    }
    if (scenario === "publisher-catalog") {
      if (String(url).endsWith("openai.com/news/rss.xml")) {
        const recent = new Date(Date.now() - 4 * 86_400_000).toUTCString()
        const old = new Date(Date.now() - 160 * 86_400_000).toUTCString()
        const item = (title, slug, date) => `<item><title>${title}</title><link>https://openai.com/index/${slug}</link><pubDate>${date}</pubDate></item>`
        const noise = Array.from({ length: 27 }, (_, index) => item("Study mentioning GPT-99", "study-" + index, recent)).join("")
        return new Response(`<rss><channel>${noise}${item("Introducing GPT-99.2 Astra and Sol", "introducing-gpt-99-2", recent)}${item("Introducing GPT-98", "introducing-gpt-98", old)}</channel></rss>`)
      }
      return Response.json({ organic: [{ title: "GPT 98", link: "https://en.wikipedia.org/wiki/GPT", snippet: "GPT-98 was the latest version." }] })
    }
    if (scenario === "all-fail") return new Response("", { status: 503 })
    if (scenario === "retry-event") {
      if (String(url).includes("serper.dev")) return Response.json({ organic: [{ title: "Nexus Film Festival recap", link: blockedEventPage, snippet: nexusSummary }] })
      if (String(url).includes("tavily.com")) return Response.json({ results: [{ title: "Nexus Film Festival recap", url: readableEventPage, content: nexusSummary }] })
      return new Response("", { status: 503 })
    }
    if (scenario === "prefer-current-event") {
      if (String(url).includes("serper.dev")) return Response.json({ organic: [{ title: `Aurora Robotics Expo ${currentEventYear - 1}`, link: auroraArchiveUrl, snippet: `Aurora Robotics Expo was held on October 3, ${currentEventYear - 1}.` }] })
      if (String(url).includes("tavily.com")) return Response.json({ results: [{ title: `Aurora Robotics Expo ${currentEventYear}`, url: auroraCurrentUrl, content: `Aurora Robotics Expo was held on January 1, ${currentEventYear}.` }] })
      return new Response("", { status: 503 })
    }
    if (scenario === "last-event" || scenario === "unread-event") {
      if (String(url).includes("serper.dev")) {
        queries.push(JSON.parse(init.body))
        return Response.json({ organic: scenario === "last-event"
          ? [{ title: "Digital Bridge 2099 — Programme", link: "https://digitalbridge.kz/programme", snippet: "Digital Bridge состоится в октябре 2099 года." }, ...sources]
          : [{ title: "Metro Design Week recap", link: "https://example.com/metro-recap", snippet: "Metro Design Week was held on October 3, 2024." }] })
      }
      if (String(url).includes("tavily.com")) return Response.json({ results: [bridgeLead] })
      return new Response("", { status: 503 })
    }
    if (String(url).includes("serper.dev")) return scenario === "fallback" ? new Response("", { status: 503 }) : Response.json({ organic: scenario === "old-and-fresh" ? [{ ...sources[0], title: "GPT-99 OLD FIXTURE model", link: "https://untrusted.example/old-gpt-99", date: "2023-01-01T00:00:00Z" }, sources[0]] : sources })
    if (String(url).includes("tavily.com")) return Response.json({ results: sources.map((source) => ({ title: source.title, url: source.link, content: source.snippet, published_date: source.date })) })
    if (String(url).includes("api.github.com")) return Response.json({ tag_name: "v99.0.0", name: "Next.js v99 TEST FIXTURE", html_url: "https://github.com/vercel/next.js/releases/tag/fixture-v99", published_at: new Date(Date.now() - 45 * 86400_000).toISOString(), body: "TEST FIXTURE stable release", draft: false, prerelease: false })
    return new Response("", { status: 503 })
  }
  const god = load("lib/malik-god-router.ts")
  const run = (prompt, depth = "balanced", modelId = "malik-fast-120b") => god.malikGodAnswer({ originalQuestion: prompt, responseDepth: depth }, { modelId }, undefined, (token) => tokens.push(token))
  await check("the production router checks an official release catalog first and skips its unrelated headlines", async () => {
    scenario = "publisher-catalog"
    try {
      const before = inferences.length, start = calls.length
      const answer = await run("Когда вышел последняя модель Gpt", "balanced", "malik-max")
      assert.equal(answer.model, "verified-publisher-release")
      assert.match(answer.content, /GPT-99\.2 Astra и Sol.*\[1\]/u)
      assert.equal(answer.sources[0].url, "https://openai.com/index/introducing-gpt-99-2")
      assert.equal(inferences.length, before)
      assert.equal(calls[start], "https://openai.com/news/rss.xml")
    } finally { scenario = "success" }
  })
  await check("a simple factual draft with an invented price is repaired once before streaming", async () => {
    scenario = "quote-repair"
    try {
      const before = inferences.length
      const answer = await run("Сколько стоит телефон Atlas?")
      assert.match(answer.content, /319 990/u)
      assert.doesNotMatch(answer.content, /449 990/u)
      assert.equal(inferences.length - before, 2)
    } finally { scenario = "success" }
  })
  await check("a social repost leads discovery to the local official event report", async () => {
    scenario = "reposted-local-event"
    try {
      const before = queries.length
      const answer = await run("Когда последний раз проходил Open Data Forum?")
      assert.ok(queries.slice(before).some(query => query.includes('site:gov.kz')))
      assert.equal(answer.model, "verified-occurrence")
      assert.match(answer.content, /1 января/u)
      assert.match(answer.sources[0].url, /gov\.kz/u)
    } finally { scenario = "success" }
  })
  for (const [name, prompt] of [
    ["A", "Какие новые ИИ-модели официально вышли за последние семь дней? Укажи даты и первоисточники"],
    ["B", "Какая самая новая официально представленная модель Google DeepMind на сегодняшний день?"],
    ["C", "Какие последние технологические новости Казахстана за 24 часа?"],
    ["D", "Какая актуальная стабильная версия Next.js?"],
  ]) await check("acceptance " + name + ": current evidence reaches actual router", async () => { const answer = await run(prompt); assert.equal(answer.provider, "fixture"); assert.ok(answer.sources.length); assert.match(answer.content, /Источники проверены/); assert.match(inferences.at(-1).systemPrompt, /LIVE INTELLIGENCE/); assert.ok(answer.content.includes("[1]")); assert.equal(answer.factAudit, null, "the server check date is operational metadata, not an unsupported external claim") })
  await check("E: historical query avoids freshness-year injection", async () => { const before = calls.length; const answer = await run("Какая ИИ-модель была представлена в 2020 году?"); assert.equal(calls.length, before); assert.equal(answer.usedWeb, false) })
  await check("F: real arithmetic engine computes without web", async () => { const before = calls.length; await run("Реши 1547 × 829 без интернет-поиска"); assert.equal(calls.length, before); assert.match(inferences.at(-1).systemPrompt, /1282463|1[ ,]282[ ,]463/) })
  scenario = "fallback"
  await check("G: provider fallback through real adapters", async () => { const answer = await run("Какие последние ИИ-модели выпустила Google за последние семь дней?", "deep"); assert.ok(calls.some((url) => url.includes("tavily"))); assert.ok(answer.sources.length) })
  scenario = "old-and-fresh"
  await check("H: current official release reaches the answer before old SEO article", async () => {
    const answer = await run("Какая актуальная модель GPT 99?", "deep")
    assert.equal(answer.sources[0].domain, "openai.com")
    assert.equal(answer.sources[0].freshness, "recent")
    assert.equal(answer.sources.find(source => source.domain === "untrusted.example")?.freshness, "old")
    assert.match(inferences.at(-1).prompt, /Freshness: old/)
  })
  await check("MAX verifies the exact date and official USD/KZT quote directly", async () => {
    scenario = "official-rate"
    const before = inferences.length
    const answer = await run("Какой официальный курс доллара к тенге действует сегодня? Дай ссылку на Нацбанк и укажи дату действия курса.", "balanced", "malik-max")
    assert.equal(answer.model, "verified-official-rate")
    assert.match(answer.content, /512,34 ₸/)
    assert.match(answer.sources[0].url, /nationalbank\.kz/u)
    assert.ok(inferences.length - before <= 1, "only the optional domain planner may run")
  })
  await check("MAX recovers the completed opening and names from the read article", async () => {
    scenario = "opening"
    modelDraft = "Две станции открылись 28 мая 2022 года [1]."
    try {
      const answer = await run("Когда в Алматы последний раз открыли новые станции метро? Какие станции открылись в тот день?", "balanced", "malik-max")
      assert.match(answer.content, /30 мая 2022/u)
      assert.match(answer.content, /Сарыарка.*Момышулы/u)
      assert.ok(readUrls.includes("https://city.example.kz/metro-open"))
      assert.doesNotMatch(answer.content, /28 мая 2022|31 декабря 2026/u)
    } finally { modelDraft = undefined }
  })
  await check("retail stays on the exact model even after a model-release conversation", async () => {
    scenario = "retail"
    modelDraft = "Store A — 520 000 ₸, в наличии [1]. Store B — 540 000 ₸, нет в наличии [2]."
    try {
      const question = "Сколько сейчас стоит iPhone 16 Pro Max 256 ГБ в Алматы? Сравни два магазина по цене и наличию."
      const messages = [{ role: "user", content: "Какая последняя модель GPT?" }, { role: "assistant", content: "Последняя модель GPT [1]." }, { role: "user", content: question }]
      const answer = await god.malikGodAnswer({ originalQuestion: question, messages }, { modelId: "malik-max" })
      assert.deepEqual(answer.sources.map(source => source.domain).sort(), ["shop-a.example.kz", "shop-b.example.kz"])
      assert.match(answer.content, /520 000.*540 000/u)
    } finally { modelDraft = undefined }
  })
  await check("blocked merchant pages trigger a different search and verified seller offers reach chat without a model draft", async () => {
    scenario = "retail-recovery"
    const answer = await run("Сколько стоит iPhone 16 Pro Max 256 ГБ в Алматы? Сравни два магазина по цене и наличию.", "balanced", "malik-max")
    assert.equal(answer.model, "structured-retail")
    assert.match(answer.content, /599[\s\u00a0]990/u)
    assert.match(answer.content, /688[\s\u00a0]900/u)
    assert.match(answer.content, /Остаток в конкретной точке не проверен/u)
  })
  await check("MAX finds the latest completed league match on the official domain without copying a cup or future score", async () => {
    scenario = "football"
    const before = inferences.length
    const answer = await run("Как закончился последний матч “Кайрата” в чемпионате Казахстана? Дай дату, соперника, счёт и ссылку на протокол", "balanced", "malik-max")
    assert.equal(answer.model, "official-match-card")
    assert.match(answer.content, /Кайрат 1:1 Алтай/u)
    assert.match(answer.content, /kffleague\.kz\/ru\/matches\/1120/u)
    assert.equal(inferences.length, before)
  })
  await check("news digest retains several recent reports from one feed, even when synthesis fails", async () => {
    scenario = "news-digest"
    modelDraft = "Неподтверждённый ответ без ссылок."
    try {
      const answer = await run("Назови три события в Казахстане за последние 24 часа. Для каждого укажи, когда оно произошло, и дай ссылку.", "balanced", "malik-max")
      assert.equal(answer.sources.length, 3)
      assert.match(answer.content, /время публикации/u)
      assert.equal(answer.content.match(/^-/gm)?.length, 3)
    } finally { modelDraft = undefined }
  })
  await check("a rounded-looking result with a currency is independently verified without a fact panel", async () => {
    scenario = "success"
    modelDraft = "43 000 ₸"
    try {
      const answer = await run("Посчитай 17,5% от 248 000 ₸. Дай только итог.h", "balanced", "malik-max")
      assert.match(answer.content, /43 ?400 ₸/u)
      assert.equal(answer.factAudit, null)
    } finally { modelDraft = undefined }
  })
  scenario = "all-fail"
  await check("I: total failure produces one honest answer before inference", async () => { const before = inferences.length; const answer = await run("Какие новые ИИ-модели официально вышли сегодня в Казахстане?", "ultra"); assert.equal(inferences.length, before); assert.equal(answer.provider, "live-evidence-gate"); assert.match(answer.content, /Не удалось подтвердить/); assert.equal(answer.usedWeb, false); assert.equal(answer.sources.length, 0) })
  scenario = "success"
  for (const depth of ["balanced", "deep", "ultra"]) await check("J: actual router freshness in " + depth, async () => { const answer = await run("Какие ИИ-модели вышли за последние семь дней " + depth, depth); assert.equal(answer.provider, "fixture"); assert.match(answer.content, /Источники проверены/) })
  await check("explicit opt-out wins over research superpowers", async () => {
    const before = calls.length
    await run("Проведи глубокое исследование ИИ-моделей без интернета", "ultra")
    assert.equal(calls.length, before)
  })
  await check("one final answer, no unchecked token stream", () => assert.equal(tokens.length, 0))
  await check("server-prepared evidence avoids a second search of private attachment text", async () => {
    const before = calls.length, prompt = "Какие новые ИИ-модели вышли за последние семь дней?"
    const { assessSources } = load("lib/live-intelligence/evidence.ts")
    const prepared = assessSources(prompt, [{ title: sources[0].title, url: sources[0].link, domain: "openai.com", snippet: sources[0].snippet, publishedAt: sources[0].date }])
    const answer = await god.malikGodAnswer({ originalQuestion: "PRIVATE FILE CONTENT: secret-project", responseDepth: "balanced" }, { modelId: "malik-fast-120b" }, undefined, undefined, undefined, undefined, undefined, { prompt, sources: prepared })
    assert.equal(calls.length, before); assert.equal(answer.provider, "fixture"); assert.match(answer.content, /Источники проверены/)
  })
  await check("the strict router replaces an unsupported version with the actual latest catalog tag", async () => {
    modelDraft = "Текущая стабильная версия Next.js — 42.0.0 [1]."
    try {
      const answer = await run("Какая актуальная стабильная версия Next.js?")
      assert.match(answer.content, /99\.0\.0/u)
      assert.doesNotMatch(answer.content, /42\.0\.0/u)
      assert.ok(answer.sources.some(source => source.releaseVersion === "99.0.0"))
    } finally { modelDraft = undefined }
  })
  await check("a legal question with no current evidence stops before model inference", async () => {
    scenario = "all-fail"
    try {
      const before = inferences.length
      const answer = await run("Какие требования закона к трудовому договору в Казахстане?")
      assert.equal(inferences.length, before)
      assert.equal(answer.provider, "live-evidence-gate")
      assert.match(answer.content, /Не удалось подтвердить/u)
    } finally { scenario = "success" }
  })
  scenario = "last-event"
  await check("the exact typo from chat retrieves a past edition through fallback and reads the official report before answering", async () => {
    const before = inferences.length, searchStart = calls.length, queryStart = queries.length
    const answer = await run("когда было последни раз ai digital bridge", "balanced", "malik-max")
    assert.match(queries[queryStart].q, /^ai digital bridge \d{4} прошёл даты итоги$/iu)
    assert.equal(queries[queryStart].tbs, undefined, "old editions must remain searchable")
    assert.ok(calls.slice(searchStart).some(url => url.includes("tavily")), "an announcement must not stop provider fallback")
    assert.ok(readUrls.includes(bridgeUrl))
    assert.equal(answer.provider, "live-evidence")
    assert.equal(answer.selectedModelId, "malik-max")
    assert.equal(answer.sources[0].url, bridgeUrl)
    assert.match(answer.content, new RegExp(`1\\s*[–-]\\s*3 октября ${bridgeYear}.*\\[1\\]`, "u"))
    assert.equal(inferences.length, before, "a date confirmed by the source needs no model guess")
  })
  scenario = "unread-event"
  await check("an unread search result does not become a confirmed date in chat", async () => {
    const answer = await run("When was the last Metro Design Week?")
    assert.equal(answer.provider, "live-evidence-gate")
    assert.doesNotMatch(answer.content, /October 3|2024|\[1\]/u)
  })
  scenario = "retry-event"
  await check("a blocked lead gets one bounded retry from an unused provider before the final answer", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY
    try {
      const before = calls.length
      const answer = await run("When was the last Nexus Film Festival?")
      assert.deepEqual(calls.slice(before).map(url => new URL(url).hostname), ["google.serper.dev", "api.tavily.com"])
      assert.deepEqual(readUrls.slice(-2), [blockedEventPage, readableEventPage])
      assert.equal(answer.provider, "live-evidence")
      assert.equal(answer.sources[0].url, readableEventPage)
      assert.match(answer.content, new RegExp(`January 1, ${currentEventYear}.*\\[1\\]`, "u"))
    } finally { process.env.BRAVE_SEARCH_API_KEY = "fixture-only" }
  })
  scenario = "prefer-current-event"
  await check("a previous-year result cannot stop discovery of the completed edition in the current year", async () => {
    const before = calls.length
    const answer = await run("When was the last Aurora Robotics Expo?")
    assert.ok(calls.slice(before).some(url => url.includes("tavily")))
    assert.equal(answer.provider, "live-evidence")
    assert.equal(answer.sources[0].url, auroraCurrentUrl)
    assert.equal(answer.sources[0].occurrence.end, `${currentEventYear}-01-01`)
    assert.match(answer.content, new RegExp(`January 1, ${currentEventYear}.*\\[1\\]`, "u"))
  })
  console.log(`${checks}/${checks} runtime acceptance checks passed (fixture transports, not live model accuracy)`)
} finally { globalThis.fetch = savedFetch; console.info = savedInfo; process.env = savedEnv }
