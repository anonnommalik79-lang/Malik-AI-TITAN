// Executes production stream/recovery helpers. The injected transport is a
// deterministic fixture, NOT evidence of a live model, WorkOS or cloud service.
import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { chatCompletionError, MAX_CHAT_RESULT_CHARS, MAX_CHAT_SSE_FRAME_CHARS, mergeChatStreamText, parseChatSseFrame } from "../lib/ai/chat-stream-contract.ts"
import { fetchRecoverableChat } from "../lib/ai/chat-stream-recovery.ts"

let checks = 0
async function check(label, run) { await run(); checks++; console.log(`PASS ${label}`) }
const event = (type, payload) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
const frame = (type, payload = {}) => event(type, { type, ...payload })
const response = (body, headers = {}) => new Response(body, { headers: { "content-type": "text/event-stream", ...headers } })
const request = (prompt = "Объясни CUDA") => ({ method: "POST", body: JSON.stringify({ prompt }) })
const TURN = "6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f"
const events = (text) => text.split(/\r?\n\r?\n/).map(parseChatSseFrame).filter(Boolean)
const readText = (text) => events(text).reduce((content, item) => item.type === "content"
  ? mergeChatStreamText(content, String(item.payload.content || ""), item.payload.contentMode) : content, "")

await check("multiline CRLF JSON and header-only event types", () => {
  assert.deepEqual(parseChatSseFrame('event: content\r\ndata: {"content":\r\ndata: "Ответ қазақша 🌍"}\r\n'),
    { type: "content", payload: { content: "Ответ қазақша 🌍" } })
  for (const value of [": heartbeat", "data: null", "data: []", "data: 1", "data: [DONE]", "data: invalid"]) assert.equal(parseChatSseFrame(value), null)
})
await check("explicit deltas preserve repeated text; snapshots are idempotent", () => {
  assert.equal(mergeChatStreamText("да", "да", "delta"), "дада")
  assert.equal(mergeChatStreamText("да", "да", "snapshot"), "да")
  assert.equal(mergeChatStreamText("Answer with evidence", "Answer", "snapshot"), "Answer with evidence")
  assert.throws(() => mergeChatStreamText("Private original", "Different answer", "snapshot"), /does not match/)
})
await check("oversized frames and answers fail visibly, rather than growing without a bound", () => {
  assert.throws(() => parseChatSseFrame("x".repeat(MAX_CHAT_SSE_FRAME_CHARS + 1)), /size limit/)
  assert.throws(() => mergeChatStreamText("saved", "x".repeat(MAX_CHAT_RESULT_CHARS), "delta"), /size limit/)
})
await check("failed completions retain a human-readable reason", () => {
  assert.equal(chatCompletionError({ ok: false, error: { message: "No provider capacity" } }), "No provider capacity")
  assert.equal(chatCompletionError({ success: false, message: "Incomplete" }), "Incomplete")
  assert.equal(chatCompletionError({ ok: true }), "")
})
await check("arbitrary byte boundaries preserve UTF-8, event headers and repeated deltas", async () => {
  const wire = event("content", { content: "Әлем 🌍", contentMode: "delta" }) +
    event("content", { content: "Әлем 🌍", contentMode: "delta" }) + event("done", { ok: true })
  const bytes = new TextEncoder().encode(wire)
  let offset = 0
  const body = new ReadableStream({ pull(controller) {
    if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset))
    else controller.close()
  } })
  const result = await fetchRecoverableChat("/api/stream", request(), { fetcher: async () => response(body) })
  const text = await result.text()
  assert.equal(readText(text), "Әлем 🌍Әлем 🌍")
  assert.equal(events(text).filter(e => e.type === "done").length, 1)
})
await check("done-only final content is delivered before completion", async () => {
  const result = await fetchRecoverableChat("/api/stream", request(), { fetcher: async () => response(event("done", { content: "Final answer", ok: true })) })
  const text = await result.text()
  assert.equal(readText(text), "Final answer")
  assert.equal(events(text).at(-1)?.type, "done")
})
await check("empty/failed done is not reported as a successful answer or replayed with a known job", async () => {
  for (const done of [{}, { ok: false, message: "Quota denied" }, { success: false }]) {
    let posts = 0
    const result = await fetchRecoverableChat("/api/stream", request(), { fetcher: async () => {
      posts++; return response(frame("done", done), { "x-malik-background-turn-id": TURN })
    } })
    const text = await result.text()
    assert.equal(posts, 1)
    assert.equal(events(text).some(e => e.type === "done"), false)
    assert.equal(events(text).at(-1)?.type, "error")
  }
})
await check("user abort while waiting for bytes cancels the reader; no repeat", async () => {
  let cancelled = false, posts = 0
  const stop = new AbortController()
  const result = await fetchRecoverableChat("/api/stream", { ...request(), signal: stop.signal }, {
    fetcher: async () => { posts++; return response(new ReadableStream({ cancel() { cancelled = true } })) },
  })
  const text = result.text()
  stop.abort()
  await assert.rejects(text, error => error.name === "AbortError")
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(cancelled, true)
  assert.equal(posts, 1)
})
await check("a divergent saved result never replaces an already received answer", async () => {
  let reads = 0, posts = 0
  const body = new ReadableStream({ pull(controller) {
    if (!reads++) controller.enqueue(new TextEncoder().encode(frame("content", { content: "User's result" })))
    else controller.error(new TypeError("network error"))
  } })
  const result = await fetchRecoverableChat("/api/stream", request(), { recoveryMs: 100, pollMs: 1,
    fetcher: async url => {
      if (url === "/api/stream") { posts++; return response(body, { "x-malik-background-turn-id": TURN }) }
      return Response.json({ turn: { status: "complete", content: "Someone else's result" } })
    },
  })
  const text = await result.text()
  assert.equal(posts, 1)
  assert.equal(readText(text), "User's result")
  assert.doesNotMatch(text, /Someone else's result/)
  assert.equal(events(text).at(-1)?.type, "error")
})
await check("lost response headers are not proof of failed admission: never duplicate the POST", async () => {
  let posts = 0
  await assert.rejects(fetchRecoverableChat("/api/stream", request(), { fetcher: async () => {
    posts++; throw new TypeError("Network lost after the server accepted the POST")
  } }), /Network lost/)
  assert.equal(posts, 1)
})
await check("header deadline never races the original task; its late body is cancelled", async () => {
  let posts = 0, cancelled = false
  await assert.rejects(fetchRecoverableChat("/api/stream", request(), { firstTextMs: 5, fetcher: async () => {
    posts++
    await new Promise(resolve => setTimeout(resolve, 30))
    return response(new ReadableStream({ cancel() { cancelled = true } }))
  } }), /Запрос не отправлен повторно/)
  await new Promise(resolve => setTimeout(resolve, 60))
  assert.equal(posts, 1)
  assert.equal(cancelled, true)
})

const start = performance.now()
let content = ""
for (let index = 0; index < 10_000; index++) content = mergeChatStreamText(content, "word ", "delta")
console.log(`PERF diagnostic: 10,000 in-process deltas / ${content.length} chars / ${(performance.now() - start).toFixed(1)} ms; not a production latency benchmark`)
console.log(`${checks}/${checks} production-contract checks passed; transport fixtures only`)
