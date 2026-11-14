import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader()
const flash = load("lib/server/malik-flash-browser-bridge.ts")
const { isFlashCodingRequest, flashImageOperation } = load("lib/ai/malik-flash-intent.ts")
const { buildFlashContext, retrieveFlashMessages, asksWhichModelGeneratedImage, flashReceiptTarget } = load("lib/ai/malik-flash-memory.ts")
const representative = [
  ["Hello", false],
  ["Explain how a REST API works", false],
  ["What is the difference between React and Vue?", false],
  ["Write a guide about Python performance", false],
  ["Подробно проанализируй рынок и составь план на 20 пунктов", false],
  ["Create an image for my website", false],
  ["Build a production-ready web application with a PostgreSQL backend", true],
  ["Build a complete 3D game", true],
  ["Create an entire website for VOLTER", true],
  ["Debug this repository", true],
  ["Review and improve the code architecture", true],
  ["Реализуй обработчик API и добавь проверку токена", true],
]
const config = {
  NEXT_PUBLIC_MALIK_FLASH_PREVIEW: "1",
  MALIK_FLASH_ISOLATED_WORKER: "1",
  MALIK_FLASH_WORKER_URL: "https://worker.example.test/v1/ask",
  MALIK_FLASH_WORKER_SECRET: "fixture-worker-secret".repeat(3),
}
const body = { userId: "alice@example.test", chatId: "chat-1", question: "Hello" }
const markdown = "# Result\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n\x60\x60\x60js\nconst x = 1\n\x60\x60\x60"
const verified = () => ({ kind: "chat", origin: "google-ai-mode-browser", complete: true, answer: markdown,
  sources: [{ title: "Primary source", url: "https://example.test/source#p1" }, { url: "https://user:pw@example.test" }, { url: "javascript:alert(1)" }],
  timing: { queueMs: 5, firstContentMs: 240, completedMs: 721.2, submitMs: -1 } })

function configure(t) {
  const original = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]))
  Object.assign(process.env, config)
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

test("Flash sends software tasks to MAX and keeps explanations, research and image prompts on their own paths", () => {
  for (const [prompt, expected] of representative) assert.equal(isFlashCodingRequest(prompt), expected, prompt)
  assert.equal(flashImageOperation("Make it blue", true), "edit")
  assert.equal(flashImageOperation("Make it blue", false), null)
  assert.equal(flashImageOperation("Сделай его синим", true), "edit")
  assert.equal(flashImageOperation("Now add the MALIK AI logo", true), "edit")
  assert.equal(flashImageOperation("Что написано на фото?", true), null)
})

test("MALIKII retrieves an older, completed matching turn and prepares bounded cited excerpts", () => {
  const older = { id: "1", role: "user", content: "Для запроса VOLTER установили лимит десять фотографий." }
  const messages = [older, { role: "user", content: "Решение: новая версия ждёт ревью." },
    { role: "assistant", isStreaming: true, content: "VOLTER ещё не завершён" },
    ...Array.from({ length: 20 }, (_, index) => ({ role: "assistant", content: "Other answer " + index + " z".repeat(800) }))]
  assert.equal(retrieveFlashMessages(messages, "Какой лимит VOLTER?")[0], older)
  const context = JSON.parse(buildFlashContext(messages, "Какой лимит VOLTER?"))
  assert.equal(context.recentExcerpts.length, 5)
  assert.equal(context.relevantEarlierExcerpts[0].text, older.content)
  assert.ok(JSON.stringify(context).length <= 3600)
  assert.equal(asksWhichModelGeneratedImage("Какая модель сделала первое изображение?"), true)
  assert.equal(flashReceiptTarget("Which generator made the first picture?", ["first", "second"]), "first")
})

test("disabled or malformed worker setup makes no external or local fallback call", async t => {
  configure(t)
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = () => assert.fail("unexpected network call")
  for (const url of ["https://user:secret@worker.example.test/v1/ask", "https://worker.example.test/v1/ask?flag=1", "http://worker.example.test/v1/ask"]) {
    process.env.MALIK_FLASH_WORKER_URL = url
    await assert.rejects(flash.runMalikFlashBrowser(body), { code: "FLASH_WORKER_NOT_READY" })
  }
  process.env.MALIK_FLASH_WORKER_URL = config.MALIK_FLASH_WORKER_URL
  process.env.MALIK_FLASH_ISOLATED_WORKER = "0"
  await assert.rejects(flash.runMalikFlashBrowser(body), { code: "FLASH_WORKER_NOT_READY" })
})

