import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"
import { streamAgent, createSseParser } from "../lib/business/agent-client.ts"
import { readBusinessBody } from "../lib/business/request-body.ts"
import { fetchComputePage, parseComputePage } from "../lib/malik-compute/client.ts"

let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
const question = { kind: "agent", agentId: "ceo", brief: "Тестовая кофейня" }
const frame = (event, data) => new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
const document = { content: "## План\n" + "Документ из контролируемого тестового провайдера. Проверка передачи данных, не бизнес-рекомендация. ".repeat(4), model: "fixture", label: "Fixture", ms: 1 }
const answer = (event, data, open = false, cancelled = () => {}) => async () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(frame(event, data)); if (!open) controller.close() }, cancel: cancelled,
}), { headers: { "content-type": "text/event-stream" } })

await check("pre-cancelled stage never reaches fetch", async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(streamAgent(question, { signal: controller.signal, fetchImpl: () => assert.fail("fetch after cancel") }), { code: "ABORTED" })
})
for (const content of ["", "  ", null, 42, {}]) await check(`empty/malformed done cannot complete a stage: ${JSON.stringify(content)}`, async () => {
  await assert.rejects(streamAgent(question, { fetchImpl: answer("done", { ...document, content }) }), { code: "EMPTY" })
})
await check("terminal document returns without waiting for transport EOF", async () => {
  let cancelled = false
  const result = await streamAgent(question, { fetchImpl: answer("done", document, true, () => { cancelled = true }), stallMs: 100 })
  assert.equal(result.content, document.content); assert.equal(cancelled, true)
})
await check("server failure cancels an otherwise open body", async () => {
  let cancelled = false
  await assert.rejects(streamAgent(question, { fetchImpl: answer("error", { code: "QUOTA", message: "Wait", retryAfterMs: 7000 }, true, () => { cancelled = true }) }), { code: "QUOTA", retryAfterMs: 7000 })
  assert.equal(cancelled, true)
})
await check("cancel closes a hung body even when fetch ignores AbortSignal", async () => {
  const controller = new AbortController()
  let ready
  const started = new Promise((resolve) => { ready = resolve })
  const pending = streamAgent(question, { signal: controller.signal, fetchImpl: async () => {
    ready(); return new Response(new ReadableStream({ start() {} }))
  } })
  await started; controller.abort()
  await assert.rejects(pending, { code: "ABORTED" })
})
await check("idle stream fails with timeout and releases reader", async () => {
  await assert.rejects(streamAgent(question, { stallMs: 5, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) }), { code: "TIMEOUT" })
})
await check("truncated text without done remains incomplete", async () => {
  await assert.rejects(streamAgent(question, { fetchImpl: answer("delta", { text: "Часть документа" }) }), { code: "INCOMPLETE" })
})
await check("huge unterminated SSE frame is bounded", () => {
  assert.throws(() => createSseParser(() => {}).push("x".repeat(1_000_001)), { code: "RESPONSE_TOO_LARGE" })
})
const request = (body, headers = {}) => new Request("https://malik.example/api/business/agent", { method: "POST", headers, body })
for (const body of ["null", "[]", "42", "{", '{"brief":42}', '{"previous":{}}', '{"previous":[{"agentId":"ceo","content":false}]}']) {
  await check(`invalid request rejected: ${body}`, async () => {
    await assert.rejects(readBusinessBody(request(body)))
  })
}
await check("payload limit also works without content-length", async () => {
  await assert.rejects(readBusinessBody(request(JSON.stringify({ brief: "x".repeat(1_000_001) }))), { status: 413 })
})
await check("UTF-8 input and completed-stage context survive parsing", async () => {
  const body = { brief: "Қазақша бизнес", previous: [{ agentId: "ceo", content: "Орысша және English" }] }
  assert.deepEqual(await readBusinessBody(request(JSON.stringify(body))), body)
})

const balance = { mode: "live", guest: true, storage: "local-directory", balance: {
  day: "2026-10-29", resetsAt: "2026-10-30T00:00:00Z", dailyLimit: 1000, used: 6, reserved: 4, remaining: 990,
  usage: { chat: 1, agent: 0, research: 5, image: 0, voice: 0, video: 0, plugin: 0 },
} }
await check("real coherent compute balance accepted", () => assert.equal(parseComputePage(balance), balance))
for (const patch of [{ remaining: -1 }, { remaining: 1000 }, { used: "6" }, { reserved: NaN }, { resetsAt: "broken" }, { usage: { ...balance.balance.usage, chat: 100 } }]) {
  await check(`inconsistent compute balance rejected: ${JSON.stringify(patch)}`, () => assert.throws(() => parseComputePage({ ...balance, balance: { ...balance.balance, ...patch } })))
}
await check("compute authentication error is actionable", async () => {
  await assert.rejects(fetchComputePage(new AbortController().signal, async () => new Response("", { status: 401 })), /Войдите/)
})
await check("cancelled balance cannot be accepted after body decode", async () => {
  const controller = new AbortController()
  await assert.rejects(fetchComputePage(controller.signal, async () => ({ ok: true, json: async () => { controller.abort(); return balance } })), { name: "AbortError" })
})

