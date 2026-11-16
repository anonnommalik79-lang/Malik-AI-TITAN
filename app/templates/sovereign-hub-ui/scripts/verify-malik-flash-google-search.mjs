// MalikLLM Flash answered by Gemini with Grounding with Google Search.
//
// Google cannot be reached from a test, so the Gemini API is played by a fetch
// that answers the documented way: ListModels, then SSE frames of
// GenerateContentResponse with groundingMetadata on the last frame.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader()
const search = load("lib/server/malik-flash-google-search.ts")
const engine = load("lib/business/gemini-engine.ts")
const { flashGoogleIntent } = load("lib/ai/malik-flash-intent.ts")
const { fetchRecoverableChat } = load("lib/ai/chat-stream-recovery.ts")

const KEY = "AIzaTESTKEYFLASHAAAAAAAAAAAAAAAAAAAAAA"
const env = { GEMINI_API_KEY: KEY, MALIK_FLASH_GOOGLE_SEARCH: "1", MALIK_FLASH_GEMINI_MODEL: "gemini-2.5-flash,gemini-2.5-flash-lite" }
const sse = frames => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder()
    for (const frame of frames) controller.enqueue(encoder.encode("data: " + JSON.stringify(frame) + "\r\n\r\n"))
    controller.close()
  },
}), { status: 200, headers: { "content-type": "text/event-stream" } })
const text = value => ({ candidates: [{ content: { role: "model", parts: [{ text: value }] } }] })
const finish = grounding => ({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP", ...(grounding ? { groundingMetadata: grounding } : {}) }],
  usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, totalTokenCount: 52 }, modelVersion: "gemini-2.5-flash-001" })
// The key sees Gemini 3 and 2.5, as production keys do.
const visible = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
const models = () => new Response(JSON.stringify({ models: visible.map(id => ({ name: "models/" + id, supportedGenerationMethods: ["generateContent"] })) }), { status: 200 })

function google(answer) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const href = String(url)
    assert.ok(!href.includes("key="), "the key never goes in the URL")
    assert.equal(new URL(href).origin, "https://generativelanguage.googleapis.com")
    if (href.includes("/v1beta/models?")) return models()
    const body = JSON.parse(init.body)
    body.model = decodeURIComponent(href.match(/models\/([^:]+):streamGenerateContent/)?.[1] || "")
    calls.push(body)
    return answer(body, calls)
  }
  return { fetchImpl, calls }
}
const fresh = t => {
  engine.resetGeminiEngineState()
  delete globalThis.__malikFlashSearchHealth
  t.after(() => { engine.resetGeminiEngineState(); delete globalThis.__malikFlashSearchHealth })
}

test("Google Search runs only when the owner turned it on and a Gemini key exists", () => {
  assert.equal(search.flashGoogleSearchEnabled({ GEMINI_API_KEY: KEY }), false, "off by default: grounding is billed")
  assert.equal(search.flashGoogleSearchEnabled({ MALIK_FLASH_GOOGLE_SEARCH: "1" }), false, "no key, no lane")
  assert.equal(search.flashGoogleSearchEnabled(env), true)
  for (const value of ["true", " 1 ", "ON", "yes"]) assert.equal(search.flashGoogleSearchEnabled({ GEMINI_API_KEY: KEY, MALIK_FLASH_GOOGLE_SEARCH: value }), true, JSON.stringify(value))
  for (const value of ["0", "false", "", "2"]) assert.equal(search.flashGoogleSearchEnabled({ GEMINI_API_KEY: KEY, MALIK_FLASH_GOOGLE_SEARCH: value }), false, JSON.stringify(value))
  const status = search.flashGoogleSearchStatus({ MALIK_FLASH_GOOGLE_SEARCH: "true" })
  assert.equal(status.switch, true)
  assert.equal(status.geminiKey, false)
  assert.equal(status.enabled, false)
  assert.deepEqual(search.flashSearchModels({}, Date.UTC(2026, 10, 16)), ["gemini-2.5-flash", "gemini-2.5-flash-lite"])
  assert.deepEqual(search.flashSearchModels({}, Date.UTC(2026, 11, 1)), ["gemini-2.5-flash-lite"])
  assert.equal(status.dailyLimit, 500)
  assert.deepEqual(search.flashSearchModels({ MALIK_FLASH_GEMINI_MODEL: "gemini-3.6-flash, models/gemini-2.5-flash, ../x" }), ["gemini-3.6-flash", "gemini-2.5-flash"])
  assert.equal(search.flashSearchDailyLimit({ MALIK_FLASH_GOOGLE_SEARCH_DAILY_LIMIT: "200" }), 200)
  assert.equal(search.flashSearchDailyLimit({ MALIK_FLASH_GOOGLE_SEARCH_DAILY_LIMIT: "-5" }), 500)
  assert.equal(JSON.stringify(search.flashGoogleSearchStatus(env)).includes(KEY), false, "the health check never shows a key")
  assert.match(readFileSync("app/api/health/route.ts", "utf8"), /flashGoogleSearch: flashGoogleSearchStatus\(\)/u)
})

