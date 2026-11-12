// MalikLLM MAX answers owner and PRO accounts with Claude. The Anthropic API is
// simulated at the network edge (the SDK's own fetch option); no real calls.
//
//   npm run test:claude-premium

import assert from "node:assert/strict"
import Anthropic from "@anthropic-ai/sdk"

const root = new URL("..", import.meta.url).pathname
const premium = await import(`${root}lib/server/claude-premium.ts`)
const engine = await import(`${root}lib/server/malik-max-engine.ts`)

let failures = 0
let count = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

const KEYS = ["MALIK_MAX_CLAUDE_API_KEY", "MALIK_MAX_CLAUDE_MODEL", "MALIK_MAX_CLAUDE_PLANS", "ANTHROPIC_API_KEY"]
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
function setEnv(values) {
  for (const key of KEYS) delete process.env[key]
  Object.assign(process.env, values)
}

const sseBody = (events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("")
function claudeEvents(text, stop = "end_turn", model = "claude-opus-5-5") {
  return [
    { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 } } },
    ...(text ? [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, 12) } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(12) } },
      { type: "content_block_stop", index: 0 },
    ] : []),
    { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 42 } },
    { type: "message_stop" },
  ]
}
function fakeClaude(respond) {
  const seen = []
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) })
      return respond(seen.length)
    },
  })
  return { client, seen }
}
const okStream = (text, stop) => new Response(sseBody(claudeEvents(text, stop)), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_test" } })

await check("only owner and PRO accounts get Claude, and only with its own key", () => {
  setEnv({})
  assert.equal(premium.claudePremiumAllowed("owner"), false, "no key, no Claude")
  setEnv({ ANTHROPIC_API_KEY: "shared-key" })
  assert.equal(premium.claudePremiumAllowed("owner"), false, "the shared ANTHROPIC_API_KEY never switches MAX to a paid model")
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  for (const plan of ["owner", "pro", "ultra"]) assert.equal(premium.claudePremiumAllowed(plan), true, plan)
  for (const plan of ["free", "guest", undefined]) assert.equal(premium.claudePremiumAllowed(plan), false, String(plan))
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k", MALIK_MAX_CLAUDE_PLANS: "owner" })
  assert.equal(premium.claudePremiumAllowed("owner"), true)
  assert.equal(premium.claudePremiumAllowed("pro"), false)
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k", MALIK_MAX_CLAUDE_PLANS: "off" })
  assert.equal(premium.claudePremiumAllowed("owner"), false)
})

await check("the request is the current API: Opus 5.5, server-side fallback, cached system, no temperature", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  const { client, seen } = fakeClaude(() => okStream("Higgsfield AI оценена в $1,3 млрд."))
  const streamed = []
  const result = await premium.runClaudePremium({
    system: "SYSTEM PROMPT", messages: [{ role: "user", content: "сколько стоит Higgsfield" }],
    maxTokens: 16000, effort: "medium", onText: (delta) => streamed.push(delta),
  }, { client })
  const { body, headers, url } = seen[0]
  assert.match(url, /\/v1\/messages/)
  assert.equal(body.model, premium.CLAUDE_PREMIUM_DEFAULT_MODEL)
  assert.equal(body.model, "claude-opus-5-5")
  assert.equal(body.fallbacks, "default")
  assert.match(headers.get("anthropic-beta") || "", /server-side-fallback-2026-07-01/)
  assert.equal(body.output_config.effort, "medium")
  assert.equal(body.system[0].cache_control.type, "ephemeral")
  assert.equal(body.stream, true)
  assert.equal(body.max_tokens, 16000)
  for (const removed of ["temperature", "top_p", "top_k", "thinking"]) assert.equal(body[removed], undefined, `${removed} is not sent to Opus 5.5`)
  assert.equal(result.text, "Higgsfield AI оценена в $1,3 млрд.")
  assert.equal(streamed.join(""), result.text, "the answer streams as it is written")
  assert.equal(result.refused, false)
})

await check("the model can be changed without code", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k", MALIK_MAX_CLAUDE_MODEL: "claude-sonnet-5-5" })
  const { client, seen } = fakeClaude(() => okStream("ok"))
  await premium.runClaudePremium({ system: "s", messages: [{ role: "user", content: "hi" }], maxTokens: 100, effort: "low" }, { client })
  assert.equal(seen[0].body.model, "claude-sonnet-5-5")
})

