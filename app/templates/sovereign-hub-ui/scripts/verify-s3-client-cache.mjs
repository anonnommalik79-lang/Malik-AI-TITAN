import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const source = fs.readFileSync("lib/server/shared-private-s3-client.ts", "utf8")
const privateState = fs.readFileSync("lib/server/private-json-store.ts", "utf8")
const turns = fs.readFileSync("lib/server/background-chat-turns.ts", "utf8")
const instances = []
class FakeS3Client {
  constructor(config) { this.config = config; this.destroyed = false; instances.push(this) }
  destroy() { this.destroyed = true }
}
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const mod = { exports: {} }
new Function("require", "module", "exports", javascript)((name) => {
  if (name === "server-only") return {}
  if (name === "@aws-sdk/client-s3") return { S3Client: FakeS3Client }
  return require(name)
}, mod, mod.exports)
const { sharedPrivateS3Client } = mod.exports
const config = { region: "auto", endpoint: "https://r2.invalid", accessKeyId: "id-a", secretAccessKey: "private-secret" }
const first = sharedPrivateS3Client(config)
for (let i = 0; i < 100; i++) {
  assert.equal(sharedPrivateS3Client({ ...config }), first, "every history write must reuse the same client")
}
assert.equal(instances.length, 1, "100 requests create one SDK client")
const differentKey = sharedPrivateS3Client({ ...config, accessKeyId: "id-b" })
assert.notEqual(differentKey, first, "different credentials must never share a client")
assert.notEqual(sharedPrivateS3Client({ ...config, region: "us-east-1" }), first, "region is in the pool key")
assert.notEqual(sharedPrivateS3Client({ ...config, endpoint: "https://other.invalid" }), first, "different endpoint is isolated")
const last = sharedPrivateS3Client({ ...config, sessionToken: "session-b" })
assert.notEqual(last, first, "session token is part of the credential identity")
assert.equal(instances.length, 5)
assert.equal(first.destroyed, true, "LRU evicts and destroys the least recently used client")
assert.equal(sharedPrivateS3Client(config).destroyed, false, "evicted credentials create a fresh client")
assert.equal(instances.length, 6)
assert.match(source, /createHash\("sha256"\)/, "pool identifiers never hold raw secrets")
for (const [label, code] of [["account chat", privateState], ["background turns", turns]]) {
  assert.match(code, /sharedPrivateS3Client\(cfg\)/, label + " uses the shared SDK pool")
  assert.doesNotMatch(code, /new S3Client\(/, label + " must not allocate SDK clients per request")
}
assert.equal((privateState.match(/abortSignal: AbortSignal\.timeout\(5000\)/g) || []).length, 5,
  "all private state read/write/delete/CAS network calls have a five-second ceiling")
assert.equal((turns.match(/abortSignal: AbortSignal\.timeout\(2500\)/g) || []).length, 2,
  "background turn cloud calls retain existing short deadlines")
console.log("PASS reusable credential-isolated S3 clients, bounded pool, 100x reuse, IO deadlines")
