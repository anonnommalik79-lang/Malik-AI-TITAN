// Real encryption, filesystem and production audit/API code. WorkOS identity
// and S3 transport are fixtures: this does not prove a production deployment.
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"

const savedEnv = { ...process.env }
const temporary = await mkdtemp(join(tmpdir(), "malik-founder-test-"))
const sensitiveEnv = /^(FOUNDER_HISTORY_|PRIVATE_STATE_|MEDIA_STORAGE_|AWS_|R2_|CLOUDFLARE_R2_|S3_BUCKET$|STORAGE_BUCKET$|WORKOS_COOKIE_PASSWORD$|WORKOS_API_KEY$|MALIK_OWNER_)/
for (const key of Object.keys(process.env)) if (sensitiveEnv.test(key)) delete process.env[key]
process.env.MALIK_OWNER_EMAIL = "owner@example.test"
let viewer = null
let accountId = "customer@example.test"
let cloudFailure = false
let cloudOperations = 0
const objects = new Map()
class GetObjectCommand { constructor(input) { this.input = input } }
class PutObjectCommand { constructor(input) { this.input = input } }
class ListObjectsV2Command { constructor(input) { this.input = input } }
class DeleteObjectCommand { constructor(input) { this.input = input } }
class S3Client {
  async send(command) {
    cloudOperations++
    if (cloudFailure) throw new Error("offline storage fixture")
    const { Key, Prefix, Body } = command.input
    if (command instanceof PutObjectCommand) { objects.set(Key, String(Body)); return {} }
    if (command instanceof DeleteObjectCommand) { objects.delete(Key); return {} }
    if (command instanceof ListObjectsV2Command) return { Contents: [...objects.keys()].filter(k => k.startsWith(Prefix)).map(Key => ({ Key })), IsTruncated: false }
    if (!objects.has(Key)) throw Object.assign(new Error("missing fixture"), { name: "NoSuchKey" })
    return { Body: { transformToString: async () => objects.get(Key) } }
  }
}
const stubs = {
  "node:os": { tmpdir: () => temporary },
  "@aws-sdk/client-s3": { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand },
  "@/lib/auth/server": { getOptionalWorkOSAuth: async () => ({ user: viewer }) },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated: true, userId: accountId }) },
  "@/lib/server/request-safety": { fetchWithTimeout: async () => Response.json({ data: [{ id: "customer-id", email: "customer@example.test", name: "Fixture customer" }] }) },
}
const load = workTestLoader(stubs)
const store = load("lib/server/founder-message-log.ts")
const audit = load("lib/server/founder-request-audit.ts")
const messages = load("app/api/founder/messages/route.ts")
const activity = load("app/api/founder/activity/route.ts")
const access = load("lib/server/founder-history-access.ts")
const entry = { id: "request-1", userId: "customer@example.test", source: "chat", userText: "Test request", assistantText: "Test answer", status: "success" }
const frame = (type, payload) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
const request = body => new Request("http://localhost/api/stream", { method: "POST", body: JSON.stringify(body) })
after(async () => {
  for (const key of Object.keys(process.env)) if (sensitiveEnv.test(key)) delete process.env[key]
  for (const [key, value] of Object.entries(savedEnv)) if (sensitiveEnv.test(key)) process.env[key] = value
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + "/") && !resolve(temporary).startsWith(resolve(tmpdir()) + "\\")) throw new Error("Unsafe fixture cleanup path")
  await rm(temporary, { recursive: true, force: true })
})

test("no encryption secret: truthful unavailable status, no plaintext fallback", async () => {
  assert.equal(store.founderMessageStorageMode(), "unavailable")
  assert.equal(await store.appendFounderMessage(entry), false)
  assert.match(store.founderMessageStorageWarning(), /не сохраняется/)
  assert.deepEqual(await readdir(temporary), [])
  process.env.WORKOS_COOKIE_PASSWORD = "fixture-encryption-secret-".repeat(3)
})

test("no cloud: encrypted server files are really written, not discarded", async () => {
  assert.equal(store.founderMessageStorageMode(), "encrypted-runtime-filesystem")
  assert.match(store.founderMessageStorageWarning(), /может исчезнуть|могут исчезнуть/)
  assert.equal(await store.appendFounderMessage(entry), true)
  assert.equal((await store.readFounderMessageLog(entry.userId))[0].assistantText, entry.assistantText)
  const directories = await readdir(join(temporary, "malik-founder-history-v1"))
  assert.equal(directories.length, 1)
  assert.doesNotMatch(directories[0], /customer|example/)
  const ciphertext = await readFile(join(temporary, "malik-founder-history-v1", directories[0], "request-1.enc.json"), "utf8")
  assert.doesNotMatch(ciphertext, /Test request|Test answer|customer@example/)
  assert.equal(JSON.parse(ciphertext).alg, "aes-256-gcm")
})

