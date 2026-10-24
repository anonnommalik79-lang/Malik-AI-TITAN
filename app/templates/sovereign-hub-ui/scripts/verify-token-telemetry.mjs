import assert from "node:assert/strict"
import test from "node:test"
import { normalizeProviderTokenUsage, readResponseMetrics } from "../lib/ai/token-telemetry.ts"

test("exact OpenAI / OpenRouter usage is preserved", () => {
  assert.deepEqual(normalizeProviderTokenUsage({
    prompt_tokens: 1337, completion_tokens: 490, total_tokens: 1827,
  }), { inputTokens: 1337, outputTokens: 490, totalTokens: 1827 })
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
