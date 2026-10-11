// Real router orchestration with fixture HTTP and model transports; no production credentials.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url), root = process.cwd()
const savedFetch = globalThis.fetch, savedEnv = { ...process.env }, savedInfo = console.info
const cache = new Map(), inferences = [], calls = [], tokens = []
let scenario = "success", checks = 0
const sources = [
  { title: "Introducing GPT-99 TEST FIXTURE model", link: "https://openai.com/fixture/gpt-99", snippet: "Fixture only: official AI model announcement", date: new Date(Date.now() - 3600_000).toISOString() },
  { title: "Google DeepMind Gemini 99 TEST FIXTURE model", link: "https://deepmind.google/fixture/gemini-99", snippet: "Fixture only: official AI model announcement", date: new Date(Date.now() - 3600_000).toISOString() },
  { title: "Казахстан: технологические новости TEST FIXTURE", link: "https://inform.kz/fixture/news", snippet: "Fixture only: новости Казахстана за последние 24 часа", date: new Date(Date.now() - 3600_000).toISOString() },
]
const stubs = {
  "@/lib/server/malik-model-router": { runStrictMalikModel: async (input) => { inferences.push(input); if (!/1547|2020 году|без интернета/.test(input.taskPrompt)) assert.equal(input.onToken, undefined, "current answers must not expose unchecked drafts"); return { content: /1547/.test(input.taskPrompt) ? "1547 × 829 = 1 282 463" : "Подтверждённый ответ по тестовым данным [1].", provider: "fixture", model: "fixture", selectedModelId: input.modelId, latencyMs: 0 } } },
  "@/lib/server/context-fusion": { requestedFusionConnectors: () => [], collectMalikConnectedContext: async () => ({ requested: false, sources: [], context: "" }) },
  "@/lib/server/science-context": { collectMalikScienceContext: async () => ({ sources: [], context: "", providers: [] }) },
  "@/lib/live-intelligence/index-reader": { indexedSources: async () => ({ sources: [], health: { status: "unavailable" } }) },
  "@/lib/malik-research/fetch-page": { fetchPageText: async (source) => ({ ...source, text: source.snippet, readAt: new Date().toISOString() }) },
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
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (scenario === "all-fail") return new Response("", { status: 503 })
    if (String(url).includes("serper.dev")) return scenario === "fallback" ? new Response("", { status: 503 }) : Response.json({ organic: scenario === "old-and-fresh" ? [{ ...sources[0], title: "GPT-99 OLD FIXTURE model", link: "https://untrusted.example/old-gpt-99", date: "2023-01-01T00:00:00Z" }, sources[0]] : sources })
    if (String(url).includes("tavily.com")) return Response.json({ results: sources.map((source) => ({ title: source.title, url: source.link, content: source.snippet, published_date: source.date })) })
    if (String(url).includes("api.github.com")) return Response.json({ tag_name: "v99.0.0", name: "Next.js v99 TEST FIXTURE", html_url: "https://github.com/vercel/next.js/releases/tag/fixture-v99", published_at: new Date(Date.now() - 45 * 86400_000).toISOString(), body: "TEST FIXTURE stable release", draft: false, prerelease: false })
    return new Response("", { status: 503 })
  }
  const god = load("lib/malik-god-router.ts")
  const run = (prompt, depth = "balanced") => god.malikGodAnswer({ originalQuestion: prompt, responseDepth: depth }, { modelId: "malik-fast-120b" }, undefined, (token) => tokens.push(token))
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
  console.log(`${checks}/${checks} runtime acceptance checks passed (fixture transports, not live model accuracy)`)
} finally { globalThis.fetch = savedFetch; console.info = savedInfo; process.env = savedEnv }
