import test from "node:test"
import assert from "node:assert/strict"
import { runSkill, getSkillRun, skillRunView, skillResultMarkdown, memorySkillStore, skillHash, skillOwnerKey, fixtureRuntime, input, project, sourceHash, SkillError } from "./fixtures/skills-fixture.mjs"

test("DEEP RESEARCH actually plans, searches, reads, synthesizes and verifies", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore()
  const run = await runSkill(input(), { store, runtime: fixture.runtime })
  assert.equal(run.status, "completed"); assert.ok(run.steps.every(s => s.status === "completed" && s.outputHash.length === 64))
  assert.equal(fixture.calls.filter(c => c.tool === "search").length, 2)
  assert.equal(fixture.calls.filter(c => c.tool === "read").length, 3)
  assert.ok(run.result.sources.every(s => s.read)); assert.equal(run.result.verification.status, "pass")
})
test("FORGE calls the real tool sequence and publishes source with honest not_run runtime", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore()
  const run = await runSkill(input({ skill: "forge.autopilot", prompt: "Build fixture CLI code" }), { store, runtime: fixture.runtime })
  assert.equal(run.status, "partial"); assert.deepEqual(fixture.calls.filter(c => c.tool !== "model").map(c => c.tool), ["build", "test", "publish"])
  assert.ok(run.result.artifact); assert.equal(fixture.published[0].passport.checks.find(c => c.id === "skills-runtime").status, "not_run")
  assert.match(skillResultMarkdown(run), /PARTIAL/)
})
test("AGENT TEAM produces separate researcher, implementer and reviewer receipts", async () => {
  const fixture = fixtureRuntime({ model: async request => {
    fixture.calls.push({ tool: "model", ...request })
    if (/Return only JSON/.test(request.systemPrompt)) return JSON.stringify({ criteria: ["Write the fixture deliverable"], queries: [] })
    return "Fixture deliverable and bounded assessment. No external action is claimed."
  } })
  const run = await runSkill(input({ skill: "agent.team", prompt: "Prepare a fictional launch checklist without internet" }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "completed")
  assert.deepEqual(run.steps.map(s => s.tool), ["plan", "researcher", "implementer", "reviewer", "verify"])
  assert.equal(fixture.calls.filter(c => c.tool === "model").length, 4)
  assert.equal(fixture.calls.filter(c => c.tool === "search").length, 0)
})
test("AGENT TEAM coding actually produces and checks files", async () => {
  const fixture = fixtureRuntime()
  const run = await runSkill(input({ skill: "agent.team", prompt: "Build fixture CLI code without internet" }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "partial"); assert.ok(fixture.calls.some(c => c.tool === "build")); assert.ok(fixture.calls.some(c => c.tool === "test")); assert.ok(run.result.artifact)
})
test("MALIK VERIFY corrects actual arithmetic without search", async () => {
  const fixture = fixtureRuntime({ model: async request => { fixture.calls.push({ tool: "model", ...request }); return "17 * 23 = 392" } })
  const run = await runSkill(input({ skill: "malik.verify", prompt: "Проверь вычисление без интернета", target: "17 * 23 = 392" }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "completed"); assert.match(run.result.content, /391/); assert.equal(fixture.calls.filter(c => c.tool === "search").length, 0)
})
test("duplicate request id reuses the exact immutable result and does not call models again", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore(), request = input()
  const first = await runSkill(request, { store, runtime: fixture.runtime }), count = fixture.calls.length
  const second = await runSkill(request, { store, runtime: fixture.runtime })
  assert.deepEqual(first.result, second.result); assert.equal(fixture.calls.length, count)
  await assert.rejects(runSkill({ ...request, prompt: "different task" }, { store, runtime: fixture.runtime }), /REQUEST_ID_REUSED/)
})
test("concurrent identical requests share one execution", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore(), request = input()
  const runs = await Promise.all([runSkill(request, { store, runtime: fixture.runtime }), runSkill(request, { store, runtime: fixture.runtime })])
  assert.equal(runs[0].id, runs[1].id); assert.equal(fixture.calls.filter(c => c.tool === "search").length, 2)
})
test("temporary search failure retries once with a real second call", async () => {
  let calls = 0
  const fixture = fixtureRuntime(), original = fixture.runtime.search
  fixture.runtime.search = async (...args) => { if (++calls === 1) throw new SkillError("SEARCH_UNAVAILABLE", 503, true); return original(...args) }
  const run = await runSkill(input(), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "completed"); assert.equal(run.steps.find(s => s.tool === "search").attempts, 2)
})
test("failure does not advance dependent tools or fabricate a final answer", async () => {
  const fixture = fixtureRuntime({ search: async () => { throw new SkillError("SEARCH_UNAVAILABLE", 503, true) } })
  const run = await runSkill(input(), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "failed"); assert.equal(run.error, "SEARCH_UNAVAILABLE"); assert.equal(run.result, undefined)
  assert.equal(fixture.calls.filter(c => c.tool === "model").length, 1)
})
test("resume after interrupted lease skips completed checkpoints and preserves spent budget", async () => {
  const fixture = fixtureRuntime({ search: async () => { throw new SkillError("SEARCH_UNAVAILABLE", 503, true) } }), store = memorySkillStore()
  const request = input(), failed = await runSkill(request, { store, runtime: fixture.runtime })
  const owner = skillOwnerKey(request.ownerId), saved = await store.read(owner, failed.id)
  saved.value.status = "running"; saved.value.lease = { token: "dead-worker", until: Date.now() - 1 }
  await store.write(owner, failed.id, saved.value, saved.revision)
  const recovered = fixtureRuntime()
  const resumed = await runSkill(input({ resumeId: failed.id }), { store, runtime: recovered.runtime })
  assert.equal(resumed.status, "completed"); assert.equal(recovered.calls.filter(c => c.tool === "model" && /Return only JSON/.test(c.systemPrompt)).length, 0)
  assert.ok(resumed.budget.tokens > failed.budget.tokens)
})
test("another owner cannot read or resume a task", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore(), run = await runSkill(input(), { store, runtime: fixture.runtime })
  await assert.rejects(getSkillRun(store, "stranger", run.id), /SKILL_RUN_NOT_FOUND/)
  await assert.rejects(runSkill(input({ ownerId: "stranger", resumeId: run.id }), { store, runtime: fixture.runtime }), /SKILL_RUN_NOT_FOUND/)
})
test("worker outage is reported; wrong source hash cannot publish runtime PASS", async () => {
  const fixture = fixtureRuntime({ test: async () => ({ status: "pass", sourceHash: "wrong", details: [] }) })
  const run = await runSkill(input({ skill: "forge.autopilot", prompt: "Build CLI" }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "failed"); assert.equal(run.error, "EXECUTION_HASH_MISMATCH"); assert.equal(fixture.published.length, 0)
})
test("actual failing test receipt blocks publication", async () => {
  const fixture = fixtureRuntime({ test: async p => ({ status: "fail", sourceHash: sourceHash(p.files), details: ["fixture assertion failed"] }) })
  const run = await runSkill(input({ skill: "forge.autopilot", prompt: "Build CLI" }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "failed"); assert.equal(fixture.published.length, 0)
})
test("model call/token caps are persisted before execution and cannot be bypassed by retries", async () => {
  const fixture = fixtureRuntime()
  const run = await runSkill(input({ maxTokens: 700 }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "failed"); assert.equal(run.error, "SKILL_BUDGET_EXHAUSTED"); assert.equal(run.budget.tokens, 700)
})
test("storage write failure stops before any model or external operation", async () => {
  const fixture = fixtureRuntime(), base = memorySkillStore(), store = { ...base, write: async () => { throw new SkillError("SKILL_STORAGE_UNAVAILABLE", 503, true) } }
  await assert.rejects(runSkill(input(), { store, runtime: fixture.runtime }), /SKILL_STORAGE_UNAVAILABLE/); assert.equal(fixture.calls.length, 0)
})
test("an active distributed lease cannot be stolen", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore(), request = input(), run = await runSkill(request, { store, runtime: fixture.runtime })
  const owner = skillOwnerKey(request.ownerId), saved = await store.read(owner, run.id)
  saved.value.status = "running"; saved.value.result = undefined; saved.value.lease = { token: "other-worker", until: Date.now() + 60000 }
  await store.write(owner, run.id, saved.value, saved.revision)
  await assert.rejects(runSkill(input({ resumeId: run.id }), { store, runtime: fixture.runtime }), /SKILL_RUN_BUSY/)
})
test("safe polling omits original prompt, drafts, files and lease tokens", async () => {
  const fixture = fixtureRuntime(), run = await runSkill(input(), { store: memorySkillStore(), runtime: fixture.runtime })
  const view = skillRunView(run)
  for (const key of ["prompt", "owner", "lease", "fingerprint"]) assert.equal(Object.hasOwn(view, key), false)
  assert.ok(view.steps.every(s => !Object.hasOwn(s, "output")))
})
test("invalid model plan cannot add a shell tool or change the graph", async () => {
  const fixture = fixtureRuntime({ model: async () => '{"criteria":["a"],"queries":[],"tool":"shell.exec"}' })
  const run = await runSkill(input(), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "failed"); assert.equal(run.error, "INVALID_SKILL_PLAN"); assert.equal(run.steps[0].attempts, 2)
})
test("cancelled generation saves cancellation and does not publish", async () => {
  const controller = new AbortController(), fixture = fixtureRuntime({ model: async ({ signal }) => new Promise((_, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); setTimeout(() => controller.abort(), 10) }) })
  const run = await runSkill(input({ signal: controller.signal }), { store: memorySkillStore(), runtime: fixture.runtime })
  assert.equal(run.status, "cancelled"); assert.equal(run.error, "SKILL_CANCELLED"); assert.equal(fixture.published.length, 0)
})
test("unknown tools in a persisted graph fail closed before another operation", async () => {
  const fixture = fixtureRuntime(), store = memorySkillStore(), request = input(), run = await runSkill(request, { store, runtime: fixture.runtime })
  const owner = skillOwnerKey(request.ownerId), saved = await store.read(owner, run.id)
  saved.value.status = "failed"; saved.value.result = undefined; saved.value.steps[0].tool = "shell.exec"
  await store.write(owner, run.id, saved.value, saved.revision)
  await assert.rejects(runSkill(input({ resumeId: run.id }), { store, runtime: fixture.runtime }), /SKILL_VERSION_MISMATCH/)
})
