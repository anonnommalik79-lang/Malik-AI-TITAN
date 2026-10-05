import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
let failures = 0, hardFailure = false, hold = false, owner = { userId: "qa-journal-owner", authenticated: true, plan: "pro" }, clock = Date.now()
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner }, "./tools/registry": { toolFor: name => ({ name, label: "Документ", timeoutMs: 5000, sideEffect: "none", async run(context) {
  if (hold) await new Promise((resolve, reject) => { context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }) })
  if (hardFailure) throw Object.assign(new Error("invalid request"), { status: 400 })
  if (failures-- > 0) throw Object.assign(new Error("temporary unavailable"), { status: 503 })
  clock += 20
  return { provider: "qa-tool", artifacts: [{ projectId: context.project.id, kind: "document", title: "Отчёт", content: "# Отчёт\n\n" + "Проверенный тестовый документ. ".repeat(100), sourceTool: "document.write", sourceTask: context.task.id, metadata: {}, links: [] }] }
} }) } })
const store = load("lib/os/store.ts"), executor = load("lib/os/executor.ts"), stream = load("app/api/os/flows/[id]/events/route.ts").GET
const deps = { now: () => clock, random: () => .5, sleep: async ms => { clock += ms; await new Promise(resolve => setImmediate(resolve)) } }
const task = (flowId, index) => ({ id: `${flowId}_t${index}`, type: "document.write", label: `Документ ${index}`, status: "planned", progress: 0, dependencies: [], input: {}, artifactIds: [], retry: { attempts: 0, maxAttempts: 2 }, idempotencyKey: `${flowId}_key${index}` })
async function start(count = 1) { return executor.startFlow({ owner, goal: "Создай документ для команды", clientRequestId: `qa-journal-${Math.random()}`, tasks: id => Array.from({ length: count }, (_, i) => task(id, i)), deps }) }
async function done(id) { const deadline = Date.now() + 10000; while (executor.isFlowRunning(id) || !(await store.getFlow(owner.userId, id))?.finishedAt) { if (Date.now() > deadline) throw Error("Flow deadline exceeded"); await new Promise(r => setTimeout(r, 5)) }; return store.getFlow(owner.userId, id) }
let count = 0; async function check(name, fn) { await fn(); count++; console.log(`ok ${name}`) }
const backend = store.memoryBackend()
store.configureOsBackend(backend)
await check("successful actual executor persists ordered journal", async () => {
  const { flow } = await start(), result = await done(flow.id)
  assert.equal(result.status, "completed")
  assert.deepEqual(result.events.map(e => e.type), ["task.created", "plan.ready", "skill.selected", "tool.started", "tool.completed", "artifact.ready", "task.completed"])
  assert.ok(result.events.every((e, i, entries) => !i || e.at >= entries[i - 1].at))
  assert.ok(result.events.find(e => e.type === "tool.completed").durationMs >= 0)
})
await check("retry journal is actual start/retry/start/complete", async () => {
  failures = 1; const { flow } = await start(), result = await done(flow.id)
  assert.deepEqual(result.events.filter(e => e.type.startsWith("tool.")).map(e => e.type), ["tool.started", "tool.retrying", "tool.started", "tool.completed"])
  assert.equal(result.events.filter(e => e.type === "tool.started")[1].attempt, 2)
})
await check("failure and cancellation are not success events", async () => {
  hardFailure = true; const { flow } = await start(), result = await done(flow.id); hardFailure = false
  assert.equal(result.status, "failed"); assert.deepEqual(result.events.slice(-2).map(e => e.type), ["tool.failed", "task.failed"])
  hold = true; const next = await start(); await new Promise(r => setTimeout(r, 20)); await executor.cancelFlow(owner.userId, next.flow.id)
  const cancelled = await done(next.flow.id); hold = false
  assert.equal(cancelled.events.at(-1).type, "task.cancelled")
  assert.ok(!cancelled.events.some(e => e.type === "tool.completed"))
})
await check("SSE reconnect snapshot contains saved events; foreign owner cannot read", async () => {
  const { flow } = await start(); const result = await done(flow.id)
  store.configureOsBackend(backend) // discard process cache and read stored JSON again
  const request = () => stream(new Request(`http://qa.invalid/api/os/flows/${flow.id}/events`), { params: Promise.resolve({ id: flow.id }) })
  for (let reconnect = 0; reconnect < 2; reconnect++) {
    const response = await request(), body = await response.text(), json = JSON.parse(body.match(/event: snapshot\ndata: (.*)\n/)[1])
    assert.deepEqual(json.flow.events, JSON.parse(JSON.stringify(result.events)))
  }
  owner = { ...owner, userId: "qa-journal-stranger" }; assert.equal((await request()).status, 404); owner = { ...owner, userId: "qa-journal-owner" }
})
await check("reload during execution restores persisted journal and reconnects before cancellation", async () => {
  hold = true
  const { flow } = await start()
  try {
    const deadline = Date.now() + 3000
    let saved
    do { saved = await store.getFlow(owner.userId, flow.id); if (saved?.events.some(event => event.type === "tool.started")) break; if (Date.now() > deadline) throw Error("Tool never started"); await new Promise(resolve => setTimeout(resolve, 5)) } while (true)
    for (let reconnect = 0; reconnect < 2; reconnect++) {
      store.configureOsBackend(backend)
      const response = await stream(new Request(`http://qa.invalid/api/os/flows/${flow.id}/events`), { params: Promise.resolve({ id: flow.id }) })
      assert.equal(response.status, 200)
      const reader = response.body.getReader()
      try {
        const first = await reader.read(), body = new TextDecoder().decode(first.value)
        const snapshot = JSON.parse(body.match(/event: snapshot\ndata: (.*)\n/)[1])
        assert.equal(snapshot.flow.status, "running")
        assert.deepEqual(snapshot.flow.events, JSON.parse(JSON.stringify(saved.events)))
        assert.ok(!snapshot.flow.events.some(event => event.type === "task.completed"))
      } finally { await reader.cancel() }
    }
  } finally { await executor.cancelFlow(owner.userId, flow.id); await done(flow.id); hold = false }
})
await check("journal is bounded at 200 events with unique IDs", async () => {
  const { flow } = await start(55), result = await done(flow.id)
  assert.equal(result.events.length, 200); assert.equal(new Set(result.events.map(e => e.id)).size, 200); assert.equal(result.events.at(-1).type, "task.completed")
})
console.log(`${count}/${count} passed (actual executor/store/SSE; external tool and auth stubbed)`)
