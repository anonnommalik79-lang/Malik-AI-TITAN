// Autonomous Company on Gemini: the engine, the stream and the prompts.
//
// Google cannot be reached from a test, so Google is played here by a fetch
// that answers the way the Gemini API documents it: SSE frames of
// GenerateContentResponse, thought parts flagged `thought: true`, errors as
// { error: { code, status, message, details } } with RetryInfo on 429. Every
// branch the real API can take is walked: a key over quota, a retired model,
// a refused setting, thinking that eats the budget, a stream that stalls.
//
//   npm run test:business-gemini

import assert from "node:assert/strict"

const root = new URL("..", import.meta.url).pathname
const engine = await import(`${root}lib/business/gemini-engine.ts`)
const client = await import(`${root}lib/business/agent-client.ts`)
const company = await import(`${root}lib/business/autonomous.ts`)

let failed = 0
let count = 0
async function check(name, fn) {
  count += 1
  engine.resetGeminiEngineState()
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

const KEY_A = "AIzaTESTKEYAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const KEY_B = "AIzaTESTKEYBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const ENV = { GOOGLE_AI_POOL_API_KEY: KEY_A, GEMINI_API_KEY: KEY_B }

const sse = (frames) => new Response(
  new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const frame of frames) controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\r\n\r\n`))
      controller.close()
    },
  }),
  { status: 200, headers: { "content-type": "text/event-stream" } },
)
const text = (value, extra = {}) => ({ candidates: [{ content: { role: "model", parts: [{ text: value }] }, ...extra }] })
const thought = (value) => ({ candidates: [{ content: { role: "model", parts: [{ text: value, thought: true }] } }] })
const finish = (reason = "STOP", extra = {}) => ({ candidates: [{ content: { role: "model", parts: [] }, finishReason: reason, ...extra }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 30, totalTokenCount: 180 }, modelVersion: "gemini-3.8-flash-001" })
const googleError = (status, message, reason, details = []) => new Response(JSON.stringify({ error: { code: status, message, status: reason, details } }), { status, headers: { "content-type": "application/json" } })
const models = (...names) => new Response(JSON.stringify({ models: names.map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent", "countTokens"] })) }), { status: 200 })

/** A scripted Google. `answer(model, key, body)` returns a Response. */
function google({ visible = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-latest"], answer }) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const href = String(url)
    const key = init.headers?.["x-goog-api-key"]
    assert.ok(!href.includes("key="), "the key never goes in the URL")
    if (href.includes("/v1beta/models?")) {
      calls.push({ kind: "list", key })
      return typeof visible === "function" ? visible(key) : models(...visible)
    }
    const model = decodeURIComponent(href.match(/models\/([^:]+):streamGenerateContent/)?.[1] || "")
    assert.ok(href.endsWith(":streamGenerateContent?alt=sse"), `streams with alt=sse: ${href}`)
    const body = JSON.parse(init.body)
    calls.push({ kind: "generate", model, key, body })
    return answer(model, key, body, calls)
  }
  return { fetchImpl, calls }
}

const base = { system: "system", prompt: "prompt", maxOutputTokens: 4_000, env: ENV }

console.log("\nKeys and models")

await check("every Gemini key the server has becomes a lane, each once", () => {
  const keys = engine.geminiKeys({
    GOOGLE_AI_POOL_API_KEY: KEY_A,
    GEMINI_API_KEY: ` ${KEY_A} `,
    GEMINI_API_KEYS: `${KEY_B}, AIzaTESTKEYCCCCCCCCCCCCCCCCCCCCCCCCCCC`,
    MALIK_VOICE_GEMINI_KEY: "short",
  })
  assert.deepEqual(keys.map((key) => key.source), ["GOOGLE_AI_POOL_API_KEY", "GEMINI_API_KEYS#1", "GEMINI_API_KEYS#2"])
  assert.equal(engine.geminiKeys({}).length, 0)
})

await check("the newest Flash the key can see goes first; retired ids are dropped", () => {
  const configured = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"]
  const visible = new Set(["gemini-3.9-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-3.9-flash-image", "gemini-4.0-pro-preview", "text-embedding-005"])
  assert.deepEqual(engine.chainForKey(configured, visible), ["gemini-3.9-flash", "gemini-3.7-flash", "gemini-flash-latest"])
  assert.deepEqual(engine.chainForKey(configured, null), configured, "unknown visibility keeps the configured list")
  assert.deepEqual(engine.chainForKey(configured, new Set(["gemini-5-flash-lite", "gemini-5-pro"])).slice(0, 2), ["gemini-5-pro", "gemini-5-flash-lite"], "renamed ids fall back to the key's own models")
  assert.equal(engine.chainForKey(configured, visible, "gemini-3.7-flash")[0], "gemini-3.7-flash", "a chosen model leads")
  assert.equal(engine.geminiLabel("gemini-3.8-flash"), "Gemini 3.8 Flash")
  assert.equal(engine.geminiLabel("gemini-3.5-flash-lite"), "Gemini 3.5 Flash-Lite")
})

await check("BUSINESS_GEMINI_MODELS overrides the list and rejects junk", () => {
  assert.deepEqual(engine.configuredGeminiModels({ BUSINESS_GEMINI_MODELS: "models/gemini-3.8-flash, ../../etc, gemini-flash-latest" }), ["gemini-3.8-flash", "gemini-flash-latest"])
  assert.equal(engine.configuredGeminiModels({})[0], "gemini-3.8-flash")
})

await check("Google's errors are read the way Google writes them", () => {
  const quota = engine.classifyGeminiFailure(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "38s" }] } }, null, { thinking: true, search: false })
  assert.equal(quota.code, "QUOTA")
  assert.equal(quota.retryAfterMs, 38_000)
  assert.equal(engine.classifyGeminiFailure(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }, null, { thinking: true, search: false }).code, "KEY_REJECTED")
  assert.equal(engine.classifyGeminiFailure(403, { error: { status: "PERMISSION_DENIED", message: "Generative Language API has not been used in project" } }, null, { thinking: false, search: false }).code, "KEY_REJECTED")
  assert.equal(engine.classifyGeminiFailure(404, { error: { status: "NOT_FOUND", message: "models/gemini-9 is not found" } }, null, { thinking: true, search: false }).code, "MODEL_MISSING")
  assert.equal(engine.classifyGeminiFailure(400, { error: { status: "INVALID_ARGUMENT", message: "Unknown name \"thinkingConfig\"" } }, null, { thinking: true, search: false }).feature, "thinking")
  assert.equal(engine.classifyGeminiFailure(400, { error: { status: "INVALID_ARGUMENT", message: "Search Grounding is not supported." } }, null, { thinking: true, search: true }).feature, "search")
  assert.equal(engine.classifyGeminiFailure(503, { error: { status: "UNAVAILABLE", message: "The model is overloaded." } }, null, { thinking: true, search: false }).code, "UNAVAILABLE")
})

console.log("\nStreaming")

await check("an answer streams: thoughts first, then text, with usage and the model", async () => {
  const { fetchImpl, calls } = google({
    answer: () => sse([thought("**Разбираю рынок**\n\nСмотрю на спрос."), text("## Решение\n"), text("Строим кофейню."), finish()]),
  })
  const events = []
  const result = await engine.runGemini({ ...base, fetchImpl, onEvent: (event) => events.push(event) })
  assert.equal(result.content, "## Решение\nСтроим кофейню.")
  assert.equal(result.model, "gemini-3.8-flash")
  assert.equal(result.keySource, "GOOGLE_AI_POOL_API_KEY")
  assert.equal(result.usage.totalTokens, 180)
  assert.equal(result.modelVersion, "gemini-3.8-flash-001")
  assert.deepEqual(events.map((event) => event.type), ["attempt", "thought", "delta", "delta"])
  const request = calls.find((call) => call.kind === "generate").body
  assert.equal(request.systemInstruction.parts[0].text, "system")
  assert.equal(request.contents[0].role, "user")
  assert.equal(request.generationConfig.thinkingConfig.includeThoughts, true)
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "low", "short thinking by default: the wait is the demo")
  assert.equal(result.thinkingLevel, "low")
  assert.ok(result.timing.totalMs >= 0 && result.timing.firstTextMs >= 0 && result.timing.discoveryMs >= 0)
  assert.ok(result.timing.firstThoughtMs <= result.timing.firstTextMs, "thoughts arrive before the answer")
  assert.equal(request.generationConfig.maxOutputTokens, 4_000)
  assert.equal(request.generationConfig.temperature, undefined, "temperature is deprecated for Gemini 3.x and not sent")
  assert.equal(request.tools, undefined, "no search unless asked")
})

await check("a key over its quota hands the same model to the next key", async () => {
  const { fetchImpl, calls } = google({
    answer: (model, key) => key === KEY_A
      ? googleError(429, "Resource has been exhausted", "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" }])
      : sse([text("Ответ со второго ключа"), finish()]),
  })
  const result = await engine.runGemini({ ...base, fetchImpl })
  assert.equal(result.keySource, "GEMINI_API_KEY")
  assert.equal(result.model, "gemini-3.8-flash", "best model on another key before a weaker model")
  // The spent key is cooling: the next call does not knock on it again.
  await engine.runGemini({ ...base, fetchImpl })
  const generates = calls.filter((call) => call.kind === "generate")
  assert.equal(generates.filter((call) => call.key === KEY_A).length, 1)
})

await check("when every lane is over quota the error says when to come back", async () => {
  const { fetchImpl } = google({
    answer: () => googleError(429, "Quota exceeded", "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" }]),
  })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl }), (error) => {
    assert.equal(error.code, "QUOTA")
    assert.equal(error.retryAfterMs, 17_000)
    assert.match(error.message, /через 17 с/)
    return true
  })
})

await check("quota on some lanes and an overload on the others is still reported as a wait", async () => {
  const { fetchImpl } = google({
    answer: (model, key) => key === KEY_A
      ? googleError(503, "The model is overloaded.", "UNAVAILABLE")
      : googleError(429, "Quota exceeded", "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }]),
  })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl }), (error) => error.code === "QUOTA" && error.retryAfterMs === 12_000)
})

await check("a retired model is skipped for the next one", async () => {
  const { fetchImpl } = google({
    visible: () => new Response("{}", { status: 500 }),
    answer: (model) => model === "gemini-3.8-flash"
      ? googleError(404, "models/gemini-3.8-flash is not found for API version v1beta", "NOT_FOUND")
      : sse([text(`Ответ ${model}`), finish()]),
  })
  const result = await engine.runGemini({ ...base, fetchImpl })
  assert.equal(result.model, "gemini-3.7-flash")
})

await check("a refused thinking setting is peeled off layer by layer and the same model answers", async () => {
  const { fetchImpl, calls } = google({
    answer: (model, key, body) => body.generationConfig.thinkingConfig
      ? googleError(400, "Invalid JSON payload received. Unknown name \"thinkingConfig\"", "INVALID_ARGUMENT")
      : sse([text("Без мыслей, но ответ"), finish()]),
  })
  const result = await engine.runGemini({ ...base, fetchImpl })
  assert.equal(result.model, "gemini-3.8-flash")
  const sent = calls.filter((call) => call.kind === "generate").map((call) => call.body.generationConfig.thinkingConfig)
  assert.deepEqual(sent, [{ includeThoughts: true, thinkingLevel: "low" }, { includeThoughts: true }, undefined])
  assert.equal(result.thinkingLevel, undefined)
})

await check("an unknown thinking level is dropped but the live thoughts stay", async () => {
  const { fetchImpl, calls } = google({
    answer: (model, key, body) => body.generationConfig.thinkingConfig?.thinkingLevel
      ? googleError(400, "Invalid value at 'generation_config.thinking_config.thinking_level'", "INVALID_ARGUMENT")
      : sse([thought("**Думаю**"), text("Ответ"), finish()]),
  })
  const events = []
  const result = await engine.runGemini({ ...base, fetchImpl, onEvent: (event) => events.push(event.type) })
  assert.equal(result.content, "Ответ")
  assert.ok(events.includes("thought"))
  // Remembered: the next call does not send the level again.
  await engine.runGemini({ ...base, fetchImpl })
  const last = calls.filter((call) => call.kind === "generate").at(-1).body.generationConfig.thinkingConfig
  assert.deepEqual(last, { includeThoughts: true })
})

await check("the thinking level can be raised or left to the model from the environment", async () => {
  assert.equal(engine.resolveThinkingLevel(undefined, {}), "low")
  assert.equal(engine.resolveThinkingLevel(undefined, { BUSINESS_GEMINI_THINKING: "HIGH" }), "high")
  assert.equal(engine.resolveThinkingLevel(undefined, { BUSINESS_GEMINI_THINKING: "default" }), undefined)
  const { fetchImpl, calls } = google({ answer: () => sse([text("ok"), finish()]) })
  await engine.runGemini({ ...base, fetchImpl, env: { ...ENV, BUSINESS_GEMINI_THINKING: "default" } })
  assert.deepEqual(calls.find((call) => call.kind === "generate").body.generationConfig.thinkingConfig, { includeThoughts: true })
})

await check("a key whose model list hangs slows the first call only", async () => {
  let lists = 0
  const { fetchImpl } = google({
    visible: (key) => {
      lists += 1
      return key === KEY_A ? new Promise(() => {}) : models("gemini-3.8-flash")
    },
    answer: () => sse([text("ok"), finish()]),
  })
  const first = await engine.runGemini({ ...base, fetchImpl })
  assert.ok(first.timing.discoveryMs >= 4_500, `first ${first.timing.discoveryMs}`)
  const second = await engine.runGemini({ ...base, fetchImpl })
  assert.ok(second.timing.discoveryMs < 500, `second ${second.timing.discoveryMs}`)
  assert.equal(lists, 2)
})

await check("Research searches Google, shows the links, and does without search when refused", async () => {
  const grounded = google({
    answer: (model, key, body) => {
      assert.deepEqual(body.tools, [{ google_search: {} }])
      return sse([text("Спрос растёт."), finish("STOP", { groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.kz/report", title: "example.kz" } }, { web: { uri: "javascript:alert(1)", title: "bad" } }] } })])
    },
  })
  const events = []
  const result = await engine.runGemini({ ...base, search: true, fetchImpl: grounded.fetchImpl, onEvent: (event) => events.push(event) })
  assert.deepEqual(result.sources, [{ title: "example.kz", uri: "https://example.kz/report" }])
  assert.ok(result.searched)
  assert.ok(events.some((event) => event.type === "sources"))

  engine.resetGeminiEngineState()
  const refused = google({
    answer: (model, key, body) => body.tools
      ? googleError(400, "Search Grounding is not supported for this API key tier.", "INVALID_ARGUMENT")
      : sse([text("Без поиска"), finish()]),
  })
  const plain = await engine.runGemini({ ...base, search: true, fetchImpl: refused.fetchImpl })
  assert.equal(plain.content, "Без поиска")
  assert.equal(plain.searched, false)
})

await check("thinking that eats the whole budget is retried with room to answer", async () => {
  const { fetchImpl, calls } = google({
    answer: (model, key, body) => body.generationConfig.maxOutputTokens < 8_000
      ? sse([thought("думаю"), finish("MAX_TOKENS")])
      : sse([text("Теперь хватило места"), finish()]),
  })
  const result = await engine.runGemini({ ...base, fetchImpl })
  assert.equal(result.content, "Теперь хватило места")
  assert.equal(calls.filter((call) => call.kind === "generate").at(-1).body.generationConfig.maxOutputTokens, 8_000)
})

await check("a stream that breaks mid-answer is reset on screen and finished by the next lane", async () => {
  const { fetchImpl } = google({
    answer: (model, key) => key === KEY_A
      ? (() => {
        let pulls = 0
        return new Response(new ReadableStream({
          pull(controller) {
            pulls += 1
            if (pulls === 1) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(text("Половина отв"))}\n\n`))
            else controller.error(new Error("socket hang up"))
          },
        }), { status: 200 })
      })()
      : sse([text("Целый ответ"), finish()]),
  })
  const events = []
  const result = await engine.runGemini({ ...base, fetchImpl, onEvent: (event) => events.push(event.type) })
  assert.equal(result.content, "Целый ответ")
  assert.ok(events.indexOf("reset") > events.indexOf("delta"), "the half answer is withdrawn before the whole one")
})

