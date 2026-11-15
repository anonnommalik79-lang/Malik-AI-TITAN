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

const KEY = "AIzaTESTKEYFLASHAAAAAAAAAAAAAAAAAAAAAA"
const env = { GEMINI_API_KEY: KEY, MALIK_FLASH_GOOGLE_SEARCH: "1" }
const sse = frames => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder()
    for (const frame of frames) controller.enqueue(encoder.encode("data: " + JSON.stringify(frame) + "\r\n\r\n"))
    controller.close()
  },
}), { status: 200, headers: { "content-type": "text/event-stream" } })
const text = value => ({ candidates: [{ content: { role: "model", parts: [{ text: value }] } }] })
const finish = grounding => ({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP", ...(grounding ? { groundingMetadata: grounding } : {}) }],
  usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, totalTokenCount: 52 }, modelVersion: "gemini-3.8-flash-001" })
const models = () => new Response(JSON.stringify({ models: [{ name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 })

function google(answer) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const href = String(url)
    assert.ok(!href.includes("key="), "the key never goes in the URL")
    if (href.includes("/v1beta/models?")) return models()
    const body = JSON.parse(init.body)
    calls.push(body)
    return answer(body, calls)
  }
  return { fetchImpl, calls }
}

test("Google Search runs only when the owner turned it on and a Gemini key exists", () => {
  assert.equal(search.flashGoogleSearchEnabled({ GEMINI_API_KEY: KEY }), false, "off by default: grounding is billed")
  assert.equal(search.flashGoogleSearchEnabled({ MALIK_FLASH_GOOGLE_SEARCH: "1" }), false, "no key, no lane")
  assert.equal(search.flashGoogleSearchEnabled(env), true)
})

test("text questions use Google Search; code, images, video and attachments keep their MALIKII paths", () => {
  for (const prompt of ["Какой сейчас курс доллара?", "Hello", "Кто президент Казахстана?", "Объясни, как работает REST API"])
    assert.equal(search.flashGoogleSearchEligible(prompt), true, prompt)
  for (const prompt of ["Build a production-ready web application with a PostgreSQL backend", "Debug this repository", "Сгенерируй изображение спорткара", "Сгенерируй видео заката"])
    assert.equal(search.flashGoogleSearchEligible(prompt), false, prompt)
  assert.equal(search.flashGoogleSearchEligible("Что на фото?", { attachments: [{ kind: "image" }] }), false)
  assert.equal(search.flashGoogleSearchEligible("Сделай сайт кофейни", { codeOrBuild: true }), false)
  assert.equal(search.flashGoogleSearchEligible("x".repeat(6001)), false)
})

test("the answer streams with Google's own links, under its real provider and model", async t => {
  engine.resetGeminiEngineState()
  t.after(() => engine.resetGeminiEngineState())
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
  assert.equal(answer.model, "gemini-3.8-flash")
  assert.equal(answer.selectedModelId, "malik-flash")
  assert.equal(answer.usedWeb, true)
  assert.deepEqual(answer.sources, [{ url: "https://nationalbank.kz/ru/exchangerates", title: "nationalbank.kz", domain: "nationalbank.kz", provider: "google-gemini-search" }])
  const request = calls[0]
  assert.deepEqual(request.tools, [{ google_search: {} }])
  assert.match(request.systemInstruction.parts[0].text, /Never say you are Google, Gemini or Google AI Mode/)
  assert.match(request.systemInstruction.parts[0].text, /Abdumalik/)
  const prompt = request.contents[0].parts[0].text
  assert.match(prompt, /User: Расскажи про тенге/)
  assert.match(prompt, /The user's message now:\s+А какой курс сегодня\?$/u)
  assert.equal(prompt.match(/А какой курс сегодня\?/gu).length, 1, "the current question is not repeated from history")
})

test("Gemini that cannot answer before any text hands the turn back to MALIKII", async t => {
  engine.resetGeminiEngineState()
  t.after(() => engine.resetGeminiEngineState())
  const { fetchImpl } = google(() => new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid." } }), { status: 403, headers: { "content-type": "application/json" } }))
  await assert.rejects(search.runFlashGoogleSearch({ question: "Hello", body: {}, env, fetchImpl }), error => error instanceof search.FlashSearchUnavailable && error.code === "KEY_REJECTED")
})

test("a stop from the user is a stop, not a fallback", async t => {
  engine.resetGeminiEngineState()
  t.after(() => engine.resetGeminiEngineState())
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(search.runFlashGoogleSearch({ question: "Hello", body: {}, env, signal: controller.signal, fetchImpl: () => assert.fail("fetch after stop") }),
    error => !(error instanceof search.FlashSearchUnavailable))
})

test("the chat routes answer Flash with Google Search and fall back to the native engine", () => {
  const stream = readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(stream, /function flashSearchTurn\(body: any\): boolean \{\s+if \(!flashNativeTurn\(body\) \|\| !flashGoogleSearchEnabled\(\) \|\| skillChatRequest\(body\)\) return false/u)
  assert.match(stream, /: !project && flashSearchTurn\(body\)\s+\? \(async \(\) => \{[\s\S]*?runFlashGoogleSearch\(\{[\s\S]*?if \(!\(error instanceof FlashSearchUnavailable\)\) throw error[\s\S]*?return await getNativeChatAnswer\(\)/u)
  assert.match(stream, /: flashSearchTurn\(routedBody\)\s+\? await \(async \(\) => \{[\s\S]*?return await runSelectedAnswer\(routedBody/u)
  assert.match(stream, /const ledger = flash \|\| answer\.provider === FLASH_GOOGLE_SEARCH_PROVIDER/u)
  assert.match(readFileSync("../../../.env.example", "utf8"), /^MALIK_FLASH_GOOGLE_SEARCH=0$/mu)
})
