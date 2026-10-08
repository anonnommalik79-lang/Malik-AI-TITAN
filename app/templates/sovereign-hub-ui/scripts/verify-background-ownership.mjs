import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const cache = new Map()
let entitlement = { authenticated: true, userId: "owner-a", plan: "free" }
function load(file) {
  const full = path.resolve(file)
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }
  cache.set(full, mod)
  const js = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const resolve = (name) => {
    if (name === "server-only") return {}
    if (name === "@/lib/server/request-entitlement") return { resolveRequestEntitlement: async () => entitlement }
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`)
    if (name.startsWith("./") || name.startsWith("../")) return load(path.resolve(path.dirname(full), name) + ".ts")
    return require(name)
  }
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: full })(resolve, mod, mod.exports)
  return mod.exports
}
// No cloud writes or model calls: exercise the actual store and GET with session stubs.
for (const key of ["BACKGROUND_CHAT_BUCKET", "MEDIA_STORAGE_BUCKET", "R2_BUCKET", "CLOUDFLARE_R2_BUCKET", "S3_BUCKET", "STORAGE_BUCKET"]) delete process.env[key]
const store = load("lib/server/background-chat-turns.ts")
const route = load("app/api/stream/background/[turnId]/route.ts")
const get = (turnId) => route.GET(new Request(`https://test.invalid/api/stream/background/${turnId}`), { params: Promise.resolve({ turnId }) })
let count = 0
async function check(label, fn) { await fn(); count++; console.log(`ok ${label}`) }
const id = randomUUID()
await check("creation saves the server owner", async () => {
  assert.equal((await store.startBackgroundChatTurn(id, "owner-a")).ownerId, "owner-a")
  await store.completeBackgroundChatTurn(id, { content: "Личный ответ" })
  assert.equal((await store.readBackgroundChatTurn(id)).ownerId, "owner-a")
})
await check("owner reads answer; ownerId is not exposed", async () => {
  const response = await get(id)
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.turn.content, "Личный ответ")
  assert.equal(json.turn.ownerId, undefined)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
})
await check("other authenticated account gets 404", async () => {
  entitlement = { ...entitlement, userId: "owner-b" }
  assert.equal((await get(id)).status, 404)
})
await check("guest gets 404 even with same identity string", async () => {
  entitlement = { ...entitlement, authenticated: false, userId: "owner-a" }
  assert.equal((await get(id)).status, 404)
})
await check("caller-chosen ID cannot overwrite owner", async () => {
  assert.equal(await store.startBackgroundChatTurn(id, "owner-b"), null)
  assert.equal((await store.readBackgroundChatTurn(id)).ownerId, "owner-a")
})
await check("failure retains owner", async () => {
  await store.failBackgroundChatTurn(id, new Error("test"))
  assert.equal((await store.readBackgroundChatTurn(id)).ownerId, "owner-a")
})
await check("terminal updates cannot create unowned records", async () => {
  const missing = randomUUID()
  assert.equal(await store.completeBackgroundChatTurn(missing, { content: "test" }), null)
  assert.equal(await store.failBackgroundChatTurn(missing, "test"), null)
  assert.equal(await store.startBackgroundChatTurn(missing, ""), null)
})
await check("concurrent claims create only one answer", async () => {
  const concurrent = randomUUID()
  const results = await Promise.all([store.startBackgroundChatTurn(concurrent, "a"), store.startBackgroundChatTurn(concurrent, "b")])
  assert.equal(results.filter(Boolean).length, 1)
})
await check("legacy unowned history is private even when a valid UUID is known", async () => {
  const legacy = randomUUID()
  globalThis.__malikBackgroundChatTurnsV1.set(legacy, { turnId: legacy, status: "complete", content: "legacy", expiresAt: new Date(Date.now() + 10000).toISOString() })
  entitlement = { ...entitlement, authenticated: true, userId: "owner-a" }
  assert.equal((await get(legacy)).status, 404, "a signed-in account cannot claim a legacy unowned record")
  entitlement = { ...entitlement, authenticated: false }
  assert.equal((await get(legacy)).status, 404, "a guest cannot read an unowned record")
  globalThis.__malikBackgroundChatTurnsV1.get(legacy).expiresAt = new Date(0).toISOString()
  assert.equal((await get(legacy)).status, 404, "expired records are denied as well")
})
await check("invalid expiration is never public", async () => {
  const invalid = randomUUID()
  globalThis.__malikBackgroundChatTurnsV1.set(invalid, { turnId: invalid, status: "complete", content: "private", expiresAt: "broken" })
  assert.equal((await get(invalid)).status, 404)
  assert.equal((await get("bad")).status, 400)
})
await check("polling has an independent rate limit", async () => {
  entitlement = { authenticated: true, userId: "polling-test", plan: "free" }
  for (let index = 0; index < 120; index++) assert.equal((await get(randomUUID())).status, 404)
  assert.equal((await get(randomUUID())).status, 429)
})
await check("large completed background turns cannot exhaust free Render RAM", async () => {
  const pendingId = randomUUID()
  assert.ok(await store.startBackgroundChatTurn(pendingId, "memory-test"))
  const answer = "long answer ".repeat(25_000)
  let firstId = ""
  let latestId = ""
  for (let index = 0; index < 145; index++) {
    const turnId = randomUUID()
    if (!firstId) firstId = turnId
    latestId = turnId
    assert.ok(await store.startBackgroundChatTurn(turnId, "memory-test"))
    assert.ok(await store.completeBackgroundChatTurn(turnId, { content: answer }))
  }
  const entries = [...globalThis.__malikBackgroundChatTurnsV1.values()]
  const finished = entries.filter((item) => item.status !== "pending")
  const approxBytes = finished.reduce((sum, item) =>
    sum + (String(item.content || "").length + String(item.error || "").length) * 2 + 8192, 0)
  assert.ok(finished.length <= 128, "finished-response count is bounded")
  assert.ok(approxBytes <= 32 * 1024 * 1024, "finished-response bytes stay bounded")
  assert.equal(await store.readBackgroundChatTurn(firstId), null, "oldest terminal cache is released")
  assert.equal((await store.readBackgroundChatTurn(latestId)).content, answer, "newest result survives")
  assert.equal((await store.readBackgroundChatTurn(pendingId)).status, "pending", "active work is never evicted")
})

