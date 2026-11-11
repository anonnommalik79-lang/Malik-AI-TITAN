import assert from "node:assert/strict"
import test from "node:test"
import { normalizeProviderTokenUsage, readResponseMetrics } from "../lib/ai/token-telemetry.ts"
import { boundedConversationHistory, conversationTransportBudget } from "../lib/ai/conversation-history.ts"

test("exact OpenAI / OpenRouter usage is preserved", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    prompt_tokens: 1337, completion_tokens: 490, total_tokens: 1827,
  }), { inputTokens: 1337, outputTokens: 490, totalTokens: 1827 })
})

test("provider usage preserves and explains totals above input plus output", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    prompt_tokens: 5388, completion_tokens: 12, total_tokens: 5681,
  }), { inputTokens: 5388, outputTokens: 12, totalTokens: 5681, unattributedTokens: 281 })
  assert.deepEqual(normalizeProviderTokenUsage({
    primary: { prompt_tokens: 400, completion_tokens: 20, total_tokens: 470 },
    continuation: { prompt_tokens: 150, completion_tokens: 10, total_tokens: 160 },
  }), { inputTokens: 550, outputTokens: 30, totalTokens: 630, unattributedTokens: 50 })
})

test("Gemini-native provider counts are supported", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    promptTokenCount: 321, candidatesTokenCount: 80, totalTokenCount: 401,
  }), { inputTokens: 321, outputTokens: 80, totalTokens: 401 })
})

test("separate official continuation receipts are summed", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    primary: { prompt_tokens: 400, completion_tokens: 200, total_tokens: 600 },
    continuation: { prompt_tokens: 250, completion_tokens: 300, total_tokens: 550 },
  }), { inputTokens: 650, outputTokens: 500, totalTokens: 1150 })
})

test("do not invent tokens when upstream does not provide a complete receipt", () => {
  assert.equal(normalizeProviderTokenUsage(undefined), undefined)
  assert.equal(normalizeProviderTokenUsage({ estimatedTokens: 2000 }), undefined)
  assert.equal(normalizeProviderTokenUsage({ primary: { total_tokens: 200 }, continuation: {} }), undefined)
  assert.equal(normalizeProviderTokenUsage({ prompt_tokens: 500 }), undefined)
})

test("the chat metrics reader rejects fake or malformed counters", () => {
  assert.deepEqual(readResponseMetrics({ tookMs: 26384, usage: { total_tokens: 1827 } }), {
    tookMs: 26384, usage: { totalTokens: 1827 },
  })
  assert.deepEqual(readResponseMetrics({ tookMs: 200, usage: { estimatedTokens: 2000 } }), {
    tookMs: 200,
  })
  assert.equal(readResponseMetrics({ tookMs: -5, usage: { total_tokens: 50 } }), undefined)
  assert.equal(readResponseMetrics({ tookMs: 50, usage: { total_tokens: -4 } })?.usage, undefined)
})

test("MAX nested continuation receipts include every provider call", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    previous: {
      previous: { prompt_tokens: 12000, completion_tokens: 100, total_tokens: 12100 },
      continuation: { prompt_tokens: 400, completion_tokens: 200, total_tokens: 600 },
    },
    continuation: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 },
  }), { inputTokens: 12700, outputTokens: 450, totalTokens: 13150 })
})

test("partial continuation receipts are unknown, not deceptively cheap", () => {
  assert.equal(normalizeProviderTokenUsage({ previous: { total_tokens: 300 } }), undefined)
  assert.equal(normalizeProviderTokenUsage({ continuation: { total_tokens: 300 } }), undefined)
  assert.equal(normalizeProviderTokenUsage({
    previous: { total_tokens: 300 },
    continuation: {},
  }), undefined)
})

test("fallback provenance survives valid history and rejects malformed values", () => {
  assert.deepEqual(readResponseMetrics({
    tookMs: 2100,
    modelFallback: { requestedModelId: "malik-27b", actualProvider: "groq", actualModel: "gpt-oss-120b" },
  }), { tookMs: 2100, modelFallback: { requestedModelId: "malik-27b", actualProvider: "groq", actualModel: "gpt-oss-120b" } })
  assert.deepEqual(readResponseMetrics({ tookMs: 2100, modelFallback: { requestedModelId: "malik-27b", actualProvider: 3, actualModel: "" } }), { tookMs: 2100 })
})

test("fast chat keeps context below 12k chars without altering stored history", () => {
  const history = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: (i === 58 ? "Я Абдумалик, основатель MALIK AI. " : "Text ").repeat(500),
  }))
  const untouched = structuredClone(history)
  const fast = conversationTransportBudget({
    fastMode: true, promptLength: 30,
    configuredMessages: 64, configuredChars: 180_000,
  })
  const selected = boundedConversationHistory(history, fast.maxMessages, fast.maxChars)
  assert.deepEqual(fast, { maxMessages: 14, maxChars: 12_000 })
  assert.ok(selected.length <= 14)
  assert.ok(selected.reduce((sum, message) => sum + message.content.length, 0) <= 12_000)
  assert.ok(selected.some(message => message.content.includes("Абдумалик")))
  assert.deepEqual(history, untouched)
})

test("long coding, explicit analysis and pasted documents retain extended budget", () => {
  const original = { fastMode: false, promptLength: 48, configuredMessages: 64, configuredChars: 180_000 }
  assert.deepEqual(conversationTransportBudget(original), { maxMessages: 64, maxChars: 180_000 })
  assert.deepEqual(conversationTransportBudget({ ...original, promptLength: 260_000 }), { maxMessages: 64, maxChars: 24_000 })
  assert.deepEqual(conversationTransportBudget({ ...original, fastMode: true, configuredMessages: 8, configuredChars: 6_000 }),
    { maxMessages: 8, maxChars: 6_000 })
})