test("text questions use Google Search; code, images, video and attachments keep their MALIKII paths", () => {
  for (const prompt of ["Какой сейчас курс доллара?", "Кто президент Казахстана?", "Объясни, как работает REST API", "Hello, what happened in tech today?"])
    assert.equal(search.flashGoogleSearchEligible(prompt), true, prompt)
  for (const prompt of ["Build a production-ready web application with a PostgreSQL backend", "Debug this repository", "Сгенерируй изображение спорткара", "Сгенерируй видео заката"])
    assert.equal(search.flashGoogleSearchEligible(prompt), false, prompt)
  assert.equal(search.flashGoogleSearchEligible("Что на фото?", { attachments: [{ kind: "image" }] }), false)
  assert.equal(search.flashGoogleSearchEligible("Сделай сайт кофейни", { codeOrBuild: true }), false)
  assert.equal(search.flashGoogleSearchEligible("x".repeat(6001)), false)
  // Instant local replies stay local: a Google search would only make them slower.
  for (const prompt of ["Hello", "Привет", "Как дела?", "Кто тебя создал?", "Какой сегодня день?"]) {
    assert.equal(search.flashGoogleSearchEligible(prompt), false, prompt)
    assert.ok(search.flashLocalReply(prompt), prompt)
  }
  assert.equal(search.flashGoogleSearchEligible("Привет", { history: [{ role: "user", content: "Найди отель в Алматы" }, { role: "assistant", content: "Вот варианты." }, { role: "user", content: "Привет" }] }), true,
    "inside a conversation a short message is a reply, not a greeting")
})

