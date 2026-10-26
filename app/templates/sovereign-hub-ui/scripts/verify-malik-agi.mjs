import assert from "node:assert/strict"
import test from "node:test"
import { runMalikAgiCli } from "../lib/agi/mission-engine.ts"

const goal = "Создай Node.js CLI для анализа CSV с node:test тестами и обработкой пустых файлов."
const fakeEvidence = (overrides = {}) => ({
  kind: "selfbuild-cli", projectId: "fixture-1", title: "CSV CLI",
  files: [{ path: "src/cli.mjs", content: "export const main = () => 1" }],
  staticCheck: "pass", unitCheck: "pass", details: [],
  rounds: 1, ...overrides,
})
const model = async (role) => role === "verifier"
  ? "Checked the test receipts and acceptance criteria.\nVERDICT: PASS"
  : "Requirements, validation criteria, and edge cases are fully specified for this Node.js CLI project."

test("all four real roles are represented and verified requires receipts", async () => {
  const seen = []
  const run = await runMalikAgiCli(goal, {
    model: async (role, context) => { seen.push({ role, context }); return model(role) },
    build: async (input) => { assert.match(input.design, /Requirements/); return fakeEvidence() },
  })
  assert.equal(run.status, "verified")
  assert.equal(run.criticalVerdict, "pass")
  assert.deepEqual(run.stages.map(step => step.role), ["analyst", "architect", "builder", "verifier"])
  assert.deepEqual(seen.map(item => item.role), ["analyst", "architect", "verifier"])
  assert.ok(run.runId)
  assert.equal(run.evidence?.files.length, 1)
  assert.equal(run.mode, "four-agent-cli-beta")
})

test("unit test not_run cannot be called verified despite an optimistic critic", async () => {
  const run = await runMalikAgiCli(goal, { model, build: async () => fakeEvidence({ unitCheck: "not_run" }) })
  assert.equal(run.status, "needs_review")
  assert.equal(run.evidence?.unitCheck, "not_run")
})

test("static failure cannot be overridden by a model verdict", async () => {
  const run = await runMalikAgiCli(goal, { model, build: async () => fakeEvidence({ staticCheck: "fail" }) })
  assert.equal(run.status, "needs_review")
})

test("critic missing a clear verdict is not fabricated into approval", async () => {
  const run = await runMalikAgiCli(goal, {
    model: async role => role === "verifier" ? "Findings are ambiguous; more coverage is necessary." : model(role),
    build: async () => fakeEvidence(),
  })
  assert.equal(run.criticalVerdict, "unknown")
  assert.equal(run.status, "needs_review")
})

test("failed analyst stops before the builder; nothing is reported as built", async () => {
  let built = false
  const run = await runMalikAgiCli(goal, {
    model: async role => { if (role === "analyst") throw Error("provider offline"); return model(role) },
    build: async () => { built = true; return fakeEvidence() },
  })
  assert.equal(built, false)
  assert.equal(run.status, "failed")
  assert.equal(run.evidence, null)
  assert.deepEqual(run.stages.map(step => step.role), ["analyst"])
})

test("executor failure produces no fake artifact or successful tests", async () => {
  const run = await runMalikAgiCli(goal, {
    model,
    build: async () => { throw Error("sandbox offline") },
  })
  assert.equal(run.status, "failed")
  assert.equal(run.evidence, null)
  assert.equal(run.stages[2].status, "failed")
  assert.deepEqual(run.stages.map(step => step.role), ["analyst", "architect", "builder"])
})

test("reviewer failure downgrades completion", async () => {
  const run = await runMalikAgiCli(goal, {
    model: async role => { if (role === "verifier") throw Error("reviewer offline"); return model(role) },
    build: async () => fakeEvidence(),
  })
  assert.equal(run.status, "needs_review")
  assert.equal(run.stages[3].status, "failed")
})

test("short malformed goal is rejected before provider calls", async () => {
  await assert.rejects(
    () => runMalikAgiCli("Привет", { model, build: async () => fakeEvidence() }),
    /AGI_GOAL_TOO_SHORT/,
  )
})