test("module reload reads actual files without process-memory history", async () => {
  const reloaded = workTestLoader(stubs)("lib/server/founder-message-log.ts")
  assert.equal((await reloaded.readFounderMessageLog("CUSTOMER@example.test"))[0].userText, entry.userText)
  assert.deepEqual(await reloaded.readFounderMessageLog("other@example.test"), [])
})

test("pending requests remain visible; final completion replaces the same record", async () => {
  await store.appendFounderMessage({ ...entry, id: "pending-1", status: "pending", assistantText: "" })
  let history = await store.readFounderMessageLog(entry.userId)
  assert.equal(history.find(e => e.id === "pending-1").status, "pending")
  await store.appendFounderMessage({ ...entry, id: "pending-1", assistantText: "Completed answer" })
  history = await store.readFounderMessageLog(entry.userId)
  assert.equal(history.filter(e => e.id === "pending-1").length, 1)
  assert.equal(history.find(e => e.id === "pending-1").assistantText, "Completed answer")
})

test("simultaneous requests do not overwrite one another", async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendFounderMessage({ ...entry, id: `parallel-${i}`, assistantText: `Answer ${i}` })))
  const history = await store.readFounderMessageLog(entry.userId)
  for (let i = 0; i < 20; i++) assert.equal(history.find(e => e.id === `parallel-${i}`).assistantText, `Answer ${i}`)
})

test("real audit stream to disk to owner API, final content and redaction preserved", async () => {
  const wire = frame("content", { content: "Draft", contentMode: "delta" }) + frame("done", { ok: true, finalContent: "Final answer password=hidden123", model: "fixture-model" })
  const response = await audit.withFounderRequestAudit(async () => new Response(wire, { headers: { "content-type": "text/event-stream" } }))(request({ prompt: "User question", userId: "forged@example.test" }))
  assert.equal(await response.text(), wire)
  viewer = { id: "owner-id", email: "owner@example.test", emailVerified: true }
  const result = await messages.GET(new Request("http://localhost/api/founder/messages?email=customer@example.test&id=customer-id"))
  assert.equal(result.status, 200)
  assert.match(result.headers.get("cache-control"), /private.*no-store/)
  const payload = await result.json()
  const turn = payload.entries.find(e => e.userText === "User question")
  assert.equal(turn.assistantText, "Final answer password=[REDACTED]")
  assert.equal(turn.model, "fixture-model")
  assert.equal(turn.status, "success")
  assert.equal((await store.readFounderMessageLog("forged@example.test")).length, 0)
})

test("UIMessage parts and standard voice JSON replies are logged", async () => {
  const wrapped = audit.withFounderRequestAudit(async () => Response.json({ content: "Parts reply" }))
  await (await wrapped(request({ messages: [{ role: "user", parts: [{ type: "text", text: "Parts question" }, { type: "file", url: "private-file" }] }] }))).text()
  const voice = audit.withFounderRequestAudit(async () => Response.json({ content: "Voice reply" }), "voice")
  await (await voice(request({ transcript: "Voice question" }))).text()
  const history = await store.readFounderMessageLog(entry.userId)
  assert.equal(history.find(e => e.userText === "Parts question").assistantText, "Parts reply")
  assert.equal(history.find(e => e.userText === "Voice question").source, "voice")
})

test("failures and interrupted streams keep user prompt and partial answer", async () => {
  const error = audit.withFounderRequestAudit(async () => Response.json({ ok: false, error: "UPSTREAM", message: "Provider unavailable" }, { status: 502 }))
  await (await error(request({ prompt: "Failed question" }))).text()
  const interrupted = audit.withFounderRequestAudit(async () => new Response(frame("content", { content: "Partial", contentMode: "delta" }), { headers: { "content-type": "text/event-stream" } }))
  await (await interrupted(request({ prompt: "Interrupted question" }))).text()
  const history = await store.readFounderMessageLog(entry.userId)
  assert.equal(history.find(e => e.userText === "Failed question").status, "failed")
  const turn = history.find(e => e.userText === "Interrupted question")
  assert.equal(turn.status, "interrupted")
  assert.equal(turn.assistantText, "Partial")
})

