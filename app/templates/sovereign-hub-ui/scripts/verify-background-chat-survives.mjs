import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const root = resolve(import.meta.dirname, "..")
const codeOf = (path) => readFileSync(resolve(root, path), "utf8")
let checks = 0
const check = (name, run) => {
  run()
  checks += 1
  console.log(`PASS ${name}`)
}

const account = codeOf("components/sovereign/AccountChatPersistence.tsx")
const proxy = codeOf("app/api/stream/background/route.ts")
const status = codeOf("app/api/stream/background/[turnId]/route.ts")
const store = codeOf("lib/server/background-chat-turns.ts")

console.log("\nbackground chat turns survive navigation and session changes")

check("each /api/stream request is rewritten to a durable background turn", () => {
  assert.match(account, /CHAT_STREAM_PATH[\s\S]*BACKGROUND_STREAM_PATH/)
  assert.match(account, /x-malik-background-turn-id/)
  assert.match(account, /crypto\.randomUUID\(\)/)
})

check("automatic Malik abort signals are protected but explicit Stop still aborts the network controller", () => {
  assert.match(account, /protectedChatSignals\.has\(this\.signal\)/)
  assert.match(account, /closest\("\.malik-runtime-stop"\)/)
  assert.match(account, /originalAbort\.call\(controller/)
})

check("unfinished turns are marked detached and mapped back to the original chat/message", () => {
  assert.match(account, /markAccountDetached/)
  assert.match(account, /chatId/)
  assert.match(account, /assistantMessageId/)
  assert.match(account, /patchRecoveredTurn/)
})

check("server tees the live stream and starts persistence before after() owns the tail", () => {
  assert.match(proxy, /response\.body\.tee\(\)/)
  assert.match(proxy, /const persistence = persistStreamResult/)
  assert.match(proxy, /after\(async \(\) => \{ await persistence \}\)/)
  assert.match(proxy, /streamPOST\(request\)/)
})

check("completed and failed turns are persisted and readable by turn id", () => {
  assert.match(proxy, /completeBackgroundChatTurn/)
  assert.match(proxy, /failBackgroundChatTurn/)
  assert.match(status, /readBackgroundChatTurn/)
})

check("durable storage is encrypted and has a process-memory fallback", () => {
  assert.match(store, /aes-256-gcm/)
  assert.match(store, /S3Client/)
  assert.match(store, /__malikBackgroundChatTurnsV1/)
  assert.match(store, /WORKOS_COOKIE_PASSWORD/)
})

check("expired cached turns are garbage-collected without dropping live work", () => {
  assert.match(store, /__malikBackgroundChatTurnsSweepAt/, "sweep runs at bounded intervals")
  assert.match(store, /expires <= now/, "only expired timestamps qualify")
  assert.match(store, /store\.delete\(id\)/, "expired turn is released from memory")
  assert.match(store, /now \+ 60_000/, "avoids an expensive scan on every request")
  assert.match(store, /MAX_FINISHED_CACHE_BYTES = 32 \* 1024 \* 1024/, "finished cache is RAM-bounded")
  assert.match(store, /MAX_FINISHED_CACHE_TURNS = 128/, "finished cache cannot grow in item count")
  assert.match(store, /turn.status === "pending"/, "active turns are never evicted")
  assert.match(store, /pruneFinishedTurnCache\(memory, turn.turnId\)/, "completed writes trigger pruning")
})


const ast = ts.createSourceFile("background-route.ts", proxy, ts.ScriptTarget.Latest, true)
const functions = ast.statements
  .filter((node) => ts.isFunctionDeclaration(node) &&
    ["parseSseFrame", "persistStreamResult"].includes(node.name?.text))
  .map((node) => node.getText(ast)).join("\n")
const runnable = ts.transpileModule(functions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const calls = []
const contractSource = codeOf("lib/ai/chat-stream-contract.ts")
const contractJs = ts.transpileModule(contractSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const contractModule = { exports: {} }
new Function("module", "exports", contractJs)(contractModule, contractModule.exports)
const { persistStreamResult } = new Function(
  "completeBackgroundChatTurn", "failBackgroundChatTurn",
  "upsertExecutionStep", "normalizeExecutionTrace",
  ...Object.keys(contractModule.exports),
  runnable + "\nreturn { persistStreamResult };",
)(
  async (_id, result) => { calls.push({ type: "complete", result }) },
  async (_id, error, _trace, partial) => { calls.push({ type: "failed", error: String(error), partial }) },
  (trace) => trace, (trace) => trace,
  ...Object.values(contractModule.exports),
)
const makeEvent = (type, value = {}) =>
  "event: " + type + "\ndata: " + JSON.stringify({ type, ...value }) + "\n\n"
const eventResponse = (body) => new Response(body, {
  status: 200, headers: { "content-type": "text/event-stream" },
})

await persistStreamResult("partial", eventResponse(makeEvent("content", { content: "First six steps" })))
assert.equal(calls.at(-1)?.type, "failed", "stream closing without done is NOT a complete turn")
assert.equal(calls.at(-1)?.partial, "First six steps", "interrupted content is retained")
calls.length = 0
await persistStreamResult("complete", eventResponse(
  makeEvent("content", { content: "Verified answer" }) + makeEvent("done", { provider: "test-model" }),
))
assert.equal(calls.at(-1)?.type, "complete", "final completion event confirms the whole response")
assert.equal(calls.at(-1)?.result.content, "Verified answer")
calls.length = 0
await persistStreamResult("errored", eventResponse(
  makeEvent("content", { content: "Partial proof" }) + makeEvent("error", { message: "Upstream failed" }),
))
assert.equal(calls.at(-1)?.type, "failed")
assert.equal(calls.at(-1)?.partial, "Partial proof")
calls.length = 0
await persistStreamResult("empty", eventResponse(makeEvent("done")))
assert.equal(calls.at(-1)?.type, "failed", "done with zero content is still a failed answer")
calls.length = 0
let reads = 0
const brokenBody = new ReadableStream({
  pull(controller) {
    if (reads++ === 0) controller.enqueue(new TextEncoder().encode(makeEvent("content", { content: "Keep this partial proof" })))
    else controller.error(new TypeError("network error after text"))
  },
})
await persistStreamResult("read-error", eventResponse(brokenBody))
assert.equal(calls.at(-1)?.type, "failed")
assert.equal(calls.at(-1)?.partial, "Keep this partial proof", "a reader exception must not erase already received content")
calls.length = 0
await persistStreamResult("false-done", eventResponse(
  makeEvent("content", { content: "Incomplete calculation" }) + makeEvent("done", { ok: false, message: "Provider rejected continuation" }),
))
assert.equal(calls.at(-1)?.type, "failed", "done with ok=false is never successful")
assert.match(calls.at(-1)?.error || "", /Provider rejected continuation/)
calls.length = 0
await persistStreamResult("multiline", eventResponse(
  'event: content\r\ndata: {"type":"content",\r\ndata: "content":"Қазақша ответ 🌍"}\r\n\r\n' + makeEvent("done"),
))
assert.equal(calls.at(-1)?.result?.content, "Қазақша ответ 🌍", "all data lines form one SSE message")
calls.length = 0
await persistStreamResult("snapshot", eventResponse(
  makeEvent("content", { content: "Answer", contentMode: "snapshot" }) +
  makeEvent("content", { content: "Answer with evidence", contentMode: "snapshot" }) + makeEvent("done"),
))
assert.equal(calls.at(-1)?.result?.content, "Answer with evidence", "cumulative snapshots must not duplicate text in history")
check("interrupted and failed SSE streams are never saved as completed answers", () => {
  assert.match(store, /content: String\(partialContent \|\| ""\)/)
  assert.match(status, /turn\.status === "complete" \|\| turn\.status === "failed"/)
  assert.match(account, /Ответ прервался и может быть неполным/)
})

console.log(`\n${checks} background-chat survival checks passed.`)

const pollAst = ts.createSourceFile("AccountChatPersistence.tsx", account, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const pollDecl = pollAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "pollDetachedTurn")
assert.ok(pollDecl, "background recovery polling function exists")
const runnablePoll = ts.transpileModule(pollDecl.getText(pollAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const patchDecl = pollAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "patchRecoveredTurn")
const patchJs = ts.transpileModule(patchDecl.getText(pollAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const patchRecoveredTurn = new Function("findTurnLocation", "scopedDashboardKey", "normalizeExecutionTrace", "window", patchJs + "\nreturn patchRecoveredTurn;")(
  (_runtime, _account, turn) => turn, () => "state", trace => trace, { localStorage: {} },
)
let recoveredState = { activeChatId: "chat", chats: [{id:"chat",messages:[{id:"answer",content:"part",isStreaming:true}]}], messages:[{id:"answer",content:"part",isStreaming:true}] }
const recoveryRuntime = { rawGetItem: () => JSON.stringify(recoveredState), rawSetItem: (_key, value) => {recoveredState=JSON.parse(value)} }
const recoverySources = [{title:"Verified source",url:"https://example.test/source",image:"https://example.test/photo.webp",domain:"example.test"}]
assert.equal(patchRecoveredTurn(recoveryRuntime,"owner",{chatId:"chat",assistantMessageId:"answer"},{status:"complete",content:"Answer [1]",usedWeb:true,sources:recoverySources,selectedModelId:"malik-max",model:"provider-internal"}),true)
for (const message of [recoveredState.messages[0], recoveredState.chats[0].messages[0]]) {
  assert.deepEqual(message.research?.sources,recoverySources,"navigation recovery preserves citations and source photos")
  assert.equal(message.research?.usedWeb,true)
  assert.equal(message.modelId,"malik-max","history keeps the selected public model")
}
const dashboardAst = ts.createSourceFile("dashboard.tsx", codeOf("components/sovereign/dashboard.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const reviveDecl = dashboardAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "reviveResearch")
const reviveJs = ts.transpileModule(reviveDecl.getText(dashboardAst), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
const reviveResearch = new Function("reviveWebSource","normalizeFactAudit",reviveJs + "\nreturn reviveResearch;")(source => source, audit => audit || null)
const savedAudit = {version:1,claims:[{id:"claim",statement:"Verified number"}]}
assert.deepEqual(reviveResearch({...recoveredState.messages[0].research,factAudit:savedAudit}).factAudit,savedAudit,"page reload preserves the saved fact audit")
async function recoveryStatusTest(statusCode, payload) {
  const scheduled = []
  const fakeWindow = { setTimeout: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length } }
  const pending = { turnId: "recovery-test", createdAt: Date.now(), pageId: "old", detached: true }
  const runtime = { pageId: "new", recoveryTimers: new Map(), baseFetch: async () => Response.json(payload || { ok: false }, { status: statusCode }) }
  const pollDetachedTurn = new Function(
    "readPending", "patchRecoveredTurn", "removePending", "scheduleRecoveryReload",
    "RECOVERY_POLL_MS", "RECOVERY_OUTAGE_POLL_MS", "RECOVERY_RATE_LIMIT_POLL_MS",
    "MAX_RECOVERY_AGE_MS", "BACKGROUND_STREAM_PATH", "window",
    runnablePoll + "\nreturn pollDetachedTurn;",
  )(
    () => [pending], () => true, () => {}, () => {},
    1600, 12000, 60000, 7 * 24 * 60 * 60 * 1000, "/api/stream/background", fakeWindow,
  )
  pollDetachedTurn(runtime, "owner", pending.turnId)
  assert.equal(scheduled.length, 1, "schedules first poll")
  await scheduled[0].fn()
  return scheduled.slice(1).map((x) => x.ms)
}
assert.deepEqual(await recoveryStatusTest(503), [12000], "temporary outage retries slowly")
assert.deepEqual(await recoveryStatusTest(429), [60000], "rate limit is respected")
assert.deepEqual(await recoveryStatusTest(401), [], "no polling after authentication failure")
assert.deepEqual(await recoveryStatusTest(403), [], "no polling of forbidden answer")
assert.deepEqual(await recoveryStatusTest(200, {ok:true,turn:{status:"pending"}}), [1600], "unfinished turn continues polling")
assert.deepEqual(await recoveryStatusTest(200, {ok:true}), [12000], "unexpected server payload doesn't drop recovery")
check("transient 429/5xx and malformed result retry without credential-crossing polls", () => {
  assert.match(account, /retryLater\(RECOVERY_OUTAGE_POLL_MS\)/)
  assert.match(account, /retryLater\(RECOVERY_RATE_LIMIT_POLL_MS\)/)
})
