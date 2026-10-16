// Actual PostgreSQL SQL/encryption on a temporary PGlite disk. pg transport and
// advisory-lock concurrency are fixtures; run the live test for real pg/TLS.
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createRequire } from "node:module"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"

const qaRequire = createRequire(join(process.env.MALIK_QA_DEPS || process.cwd(), "fixture.cjs"))
const { PGlite } = qaRequire("@electric-sql/pglite")
const savedEnv = { ...process.env }
const temporary = await mkdtemp(join(tmpdir(), "malik-history-sql-"))
const sensitive = /^(FOUNDER_|PRIVATE_STATE_|MEDIA_STORAGE_|AWS_|R2_|CLOUDFLARE_R2_|DATABASE_URL$|S3_BUCKET$|STORAGE_BUCKET$|WORKOS_COOKIE_PASSWORD$)/
for (const key of Object.keys(process.env)) if (sensitive.test(key)) delete process.env[key]
process.env.FOUNDER_DATABASE_URL = "postgres://fixture:fixture@localhost/history"
process.env.FOUNDER_HISTORY_SECRET = "test-encryption-key-".repeat(4)
process.env.FOUNDER_HISTORY_DIRECTORY = join(temporary, "emergency-copy")
let database = await PGlite.create(join(temporary, "postgres")), offline = false, failNextConnection = false
const poolOptions = []
class Pool {
  constructor(options) { poolOptions.push(options) }
  on() {}
  async connect() {
    if (failNextConnection) { failNextConnection = false; throw Object.assign(new Error("cold connection reset"), { code: "ECONNRESET" }) }
    return { query: (...args) => this.query(...args), release() {} }
  }
  async query(sql, params) {
    if (offline) throw new Error("synthetic database outage")
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 }
    const result = await database.query(sql, params)
    return { rows: result.rows, rowCount: result.affectedRows }
  }
  async end() {}
}
const stubs = { pg: { Pool } }
const load = workTestLoader(stubs)
const pg = load("lib/server/durable-postgres.ts")
const log = load("lib/server/founder-message-log.ts")
const store = load("lib/server/private-json-store.ts")
const chats = load("lib/server/account-chat-state.ts")
const entry = { id: "sql-turn-1", userId: "customer@example.test", source: "chat", userText: "Приватный запрос", assistantText: "Проверенный ответ", status: "success" }

after(async () => {
  await pg.closeHistoryDatabase()
  await database.close()
  for (const key of Object.keys(process.env)) if (sensitive.test(key)) delete process.env[key]
  for (const [key, value] of Object.entries(savedEnv)) if (sensitive.test(key)) process.env[key] = value
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + "/") || resolve(temporary).startsWith(resolve(tmpdir()) + "\\"))
  await rm(temporary, { recursive: true, force: true })
})

test("external URLs require verified TLS; pool and deadlines are bounded", () => {
  const config = pg.historyPoolConfig("postgres://u:p@example.test/db?sslmode=disable&uselibpqcompat=true")
  assert.equal(new URL(config.connectionString).searchParams.get("sslmode"), "verify-full")
  assert.equal(new URL(config.connectionString).searchParams.has("uselibpqcompat"), false)
  assert.equal(config.max, 3)
  assert.equal(config.statement_timeout, 5000)
  assert.equal(config.connectionTimeoutMillis, 10000)
  assert.throws(() => pg.historyPoolConfig("https://example.test"), /INVALID_HISTORY/)
})

test("request + actual answer are encrypted in SQL, never plaintext or email", async () => {
  assert.equal(await log.appendFounderMessage(entry), true)
  assert.equal(log.founderMessageStorageMode(), "encrypted-postgres")
  const result = await database.query("SELECT * FROM malik_founder_audit_v1")
  assert.equal(result.rows.length, 1)
  assert.doesNotMatch(JSON.stringify(result.rows), /Приватный|Проверенный|customer@example/)
  assert.equal((await log.readFounderMessageLog(entry.userId))[0].assistantText, entry.assistantText)
  assert.deepEqual(await log.readFounderMessageLog("other@example.test"), [])
})

test("late pending cannot overwrite a completed answer; writes are idempotent", async () => {
  await log.appendFounderMessage({ ...entry, status: "pending", assistantText: "" })
  const history = await log.readFounderMessageLog(entry.userId)
  assert.equal(history.length, 1)
  assert.equal(history[0].status, "success")
  assert.equal(history[0].assistantText, entry.assistantText)
})

test("30 simultaneous turns remain distinct and connection pool is reused", async () => {
  await Promise.all(Array.from({ length: 30 }, (_, i) => log.appendFounderMessage({ ...entry, id: `parallel-${i}` })))
  assert.equal((await log.readFounderMessageLog(entry.userId)).length, 31)
  assert.equal(poolOptions.length, 1)
})

test("owner health canary really writes, reads and decrypts without deleting conversations", async () => {
  assert.deepEqual(await log.founderMessageStorageCheck(), { durable: true, reason: "POSTGRES_WRITE_READ_DECRYPT_OK" })
  assert.equal((await log.readFounderMessageLog(entry.userId)).length, 31)
  await assert.rejects(pg.deletePostgresAuditCanary("not-owner", "real-turn"), /INVALID_HISTORY_CANARY/)
})