await check("a stream that goes silent is abandoned, not waited on forever", async () => {
  const { fetchImpl } = google({
    answer: (model, key, body, calls) => key === KEY_A
      ? new Response(new ReadableStream({ start() { /* never sends */ } }), { status: 200 })
      : sse([text("Ответил второй"), finish()]),
  })
  const started = Date.now()
  const result = await engine.runGemini({ ...base, fetchImpl, stallMs: { firstMs: 150, nextMs: 150 } })
  assert.equal(result.content, "Ответил второй")
  assert.ok(Date.now() - started < 3_000)
})

await check("no key, bad keys and blocked prompts each say what happened", async () => {
  await assert.rejects(engine.runGemini({ ...base, env: {} }), (error) => error.code === "NO_KEY")
  const bad = google({ answer: () => googleError(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT") })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl: bad.fetchImpl }), (error) => {
    assert.equal(error.code, "KEY_REJECTED")
    assert.match(error.message, /не принял ключи/)
    assert.ok(!JSON.stringify(error).includes(KEY_A), "the key never appears in an error")
    return true
  })
  engine.resetGeminiEngineState()
  const blocked = google({ answer: () => sse([{ promptFeedback: { blockReason: "SAFETY" } }]) })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl: blocked.fetchImpl }), (error) => error.code === "SAFETY")
  engine.resetGeminiEngineState()
  const empty = google({ answer: () => sse([finish("STOP")]) })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl: empty.fetchImpl }), (error) => error.code === "EMPTY")
})

