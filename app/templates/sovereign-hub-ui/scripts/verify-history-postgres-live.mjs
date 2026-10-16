// Opt-in live PostgreSQL test. Credentials arrive on stdin with terminal echo
// disabled, never in arguments, output, source files or committed fixtures.
import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"

if (process.argv.includes("--restart-reader")) {
  const load = workTestLoader(), log = load("lib/server/founder-message-log.ts"), pg = load("lib/server/durable-postgres.ts")
  try {
    const history = await log.readFounderMessageLog(process.env.QA_HISTORY_OWNER)
    assert.equal(history.find(e => e.id === process.env.QA_HISTORY_REQUEST)?.assistantText, "Live encrypted answer")
    assert.equal((await load("lib/server/private-json-store.ts").readPrivateJson(process.env.QA_HISTORY_STATE)).text, "Live private state")
    console.log("PASS fresh-process read after connection shutdown")
  } finally { await pg.closeHistoryDatabase() }
} else {
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.setEncoding("utf8")
  console.log("READY_FOR_PRIVATE_DATABASE_CONNECTION")
  const input = await new Promise((resolve, reject) => {
    let text = ""
    const consume = part => {
      if (part.includes("\u0003")) { reject(new Error("Cancelled")); return }
      text += part
      if (text.length > 16000) { reject(new Error("Input too large")); return }
      if (/[\r\n]/.test(text)) { process.stdin.removeListener("data", consume); process.stdin.pause(); resolve(text.trim()) }
    }
    process.stdin.on("data", consume)
    process.stdin.once("end", () => reject(new Error("No private connection received")))
  }).finally(() => { if (process.stdin.isTTY) process.stdin.setRawMode(false) })
  const { connectionString } = JSON.parse(input)
  for (const key of Object.keys(process.env)) if (/^(FOUNDER_|PRIVATE_STATE_|MEDIA_STORAGE_|AWS_|R2_|CLOUDFLARE_R2_|S3_BUCKET$|STORAGE_BUCKET$|DATABASE_URL$)/.test(key)) delete process.env[key]
  const nonce = randomUUID(), owner = `qa-health-${nonce}`, id = `health-${nonce}`, key = `private/health/${nonce}.json`
  Object.assign(process.env, {
    FOUNDER_DATABASE_URL: connectionString, FOUNDER_HISTORY_SECRET: randomBytes(48).toString("base64"),
    QA_HISTORY_OWNER: owner, QA_HISTORY_REQUEST: id, QA_HISTORY_STATE: key,
  })
  const load = workTestLoader(), log = load("lib/server/founder-message-log.ts"), pg = load("lib/server/durable-postgres.ts")
  const state = load("lib/server/private-json-store.ts")
  const qaRequire = createRequire(join(process.env.MALIK_QA_DEPS || process.cwd(), "fixture.cjs"))
  const { Pool } = qaRequire("pg")
  const inspect = new Pool(pg.historyPoolConfig(connectionString))
  const ownerHash = createHash("sha256").update(owner).digest("hex").slice(0, 40)
  try {
    await pg.readPostgresAudit(ownerHash)
    assert.equal(await log.appendFounderMessage({ id, userId: owner, source: "chat", userText: "Live synthetic question", assistantText: "Live encrypted answer", status: "success" }), true)
    assert.equal((await log.readFounderMessageLog(owner))[0].assistantText, "Live encrypted answer")
    console.log("PASS real PostgreSQL driver + verified TLS + encrypted request/answer")
    assert.equal(await state.writePrivateJson(key, { text: "Live private state" }), true)
    const original = await state.readPrivateJsonVersioned(key)
    const writes = await Promise.all([1, 2].map(n => state.writePrivateJsonConditional(key, { text: "Live private state", n }, original.etag)))
    assert.equal(writes.filter(r => r.stored).length, 1)
    assert.equal(writes.filter(r => r.conflict).length, 1)
    console.log("PASS real concurrent compare-and-swap")
    assert.equal((await log.founderMessageStorageCheck()).durable, true)
    const raw = await inspect.query("SELECT encrypted_payload FROM malik_founder_audit_v1 WHERE owner_hash=$1", [ownerHash])
    assert.doesNotMatch(raw.rows[0].encrypted_payload, /Live encrypted|Live synthetic/)
    await pg.closeHistoryDatabase()
    const child = spawnSync(process.execPath, ["scripts/verify-history-postgres-live.mjs", "--restart-reader"], { env: process.env, encoding: "utf8", timeout: 30000, windowsHide: true })
    assert.equal(child.status, 0, "Fresh-process verification failed (details suppressed to protect credentials)")
    console.log(child.stdout.trim())
    console.log("LIVE HISTORY POSTGRES: 4/4 PASS")
  } finally {
    // Delete ONLY this run's generated synthetic canaries, never existing user data.
    await inspect.query("DELETE FROM malik_founder_audit_v1 WHERE owner_hash=$1 AND request_id=$2", [ownerHash, id]).catch(() => {})
    await inspect.query("DELETE FROM malik_private_state_v1 WHERE key_hash=$1", [createHash("sha256").update(key).digest("hex")]).catch(() => {})
    await pg.closeHistoryDatabase()
    await inspect.end()
  }
}
