import assert from "node:assert/strict"
import test from "node:test"
import {
  usesOpenAIResponses, openAINativeRequest, openAINativeOutput,
  claudeNativeRequest, claudeNativeOutput,
} from "../lib/ai/provider-native-compat.ts"

test("GPT-6/5 use Responses, legacy GPT-4 uses Chat Completions", () => {
  assert.equal(usesOpenAIResponses("gpt-6-astra"), true)
  assert.equal(usesOpenAIResponses("gpt-6.1-sol"), true)
  assert.equal(usesOpenAIResponses("gpt-5.6-sol"), true)
  assert.equal(usesOpenAIResponses("gpt-4.1-mini"), false)
  const input = { prompt: "solve", temperature: 0.7, metadata: { reasoningEffort: "high" } }
  const modern = openAINativeRequest(input, "gpt-6-astra")
  assert.match(modern.endpoint, /\/responses$/)
  assert.deepEqual(modern.body.reasoning, { effort: "high" })
  assert.equal(modern.body.store, false)
  assert.equal("temperature" in modern.body, false)
  assert.equal(modern.body.input[0].content, "solve")
  const legacy = openAINativeRequest(input, "gpt-4.1-mini")
  assert.match(legacy.endpoint, /\/chat\/completions$/)
  assert.equal(legacy.body.temperature, 0.7)
  assert.equal("reasoning" in legacy.body, false)
})

test("OpenAI Responses text parsing is strict and rejects silent truncation", () => {
  assert.equal(openAINativeOutput({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "ready" }] }] }, true), "ready")
  assert.equal(openAINativeOutput({ output_text: "top-level", output: [] }, true), "top-level")
  assert.throws(() => openAINativeOutput({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "partial" }, true), /incomplete/)
  assert.throws(() => openAINativeOutput({ status: "completed", output: [{ type: "reasoning" }] }, true), /no visible text/)
  assert.throws(() => openAINativeOutput({ choices: [{ finish_reason: "length", message: { content: "partial" } }] }, false), /output limit/)
})

test("Claude modern adaptive thinking preserves every system message", () => {
  const request = claudeNativeRequest({
    prompt: "hello",
    messages: [{ role: "system", content: "Policy A" }, { role: "system", content: "Policy B" }, { role: "user", content: "hello" }],
    temperature: 0.9,
    metadata: { reasoningEffort: "high" },
  }, "claude-opus-5-5")
  assert.equal(request.system, "Policy A\n\nPolicy B")
  assert.deepEqual(request.thinking, { type: "adaptive" })
  assert.deepEqual(request.output_config, { effort: "high" })
  assert.equal("temperature" in request, false)
  assert.equal(request.messages.length, 1)
  const legacy = claudeNativeRequest({ prompt: "hello" }, "claude-3-5-sonnet-latest")
  assert.equal(legacy.temperature, 0.35)
  assert.equal("thinking" in legacy, false)
})

test("Claude text extraction refuses unexecuted tool calls and truncation", () => {
  assert.equal(claudeNativeOutput({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "done" }] }), "done")
  assert.throws(() => claudeNativeOutput({ stop_reason: "tool_use", content: [{ type: "text", text: "Doing task" }] }), /no tool executor/)
  assert.throws(() => claudeNativeOutput({ stop_reason: "max_tokens", content: [{ type: "text", text: "partial" }] }), /output limit/)
  assert.throws(() => claudeNativeOutput({ content: [] }), /empty text/)
})

test("Invalid effort is ignored rather than causing a provider 400", () => {
  assert.equal("reasoning" in openAINativeRequest({ prompt: "x", metadata: { reasoningEffort: "unlimited" } }, "gpt-6-astra").body, false)
  assert.equal("output_config" in claudeNativeRequest({ prompt: "x", metadata: { reasoningEffort: "unlimited" } }, "claude-opus-5-5"), false)
})