// Execute the real API route. Only identity/provider/usage are controlled fixtures.
const nativeRequire = createRequire(import.meta.url), cache = new Map()
let pro = true, modelCalls = [], resultQueue = [], customRun
class FixtureEngineError extends Error { constructor(code, message) { super(message); this.code = code; this.trail = [] } }
const stubs = {
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ userId: "fixture-user", plan: pro ? "owner" : "free" }) },
  "@/lib/limits/rate-limit": { checkPromptLength: () => ({ ok: true }), checkUsageLimit: async () => ({ ok: true }) },
  "@/lib/limits/user-plan": { resolveUserTier: () => "fixture" },
  "@/lib/ai/usage": { incrementUsage() {} },
  "@/lib/business/orchestration": { augmentBusinessInput: (_mode, text) => text, ensureAutonomousCompanyState: (_mode, text) => text, businessOutputQuality: () => ({ ok: true }), businessRetryPrompt: (text) => text },
  "@/lib/business/gemini-engine": {
    GeminiEngineError: FixtureEngineError, geminiKeys: () => [], configuredGeminiModels: () => ["fixture"], geminiLabel: () => "Fixture", describeTrail: () => [],
    runGemini: async (input) => { modelCalls.push(input); return customRun ? customRun(input) : resultQueue.shift() || { ...document, finishReason: "STOP", sources: [], attempts: 1 } },
  },
}
function load(file) {
  const absolute = path.resolve(file.endsWith(".ts") ? file : file + ".ts")
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }; cache.set(absolute, box)
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const require = (name) => name in stubs ? stubs[name] : name.startsWith("@/") ? load(name.slice(2)) : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), name)) : nativeRequire(name)
  new Function("require", "module", "exports", code)(require, box, box.exports)
  return box.exports
}
const route = load("app/api/business/agent/route.ts")
await check("all eight stages and summary exchange real documents through client/API boundaries", async () => {
  modelCalls = []
  const previous = []
  customRun = async () => ({ ...document, content: `Stage ${modelCalls.length}\n${document.content}`, finishReason: "STOP", sources: [], attempts: 1 })
  const transport = async (_url, init) => route.POST(new Request("https://malik.example/api/business/agent", init))
  try {
    for (const agentId of ["ceo", "research", "coder", "design", "marketing", "sales", "support", "analyst"]) {
      const result = await streamAgent({ ...question, agentId, previous }, { fetchImpl: transport })
      if (previous.length) assert.ok(modelCalls.at(-1).prompt.includes(previous.at(-1).content.trim()), "prior output lost")
      previous.push({ agentId, content: result.content })
    }
    const result = await streamAgent({ ...question, kind: "summary", previous }, { fetchImpl: transport })
    assert.match(result.content, /Stage 9/)
    assert.equal(modelCalls.length, 9)
  } finally { customRun = undefined }
})
await check("business API rejects null JSON before calling a model", async () => {
  modelCalls = []; assert.equal((await route.POST(request("null"))).status, 400); assert.equal(modelCalls.length, 0)
})
await check("business API retains PRO access checks", async () => {
  pro = false; modelCalls = []
  try { assert.equal((await route.POST(request(JSON.stringify(question)))).status, 402); assert.equal(modelCalls.length, 0) } finally { pro = true }
})
await check("business API refuses cross-site execution", async () => {
  assert.equal((await route.POST(request(JSON.stringify(question), { origin: "https://other.example" }))).status, 403)
})
await check("two truncated model outputs cannot mark a stage done", async () => {
  resultQueue = [0, 1].map(() => ({ ...document, finishReason: "MAX_TOKENS", sources: [], attempts: 1 }))
  const response = await route.POST(request(JSON.stringify(question)))
  const wire = await response.text()
  assert.match(wire, /event: error/); assert.ok(!wire.includes("event: done"))
  assert.match(response.headers.get("cache-control"), /private.*no-store/)
})
await check("cancelling the business response aborts its provider", async () => {
  let providerSignal
  customRun = (input) => new Promise((_resolve, reject) => { providerSignal = input.signal; input.signal.addEventListener("abort", () => reject(new FixtureEngineError("ABORTED", "Stopped")), { once: true }) })
  try {
    const response = await route.POST(request(JSON.stringify(question)))
    const reader = response.body.getReader(); await reader.read(); await reader.cancel()
    assert.equal(providerSignal.aborted, true)
  } finally { customRun = undefined }
})
console.log(`Business/Compute reliability: ${passed}/${passed} PASS; fixtures, no paid model calls`)
