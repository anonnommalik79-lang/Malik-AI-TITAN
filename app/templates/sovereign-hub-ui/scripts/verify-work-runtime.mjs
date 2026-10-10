import assert from "node:assert/strict"
import fs from "node:fs"
import { createHash } from "node:crypto"
import { workTestLoader } from "./work-test-loader.mjs"

const owner = { userId: "qa-work-runtime-owner", authenticated: true, plan: "pro" }
let sessionOwner = owner, calls = [], decisions = [], hold = false, rejectReads = false
const commit = "a".repeat(40), blob = "b".repeat(40)
const original = "export function add(a: number, b: number) { return a - b }\n"
const corrected = "export function add(a: number, b: number) { return a + b }\n"
const sourceFiles = { "src/add.ts": original, "src/multiply.ts": "export const multiply = (a: number, b: number) => a + b;" }
let embeddedSecret = false, readActive = 0, peakReads = 0
let clock = Date.now()
const deps = {
  now: () => ++clock, random: () => .5, sleep: async ms => { clock += ms; await new Promise(r => setImmediate(r)) },
  async text(request) {
    calls.push({ type: "model", request })
    if (hold) return new Promise((resolve, reject) => request.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
    const decision = decisions.shift(); if (!decision) throw Error("Unexpected extra model call")
    return { content: typeof decision === "string" ? decision : JSON.stringify(decision), provider: "qa-model", model: "fixture" }
  },
  async githubRead(ownerId, input, signal) {
    assert.equal(ownerId, owner.userId); signal.throwIfAborted(); calls.push({ type: "github", input })
    if (rejectReads && input.action === "file") throw Object.assign(new Error("No file"), { status: 404 })
    if (input.action === "snapshot") return { repo: input.repo, ref: input.ref || "main", commitSha: commit, truncated: false,
      tree: [...Object.entries(sourceFiles).map(([path, content]) => ({ path, type: "blob", mode: "100644", size: content.length })), { path: ".env", type: "blob", mode: "100644", size: 15 }, { path: "linked.ts", type: "blob", mode: "120000", size: 10 }, { path: "large.ts", type: "blob", mode: "100644", size: 150000 }] }
    assert.equal(input.action, "file"); assert.equal(input.ref, commit, "every file read pinned to commit, not branch")
    assert.ok(Object.hasOwn(sourceFiles, input.path)); readActive++; peakReads = Math.max(peakReads, readActive)
    try { await new Promise(r => setImmediate(r)); return { content: embeddedSecret ? "const key = 'ghp_" + "x".repeat(30) + "';" : sourceFiles[input.path], sha: blob } }
    finally { readActive-- }
  },
}
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => sessionOwner },
  "@/lib/os/runtime": { serverToolDeps: () => deps } })
