import assert from "node:assert/strict"
import { createExecutionReporter, executionMarkdown, executionSources, executionUrl, MAX_EXECUTION_BYTES, MAX_EXECUTION_STEPS, normalizeExecutionTrace, publicExecutionText, settleExecution, upsertExecutionStep } from "../lib/ai/chat-execution.ts"

let at = 1000
const events = []
const reporter = createExecutionReporter((step) => events.push(step), "test-model", () => at)
const search = reporter.start("Поиск", "search", "web.search", { query: "Алматы" })
at = 1300
reporter.finish(search, { sources: 3 })
assert.equal(events.length, 2)
assert.equal(events[0].state, "running")
assert.equal(events[1].state, "completed")
assert.equal(events[0].id, events[1].id)
assert.equal(events[1].endedAt - events[1].startedAt, 300)
assert.equal(reporter.snapshot().steps.length, 1)
assert.equal(upsertExecutionStep(reporter.snapshot(), events[0]).steps[0].state, "completed", "Delayed packet cannot reopen a finished tool")

const plugin = reporter.start("Notion", "plugin", "notion", { token: "sensitive", query: "Мой проект" })
reporter.finish(plugin, undefined, "failed", "Сервис не подключён")
const waiting = reporter.start("Ответ", "model")
const trace = reporter.settle("cancelled")
assert.equal(trace.steps.find((item) => item.id === waiting).state, "cancelled")
assert.equal(trace.steps.find((item) => item.id === plugin).state, "failed")
assert(!JSON.stringify(trace).includes("sensitive"))
assert.equal(normalizeExecutionTrace(JSON.parse(JSON.stringify(trace))).steps.length, 3)
assert.equal(normalizeExecutionTrace({ version: 1, id: "bad", startedAt: "no", steps: [] }), undefined)
assert.equal(normalizeExecutionTrace({ ...trace, state: "running", steps: [events[0]] }, true).steps[0].state, "interrupted")
assert.equal(settleExecution({ ...trace, steps: [events[0]] }, "completed").steps[0].state, "interrupted", "Unconfirmed calls must not be marked successful")

const secret = "sk-proj-" + "s".repeat(30)
const safe = publicExecutionText({ api_key: secret, nested: { authorization: "Bearer private" }, base64: "privateBytes", reasoning: "privateThought", query: "hello" })
for (const privateText of [secret, "privateBytes", "privateThought", "Bearer private"]) assert(!safe.includes(privateText))
assert(publicExecutionText("https://host.test/?token=PRIVATE").includes("[скрыто]"))
assert.equal(executionUrl("javascript:alert(1)"), undefined)
assert(!executionUrl("https://name:pass@host.test/?token=PRIVATE").includes("PRIVATE"))
assert(!executionUrl("https://name:pass@host.test/").includes("pass"))
assert(publicExecutionText("a".repeat(7000)).length < 6100)
assert(executionMarkdown(trace).includes("Notion"))
assert(!executionMarkdown(trace).includes("sensitive"))

const many = createExecutionReporter(() => {}, undefined, () => at++)
for (let i = 0; i < 150; i++) many.status(`step-${i}`)
assert.equal(many.snapshot().steps.length, MAX_EXECUTION_STEPS)
const heavy = createExecutionReporter(() => {}, undefined, () => at++)
for (let i = 0; i < MAX_EXECUTION_STEPS; i++) {
  const id = heavy.start(`Action ${i}`, "plugin", "plugin.read", "i".repeat(6000))
  heavy.finish(id, "o".repeat(6000))
}
assert(new TextEncoder().encode(JSON.stringify(heavy.snapshot().steps)).byteLength <= MAX_EXECUTION_BYTES, "saved receipts must stay bounded")
assert.equal(heavy.snapshot().steps.length, MAX_EXECUTION_STEPS, "trimming logs must retain actual actions")
const sourceTrace = createExecutionReporter(() => {}, undefined, () => at++)
const call = sourceTrace.start("Search", "search", "web.search")
sourceTrace.finish(call, { sources: [{ url: "https://developer.mozilla.org/docs", title: "Docs" }, { url: "javascript:alert(1)", title: "unsafe" }] })
assert.deepEqual(executionSources(sourceTrace.snapshot(), [{ url: "https://developer.mozilla.org/docs", title: "Same source" }]).map((source) => source.domain), ["developer.mozilla.org"])
console.log("PASS: execution lifecycle, upsert, cancellation, recovery, privacy, export and bounds")
