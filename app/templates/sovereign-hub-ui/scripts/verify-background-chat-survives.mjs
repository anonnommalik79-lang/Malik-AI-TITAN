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
const { persistStreamResult } = new Function(
  "completeBackgroundChatTurn", "failBackgroundChatTurn",
  "upsertExecutionStep", "normalizeExecutionTrace",
  runnable + "\nreturn { persistStreamResult };",
)(
  async (_id, result) => { calls.push({ type: "complete", result }) },
  async (_id, error, _trace, partial) => { calls.push({ type: "failed", error: String(error), partial }) },
  (trace) => trace, (trace) => trace,
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
check("interrupted and failed SSE streams are never saved as completed answers", () => {
  assert.match(store, /content: String\(partialContent \|\| ""\)/)
  assert.match(status, /turn\.status === "complete" \|\| turn\.status === "failed"/)
  assert.match(account, /Ответ прервался и может быть неполным/)
})

console.log(`\n${checks} background-chat survival checks passed.`)
