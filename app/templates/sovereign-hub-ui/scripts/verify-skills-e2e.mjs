// Transport E2E: real HTTP -> real chat handler -> real skills graph -> checked
// final SSE/JSON. Only sessions, provider I/O and private cloud storage are
// fixtures. This does NOT claim authenticated production-model validation.
import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { workTestLoader } from "./work-test-loader.mjs"
import { fixtureRuntime, project, sourceHash } from "./fixtures/skills-fixture.mjs"

const owner = { userId: "skills-e2e-owner", plan: "pro", authenticated: true }
let currentOwner = owner, admit = true, tokens = 16000, mode = "normal", legacyCalls = 0
const selections = [], executions = [], deferred = []
const forbidden = () => { throw new Error("Unexpected legacy/external boundary") }
class RouteError extends Error {}
const fixture = fixtureRuntime()
// Only this exact immutable, reviewed fixture may be executed by the test. It
// is never a production executor and never runs user/model-supplied code.
async function reviewedFixtureTest(value) {
  assert.deepEqual(value.files, project().files)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "malik-skills-reviewed-fixture-"))
  try {
    const files = load("lib/website/engine/workspace.ts").projectFiles(value.files)
    for (const file of files) await fs.writeFile(path.join(directory, file.path), file.content)
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--permission", `--allow-fs-read=${directory}`, "--disallow-code-generation-from-strings", "--max-old-space-size=96", "--test", "--experimental-test-isolation=none", "--test-reporter=tap", "add.test.mjs"], { cwd: directory, env: {}, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      let output = ""
      const timer = setTimeout(() => { child.kill(); reject(Error("FIXTURE_TEST_TIMEOUT")) }, 10000)
      child.stdout.on("data", data => { output += data; if (output.length > 32000) child.kill() })
      child.stderr.on("data", () => {})
      child.once("error", error => { clearTimeout(timer); reject(error) })
      child.once("close", code => { clearTimeout(timer); resolve({ code, output }) })
    })
    assert.match(result.output, /# tests 1/)
    const receipt = { sourceHash: sourceHash(value.files), status: result.code === 0 ? "pass" : "fail", command: "node --test --test-reporter=tap", tests: 1, failures: result.code === 0 ? 0 : 1, details: [result.output.slice(-1600)] }
    executions.push(receipt); return receipt
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "malik-skills-reviewed-fixture-"))
    await fs.rm(directory, { recursive: true, force: true })
  }
}
const stubs = {
  "next/server": { after: fn => deferred.push(fn) },
  "@/lib/server/private-json-store": { privateJsonStoreConfigured: () => false },
  "@/lib/skills/runtime": { skillRuntime: input => {
    selections.push(input)
    return { ...fixture.runtime,
      search: async (...args) => { if (mode === "search-fail") throw new Error("private provider diagnostic must not leak"); return fixture.runtime.search(...args) },
      test: reviewedFixtureTest,
    }
  } },
  "@/lib/malik-god-router": { asPlainText: a => a.content, asJson: a => a, extractPrompt: b => b.prompt || b.question, sourceContext: () => "", gatherSourcesForPrompt: forbidden,
    malikGodAnswer: async (_body, selection, _progress, onToken) => { legacyCalls++; const content = "Ordinary chat fixture reply"; onToken?.(content); return { content, provider: "fixture", model: selection.modelId, selectedModelId: selection.modelId, sources: [], usedWeb: false, attempts: [] } } },
  "@/lib/server/plugin-runtime": { parsePluginCommand: () => null, parsePluginCommandFromBody: () => null },
  "@/lib/server/plugin-model-answer": { runPluginModelAnswer: forbidden },
  "@/lib/ai/project-builder": { generateProjectWithBrain: forbidden },
  "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: admit, code: "DAILY_LIMIT_REACHED" }), recordChatUsage: async () => {} },
  "@/lib/server/malik-model-router": { resolveStrictMalikSelection: async (_r, b) => ({ modelId: b.modelId || "malik-max", entitlement: currentOwner }), MalikModelRouteError: RouteError, malikModelErrorPayload: () => ({ error: "MODEL_UNAVAILABLE" }), runStrictMalikModel: forbidden },
  "@/lib/server/malik-coder-orchestrator": { runMalikCoderOrchestrator: forbidden },
  "@/lib/server/malik-agent-runtime": { prepareMalikAgentRuntime: async () => null },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => currentOwner },
  "@/lib/server/work-quota": { reserveWorkQuota: async () => ({ ok: true, receipt: { id: "fixture" } }), refundWorkQuota: async () => {}, WorkQuotaError: RouteError },
  "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: b => b },
  "@/lib/server/project-artifact-store": { putProjectArtifact: forbidden },
  "@/lib/server/multimodal-router": { estimateMultimodalTokens: () => 0, hasMalikAttachments: a => Array.isArray(a) && a.length > 0, routeMalikAttachments: forbidden },
  "@/lib/server/daily-multimodal-quota": { DAILY_MULTIMODAL_TOKEN_LIMIT: 10000, getDailyMultimodalQuota: () => ({ remaining: 10000 }), recordDailyMultimodalTokens: () => {} },
  "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: false, remaining: tokens }) },
  "@/lib/server/scheduled-tasks": { createScheduledTask: forbidden, scheduledTasksStatus: () => ({ ready: false }) },
  "@/lib/malik-compute/runtime": { withCompute: h => h, observeComputeResult: () => {} },
  "@/lib/server/request-frequency": { takeRequestFrequency: () => true },
  "@/lib/server/founder-request-audit": { withFounderRequestAudit: h => h },
  "@/lib/server/account-addressing": { addressChatResponse: r => r },
}
stubs["./runtime"] = stubs["@/lib/skills/runtime"] // chat.ts uses its relative runtime import.
const load = workTestLoader(stubs)
const stream = load("app/api/stream/route-impl.ts").POST
const chat = load("app/api/ai/chat/route.ts").POST
const catalog = load("app/api/skills/route.ts").GET
const status = load("app/api/skills/runs/[id]/route.ts").GET
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const url = new URL(req.url, `http://${req.headers.host}`)
    const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method !== "GET" ? { body: Buffer.concat(chunks) } : {}) })
    const response = url.pathname === "/api/stream" ? await stream(request) : url.pathname === "/api/ai/chat" ? await chat(request) : url.pathname === "/api/skills" ? await catalog(request) : await status(request, { params: Promise.resolve({ id: url.pathname.split("/").at(-1) }) })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    const reader = response.body?.getReader()
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; res.write(part.value) }
    res.end()
  } catch { res.writeHead(500); res.end("E2E_HANDLER_FAILED") }
})
server.listen(0, "127.0.0.1"); await once(server, "listening")
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => new Promise(resolve => server.close(resolve)))
let serial = 0
async function turn(prompt, extra = {}, route = "/api/stream") {
  const response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ question: prompt, originalQuestion: prompt, stream: true, requestId: `skills-e2e-${++serial}`, ...extra }) })
  const text = await response.text()
  const events = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5)))
  for (const action of deferred.splice(0)) await action()
  return { response, text, events, content: events.filter(e => e.type === "content").map(e => e.content).join(""), done: events.find(e => e.type === "done") }
}
test("catalog reports four executable skills and truthful infrastructure readiness", async () => {
  const response = await fetch(base + "/api/skills"), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.skills.length, 4); assert.equal(data.execution.durableCheckpoints, false); assert.equal(data.execution.npmBuildWorker, false)
})
test("HTTP/SSE -> research tools -> verified answer: one final response, real activity receipts", async () => {
  const result = await turn("/research Research the test fixture observations")
  assert.equal(result.response.status, 200); assert.equal(result.events.filter(e => e.type === "done").length, 1)
  assert.equal(result.done.skillRun.status, "completed"); assert.ok(result.done.sources.length)
  assert.ok(result.events.some(e => e.type === "activity" && e.step.tool?.endsWith(".search") && e.step.state === "completed"))
  assert.ok(result.events.some(e => e.type === "activity" && e.step.tool?.endsWith(".verify") && e.step.kind === "code"))
  assert.equal(legacyCalls, 0)
})
test("HTTP/SSE -> Forge -> real reviewed-fixture Node test -> matching receipt and artifact passport", async () => {
  const result = await turn("/forge Build fixture CLI code")
  assert.equal(result.done.skillRun.status, "completed", JSON.stringify(result.done.skillRun.result?.verification)); assert.ok(executions.length); assert.equal(executions.at(-1).status, "pass")
  assert.equal(fixture.published.at(-1).passport.checks.find(c => c.id === "skills-runtime").status, "pass")
  assert.match(result.content, /api\/ai\/project\/artifacts/)
})
for (const [language, prompt] of [["RU", "/verify Проверь без интернета 17 * 23 = 392"], ["KK", "/verify Интернетсіз тексер: 17 * 23 = 392"], ["EN", "/verify Check without internet: 17 * 23 = 392"]]) test(`HTTP verify accepts ${language} task and selected provider model`, async () => {
  const result = await turn(prompt, { modelId: "claude-selected-fixture" })
  assert.equal(result.done.selectedModelId, "claude-selected-fixture"); assert.equal(selections.at(-1).modelId, "claude-selected-fixture")
  assert.ok(result.done.skillRun); assert.equal(result.events.filter(e => e.type === "done").length, 1)
  assert.match(result.content, /391/)
})
test("polling is owner-scoped and never returns role drafts or input prompts", async () => {
  const result = await turn("/research Research test fixture observations"), id = result.done.skillRun.id
  const read = await (await fetch(base + "/api/skills/runs/" + id)).json()
  assert.equal(read.run.id, id); assert.equal(read.run.prompt, undefined); assert.ok(read.run.steps.every(s => s.output === undefined))
  currentOwner = { ...owner, userId: "another-owner" }
  assert.equal((await fetch(base + "/api/skills/runs/" + id)).status, 404)
  currentOwner = owner
})
test("JSON chat endpoint executes the same skill engine", async () => {
  const result = await turn("/verify Check without internet: 17 * 23 = 392", { stream: false }, "/api/ai/chat")
  const data = JSON.parse(result.text)
  assert.equal(data.provider, "malik-skills-engine"); assert.ok(data.skillRun); assert.equal(data.selectedModelId, "malik-max")
})
test("ordinary chat and questions about skills keep the existing pipeline", async () => {
  for (const prompt of ["Привет", "Explain deep research"]) {
    const result = await turn(prompt)
    assert.match(result.content, /Ordinary chat fixture reply/); assert.equal(result.done.skillRun, undefined)
  }
  assert.equal(legacyCalls, 2)
})
test("a guest cannot grant access by supplying owner fields", async () => {
  currentOwner = { userId: "guest", plan: "free", authenticated: false }
  const before = fixture.calls.length
  const result = await turn("/team Build CLI", { ownerId: owner.userId, authenticated: true, plan: "owner" })
  assert.ok(result.events.some(e => e.type === "error" && e.code === "SIGN_IN_REQUIRED")); assert.equal(fixture.calls.length, before)
  currentOwner = owner
})
test("quota rejection happens before the skill executes", async () => {
  admit = false; const before = fixture.calls.length
  const result = await turn("/research Research fixture")
  assert.equal(result.response.status, 429); assert.equal(fixture.calls.length, before); admit = true
})
test("persistent upstream failure returns saved task and sanitized failure, never a rescue model answer", async () => {
  mode = "search-fail"; const before = legacyCalls
  const result = await turn("/research Research fixture observations")
  assert.equal(result.done.skillRun.status, "failed"); assert.equal(legacyCalls, before); assert.doesNotMatch(result.text, /private provider diagnostic/)
  const id = result.done.skillRun.id; mode = "normal"
  const resumed = await turn(`Resume task ${id}`)
  assert.equal(resumed.done.skillRun.id, id); assert.equal(resumed.done.skillRun.status, "completed")
})