test("the completed answer reaches the chat with Google's own links and model version", async t => {
  fresh(t)
  const { fetchImpl, calls } = google(() => sse([text("Курс доллара сегодня — "), text("**470 ₸** [1]."), finish({
    webSearchQueries: ["курс доллара тенге сегодня"],
    groundingChunks: [{ web: { uri: "https://nationalbank.kz/ru/exchangerates", title: "nationalbank.kz" } }, { web: { uri: "javascript:alert(1)", title: "bad" } }, { web: { uri: "https://nationalbank.kz/ru/exchangerates", title: "dup" } }],
  })]))
  const chunks = []
  const answer = await search.runFlashGoogleSearch({
    question: "А какой курс сегодня?",
    body: { history: [{ role: "user", content: "Расскажи про тенге" }, { role: "assistant", content: "Тенге — валюта Казахстана." }, { role: "user", content: "А какой курс сегодня?" }] },
    maxOutputTokens: 1024, env, fetchImpl, onText: chunk => chunks.push(chunk),
  })
  assert.equal(chunks.join(""), "Курс доллара сегодня — **470 ₸** [1].")
  assert.equal(answer.content, chunks.join(""))
  assert.equal(answer.provider, "google-gemini-search")
  assert.equal(answer.model, "gemini-2.5-flash-001")
  assert.equal(answer.selectedModelId, "malik-flash")
  assert.equal(answer.usedWeb, true)
  assert.deepEqual(answer.usage, { inputTokens: 40, outputTokens: 12, totalTokens: 52 })
  assert.deepEqual(answer.sources, [{ url: "https://nationalbank.kz/ru/exchangerates", title: "nationalbank.kz", domain: "nationalbank.kz", provider: "google-gemini-search" }])
  const request = calls[0]
  assert.deepEqual(calls.map(call => call.model), ["gemini-2.5-flash"])
  assert.equal(search.flashGoogleSearchStatus(env).dailyUsed, 1)
  assert.deepEqual(request.tools, [{ google_search: {} }])
  assert.match(request.systemInstruction.parts[0].text, /Never say you are Google, Gemini or Google AI Mode/)
  assert.match(request.systemInstruction.parts[0].text, /Abdumalik/)
  const prompt = request.contents[0].parts[0].text
  assert.match(prompt, /User: Расскажи про тенге/)
  assert.match(prompt, /The user's message now:\s+А какой курс сегодня\?$/u)
  assert.equal(prompt.match(/А какой курс сегодня\?/gu).length, 1, "the current question is not repeated from history")
})

test("quota stops the attempt without trying other models or keys until the retry window", async t => {
  fresh(t)
  const { fetchImpl, calls } = google(body => body.model.startsWith("gemini-2.5")
    ? new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." } }), { status: 429, headers: { "content-type": "application/json" } })
    : assert.fail("called " + body.model))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Курс доллара?", body: {}, env, fetchImpl }), error => error instanceof search.FlashSearchUnavailable && error.code === "QUOTA")
  await assert.rejects(search.runFlashGoogleSearch({ question: "А курс евро?", body: {}, env, fetchImpl }), error => error.code === "QUOTA")
  assert.deepEqual(calls.map(call => call.model), ["gemini-2.5-flash"])
  const failure = search.flashGoogleSearchStatus(env).lastFailure
  assert.deepEqual(failure.models, [{ model: "gemini-2.5-flash", code: "QUOTA", status: 429 }])
})

test("a billing refusal is reported without attempting ungrounded generation", async t => {
  fresh(t)
  const { fetchImpl, calls } = google(() => Response.json({ error: { message: "Google Search grounding requires billing." } }, { status: 402 }))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Курс доллара?", body: {}, env, fetchImpl }), error => {
    assert.equal(error.code, "BILLING_REQUIRED")
    assert.equal(search.flashGoogleSearchError(error).code, "FLASH_GOOGLE_SEARCH_BILLING_REQUIRED")
    return true
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(search.flashGoogleSearchStatus(env).lastFailure.statuses, [402])
})

test("turns without real sources or a completion receipt never yield partial Google text", async t => {
  fresh(t)
  const grounding = { groundingChunks: [{ web: { uri: "https://example.com/source" } }] }
  for (const [frames, code] of [[[text("Без источника"), finish()], "NO_SOURCES"], [[text("Оборванный ответ"), { candidates: [{ groundingMetadata: grounding }] }], "INCOMPLETE"]]) {
    const { fetchImpl } = google(() => sse(frames))
    await assert.rejects(search.runFlashGoogleSearch({ question: "Курс доллара?", body: {}, env, fetchImpl,
      onText: () => assert.fail("unverified text reached the chat") }), error => error.code === code)
  }
})

test("unsupported grounding is not retried without the Google Search tool", async t => {
  fresh(t)
  const { fetchImpl, calls } = google(() => Response.json({ error: { message: "google_search is not supported" } }, { status: 400 }))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Последние новости?", body: {}, env, fetchImpl }), search.FlashSearchUnavailable)
  assert.ok(calls.length > 0)
  assert.ok(calls.every(call => call.tools?.some(tool => tool.google_search)))
  assert.equal(search.flashGoogleSearchStatus(env).dailyUsed, calls.length)
})

test("a key without the free-allowance models answers natively, without trying Gemini 3", async t => {
  fresh(t)
  visible.splice(2)
  t.after(() => visible.push("gemini-2.5-flash", "gemini-2.5-flash-lite"))
  const { fetchImpl, calls } = google(body => assert.fail("called " + body.model))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Курс доллара?", body: {}, env, fetchImpl }), error => error instanceof search.FlashSearchUnavailable && error.code === "MODEL_MISSING")
  assert.equal(calls.length, 0)
})

test("over the daily allowance nothing is sent to Google", async t => {
  fresh(t)
  const limited = { ...env, MALIK_FLASH_GOOGLE_SEARCH_DAILY_LIMIT: "1" }
  const { fetchImpl, calls } = google(() => sse([text("Ответ."), finish({ groundingChunks: [{ web: { uri: "https://example.com/source" } }] })]))
  await search.runFlashGoogleSearch({ question: "Первый вопрос", body: {}, env: limited, fetchImpl })
  await assert.rejects(search.runFlashGoogleSearch({ question: "Второй вопрос", body: {}, env: limited, fetchImpl }), error => error instanceof search.FlashSearchUnavailable && error.code === "DAILY_LIMIT")
  assert.equal(calls.length, 1)
  assert.equal(search.flashGoogleSearchStatus(limited).dailyUsed, 1)
})

test("Flash Search handles simultaneous users with a bounded number of Google requests", async t => {
  fresh(t)
  const gate = Promise.withResolvers()
  const { fetchImpl, calls } = google(async () => {
    await gate.promise
    return sse([text("Ответ."), finish({ groundingChunks: [{ web: { uri: "https://example.com/source" } }] })])
  })
  const submit = question => search.runFlashGoogleSearch({ question, body: {}, env, fetchImpl })
  const active = [submit("Первый"), submit("Второй"), submit("Третий")]
  try { await assert.rejects(submit("Четвёртый"), error => error.code === "BUSY") }
  finally { gate.resolve(); await Promise.all(active) }
  await submit("Следующий")
  assert.equal(calls.length, 4)
})

test("memory opt-out sends only the current question, even when the client offers earlier turns", () => {
  assert.equal(search.flashSearchPrompt("Что нового?", {
    flashContextEnabled: false, history: [{ role: "user", content: "Earlier private context" }],
  }), "Что нового?")
})

test("Gemini that cannot answer before any text hands the turn back to MALIKII", async t => {
  fresh(t)
  const { fetchImpl } = google(() => new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid." } }), { status: 403, headers: { "content-type": "application/json" } }))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Hello", body: {}, env, fetchImpl }), error => error instanceof search.FlashSearchUnavailable && error.code === "KEY_REJECTED")
  const status = search.flashGoogleSearchStatus(env)
  assert.equal(status.lastFailure.code, "KEY_REJECTED")
  assert.deepEqual(status.lastFailure.statuses, [403])
  assert.equal(JSON.stringify(status).includes(KEY) || JSON.stringify(status).includes("GEMINI_API_KEY"), false, "no key and no key name in health")
})