test("text, sources, scope and timing are returned from the correlated worker receipt", async t => {
  configure(t)
  const received = []
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), config.MALIK_FLASH_WORKER_URL)
    assert.equal(request.redirect, "error")
    assert.equal(request.headers.authorization, "Bearer " + config.MALIK_FLASH_WORKER_SECRET)
    const data = JSON.parse(request.body)
    received.push(data)
    assert.equal(data.question, "Hello")
    assert.equal(data.requestId, request.headers["x-request-id"])
    assert.doesNotMatch(request.body, /alice@example|bob@example|chat-1/u)
    return Response.json({ ...verified(), requestId: data.requestId }, { headers: { "x-request-id": data.requestId } })
  }
  const answer = await flash.runMalikFlashBrowser(body)
  await flash.runMalikFlashBrowser({ ...body, chatId: "chat-2" })
  await flash.runMalikFlashBrowser({ ...body, userId: "bob@example.test" })
  await flash.runMalikFlashBrowser({ ...body, isolatedTurn: true, context: "private", requireExisting: true })
  assert.equal(answer.content, markdown)
  assert.equal(answer.provider, "google-ai-mode-browser")
  assert.deepEqual(answer.sources.map(s => s.url), ["https://example.test/source"])
  assert.equal(answer.flashTiming.completedMs, 721)
  assert.equal(answer.flashTiming.submitMs, undefined)
  assert.equal(received[0].userScope, received[1].userScope)
  assert.notEqual(received[0].userScope, received[2].userScope)
  assert.equal(new Set(received.map(item => item.chatScope)).size, 4)
  assert.equal(received.at(-1).context, undefined)
  assert.equal(received.at(-1).requireExisting, false)
})

test("incomplete receipts, false photo success, and wrong provenance fail closed", () => {
  assert.throws(() => flash.readFlashWorkerAnswer({ ...verified(), complete: false }), { code: "FLASH_INCOMPLETE" })
  assert.throws(() => flash.readFlashWorkerAnswer(verified(), true), { code: "FLASH_IMAGE_UNVERIFIED" })
  assert.throws(() => flash.readFlashWorkerAnswer({ ...verified(), origin: "malik-max" }), { code: "FLASH_INCOMPLETE" })
})

test("streaming preserves real deltas and requires an authoritative terminal receipt", async t => {
  configure(t)
  let terminal = true
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (_url, init) => {
    const requestId = init.headers["x-request-id"]
    const frames = [{ type: "delta", text: "# Result", requestId }]
    if (terminal) frames.push({ type: "done", result: verified(), requestId })
    return new Response(frames.map(JSON.stringify).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson", "x-request-id": requestId } })
  }
  const deltas = []
  assert.equal((await flash.runMalikFlashBrowser({ ...body, onText: chunk => deltas.push(chunk) })).content, markdown)
  assert.deepEqual(deltas, ["# Result"])
  terminal = false
  await assert.rejects(flash.runMalikFlashBrowser({ ...body, onText: () => {} }), { code: "FLASH_INCOMPLETE" })
})

test("normal chat endpoints share the Flash handler and preserve existing MAX entitlement checks", () => {
  const stream = readFileSync("app/api/stream/route-impl.ts", "utf8")
  const json = readFileSync("app/api/ai/chat/route.ts", "utf8")
  assert.match(stream, /flashUsesMax && requestedSelection && !canUseMalikModel\("malik-max"/)
  assert.match(stream, /\? \{ \.\.\.requestedSelection, modelId: "malik-max" \}/)
  assert.match(stream, /const settledAnswer = flash\s*\? runFlashChat\([\s\S]*?: getNativeChatAnswer\(\)/u)
  assert.match(json, /if \(selectsMalikFlash\(requestBody\)\) \{[\s\S]*?return handleFlashJsonChat\(request\)/)
})