await check("«Продолжить» right after an overload tries again instead of reading the cooldown back", async () => {
  let overloaded = true
  const { fetchImpl, calls } = google({
    answer: () => overloaded ? googleError(503, "The model is overloaded. Please try again later.", "UNAVAILABLE") : sse([text("Снова работает"), finish()]),
  })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl }), (error) => error.code === "UNAVAILABLE" && /Продолжить/.test(error.message))
  overloaded = false
  const before = calls.filter((call) => call.kind === "generate").length
  const result = await engine.runGemini({ ...base, fetchImpl })
  assert.equal(result.content, "Снова работает")
  assert.equal(calls.filter((call) => call.kind === "generate").length, before + 1)
})

await check("a lane still cooling off its quota is not asked, and the wait is reported", async () => {
  const { fetchImpl, calls } = google({
    answer: () => googleError(429, "Quota exceeded", "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "40s" }]),
  })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl }), (error) => error.code === "QUOTA")
  const before = calls.filter((call) => call.kind === "generate").length
  await assert.rejects(engine.runGemini({ ...base, fetchImpl }), (error) => error.code === "QUOTA" && error.retryAfterMs > 30_000)
  assert.equal(calls.filter((call) => call.kind === "generate").length, before, "Google's wait is respected")
})

await check("stopping the run stops Gemini", async () => {
  const controller = new AbortController()
  const { fetchImpl } = google({
    answer: (model, key, body) => new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(text("Пишу"))}\n\n`))
        setTimeout(() => controller.abort(), 20)
      },
    }), { status: 200 }),
  })
  await assert.rejects(engine.runGemini({ ...base, fetchImpl, signal: controller.signal }), (error) => error.code === "ABORTED")
})

await check("the models each key can see are asked once, then remembered", async () => {
  const { fetchImpl, calls } = google({ answer: () => sse([text("ok"), finish()]) })
  await engine.runGemini({ ...base, fetchImpl })
  await engine.runGemini({ ...base, fetchImpl })
  assert.equal(calls.filter((call) => call.kind === "list").length, 2, "one list per key, not per call")
})

console.log("\nBrowser stream")

await check("the SSE parser survives frames split anywhere and skips keep-alives", () => {
  const seen = []
  const parser = client.createSseParser((event, data) => seen.push([event, data]))
  const wire = ": keep-alive\n\nevent: delta\ndata: {\"text\":\"При\"}\n\nevent: delta\r\ndata: {\"text\":\"вет\"}\r\n\r\nevent: done\ndata: {\"content\":\"Привет\"}\n\n"
  for (let i = 0; i < wire.length; i += 7) parser.push(wire.slice(i, i + 7))
  parser.end()
  assert.deepEqual(seen.map(([event]) => event), ["delta", "delta", "done"])
})

const serverStream = (lines, status = 200) => async () => new Response(new ReadableStream({
  start(controller) {
    for (const line of lines) controller.enqueue(new TextEncoder().encode(line))
    controller.close()
  },
}), { status, headers: { "content-type": "text/event-stream" } })

await check("streamAgent returns the finished document and reports progress on the way", async () => {
  const events = []
  const done = await client.streamAgent({ kind: "agent", agentId: "ceo", brief: "Кофейня" }, {
    fetchImpl: serverStream([
      "event: model\ndata: {\"model\":\"gemini-3.8-flash\",\"label\":\"Gemini 3.8 Flash\"}\n\n",
      "event: thought\ndata: {\"text\":\"**План**\"}\n\n",
      "event: delta\ndata: {\"text\":\"## Решение\"}\n\n",
      "event: done\ndata: {\"content\":\"## Решение\",\"model\":\"gemini-3.8-flash\",\"label\":\"Gemini 3.8 Flash\",\"ms\":1200}\n\n",
    ]),
    onEvent: (event) => events.push(event.type),
  })
  assert.equal(done.content, "## Решение")
  assert.deepEqual(events, ["model", "thought", "delta"])
})

await check("streamAgent turns a server error into words, with the wait", async () => {
  await assert.rejects(client.streamAgent({ kind: "agent", agentId: "ceo", brief: "x" }, {
    fetchImpl: serverStream(["event: error\ndata: {\"code\":\"QUOTA\",\"message\":\"Gemini упёрся в лимит запросов. Можно продолжить через 20 с.\",\"retryAfterMs\":20000}\n\n"]),
  }), (error) => error.code === "QUOTA" && error.retryAfterMs === 20_000 && /лимит/.test(error.message))
  await assert.rejects(client.streamAgent({ kind: "agent", agentId: "ceo", brief: "x" }, {
    fetchImpl: serverStream(["event: delta\ndata: {\"text\":\"обры\"}\n\n"]),
  }), (error) => error.code === "INCOMPLETE")
  await assert.rejects(client.streamAgent({ kind: "agent", agentId: "ceo", brief: "x" }, {
    fetchImpl: async () => new Response(JSON.stringify({ code: "PROMPT_TOO_LONG", message: "Описание и инструкция слишком длинные" }), { status: 400 }),
  }), (error) => error.code === "PROMPT_TOO_LONG" && /слишком длинные/.test(error.message))
})

console.log("\nPrompts")

const agents = company.AUTONOMOUS_AGENTS
const doc = (name) => `## Работа ${name}\n${"Решение и цифры. ".repeat(40)}\n\n## COMPANY STATE\n- Продукт: кофейня у метро`

await check("every agent hands over a real document with its own sections", () => {
  for (const agent of agents) {
    const deliverable = company.AGENT_DELIVERABLES[agent.id]
    assert.ok(deliverable && deliverable.split("\n").length >= 5, `${agent.id} has sections`)
    const prompt = company.companyAgentPrompt(agent, { brief: "Кофейня в Алматы", market: "Общепит", budget: "до 10 млн ₸" }, [])
    assert.ok(prompt.includes(deliverable))
    assert.match(prompt, /Бюджет на запуск: до 10 млн ₸/)
  }
})

await check("the next agent reads the earlier documents in full and in pipeline order", () => {
  const previous = [agents[2], agents[0], agents[1]].map((agent) => ({ agent, content: doc(agent.name) }))
  const prompt = company.companyAgentPrompt(agents[3], { brief: "Кофейня" }, previous.sort((a, b) => agents.indexOf(a.agent) - agents.indexOf(b.agent)))
  const order = ["### CEO", "### Research", "### Coder"].map((head) => prompt.indexOf(head))
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "CEO → Research → Coder")
  assert.ok(prompt.includes("Решение и цифры. ".repeat(40).trim()), "not an excerpt")
})

await check("a huge company still fits: the oldest documents shrink to their handover first", () => {
  const previous = agents.slice(0, 7).map((agent) => ({ agent, content: `${"Очень длинный текст. ".repeat(600)}\n\n## COMPANY STATE\n- Итог ${agent.name}` }))
  const prior = company.priorDocuments(previous)
  assert.ok(prior.length <= 47_000, `${prior.length}`)
  for (const agent of agents.slice(0, 7)) assert.ok(prior.includes(`- Итог ${agent.name}`), `${agent.name} keeps its COMPANY STATE`)
})

await check("only Research is told it can search; everyone is told not to invent numbers", () => {
  const research = company.companySystemPrompt(agents[1], { search: true })
  const ceo = company.companySystemPrompt(agents[0], { search: false })
  assert.match(research, /поиск Google/)
  assert.doesNotMatch(ceo, /поиск Google/)
  for (const system of [research, ceo, company.companySummarySystem()]) {
    assert.match(system, /Не выдумывай статистику/)
    assert.match(system, /Без вступления/)
  }
  const summary = company.companySummaryPrompt({ brief: "Кофейня" }, agents.map((agent) => ({ agent, content: doc(agent.name) })))
  for (const section of ["## Компания", "## Принятые решения", "## Первые 7 дней", "## Три главных риска"]) assert.ok(summary.includes(section))
})

console.log(`\n${count - failed}/${count} passed`)
process.exit(failed ? 1 : 0)