await check("cloud recovery reads obey the same memory limits as completed writes", async () => {
  const objects = new Map()
  load("lib/server/shared-private-s3-client.ts").sharedPrivateS3Client = () => ({ send: async (command) => {
    if (command.constructor.name === "PutObjectCommand") { objects.set(command.input.Key, String(command.input.Body)); return {} }
    const text = objects.get(command.input.Key)
    if (!text) throw new Error("NoSuchKey")
    return { Body: { transformToString: async () => text } }
  } })
  Object.assign(process.env, { BACKGROUND_CHAT_BUCKET: "test", BACKGROUND_CHAT_ACCESS_KEY_ID: "test", BACKGROUND_CHAT_SECRET_ACCESS_KEY: "test", BACKGROUND_CHAT_SECRET: "test-encryption" })
  const ids = []
  for (let index = 0; index < 145; index++) {
    const turnId = randomUUID(); ids.push(turnId)
    await store.startBackgroundChatTurn(turnId, "cloud-test")
    await store.completeBackgroundChatTurn(turnId, { content: "cloud answer ".repeat(25000) })
  }
  globalThis.__malikBackgroundChatTurnsV1.clear()
  for (const turnId of ids) assert.equal((await store.readBackgroundChatTurn(turnId)).ownerId, "cloud-test")
  const finished = [...globalThis.__malikBackgroundChatTurnsV1.values()].filter(turn => turn.status !== "pending")
  assert.ok(finished.length <= 128, "reading cloud history cannot grow the cache without a bound")
  assert.ok(finished.reduce((sum, turn) => sum + turn.content.length * 2 + 8192, 0) <= 32 * 1024 * 1024)
  assert.equal((await store.readBackgroundChatTurn(ids[0])).ownerId, "cloud-test", "evicted answers remain recoverable from encrypted cloud storage")
})

console.log(`${count}/${count} passed (real store/handler; auth and cloud IO stubbed)`)
