// MalikLLM MAX engine: lanes race, the first to write wins and streams, dead
// lanes are rested, a dropped answer is finished by another lane, and every
// provider's stream format is read. Providers are simulated; no network.
//
//   npm run test:max

import assert from "node:assert/strict"

const root = new URL("..", import.meta.url).pathname
const engine = await import(`${root}lib/server/malik-max-engine.ts`)
const god = await import(`${root}lib/ai/answer-budget.ts`)

let failures = 0
let count = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 3).join("\n       ")}`)
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")) }, { once: true })
})

let laneSeq = 0
function lane(name, { protocol = "openai", power = 80, vision = false } = {}) {
  laneSeq += 1
  return {
    id: `test:${name}#${laneSeq}`,
    provider: `test-${protocol}`,
    providerModel: name,
    label: name,
    protocol,
    keyIndex: 0,
    key: "k",
    def: {
      id: `max:test:${name}`,
      label: name,
      description: "test",
      tier: "free",
      provider: "openai",
      providerModel: name,
      capabilities: vision ? ["text", "vision"] : ["text"],
      brand: "router",
      hidden: true,
    },
    direct: { url: `https://fake.test/${name}`, outputCap: 16_000 },
    power,
    vision,
  }
}

function sse(lines, { delay = 5, failAfter, signal } = {}) {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    async pull(controller) {
      try {
        if (failAfter !== undefined && index === failAfter) throw new Error("connection reset")
        if (index >= lines.length) return controller.close()
        await sleep(delay, signal)
        controller.enqueue(encoder.encode(`${lines[index]}\n\n`))
        index += 1
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

const openaiChunk = (text, finish) => `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: finish || null }] })}`
const words = (text) => text.match(/\S+\s*/g)

/** A fake provider: the last path segment says how it behaves. */
function makeFetcher(log = []) {
  return async (url, init) => {
    const name = new URL(url).pathname.slice(1)
    const signal = init.signal
    const body = JSON.parse(init.body)
    log.push({ name, body })
    const stream = (lines, options = {}) => new Response(sse(lines, { ...options, signal }), { status: 200, headers: { "content-type": "text/event-stream" } })
    if (name.startsWith("slow")) {
      await sleep(1500, signal)
      return stream([...words("Slow lane answer.").map((w) => openaiChunk(w)), openaiChunk("", "stop"), "data: [DONE]"])
    }
    if (name.startsWith("fast")) return stream([...words("Fast lane wins the race and writes the whole answer.").map((w) => openaiChunk(w)), openaiChunk("", "stop"), "data: [DONE]"])
    if (name.startsWith("missing")) return new Response(JSON.stringify({ error: { message: "The model `x` does not exist" } }), { status: 404, headers: { "content-type": "application/json" } })
    if (name.startsWith("limited")) return new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "30" } })
    if (name.startsWith("cut")) return stream(words("First half of a long answer that stops right").map((w) => openaiChunk(w)), { failAfter: 8 })
    if (name.startsWith("finisher")) {
      const prompt = JSON.stringify(body.messages)
      const text = /CURRENT ANSWER TAIL/.test(prompt) ? "stops right here and then the answer is complete." : "Finisher original answer."
      return stream([...words(text).map((w) => openaiChunk(w)), openaiChunk("", "stop")])
    }
    if (name.startsWith("long")) {
      const prompt = JSON.stringify(body.messages)
      if (/CURRENT ANSWER TAIL/.test(prompt)) return stream([...words("Part two ends the answer.").map((w) => openaiChunk(w)), openaiChunk("", "stop")])
      return stream([...words("Part one of a very long answer. ").map((w) => openaiChunk(w)), openaiChunk("", "length")])
    }
    if (name.startsWith("think")) return stream([openaiChunk("<thi"), openaiChunk("nk>hidden plan</th"), openaiChunk("ink>Visible "), openaiChunk("answer only."), openaiChunk("", "stop")])
    if (name.startsWith("quota")) return stream([openaiChunk("Insufficient balance: please topup your account to continue using this model."), openaiChunk("", "stop")])
    if (name.startsWith("json")) return new Response(JSON.stringify({ choices: [{ message: { content: "Plain JSON answer from a lane that does not stream." }, finish_reason: "stop" }] }), { status: 200, headers: { "content-type": "application/json" } })
    if (name.startsWith("gemini")) return stream([
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }] } }] })}`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemini streamed " }] } }] })}`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "this answer." }] }, finishReason: "STOP" }] })}`,
    ])
    if (name.startsWith("claude")) return stream([
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start" })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Claude streamed " } })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "this answer." } })}`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}`,
    ])
    if (name.startsWith("silent")) {
      await sleep(60_000, signal)
      return stream([])
    }
    return new Response("unknown", { status: 500 })
  }
}

const raceTiming = { hedgeMs: 250, firstTokenMs: 4_000, firstDeadlineMs: 6_000, idleMs: 3_000, totalMs: 20_000 }
const call = { prompt: "Explain something", systemPrompt: "Be helpful.", maxTokens: 800, codeMode: false, fastMode: false }

await check("the first lane to write wins; a slower stronger lane is cancelled, not blamed", async () => {
  const slow = lane("slow-strong", { power: 95 })
  const fast = lane("fast-weaker", { power: 70 })
  let text = ""
  const result = await engine.raceLanes({ lanes: [slow, fast], call, onToken: (chunk) => { text += chunk }, minFlush: 8, fetcher: makeFetcher(), ...raceTiming })
  assert.equal(result.lane.id, fast.id)
  assert.match(text, /^Fast lane wins the race/)
  assert.equal(text, result.content)
  const status = await engine.maxLaneStatus().catch(() => [])
  assert.ok(Array.isArray(status))
})

await check("an unknown model is rested for an hour and the next lane answers at once", async () => {
  const missing = lane("missing-model", { power: 99 })
  const fast = lane("fast-backup")
  const started = Date.now()
  const result = await engine.raceLanes({ lanes: [missing, fast], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(), ...raceTiming, hedgeMs: 5_000 })
  assert.equal(result.lane.id, fast.id)
  assert.ok(Date.now() - started < 2_000, "must not wait for the hedge timer after a hard failure")
  // Rested: a second race skips it without a request.
  const log = []
  await engine.raceLanes({ lanes: [missing, fast], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(log), ...raceTiming })
  assert.ok(!log.some((item) => item.name === "missing-model"), "rested lane was called again")
})

await check("a rate-limited lane rests and another lane answers", async () => {
  const limited = lane("limited-lane", { power: 99 })
  const fast = lane("fast-after-limit")
  const result = await engine.raceLanes({ lanes: [limited, fast], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(), ...raceTiming })
  assert.equal(result.lane.id, fast.id)
})

await check("<think> blocks never reach the chat, even split across chunks", async () => {
  let text = ""
  const result = await engine.raceLanes({ lanes: [lane("think-lane")], call, onToken: (chunk) => { text += chunk }, minFlush: 4, fetcher: makeFetcher(), ...raceTiming })
  assert.equal(text, "Visible answer only.")
  assert.equal(result.content, "Visible answer only.")
})

await check("a quota notice returned as text is not shown as an answer", async () => {
  let text = ""
  const result = await engine.raceLanes({ lanes: [lane("quota-lane", { power: 99 }), lane("fast-after-quota")], call, onToken: (chunk) => { text += chunk }, minFlush: 8, fetcher: makeFetcher(), ...raceTiming })
  assert.match(result.lane.id, /fast-after-quota/)
  assert.doesNotMatch(text, /topup/i)
})

await check("non-streaming JSON, Gemini and Claude streams are all read", async () => {
  for (const [name, protocol, expected] of [
    ["json-lane", "openai", "Plain JSON answer from a lane that does not stream."],
    ["gemini-lane", "google", "Gemini streamed this answer."],
    ["claude-lane", "anthropic", "Claude streamed this answer."],
  ]) {
    let text = ""
    await engine.raceLanes({ lanes: [lane(name, { protocol })], call, onToken: (chunk) => { text += chunk }, minFlush: 4, fetcher: makeFetcher(), ...raceTiming })
    assert.equal(text, expected, name)
  }
})

await check("a lane that never writes is dropped after its first-token time", async () => {
  const started = Date.now()
  const result = await engine.raceLanes({ lanes: [lane("silent-lane", { power: 99 }), lane("fast-after-silence")], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(), ...raceTiming, hedgeMs: 60_000, firstTokenMs: 400 })
  assert.match(result.lane.id, /fast-after-silence/)
  assert.ok(Date.now() - started < 3_000)
})

await check("when every lane fails the error is clear and quick", async () => {
  await assert.rejects(
    engine.raceLanes({ lanes: [lane("missing-a"), lane("missing-b")], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(), ...raceTiming }),
    (error) => error.code === "MAX_ALL_LANES_BUSY" && /заняты/.test(error.message),
  )
})

await check("an answer cut off mid-stream is finished by another lane without repeating", async () => {
  let text = ""
  const result = await engine.runMalikMax(
    { prompt: "Расскажи подробно историю интернета и его архитектуру", systemPrompt: "Be helpful.", maxTokens: 2_000, onToken: (chunk) => { text += chunk } },
    { fetcher: makeFetcher(), lanes: [lane("cut-lane", { power: 99 }), lane("finisher-lane")] },
  )
  assert.equal(text, result.content)
  assert.match(text, /^First half of a long answer/)
  assert.match(text, /answer is complete\.$/)
  assert.doesNotMatch(text, /Finisher original answer/)
  assert.equal(result.selectedModelId, "malik-max")
})

await check("an answer stopped by its output limit is continued to the end", async () => {
  let text = ""
  await engine.runMalikMax(
    { prompt: "Напиши очень длинный подробный рассказ о космосе", systemPrompt: "Be helpful.", maxTokens: 6_000, onToken: (chunk) => { text += chunk } },
    { fetcher: makeFetcher(), lanes: [lane("long-lane")] },
  )
  assert.match(text, /^Part one of a very long answer\./)
  assert.match(text, /Part two ends the answer\.$/)
})

await check("every key of every provider becomes a lane, strongest first", async () => {
  const saved = { ...process.env }
  Object.assign(process.env, {
    XKIRO_API_KEY_1: "x1", XKIRO_API_KEY_2: "x2", GROQ_API_KEY: "g", OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a",
    GOOGLE_AI_POOL_API_KEY: "", GEMINI_API_KEY: "", GOOGLE_GENERATIVE_AI_API_KEY: "",
  })
  try {
    const lanes = await engine.buildMaxLanes({ prompt: "Расскажи о чёрных дырах", codeMode: false, fastMode: false, needsVision: false })
    const xkiro = lanes.filter((item) => item.provider === "xkiro" && item.providerModel === "qwen/qwen3.8-max:free")
    assert.deepEqual(xkiro.map((item) => item.id.split("#")[1]).sort(), ["1", "2"], "both xKiro keys must be lanes")
    assert.ok(lanes.some((item) => item.provider === "anthropic"), "Anthropic key must join MAX")
    assert.ok(lanes.some((item) => item.provider === "openai"), "OpenAI key must join MAX")
    assert.ok(lanes.some((item) => item.provider === "groq"), "Groq models must join MAX")
    assert.ok(!lanes.some((item) => item.def.access === "catalog"), "pay-as-you-go catalogue routes stay out of MAX")
    assert.ok(lanes[0].power >= 88, `the first lane should be a frontier model, got ${lanes[0].id}`)
    const vision = await engine.buildMaxLanes({ prompt: "что на фото", codeMode: false, fastMode: false, needsVision: true })
    assert.ok(vision.length && vision.every((item) => item.vision), "a photo only goes to lanes that can see")
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

await check("streams are parsed line by line for all three protocols", () => {
  assert.equal(engine.parseStreamLine("openai", openaiChunk("hi")).text, "hi")
  assert.equal(engine.parseStreamLine("openai", 'data: {"choices":[{"delta":{"reasoning_content":"x"}}]}').activity, true)
  assert.equal(engine.parseStreamLine("openai", "data: [DONE]"), null)
  assert.equal(engine.parseStreamLine("google", `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "a", thought: true }, { text: "b" }] }, finishReason: "MAX_TOKENS" }] })}`).text, "b")
  assert.equal(engine.parseStreamLine("anthropic", `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "max_tokens" } })}`).finishReason, "max_tokens")
})

await check("the think filter keeps ordinary '<' in code", () => {
  const filter = new engine.ThinkFilter()
  const out = filter.push("if (a <") + filter.push(" b) return <table>") + filter.flush()
  assert.equal(out, "if (a < b) return <table>")
})

await check("continuations do not repeat the end of the answer", () => {
  assert.equal(engine.trimOverlap("the quick brown fox jumps over", "fox jumps over the lazy dog"), " the lazy dog")
  assert.equal(engine.trimOverlap("abc", "def"), "def")
})

await check("a structured stress-test answer is not considered finished before its last required section", () => {
  const prompt = [
    "Выполни все пункты.",
    "1. ЛОГИКА",
    "2. ТЕКСТ",
    "3. КОД",
    "4. DEBUG",
    "5. АРХИТЕКТУРА",
    "6. IMAGE",
    "7. VISION",
    "8. ФИНАЛ",
    "В самом конце выведи:",
    "TEST COMPLETE",
  ].join("\n")
  const partial = "1. ЛОГИКА\nготово\n\n2. ТЕКСТ\nготово\n\n3. КОД\nготово"
  assert.equal(engine.structuredAnswerNeedsMore(prompt, partial), true)
  const complete = [
    "1. ЛОГИКА", "готово",
    "2. ТЕКСТ", "готово",
    "3. КОД", "готово",
    "4. DEBUG", "готово",
    "5. АРХИТЕКТУРА", "готово",
    "6. IMAGE", "готово",
    "7. VISION", "готово",
    "8. ФИНАЛ", "TEST COMPLETE",
  ].join("\n")
  assert.equal(engine.structuredAnswerNeedsMore(prompt, complete), false)
})

await check("the strongest Google models a key can call are chosen, newest and Pro first", () => {
  const picked = engine.strongestGoogleModels([
    "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview", "gemini-3-flash-preview",
    "gemini-flash-lite-latest", "text-embedding-004", "gemini-2.5-flash-image", "gemini-2.5-flash-preview-tts", "imagen-4",
  ])
  assert.deepEqual(picked, ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"])
})

await check("lane power puts frontier models above small ones", () => {
  assert.ok(engine.lanePower("claude-sonnet-4-5") > engine.lanePower("gpt-oss-20b"))
  assert.ok(engine.lanePower("gemini-3.6-flash") > engine.lanePower("gemma-4-26b-a4b-it"))
  assert.ok(engine.lanePower("ZhipuAI/GLM-5.2") > engine.lanePower("@cf/meta/llama-3.1-8b-instruct-fast"))
})

{
  await check("an answer may be as long as the user asks, within the daily allowance", () => {
    assert.equal(god.answerBudget({ maxTokens: 900 }, "Напиши ответ примерно на 4000 токенов", 3_500), 4_600)
    assert.equal(god.answerBudget({ maxTokens: 900 }, "Напиши эссе на 2000 слов", 3_500), 3_600)
    assert.equal(god.answerBudget({ maxTokens: 900 }, "привет", 700), 900)
    assert.equal(god.answerBudget({ maxTokens: 900, maxTokensCap: 1_200 }, "на 4000 токенов", 3_500), 1_200)
  })
}

await check("a cancelled request stops every lane and blames none", async () => {
  const slow = lane("slow-cancel", { power: 95 })
  const silent = lane("silent-cancel", { power: 90 })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 120)
  const started = Date.now()
  await assert.rejects(
    engine.raceLanes({ lanes: [slow, silent], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(), ...raceTiming, signal: controller.signal }),
    (error) => error.name === "AbortError",
  )
  assert.ok(Date.now() - started < 1_000, "stopped at once")
  const status = await engine.maxLaneStatus().catch(() => [])
  assert.equal(status.filter((row) => /cancel/.test(row.id) && row.restingMs > 0).length, 0)
  // An already-aborted signal never starts a lane.
  const log = []
  const done = new AbortController()
  done.abort()
  await assert.rejects(engine.raceLanes({ lanes: [lane("fast-never")], call, onToken: () => {}, minFlush: 8, fetcher: makeFetcher(log), ...raceTiming, signal: done.signal }))
  assert.equal(log.length, 0)
})

await check("retrieved programming excerpts do not turn an event question into a coding job", async () => {
  const log = []
  const result = await engine.runMalikMax({
    prompt: "Question: Дай спикеров Digital Bridge\nWeb sources:\n" + "Python JavaScript code examples. ".repeat(200),
    taskPrompt: "Дай спикеров Digital Bridge",
    systemPrompt: "Use the sources.",
    maxTokens: 8_000,
  }, { lanes: [lane("fast-event")], fetcher: makeFetcher(log) })
  assert.match(result.content, /Fast lane wins/)
  assert.equal(log[0].body.max_tokens, 1_500)
  assert.match(JSON.stringify(log[0].body.messages), /Python JavaScript/)
})

await check("short comparisons and how-to questions use responsive chat lanes", async () => {
  for (const prompt of ["Сравни iPhone 16 Pro Max и Samsung S24 Ultra", "Как включить вибрацию на iPhone? Объясни пошагово"]) {
    const log = []
    await engine.runMalikMax({ prompt, systemPrompt: "Answer directly.", maxTokens: 4000 }, { lanes: [lane("fast-guide")], fetcher: makeFetcher(log) })
    assert.equal(log[0].body.max_tokens, 1500)
  }
})

await check("a fast comparison stays responsive but is not told to be brief", async () => {
  const log = []
  await engine.runMalikMax({ prompt: "Сравни iPhone 16 Pro Max и Samsung S24 Ultra", systemPrompt: "Answer directly.", maxTokens: 4000 }, { lanes: [lane("fast-shape")], fetcher: makeFetcher(log) })
  const system = JSON.stringify(log[0].body.messages?.[0] ?? log[0].body.system ?? "")
  assert.match(system, /FAST CHAT MODE/)
  assert.match(system, /HEAD-TO-HEAD contract above in full/)
  assert.doesNotMatch(system, /Keep the final answer concise/)
  const small = []
  await engine.runMalikMax({ prompt: "привет, как дела?", systemPrompt: "Answer directly.", maxTokens: 4000 }, { lanes: [lane("fast-small")], fetcher: makeFetcher(small) })
  assert.match(JSON.stringify(small[0].body.messages?.[0] ?? small[0].body.system ?? ""), /Keep the final answer concise/)
})

console.log(`\n${count - failures}/${count} checks passed`)
if (failures) process.exit(1)
