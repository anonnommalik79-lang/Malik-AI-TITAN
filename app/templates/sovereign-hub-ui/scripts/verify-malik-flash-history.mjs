import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"
import * as fixture from "./stubs/memory-private-json-store.mjs"

const require = createRequire(import.meta.url)
const sharp = require("sharp")
const users = {
  alice: { authenticated: true, plan: "pro", userId: "alice@example.test" },
  bob: { authenticated: true, plan: "free", userId: "bob@example.test" },
  guest: { authenticated: false, plan: "free", userId: "guest:example" },
}
const assets = new Map()
let account = users.alice
const fakeDB = {
  durablePostgresConfigured: () => true,
  readPostgresPrivateJson: async key => ({ value: assets.get(key) || null, etag: null }),
  writePostgresPrivateJson: async (key, data) => { assets.set(key, structuredClone(data)); return { stored: true } },
}
function loadFixture() {
  return workTestLoader({
    "./private-json-store": fixture, "./durable-postgres": fakeDB,
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => account },
  })
}
const created = "2026-11-14T12:00:00.000Z"
function input(chatId, number, extra = {}) {
  return { chatId, userMessageId: "q" + number, assistantMessageId: "a" + number, ...extra }
}

test("completed transcripts survive reload, preserve chronological order and remain private to account/chat", async () => {
  globalThis.__malikStoreConfigured = true
  const load = loadFixture()
  const history = load("lib/server/malik-flash-history.ts")
  const chat = load("lib/server/account-chat-state.ts")
  const first = history.flashTurnInput(input("account-chat", 1))
  const result = (question, answer) => ({ question, answer, provider: "google-ai-mode-browser", model: "Google AI Mode",
    sources: [], browserConversation: true, startedAt: created, completedAt: created })
  await history.saveFlashTurn(users.alice.userId, first, result("Наш проект называется VOLTER", "Запомнил названный проект."))
  await history.saveFlashTurn(users.alice.userId, history.flashTurnInput(input("account-chat", 2)), result("Какой срок?", "В пятницу."))
  await history.saveFlashTurn(users.alice.userId, history.flashTurnInput(input("other-chat", 3)), result("Other task", "Other scope"))
  await history.saveFlashTurn(users.bob.userId, first, result("Bob private", "Bob only"))

  const again = loadFixture()
  const reader = again("lib/server/malik-flash-history.ts")
  const next = reader.flashTurnInput(input("account-chat", 5))
  const original = await reader.loadFlashHistory(users.alice.userId, next, "VOLTER")
  assert.deepEqual(original.messages.map(x => x.id), ["q1", "a1", "q2", "a2"])
  assert.equal(original.requireExisting, true)
  assert.match(original.context, /VOLTER/)
  assert.deepEqual((await reader.loadFlashHistory(users.bob.userId, next, "VOLTER")).messages.map(x => x.content), ["Bob private", "Bob only"])
  assert.deepEqual((await reader.loadFlashHistory(users.alice.userId, reader.flashTurnInput(input("other-chat", 8)), "VOLTER")).messages.map(x => x.content), ["Other task", "Other scope"])
  const isolated = await reader.loadFlashHistory(users.alice.userId, reader.flashTurnInput(input("account-chat", 6, { flashContextEnabled: false })), "private")
  assert.equal(isolated.requireExisting, false)
  assert.equal(isolated.context, undefined)

  const poison = reader.cleanFlashMetadataForSync({ chats: [{ id: "account-chat", flashMediaIds: ["f".repeat(32)], flashConversationStarted: false,
    messages: [{ id: "a1", role: "assistant", content: "stale device", flashServerSaved: true, answerProvider: "fake" }] }] })
  await chat.writeAccountChatState(users.alice.userId, poison)
  assert.match((await reader.loadFlashHistory(users.alice.userId, next, "VOLTER")).messages[1].content, /Запомнил/)
  assert.equal(await reader.canReadFlashAsset(users.alice.userId, "account-chat", "f".repeat(32)), false)
})

test("image receipts survive refresh, retain source lineage and honor authenticated deletion", async t => {
  globalThis.__malikStoreConfigured = true
  const restore = new Map(["NEXT_PUBLIC_MALIK_FLASH_PREVIEW", "MALIK_FLASH_ISOLATED_WORKER", "MALIK_FLASH_WORKER_URL", "MALIK_FLASH_WORKER_SECRET"].map(key => [key, process.env[key]]))
  Object.assign(process.env, { NEXT_PUBLIC_MALIK_FLASH_PREVIEW: "1", MALIK_FLASH_ISOLATED_WORKER: "1",
    MALIK_FLASH_WORKER_URL: "https://flash.test/v1/ask", MALIK_FLASH_WORKER_SECRET: "f".repeat(40) })
  const oldFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = oldFetch
    account = users.alice
    for (const [key, value] of restore) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const png = async color => sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer()
  const original = await png("red")
  const edited = await png("blue")
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body)
    calls++
    assert.equal(request.task, calls === 1 ? "image_generate" : "image_edit")
    if (calls === 2) {
      assert.equal(request.requireExisting, true)
      assert.deepEqual(Buffer.from(request.images[0].base64, "base64"), original)
    }
    return Response.json({
      requestId: request.requestId, kind: request.task, complete: true, origin: "google-ai-mode-browser", imageOrigin: "confirmed-generated-output", imagesProcessed: calls === 2,
      image: { mime: "image/png", base64: (calls === 1 ? original : edited).toString("base64") },
    }, { headers: { "x-request-id": request.requestId } })
  }
  const load = loadFixture()
  const { runFlashMedia } = load("lib/server/malik-flash-media.ts")
  const { runFlashChat } = load("lib/server/malik-flash-chat.ts")
  const controller = new AbortController()
  const run = (n, question, editing, extra = {}) => runFlashMedia({ account, body: input("image-chat", n, extra), question, editing, signal: controller.signal })
  const a = await run(1, "Create an image of a red car.", false)
  const b = await run(2, "Make it blue.", true, { flashSourceId: a.assetId })
  assert.equal(b.sourceAssetId, a.assetId)
  assert.equal(a.generatorProvider, "google-ai-mode-browser")
  assert.equal(a.generatorModel, undefined)
  assert.equal(a.durable, true)
  await assert.rejects(runFlashMedia({ account: users.bob, body: input("image-chat", 3, { flashSourceId: a.assetId }), question: "Edit", editing: true, signal: controller.signal }), { code: "FLASH_SOURCE_REQUIRED" })
  const provenance = await runFlashChat({ account, body: input("image-chat", 4), question: "Which generator made the first picture?" })
  assert.match(provenance.content, /Google AI Mode/)
  assert.equal(provenance.provider, "malik-chat-history")
  assert.equal(calls, 2)

  const reloaded = loadFixture()
  const media = reloaded("app/api/chat/flash-image/[chatId]/[assetId]/route.ts")
  const api = reloaded("app/api/chat/state/route.ts")
  const request = new Request("https://malik.test" + a.url)
  const params = { params: Promise.resolve({ chatId: "image-chat", assetId: a.assetId }) }
  const response = await media.GET(request, params)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original)
  account = users.bob
  assert.equal((await media.GET(request, params)).status, 404)
  account = users.guest
  assert.equal((await media.GET(request, params)).status, 401)
  account = users.alice
  const deletion = await api.PUT(new Request("https://malik.test/api/chat/state", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { deletedChatIds: ["image-chat"] } }),
  }))
  assert.equal(deletion.status, 200)
  assert.equal((await media.GET(request, params)).status, 404)
  assert.equal(assets.size, 2)
  assert.ok([...assets.values()].every(value => value === null))
})