await check("chat messages become Claude turns: one system text, images kept, a user turn first", () => {
  const { system, turns } = engine.toClaudeMessages([
    { role: "system", content: "rules one" },
    { role: "assistant", content: "orphan greeting" },
    { role: "system", content: "rules two" },
    { role: "user", content: [{ type: "text", text: "что на фото?" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }, { type: "image_url", image_url: { url: "https://example.com/a.jpg" } }] },
    { role: "assistant", content: "  " },
    { role: "assistant", content: "Кот." },
    { role: "user", content: "а цвет?" },
  ])
  assert.equal(system, "rules one\n\nrules two")
  assert.equal(turns[0].role, "user", "a leading assistant turn is dropped")
  assert.deepEqual(turns[0].content[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } })
  assert.deepEqual(turns[0].content[2], { type: "image", source: { type: "url", url: "https://example.com/a.jpg" } })
  assert.deepEqual(turns.map((turn) => turn.role), ["user", "assistant", "user"], "empty turns are skipped")
})

// ---- inside MAX -----------------------------------------------------------

function freeLane() {
  return {
    id: "test:free#1", provider: "test-openai", providerModel: "free-model", label: "free-model", protocol: "openai", keyIndex: 0, key: "k",
    def: { id: "max:test:free", label: "free", description: "test", tier: "free", provider: "openai", providerModel: "free-model", capabilities: ["text"], brand: "router", hidden: true },
    direct: { url: "https://fake.test/free", outputCap: 16000 }, power: 80, vision: false,
  }
}
const openaiStream = (text) => new Response(
  [JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })].map((line) => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n",
  { status: 200, headers: { "content-type": "text/event-stream" } },
)
async function ask(plan, claude, prompt = "Расскажи подробно, чем отличаются Kling и Higgsfield для рекламы, с выводом.") {
  const calls = { free: 0, claude: 0 }
  const tokens = []
  premium.enterPremiumAccess(plan)
  const result = await engine.runMalikMax(
    { prompt, systemPrompt: "SYSTEM", onToken: (chunk) => tokens.push(chunk), wallMs: 30_000 },
    {
      lanes: [freeLane()],
      fetcher: async () => { calls.free += 1; return openaiStream("Ответ бесплатной модели, полный и законченный.") },
      claude: async (input) => { calls.claude += 1; return claude(input) },
    },
  )
  return { result, calls, streamed: tokens.join("") }
}
const claudeAnswer = (text) => async (input) => {
  input.onText?.(text)
  return { text, model: "claude-opus-5-5", stopReason: "end_turn", refused: false, usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } }
}

await check("a PRO account is answered by Claude; the free pool is not asked", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  const { result, calls, streamed } = await ask("pro", claudeAnswer("Kling сильнее в физике движения, Higgsfield — в пресетах камеры. Вывод: для рекламы с камерой — Higgsfield."))
  assert.equal(calls.claude, 1)
  assert.equal(calls.free, 0)
  assert.equal(result.provider, "anthropic")
  assert.equal(result.model, "claude-opus-5-5")
  assert.equal(result.selectedModelId, "malik-max", "the person still sees MalikLLM MAX")
  assert.match(streamed, /Higgsfield/)
})

await check("a free account keeps the free pool and never costs a Claude call", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  const { result, calls } = await ask("free", claudeAnswer("should not run"))
  assert.equal(calls.claude, 0)
  assert.equal(calls.free >= 1, true)
  assert.equal(result.model, "free-model")
})

await check("Claude down before its first word: the free pool answers instead", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  const { result, calls } = await ask("owner", async () => { throw new Anthropic.APIError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers()) })
  assert.equal(calls.claude, 1)
  assert.equal(calls.free >= 1, true)
  assert.match(result.content, /бесплатной модели/)
})

await check("a refusal is final: it is not re-asked of a model without Claude's safeguards", async () => {
  setEnv({ MALIK_MAX_CLAUDE_API_KEY: "k" })
  const { result, calls } = await ask("pro", async () => ({ text: "", model: "claude-opus-5-5", stopReason: "refusal", refused: true, usage: { input_tokens: 10, output_tokens: 0 } }))
  assert.equal(calls.free, 0)
  assert.match(result.content, /помочь не могу/)
})

await check("the engine no longer sends Claude through the free race", async () => {
  const fs = await import("node:fs")
  const source = fs.readFileSync(new URL("../lib/server/malik-max-engine.ts", import.meta.url), "utf8")
  assert.match(source, /claudePremiumAllowed\(\)\s*\n?\s*\? await runPremiumAnswer/)
  const route = fs.readFileSync(new URL("../app/api/stream/route-impl.ts", import.meta.url), "utf8")
  assert.match(route, /enterPremiumAccess\(entitlement\.plan\)/, "the chat request tells MAX the account's plan")
})

setEnv(saved)
for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]
console.log(failures ? `\n${failures}/${count} checks failed` : `\n${count}/${count} checks passed`)
process.exit(failures ? 1 : 0)