test("a stop from the user is a stop, not a fallback", async t => {
  engine.resetGeminiEngineState()
  t.after(() => engine.resetGeminiEngineState())
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(search.runFlashGoogleSearch({ question: "Hello", body: {}, env, signal: controller.signal, fetchImpl: () => assert.fail("fetch after stop") }),
    error => !(error instanceof search.FlashSearchUnavailable))
})

test("directed Google requests keep their error on both chat transports without an automatic replay", async () => {
  assert.equal(flashGoogleIntent("Найди в Google официальный сайт"), "search")
  assert.equal(flashGoogleIntent("Ответь через ИИ-режим Google"), "ai-mode")
  assert.equal(flashGoogleIntent("Сгенерируй изображение через Google AI Mode"), "ai-mode")
  assert.equal(flashGoogleIntent("Как работает поиск в Google AI Mode?"), null)
  assert.equal(flashGoogleIntent("Без поиска объясни, как работает Google"), null)
  let posts = 0
  const response = await fetchRecoverableChat("/api/stream", { method: "POST", body: JSON.stringify({ model: "malik-flash", question: "Ответь через Google AI Mode" }) }, {
    fetcher: async () => {
      posts++
      return Response.json({ error: "FLASH_GOOGLE_AI_MODE_UNAVAILABLE", message: "Google AI Mode недоступен." }, { status: 503 })
    },
  })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, "FLASH_GOOGLE_AI_MODE_UNAVAILABLE")
  assert.equal(posts, 1)
})

test("streaming and JSON share the same Google-only policy", () => {
  const stream = readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(stream, /if \(flashGoogleIntent\(input\.question\) === "search"\) throw flashGoogleSearchError\(error\)/u)
  assert.match(stream, /!project && flashSearchTurn\(body\)\s*\? flashSearchAnswer\(/u)
  assert.match(stream, /flashSearchTurn\(routedBody\)\s*\? await flashSearchAnswer\(/u)
  assert.match(readFileSync("app/api/ai/chat/route.ts", "utf8"), /flashGoogleIntent\(prompt\)[\s\S]*?return handleFlashJsonChat\(request\)/u)
  assert.match(stream, /const ledger = flash \|\| answer\.provider === FLASH_GOOGLE_SEARCH_PROVIDER/u)
  assert.match(readFileSync("../../../.env.example", "utf8"), /^MALIK_FLASH_GOOGLE_SEARCH=0$/mu)
})