test("private state has encrypted payloads and atomic revisions", async () => {
  const key = "private/test/account.json"
  assert.deepEqual(await store.readPrivateJsonVersioned(key), { value: null, etag: null })
  assert.deepEqual(await store.writePrivateJsonConditional(key, { text: "Личная история" }, null), { stored: true, conflict: false })
  const previous = await store.readPrivateJsonVersioned(key)
  const competing = await Promise.all([1, 2].map(n => store.writePrivateJsonConditional(key, { n }, previous.etag)))
  assert.equal(competing.filter(r => r.stored).length, 1)
  assert.equal(competing.filter(r => r.conflict).length, 1)
  assert.doesNotMatch(JSON.stringify((await database.query("SELECT * FROM malik_private_state_v1")).rows), /Личная история|private\/test/)
})

test("normal account chat synchronization works with PostgreSQL, not only owner audit", async () => {
  const state = { chats: [{ id: "chat-1", title: "SQL test", updatedAt: Date.now(), messages: [{ id: "m-1", role: "user", content: "Stored question" }] }] }
  assert.equal((await chats.writeAccountChatState("account-1", state)).stored, true)
  assert.equal((await chats.readAccountChatState("account-1")).state.chats[0].id, "chat-1")
  assert.equal((await chats.readAccountChatState("account-2")).state, null)
})

test("delete leaves an encrypted tombstone, preventing legacy resurrection", async () => {
  assert.equal(await store.deletePrivateJson("private/test/account.json"), true)
  const result = await store.readPrivateJsonVersioned("private/test/account.json")
  assert.equal(result.value, null)
  assert.ok(result.etag)
})

test("closing + reopening the database disk and modules preserves chats and audit", async () => {
  await pg.closeHistoryDatabase()
  await database.close()
  database = await PGlite.create(join(temporary, "postgres"))
  const reload = workTestLoader(stubs)
  assert.equal((await reload("lib/server/founder-message-log.ts").readFounderMessageLog(entry.userId)).length, 31)
  assert.equal((await reload("lib/server/account-chat-state.ts").readAccountChatState("account-1")).state.chats[0].id, "chat-1")
})

test("outage is not an empty history or successful durable save", async () => {
  offline = true
  await assert.rejects(log.readFounderMessageLog(entry.userId))
  await assert.rejects(chats.readAccountChatState("account-1"))
  assert.equal(await log.appendFounderMessage({ ...entry, id: "outage-copy" }), false)
  assert.deepEqual(await log.founderMessageStorageCheck(), { durable: false, reason: "DATABASE_CHECK_FAILED" })
  offline = false
  assert.equal((await log.readFounderMessageLog(entry.userId)).find(e => e.id === "outage-copy").assistantText, entry.assistantText)
})

test("wrong encryption key fails closed rather than yielding empty data", async () => {
  const correct = process.env.FOUNDER_HISTORY_SECRET
  process.env.FOUNDER_HISTORY_SECRET = "different-encryption-key-".repeat(4)
  await assert.rejects(log.readFounderMessageLog(entry.userId))
  await assert.rejects(store.readPrivateJsonVersioned("private/test/account.json"))
  process.env.FOUNDER_HISTORY_SECRET = correct
})

test("a transient cold-start connection gets one bounded retry without losing a turn", async () => {
  await pg.closeHistoryDatabase()
  failNextConnection = true
  assert.equal(await log.appendFounderMessage({ ...entry, id: "cold-start-turn" }), true)
  assert.equal((await log.readFounderMessageLog(entry.userId)).find(e => e.id === "cold-start-turn").assistantText, entry.assistantText)
})

test("streamed final answer travels through production audit + SQL + owner API", async () => {
  let viewer = { id: "owner", email: "owner@example.test", emailVerified: true }
  const oldOwner = process.env.MALIK_OWNER_EMAIL
  process.env.MALIK_OWNER_EMAIL = viewer.email
  const apiLoad = workTestLoader({ ...stubs,
    "@/lib/auth/server": { getOptionalWorkOSAuth: async () => ({ user: viewer }) },
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated: true, userId: entry.userId }) },
  })
  try {
    const audit = apiLoad("lib/server/founder-request-audit.ts")
    const wire = 'event: content\ndata: {"content":"Draft","contentMode":"delta"}\n\nevent: done\ndata: {"ok":true,"finalContent":"Final SQL answer","model":"fixture-model"}\n\n'
    const response = await audit.withFounderRequestAudit(async () => new Response(wire, { headers: { "content-type": "text/event-stream" } }))(
      new Request("http://localhost/api/stream", { method: "POST", body: JSON.stringify({ prompt: "SQL audit question", userId: "forged-identity" }) }))
    assert.equal(await response.text(), wire)
    const api = apiLoad("app/api/founder/messages/route.ts")
    const request = new Request(`http://localhost/api/founder/messages?email=${encodeURIComponent(entry.userId)}`)
    const payload = await (await api.GET(request)).json()
    assert.equal(payload.storage, "encrypted-postgres")
    const saved = payload.entries.find(e => e.userText === "SQL audit question")
    assert.equal(saved.assistantText, "Final SQL answer")
    assert.equal(saved.model, "fixture-model")
    assert.deepEqual(await log.readFounderMessageLog("forged-identity"), [])
    viewer = { id: "not-owner", email: "another@example.test", emailVerified: true }
    assert.equal((await api.GET(request)).status, 403)
    viewer = { id: "owner", email: "owner@example.test", emailVerified: true }
    offline = true
    assert.equal((await api.GET(request)).status, 503, "database outage cannot masquerade as an empty history")
  } finally {
    offline = false
    if (oldOwner === undefined) delete process.env.MALIK_OWNER_EMAIL
    else process.env.MALIK_OWNER_EMAIL = oldOwner
  }
})