const store = load("lib/os/store.ts"), backend = store.memoryBackend(); store.configureOsBackend(backend)
const executor = load("lib/os/executor.ts"), intent = load("lib/work/intent.ts"), orchestrator = load("lib/work/orchestrator.ts")
const flowRoute = load("app/api/os/flows/route.ts").POST, exporter = load("app/api/os/artifacts/[id]/export/route.ts").GET
const checks = load("lib/work/repository-checks.ts")
const goal = "Изучи https://github.com/qa-owner/qa-repository и исправь ошибку сложения. Создай regression test и предлагаемый patch."
let number = 0, passed = 0
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`) }
async function start(extra = {}) {
  const response = await flowRoute(new Request("http://qa.invalid/api/os/flows", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal, workspaceMode: "work", clientRequestId: `work-runtime-${++number}`, ...extra }) }))
  const payload = await response.json(); assert.equal(response.status, 201, JSON.stringify(payload)); return payload.flow.id
}
async function done(id) {
  const until = Date.now() + 15000
  while (executor.isFlowRunning(id) || !(await store.getFlow(owner.userId, id))?.finishedAt) {
    if (Date.now() > until) throw Error("Flow timeout"); await new Promise(r => setTimeout(r, 5))
  }
  return store.getFlow(owner.userId, id)
}
const read = { action: "read", paths: ["src/add.ts"] }
const finish = { action: "finish", finding: "Function subtracts instead of adding, observed in src/add.ts.", files: [{ path: "src/add.ts", content: corrected }] }

await check("large engineering mission never schedules; direct reminders still work", () => {
  const mission = "# ENGINEERING MISSION\nРаботай в репозитории https://github.com/qa-owner/qa-repository.\n" +
    "Исправь баг. Подготовь PR. Следи за выполнением. Завтра demo. Scheduler: уведомляй каждый час.\n".repeat(90)
  assert.equal(intent.detectWorkScheduleIntent(mission), null)
  assert.equal(orchestrator.routeWorkRequest(mission, { mode: "work", signedIn: true }).reason, "work-repository")
  for (const text of ["Подготовь patch в GitHub завтра", "Напиши scheduler с функцией remind me in 2 hours", "Следи за прогрессом выполнения тестов", 'Объясни фразу «напомни завтра»']) assert.equal(intent.detectWorkScheduleIntent(text), null, text)
  assert.equal(intent.detectWorkScheduleIntent("Напомни через 10 минут проверить CI на GitHub", "UTC", 1000000).schedule.runAt, new Date(1600000).toISOString())
  assert.equal(intent.detectWorkScheduleIntent("Notify me when NVIDIA releases a new GPU").mode, "condition")
  assert.equal(orchestrator.routeWorkRequest("Напомни через час проверить GitHub", { mode: "work", signedIn: true }).reason, "work-schedule")
})
await check("ordinary chat, guests, incidental GitHub and code examples do not start repo work", () => {
  for (const text of ["Что такое GitHub?", "Explain GitHub: https://github.com/qa-owner/qa-repository", "Когда исправят https://github.com/qa-owner/qa-repository?", "How do I fix https://github.com/qa-owner/qa-repository?", 'Объясни этот пример:\n```\ninspect https://github.com/qa-owner/qa-repository\n```']) assert.equal(intent.workRepositoryIntent(text), null)
  assert.equal(orchestrator.routeWorkRequest(goal, { mode: "chat", signedIn: true }).route, "chat")
  assert.equal(orchestrator.routeWorkRequest(goal, { mode: "work", signedIn: false }).route, "chat")
  assert.equal(intent.workRepositoryIntent("Inspect https://github.com/a/b and https://github.com/c/d"), null)
})
let success, patch, report, resumedId
await check("actual API -> executor -> read -> model decisions -> syntax -> private artifacts", async () => {
  calls = []; decisions = [read, { ...finish, files: [{ path: "src/add.ts", content: "export const x = (" }] }, finish]
  const id = await start(); success = await done(id); assert.equal(success.status, "completed")
  const artifacts = await store.getArtifacts(owner.userId, success.tasks.flatMap(task => task.artifactIds))
  patch = artifacts.find(item => item.metadata.role === "repository-patch"); report = artifacts.find(item => item.metadata.role === "repository-report")
  assert.equal(JSON.parse(patch.content).files[0].content, corrected)
  assert.equal(patch.metadata.baseSha, commit); assert.equal(patch.metadata.testsExecuted, false)
  assert.match(report.content, /Build \/ unit tests \/ выполнение команд: NOT RUN/)
  assert.equal(calls.filter(call => call.type === "github" && call.input.action === "file").length, 1)
  assert.equal(calls.filter(call => call.type === "model").length, 3)
  assert.ok(calls.filter(call => call.type === "github").every(call => ["file", "snapshot"].includes(call.input.action)))
  const events = success.events; assert.equal(events.filter(event => event.tool === "code.syntax-check" && event.type === "tool.completed").length, 2)
  assert.ok(events.find(event => event.tool === "github.file" && event.type === "tool.started"))
  assert.ok(!events.some(event => /Запускаю тесты|Редактирую GitHub/.test(event.label || "")))
  assert.ok(!success.tasks.some(task => /Сверяю бренд/.test(task.activity || "")))
  assert.match(artifacts.find(item => item.metadata.role === "summary").content, /Build и unit tests: NOT RUN/)
})
await check("real patch ZIP and report PDF/DOCX exports use existing owner-scoped endpoints", async () => {
  for (const [artifact, format, signature] of [[patch, "zip", "PK"], [report, "docx", "PK"], [report, "pdf", "%PDF"]]) {
    const response = await exporter(new Request(`http://qa.invalid/api/os/artifacts/${artifact.id}/export?format=${format}`), { params: Promise.resolve({ id: artifact.id }) })
    assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.subarray(0, signature.length).toString(), signature); assert.ok(bytes.length > 100)
  }
})
await check("independent reads run in parallel and produce a real two-file proposed patch", async () => {
  peakReads = 0; calls = []; decisions = [{ action: "read", paths: Object.keys(sourceFiles) }, { action: "finish", files: [finish.files[0], { path: "src/multiply.ts", content: sourceFiles["src/multiply.ts"].replace("a + b", "a * b") }] }]
  const result = await done(await start()); assert.equal(result.status, "completed"); assert.equal(peakReads, 2)
  const artifacts = await store.getArtifacts(owner.userId, result.tasks.flatMap(task => task.artifactIds))
  assert.equal(JSON.parse(artifacts.find(item => item.metadata.role === "repository-patch").content).files.length, 2)
  assert.ok(calls.filter(call => call.type === "github" && call.input.action === "file").every(call => call.input.ref === commit))
})
await check("embedded credential content is never passed to the next model decision or artifact", async () => {
  embeddedSecret = true; calls = []; decisions = [read]
  const failed = await done(await start()); embeddedSecret = false
  assert.equal(failed.status, "failed"); assert.equal(calls.filter(call => call.type === "model").length, 1)
  assert.ok(calls.filter(call => call.type === "model").every(call => !call.request.prompt.includes("ghp_")))
  assert.ok(!failed.events.some(event => event.type === "artifact.ready")); assert.equal(failed.tasks[0].error.code, "SECRET_CONTENT")
})
await check("owner isolation, reconnect/reload checkpoints and duplicate request do not redo work", async () => {
  assert.equal(await store.getFlow("other-owner", success.id), null); assert.equal(await store.getArtifact("other-owner", patch.id), null)
  sessionOwner = { ...owner, userId: "other-owner" }
  assert.equal((await exporter(new Request(`http://qa.invalid/export?format=zip`), { params: Promise.resolve({ id: patch.id }) })).status, 404)
  sessionOwner = owner; store.configureOsBackend(backend)
  assert.deepEqual((await store.getFlow(owner.userId, success.id)).events, JSON.parse(JSON.stringify(success.events)))
  const before = calls.length
  const response = await flowRoute(new Request("http://qa.invalid/api/os/flows", { method: "POST", body: JSON.stringify({ goal, workspaceMode: "work", clientRequestId: success.clientRequestId }) }))
  assert.equal(response.status, 200); assert.equal((await response.json()).created, false); assert.equal(calls.length, before)
})
await check("secrets, symlinks, traversal, oversized files and unread edits are denied", async () => {
  for (const path of ["../x", "src/../x", ".env", ".env.production", "secret.pem", ".git/config", ".aws/config", ".ssh/config", ".docker/config.json", ".netrc", "service-account.json", "src\\x", "/tmp/x", "credentials.json"]) assert.equal(checks.repositoryFileAllowed(path), false, path)
  decisions = [{ action: "read", paths: [".env"] }, { action: "read", paths: ["linked.ts"] }, read,
    { action: "finish", files: [{ path: "large.ts", content: "overwrite" }] }, finish]
  calls = []; const flow = await done(await start()); assert.equal(flow.status, "completed")
  assert.equal(calls.filter(call => call.type === "github" && call.input.action === "file").length, 1)
  assert.equal(calls.find(call => call.type === "github" && call.input.action === "file").input.path, "src/add.ts")
})
await check("unusable decisions and failed reads produce failure, not fake success/artifacts", async () => {
  decisions = Array(8).fill("not valid JSON"); const failed = await done(await start()); assert.equal(failed.status, "failed")
  assert.ok(!failed.events.some(event => event.type === "artifact.ready")); assert.ok(failed.events.some(event => event.type === "task.failed"))
  rejectReads = true; decisions = [read]; const rejected = await done(await start()); rejectReads = false
  assert.notEqual(rejected.status, "completed"); assert.ok(rejected.events.some(event => event.type === "tool.failed" && event.tool === "github.file"))
})
await check("cancellation aborts the actual model call; no successful receipt or late artifact", async () => {
  hold = true; const id = await start(); await new Promise(r => setTimeout(r, 30)); await executor.cancelFlow(owner.userId, id)
  const cancelled = await done(id); hold = false
  assert.equal(cancelled.status, "cancelled"); assert.ok(!cancelled.events.some(event => event.type === "artifact.ready"))
  assert.ok(cancelled.events.some(event => event.type === "tool.failed" && event.tool === "model.repository-decision"))
  resumedId = id
})
await check("retry restores the original SHA saved before any file read", async () => {
  calls = []; decisions = [read, finish]
  await executor.retryFlow(owner.userId, resumedId, owner, deps)
  const recovered = await done(resumedId); assert.equal(recovered.status, "completed")
  assert.equal(calls.find(call => call.type === "github" && call.input.action === "snapshot").input.ref, commit)
})
await check("corrupt checkpoint fails closed before sending data to GitHub or a model", async () => {
  hold = true; const id = await start(); await new Promise(r => setTimeout(r, 30)); await executor.cancelFlow(owner.userId, id)
  const cancelled = await done(id); hold = false
  const task = cancelled.tasks.find(task => task.type === "github.work")
  const key = `work-repo-${createHash("sha256").update(task.idempotencyKey).digest("hex").slice(0, 40)}`
  await store.writeOwnerJson(owner.userId, key, { repo: "qa-owner/qa-repository", files: "corrupt" })
  calls = []; await executor.retryFlow(owner.userId, id, owner, deps)
  const failed = await done(id); assert.equal(failed.status, "failed"); assert.equal(calls.length, 0)
  assert.equal(failed.tasks.find(task => task.type === "github.work").error.code, "INVALID_CHECKPOINT")
})
await check("long Work goal preserves tail; ordinary chat flow retains 4000 character limit", async () => {
  const long = goal + "\n" + "Обязательные проверки и ограничения.\n".repeat(300) + "TAIL_REQUIREMENT_123"
  calls = []; decisions = [read, finish]; const result = await done(await start({ goal: long }))
  assert.equal(result.goal, long); assert.ok(calls.filter(call => call.type === "model").every(call => call.request.prompt.includes("TAIL_REQUIREMENT_123")))
  const response = await flowRoute(new Request("http://qa.invalid/api/os/flows", { method: "POST", body: JSON.stringify({ goal: long, workspaceMode: "chat", clientRequestId: "chat-long-reject", force: true }) }))
  assert.equal(response.status, 400)
})
await check("deterministic parsers do not execute proposed code; unsupported formats are NOT RUN", () => {
  globalThis.__workCodeExecuted = false
  const result = checks.checkRepositoryFiles([{ path: "test.js", content: "globalThis.__workCodeExecuted = true;" }, { path: "data.json", content: "{}" }, { path: "script.py", content: "raise Exception()" }])
  assert.equal(globalThis.__workCodeExecuted, false); assert.ok(result.checks.every(check => check.ok)); assert.deepEqual(result.notRun, ["script.py"])
  assert.ok(checks.checkRepositoryFiles([{ path: "types.d.ts", content: "declare const x: number;" }]).checks[0].ok)
  assert.equal(checks.checkRepositoryFiles([{ path: "types.d.ts", content: "declare const x: ;" }]).checks[0].ok, false)
  delete globalThis.__workCodeExecuted
})
await check("runtime wiring is Work-scoped and uses the existing OS registry", () => {
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /resolveWorkspaceMode\(body\?\.workspaceMode\) === "work"\s*\? detectWorkScheduleIntent/)
  const registry = fs.readFileSync("lib/os/tools/registry.ts", "utf8"); assert.match(registry, /"github.work": githubWorkTool/)
})
console.log(`${passed}/${passed} PASS (real routes/executor/store/parsers/exporters; auth, GitHub and model fixture boundaries; no live providers or writes)`)
