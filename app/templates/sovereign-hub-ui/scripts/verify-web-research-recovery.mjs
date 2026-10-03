// Offline regressions for event identity, stalled HTTP bodies and SSE delivery.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }
  cache.set(absolute, box)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      return load([base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)))
    }
    return require(name)
  }, box, box.exports)
  return box.exports
}

function functionsFrom(file, names, dependencies = {}) {
  const source = fs.readFileSync(file, "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const selected = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.includes(d.name.getText(ast))))
  const js = ts.transpileModule(selected.map((node) => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(dependencies), js + `\nreturn { ${names.filter((n) => n !== "SEARCH_STOP_WORDS").join(", ")} }`)(...Object.values(dependencies))
}

const { fetchResearchResponse } = load("lib/malik-research/bounded-fetch.ts")
const { shouldUseWeb } = load("lib/ai/web-search-policy.ts")
const query = load("lib/ai/web-search-query.ts")
const { buildContextualFollowUps } = load("lib/ai/chat-followups.ts")
const screenshotPrompt = "Знаеш про Ai Digital Bridge дай всех спикеров"
const originalFetch = globalThis.fetch
// AbortSignal.timeout is unref'ed; keep the process alive during stalled-body tests.
const keepAlive = setInterval(() => {}, 1000)
let checks = 0
async function check(name, fn) { await fn(); checks += 1; console.log(`  ok  ${name}`) }

try {
  await check("speaker requests search automatically and respect explicit opt-out", () => {
    assert.equal(shouldUseWeb(screenshotPrompt), true)
    assert.equal(shouldUseWeb("Дай программу конференции Web Summit"), true)
    assert.equal(shouldUseWeb(screenshotPrompt, { research: false }), false)
    assert.equal(shouldUseWeb("Без интернета " + screenshotPrompt), false)
    assert.equal(shouldUseWeb("Напиши программу на Python"), false)
    assert.equal(query.normalizeWebSearchQuery(screenshotPrompt), "Ai Digital Bridge спикеры")
    assert.equal(query.eventSearchTitle(screenshotPrompt), "Ai Digital Bridge")
  })
  await check("search keeps the named event and rejects generic AI links", () => {
    const router = functionsFrom("lib/malik-god-router.ts", ["extractNamedSubject", "knownPersonSearchName", "buildQueries", "SEARCH_STOP_WORDS", "searchTokens", "knownNameAliases", "identityTokensForNamedSubject", "rankSourcesForPrompt"], query)
    assert.ok(router.buildQueries(screenshotPrompt).every((q) => /Ai Digital Bridge/i.test(q)))
    assert.ok(!router.buildQueries(screenshotPrompt).some((q) => /hackathon accelerator/i.test(q)))
    const event = { title: "AI Digital Bridge programme and speakers", url: "https://example.test/digital-bridge", domain: "example.test", snippet: "Confirmed programme" }
    const unrelated = { title: "AI founder interview", url: "https://example.test/ai", domain: "example.test", snippet: "Speaker discusses artificial intelligence" }
    assert.deepEqual(router.rankSourcesForPrompt(screenshotPrompt, [unrelated, event]), [event])
  })
  await check("programme answers offer fact checking instead of code review", () => {
    const chips = buildContextualFollowUps(screenshotPrompt, "Проверь раздел «Программа» на сайте мероприятия.")
    assert.ok(chips.some((chip) => chip.research === true))
    assert.ok(!chips.some((chip) => /код/i.test(chip.label)))
    assert.ok(buildContextualFollowUps("Напиши программу", "Готово").some((chip) => /код/i.test(chip.label)))
  })
  await check("deadline includes a body that stalls after successful headers", async () => {
    let cancelled = false
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true } }), { headers: { "content-type": "text/html" } })
    const start = Date.now()
    await assert.rejects(fetchResearchResponse("https://example.test/slow", {}, 35), (error) => error.name === "TimeoutError")
    assert.ok(Date.now() - start < 500)
    assert.equal(cancelled, true)
  })
  await check("user cancellation also stops a stalled body", async () => {
    const abort = new AbortController()
    globalThis.fetch = async () => new Response(new ReadableStream({}))
    const pending = fetchResearchResponse("https://example.test/cancel", { signal: abort.signal }, 1000)
    setTimeout(() => abort.abort(), 15)
    await assert.rejects(pending, (error) => error.name === "AbortError")
  })
  await check("oversized bodies are cancelled and valid text stays readable", async () => {
    globalThis.fetch = async () => new Response("too much text")
    await assert.rejects(fetchResearchResponse("https://example.test/large", {}, 1000, 4), /byte limit/)
    globalThis.fetch = async () => new Response("Verified text", { headers: { "content-type": "text/plain", "content-encoding": "gzip" } })
    const response = await fetchResearchResponse("https://example.test/text", {}, 1000)
    assert.equal(await response.text(), "Verified text")
    assert.equal(response.headers.get("content-encoding"), null)
  })

  const { createExecutionReporter } = load("lib/ai/chat-execution.ts")
  const callbacks = []
  let resolveUsage, resolveHistory, modelSignal
  const usage = new Promise((resolve) => { resolveUsage = resolve })
  const history = new Promise((resolve) => { resolveHistory = resolve })
  let modelRun = async (...args) => {
    modelSignal = args[6]
    args[4]("Confirmed answer.")
    return { content: "Confirmed answer.", sources: [], usedWeb: true, provider: "test", model: "test", selectedModelId: "malik-max" }
  }
  const { liveSseResponse } = functionsFrom("app/api/stream/route-impl.ts", ["protectChatCodeFences", "createStreamingFenceProtector", "liveSseResponse"], {
    after: (callback) => callbacks.push(callback), createExecutionReporter, DEFAULT_MALIK_MODEL_ID: "malik-max",
    isProjectBuildRequest: () => false, runSelectedAnswer: (...args) => modelRun(...args),
    estimateMultimodalTokens: () => 0, hasMalikAttachments: () => false,
    recordDailyMultimodalTokens: () => {}, observeComputeResult: () => {}, asPlainText: (answer) => answer.content,
    recordChatUsage: () => usage, persistFounderChatTurn: () => history,
    malikModelErrorPayload: (error) => ({ message: String(error) }),
  })
  await check("SSE delivers done while history and usage writes are still pending", async () => {
    const response = liveSseResponse({ prompt: screenshotPrompt }, null, { userId: "offline-test", plan: "owner" })
    let timer
    const text = await Promise.race([response.text(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SSE waited on storage")), 500) })]).finally(() => clearTimeout(timer))
    assert.match(text, /event: content/)
    assert.match(text, /event: done/)
    const events = text.split("\n\n").filter((event) => event.startsWith("event: content\n"))
    assert.equal(events.map((event) => JSON.parse(event.split("\ndata: ")[1]).content).join(""), "Confirmed answer.")
    assert.equal(modelSignal.aborted, false)
    let saved = false
    const finish = callbacks[0]().then(() => { saved = true })
    await Promise.resolve()
    assert.equal(saved, false)
    resolveUsage(); resolveHistory(); await finish
    assert.equal(saved, true)
  })
  await check("cancelling the SSE stream aborts model generation", async () => {
    modelRun = (...args) => { modelSignal = args[6]; return new Promise((_, reject) => modelSignal.addEventListener("abort", () => reject(modelSignal.reason), { once: true })) }
    const response = liveSseResponse({ prompt: "stop" }, null, { userId: "offline-test", plan: "owner" })
    await response.body.cancel()
    assert.equal(modelSignal.aborted, true)
    await Promise.resolve()
  })
  console.log(`\n${checks}/${checks} web recovery checks passed`)
} finally { clearInterval(keepAlive); globalThis.fetch = originalFetch }
