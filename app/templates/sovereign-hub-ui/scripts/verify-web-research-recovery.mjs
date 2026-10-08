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
const currentEvidence = load("lib/ai/current-evidence.ts")
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
    const router = functionsFrom("lib/malik-god-router.ts", ["extractNamedSubject", "knownPersonSearchName", "buildQueries", "SEARCH_STOP_WORDS", "searchTokens", "knownNameAliases", "identityTokensForNamedSubject", "rankSourcesForPrompt"], { ...query, ...currentEvidence })
    assert.ok(router.buildQueries(screenshotPrompt).every((q) => /Ai Digital Bridge/i.test(q)))
    assert.ok(!router.buildQueries(screenshotPrompt).some((q) => /hackathon accelerator/i.test(q)))
    const event = { title: "AI Digital Bridge programme and speakers", url: "https://example.test/digital-bridge", domain: "example.test", snippet: "Confirmed programme" }
    const unrelated = { title: "AI founder interview", url: "https://example.test/ai", domain: "example.test", snippet: "Speaker discusses artificial intelligence" }
    assert.deepEqual(router.rankSourcesForPrompt(screenshotPrompt, [unrelated, event]), [event])
  })
  await check("new model comparisons check exact versions separately, not an older model", () => {
    const prompt = "Сравни Gemini 4 pro и GPT 6.1S SOL"
    assert.equal(shouldUseWeb(prompt), true)
    assert.equal(shouldUseWeb("Напиши последние новости мира"), true)
    assert.equal(shouldUseWeb("Напиши код на Python"), false)
    assert.equal(shouldUseWeb(prompt, { research: false }), false)
    assert.deepEqual(currentEvidence.currentModelSubjects(prompt), ["Gemini 4 pro", "GPT 6.1S SOL"])
    const router = functionsFrom("lib/malik-god-router.ts", ["extractNamedSubject", "knownPersonSearchName", "buildQueries"], { ...query, ...currentEvidence })
    const queries = router.buildQueries(prompt)
    assert.equal(queries.length, 3)
    assert.ok(queries.some((q) => q.includes('"Gemini 4 pro"') && q.includes("site:deepmind.google")))
    assert.ok(queries.some((q) => q.includes('"GPT 6.1S SOL"') && q.includes("site:openai.com")))
    assert.ok(queries.every((q) => !q.includes("Gemini 3.1")))
    assert.deepEqual(currentEvidence.mentionedCurrentModels(prompt, "Gemini 3.1 Pro — latest model"), [])
    assert.deepEqual(currentEvidence.mentionedCurrentModels(prompt, "GPT-6.1S SOL release"), ["GPT 6.1S SOL"])
    const old = { domain: "deepmind.google", title: "Gemini 3.1 Pro", snippet: "Previous model" }
    const exact = { domain: "deepmind.google", title: "Gemini 4 Pro", snippet: "Announcement" }
    assert.ok(currentEvidence.currentSourcePriority(prompt, exact) > currentEvidence.currentSourcePriority(prompt, old))
    assert.ok(router.buildQueries("Как зарегистрироваться в NVIDIA").some((q) => q.includes("site:nvidia.com")))
    assert.ok(currentEvidence.currentSourcePriority("Как зарегистрироваться в NVIDIA", { domain: "accounts.nvidia.com" }) > currentEvidence.currentSourcePriority("Как зарегистрироваться в NVIDIA", { domain: "smsfast.test" }))
    assert.equal(currentEvidence.currentResearchDate(new Date("2026-10-05T21:00:00Z")), "2026-10-06")
    assert.ok(currentEvidence.currentSourcePriority(prompt, { domain: "openai.com" }) > currentEvidence.currentSourcePriority(prompt, { domain: "random.test" }))
    const instruction = currentEvidence.currentEvidenceInstruction(prompt)
    assert.match(instruction, /do NOT prove/)
    assert.match(instruction, /not "it does not exist"/)
    const cache = new Map()
    const caching = functionsFrom("lib/malik-god-router.ts", ["cacheKey", "getCache", "setCache"], { CACHE: cache, SEARCH_CACHE_VERSION: "test", needsCurrentEvidence: currentEvidence.needsCurrentEvidence })
    caching.setCache(prompt, { content: "outdated comparison" })
    assert.equal(caching.getCache(prompt), null, "changing facts are rechecked, not restored from a stale answer")
    assert.equal(cache.size, 0)
    caching.setCache("Что такое Медеу", { content: "stable overview" })
    assert.equal(caching.getCache("Что такое Медеу").content, "stable overview")
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
  const { fetchRecoverableChat, canRetryChat } = load("lib/ai/chat-stream-recovery.ts")
  const event = (type, rest = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`
  const sse = (text, headers = {}) => new Response(text, { headers: { "content-type": "text/event-stream", ...headers } })
  const request = { method: "POST", body: JSON.stringify({ originalQuestion: "Сравни два телефона", workspaceMode: "chat" }) }
  const recoveryOptions = { pollMs: 1, recoveryMs: 100, firstTextMs: 80, idleMs: 80 }
  await check("a cut before text automatically retries once and completes without photo dependencies", async () => {
    const calls = []
    const response = await fetchRecoverableChat("/api/stream", request, { ...recoveryOptions, fetcher: async (_url, init) => {
      calls.push(JSON.parse(init.body))
      return calls.length === 1 ? sse(event("progress", { text: "Думает…" })) : sse(event("content", { content: "Полный ответ" }) + event("done", { sources: [] }))
    } })
    const text = await response.text()
    assert.equal(calls.length, 2)
    assert.equal(calls[1].chatRecovery, true)
    assert.match(text, /Полный ответ/)
    assert.match(text, /"textOnly":true/)
    assert.match(text, /event: done/)
    assert.doesNotMatch(text, /event: error/)
  })
  await check("saved server content is recovered with citations, without replaying the question", async () => {
    let posts = 0, polls = 0
    const sources = [{ title: "Verified page", url: "https://example.test/evidence", domain: "example.test" }]
    const response = await fetchRecoverableChat("/api/stream", request, { ...recoveryOptions, fetcher: async (url) => {
      if (url === "/api/stream") { posts++; return sse(event("content", { content: "Часть" }), { "x-malik-background-turn-id": "saved-turn" }) }
      polls++
      return Response.json({ turn: { status: "complete", content: "Часть и продолжение [1]", sources, usedWeb: true } })
    } })
    const text = await response.text()
    assert.equal(posts, 1); assert.equal(polls, 1)
    assert.match(text, /Часть и продолжение/)
    assert.match(text, /example.test\/evidence/)
    assert.match(text, /"usedWeb":true/)
    assert.doesNotMatch(text, /event: error/)
  })
  await check("permission, quota and action requests are never replayed", async () => {
    for (const status of [401, 403, 429]) {
      let calls = 0
      const response = await fetchRecoverableChat("/api/stream", request, { fetcher: async () => { calls++; return new Response("Denied", { status }) } })
      assert.equal(response.status, status); assert.equal(calls, 1)
    }
    for (const prompt of ["/malik", "Отправь сообщение", "Опубликуй сайт", "Удали файл"]) assert.equal(canRetryChat({ originalQuestion: prompt }), false)
    assert.equal(canRetryChat({ originalQuestion: "Собери проект", isProjectRequest: true }), false)
    assert.equal(canRetryChat({ originalQuestion: "Объясни", workspaceMode: "work" }), false)
    assert.equal(canRetryChat({ originalQuestion: "Проанализируй файл", attachments: [{ id: "attachment1" }] }), false)
    assert.equal(canRetryChat({ originalQuestion: "Выполни действия", actionPlan: { kind: "purchase" } }), false)
  })
  await check("a silent stream is bounded and falls back to a working answer", async () => {
    let calls = 0
    const response = await fetchRecoverableChat("/api/stream", request, { ...recoveryOptions, firstTextMs: 25, fetcher: async () => {
      calls++
      return calls === 1 ? new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } }) : sse(event("content", { content: "Recovered" }) + event("done"))
    } })
    assert.match(await response.text(), /Recovered/)
    assert.equal(calls, 2)
  })
  await check("all failed attempts retain a truthful error instead of a manufactured answer", async () => {
    let calls = 0
    const response = await fetchRecoverableChat("/api/stream", request, { ...recoveryOptions, fetcher: async () => { calls++; return sse(event("error", { message: "Unavailable" })) } })
    const text = await response.text()
    assert.equal(calls, 2)
    assert.match(text, /event: error/)
    assert.doesNotMatch(text, /event: done|Соединение прервалось до ответа/)
  })
  await check("cumulative SSE chunks recover saved turn without duplicate POST", async () => {
    let posts = 0
    const response = await fetchRecoverableChat("/api/stream", request, {
      ...recoveryOptions,
      fetcher: async (url) => {
        if (url === "/api/stream") {
          posts++
          return sse(
            event("content", { content: "Часть" }) + event("content", { content: "Часть и продолжение" }),
            { "x-malik-background-turn-id": "cumulative-turn" },
          )
        }
        return Response.json({ turn: { status: "complete", content: "Часть и продолжение завершено", usedWeb: false, sources: [] } })
      },
    })
    const text = await response.text()
    assert.equal(posts, 1)
    assert.match(text, /Часть и продолжение завершено/)
    assert.match(text, /event: done/)
    assert.doesNotMatch(text, /event: error/)
  })
  await check("a partly written answer is retained and never restarted from scratch", async () => {
    let calls = 0
    const response = await fetchRecoverableChat("/api/stream", request, { ...recoveryOptions, fetcher: async () => { calls++; return sse(event("content", { content: "Useful partial answer" })) } })
    const text = await response.text()
    assert.equal(calls, 1)
    assert.match(text, /Useful partial answer/)
    assert.match(text, /event: error/)
  })
  await check("explicit cancellation never restarts generation", async () => {
    const abort = new AbortController()
    let calls = 0
    const response = await fetchRecoverableChat("/api/stream", { ...request, signal: abort.signal }, { ...recoveryOptions, fetcher: async () => { calls++; return new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } }) } })
    abort.abort()
    await assert.rejects(response.text(), (error) => error.name === "AbortError")
    assert.equal(calls, 1)
  })
  console.log(`\n${checks}/${checks} web recovery checks passed`)
} finally { clearInterval(keepAlive); globalThis.fetch = originalFetch }
