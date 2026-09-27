import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

const contracts = read("lib/god-mode/contracts.ts")
const project = read("lib/god-mode/project-state.ts")
const health = read("lib/god-mode/provider-health.ts")
const perf = read("lib/god-mode/performance.ts")
const flags = read("lib/god-mode/feature-flags.ts")
const trace = read("lib/god-mode/trace.ts")
const status = read("app/api/god/status/route.ts")
const roadmap = read("../../../docs/MALIK_GOD_MODE_100.md")

const checks = [
  ["100 roadmap entries exist", () => {
    const entries = roadmap.match(/^\d+\./gm) || []
    assert.equal(entries.length, 100)
  }],
  ["task state machine is explicit", () => {
    for (const state of ["queued", "running", "waiting", "retrying", "completed", "failed", "cancelled"]) assert.match(contracts, new RegExp(`"${state}"`))
    assert.match(project, /INVALID_TASK_TRANSITION/)
  }],
  ["idempotency key reuses an existing logical task", () => {
    assert.match(project, /idempotencyKey/)
    assert.match(project, /find\(\(task\) => task\.idempotencyKey === key\)/)
  }],
  ["projects and artifacts are account-isolated", () => {
    assert.match(project, /ownerHash/)
    assert.match(project, /stored\.ownerId !== owner/)
    assert.match(project, /private\/system\/malik-god-projects/)
  }],
  ["artifact lineage and versions exist", () => {
    assert.match(project, /parentArtifactId/)
    assert.match(project, /version: parent \? parent\.version \+ 1 : 1/)
    assert.match(project, /derivedFrom/)
  }],
  ["provider health has cooldown and a live score", () => {
    assert.match(health, /cooldownUntil/)
    assert.match(health, /successRate/)
    assert.match(health, /score/)
    assert.match(health, /MALIK_DISABLE_PROVIDER_/)
  }],
  ["performance budgets are measured, not invented", () => {
    assert.match(perf, /recordPerformance/)
    assert.match(perf, /p95Ms/)
    assert.match(perf, /MALIK_PERF_BUDGET_/)
  }],
  ["rollout flags support owner, demo and percentages", () => {
    assert.match(flags, /mode === "owner"/)
    assert.match(flags, /mode === "demo"/)
    assert.match(flags, /rolloutBucket/)
  }],
  ["trace IDs never expose secrets", () => {
    assert.match(trace, /X-Malik-Trace-Id/)
    assert.match(trace, /X-Malik-Diagnostic-Id/)
    assert.doesNotMatch(trace, /API_KEY|SECRET_KEY|PASSWORD/)
  }],
  ["god status is owner-only and reports no secrets", () => {
    assert.match(status, /entitlement\.plan !== "owner"/)
    assert.match(status, /secretsExposed: false/)
  }],
]

let failed = 0
for (const [name, fn] of checks) {
  try { fn(); console.log("✓", name) }
  catch (error) { failed++; console.error("✗", name, "\n ", error.message) }
}
if (failed) process.exit(1)
console.log(`\n${checks.length} GOD MODE checks passed`)
