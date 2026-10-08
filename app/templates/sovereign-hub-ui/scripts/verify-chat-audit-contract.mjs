// Production audit wrapper with auth/storage fixtures. Does not prove live
// WorkOS access or cloud persistence and never writes production user data.
import assert from "node:assert/strict"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import ts from "typescript"

const transpile = path => ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const contractModule = { exports: {} }
new Function("module", "exports", transpile("lib/ai/chat-stream-contract.ts"))(contractModule, contractModule.exports)
const writes = []
let authenticated = true
const auditModule = { exports: {} }
new Function("require", "module", "exports", transpile("lib/server/founder-request-audit.ts"))(name => {
  if (name === "server-only") return {}
  if (name === "node:crypto") return { randomUUID }
  if (name.endsWith("request-entitlement")) return { resolveRequestEntitlement: async () => ({ authenticated, userId: authenticated ? "account-a" : "guest" }) }
  if (name.endsWith("founder-message-log")) return { appendFounderMessage: async value => { writes.push(value) } }
  if (name.endsWith("chat-stream-contract")) return contractModule.exports
  throw new Error(`Unexpected dependency ${name}`)
}, auditModule, auditModule.exports)
const { withFounderRequestAudit } = auditModule.exports
const event = (type, payload) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
let checks = 0
async function run(label, wire, verify, options = {}) {
  writes.length = 0
  const response = await withFounderRequestAudit(async () => new Response(options.body || wire, {
    headers: { "content-type": "text/event-stream" },
  }))(new Request("http://localhost/api/stream", { method: "POST", body: JSON.stringify({ prompt: "Explain a test", userId: "forged-other-account" }) }))
  const received = await response.text()
  if (!options.body) assert.equal(received, wire, "telemetry must preserve the original response byte-for-byte")
  await verify(writes.at(-1), received)
  checks++
  console.log(`PASS ${label}`)
}

await run("header-only types and multiline CRLF preserve the real answer", 'event: content\r\ndata: {"content":\r\ndata: "Әлем 🌍"}\r\n\r\nevent: done\r\ndata: {"ok":true}\r\n\r\n', result => {
  assert.equal(result.status, "success")
  assert.equal(result.assistantText, "Әлем 🌍")
  assert.equal(result.userId, "account-a", "never trust body-supplied identity")
})
await run("snapshots are not duplicated", event("content", { content: "First", contentMode: "snapshot" }) + event("content", { content: "First second", contentMode: "snapshot" }) + event("done", { ok: true }), result => {
  assert.equal(result.assistantText, "First second")
})
await run("final completion snapshot includes the tail", event("content", { content: "First", contentMode: "delta" }) + event("done", { ok: true, content: "First final tail" }), result => {
  assert.equal(result.assistantText, "First final tail")
})
await run("failed completion is not success; partial content is retained", event("content", { content: "Partial", contentMode: "delta" }) + event("done", { ok: false, error: { message: "Upstream unavailable" } }), result => {
  assert.equal(result.status, "failed")
  assert.equal(result.assistantText, "Partial")
  assert.equal(result.errorMessage, "Upstream unavailable")
})
await run("empty completion is not recorded as a successful answer", event("done", { ok: true }), result => {
  assert.equal(result.status, "failed")
  assert.equal(result.errorCode, "EMPTY_ANSWER")
})
await run("audit parsing cannot interrupt the user's original response", event("content", { content: "First", contentMode: "snapshot" }) + event("content", { content: "Divergent", contentMode: "snapshot" }) + event("done", { ok: true }), result => {
  assert.equal(result.status, "failed")
  assert.equal(result.errorCode, "AUDIT_STREAM_PARSE")
  assert.equal(result.assistantText, "First")
})
const largeAnswer = "x".repeat(180_000)
const largeWire = event("content", { content: largeAnswer, contentMode: "delta" }) + event("done", { ok: true })
let cursor = 0
await run("split large frames are bounded without silently dropping audit content", largeWire, result => {
  assert.equal(result.status, "success")
  assert.equal(result.assistantText, "x".repeat(16_000))
}, { body: new ReadableStream({ pull(controller) {
  if (cursor < largeWire.length) { controller.enqueue(new TextEncoder().encode(largeWire.slice(cursor, cursor + 80_000))); cursor += 80_000 }
  else controller.close()
} }) })
await run("secret redaction remains active", event("content", { content: "password=private123 sk-proj-abcdefghijklmno", contentMode: "delta" }) + event("done", { ok: true }), result => {
  assert.doesNotMatch(result.assistantText, /private123|abcdefghijklmno/)
  assert.match(result.assistantText, /REDACTED/)
})
authenticated = false
await run("unauthenticated traffic is never logged against an account", event("done", { content: "Guest answer" }), () => assert.equal(writes.length, 0))
console.log(`${checks}/${checks} audit-contract checks passed; auth/storage fixtures only`)