test("owner alone sees activity with requests, replies, and reply-text search", async () => {
  process.env.WORKOS_API_KEY = "fixture-only"
  const response = await activity.GET(new Request("http://localhost/api/founder/activity?q=Final%20answer"))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.items.length, 1)
  assert.equal(payload.items[0].userEmail, entry.userId)
  assert.equal(payload.items[0].userText, "User question")
  assert.match(payload.items[0].assistantText, /Final answer/)
})

test("anonymous, another account, and an unverified owner address cannot read chat content", async () => {
  for (const identity of [null, { email: "other@example.test", emailVerified: true }, { email: "owner@example.test", emailVerified: false }]) {
    viewer = identity
    const req = new Request("http://localhost/api/founder/messages?email=customer@example.test", { headers: { "x-malik-admin-email": "owner@example.test" } })
    assert.equal((await messages.GET(req)).status, 403)
    assert.equal((await activity.GET(req)).status, 403)
  }
  process.env.MALIK_OWNER_WORKOS_USER_ID = "pinned-owner"
  assert.equal(access.canReadFounderHistory({ id: "wrong-id", email: "owner@example.test", emailVerified: false }), false)
  assert.equal(access.canReadFounderHistory({ id: "pinned-owner", email: "owner@example.test", emailVerified: false }), true)
  delete process.env.MALIK_OWNER_WORKOS_USER_ID
  viewer = { id: "owner-id", email: "owner@example.test", emailVerified: true }
})

test("large text is retained up to the explicit limit, truncation never hidden", async () => {
  await store.appendFounderMessage({ ...entry, id: "long-1", assistantText: "x".repeat(store.MAX_FOUNDER_TEXT_CHARS + 5) })
  const turn = (await store.readFounderMessageLog(entry.userId)).find(e => e.id === "long-1")
  assert.equal(turn.assistantText.length, store.MAX_FOUNDER_TEXT_CHARS)
  assert.equal(turn.textTruncated, true)
})

test("disk health verifies a real write/read without claiming persistent mount", async () => {
  assert.deepEqual(await store.founderMessageStorageCheck(), { durable: false, reason: "EPHEMERAL_WRITE_READ_OK" })
  process.env.FOUNDER_HISTORY_DIRECTORY = join(temporary, "explicit-disk")
  assert.equal(store.founderMessageStorageMode(), "encrypted-directory")
  assert.deepEqual(await store.founderMessageStorageCheck(), { durable: false, reason: "DIRECTORY_WRITE_READ_OK_VERIFY_MOUNT" })
  delete process.env.FOUNDER_HISTORY_DIRECTORY
})

test("unreadable or corrupted records return 503, not a fake empty history", async () => {
  const root = join(temporary, "malik-founder-history-v1")
  const directories = await readdir(root)
  let directory
  for (const name of directories) if ((await readdir(join(root, name))).includes("request-1.enc.json")) directory = join(root, name)
  await writeFile(join(directory, "corrupted.enc.json"), "not-an-envelope", "utf8")
  const response = await messages.GET(new Request("http://localhost/api/founder/messages?email=customer@example.test"))
  assert.equal(response.status, 503)
  await rm(join(directory, "corrupted.enc.json"))
})

test("PRIVATE_STATE credentials reuse encrypted object storage rather than dropping logs", async () => {
  process.env.PRIVATE_STATE_BUCKET = "fixture-private"
  process.env.PRIVATE_STATE_ACCESS_KEY_ID = "fixture-access"
  process.env.PRIVATE_STATE_SECRET_ACCESS_KEY = "fixture-secret"
  assert.equal(store.founderMessageStorageMode(), "encrypted-object-storage")
  assert.equal(await store.appendFounderMessage({ ...entry, userId: "cloud@example.test", id: "cloud-1" }), true)
  assert.equal((await store.readFounderMessageLog("cloud@example.test"))[0].assistantText, entry.assistantText)
  assert.ok((await store.readFounderMessageLog(entry.userId)).some(e => e.id === "request-1"), "connecting cloud must not hide this host's existing records")
  assert.ok(cloudOperations > 0)
  assert.doesNotMatch([...objects.values()].join(""), /Test request|Test answer/)
  assert.deepEqual(await store.founderMessageStorageCheck(), { durable: true, reason: "WRITE_READ_DECRYPT_OK" })
})

test("cloud outage is visible, no silent success or empty-history substitution", async () => {
  cloudFailure = true
  const previousError = console.error
  console.error = () => {}
  try {
    assert.equal(await store.appendFounderMessage({ ...entry, id: "failed-cloud" }), false)
    const response = await messages.GET(new Request("http://localhost/api/founder/messages?email=cloud@example.test"))
    assert.equal(response.status, 503)
  } finally { console.error = previousError; cloudFailure = false }
})
