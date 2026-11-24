import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const auth = workTestLoader()("lib/auth/admin-policy.ts")
test("founder requires verified email", () => {
  const email = auth.malikOwnerEmail()
  assert.equal(auth.isVerifiedOwner({ email, emailVerified: false }), false)
  assert.equal(auth.isVerifiedOwner({ email }), false)
  assert.equal(auth.isVerifiedOwner({ email, emailVerified: true }), true)
  assert.equal(auth.isVerifiedOwner(null), false)
})

const request = (body) => new Request("https://example.test/api", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
})
const get = (path = "/api") => new Request("https://example.test" + path)
const guest = { authenticated: false, userId: "guest:test", plan: "free" }
const account = { authenticated: true, userId: "account-a", plan: "free" }

function fixture(identity, allowed = true, extras = {}) {
  return workTestLoader({
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => identity },
    "@/lib/server/request-frequency": { takeSharedRequestFrequency: async () => allowed },
    ...extras,
  })
}

test("sensitive routes reject anonymous access before touching providers", async () => {
  const load = fixture(guest, true, {
    "@/lib/server/code-execution-runtime": { executeMalikCode: () => assert.fail("execution not allowed"), malikCodeExecutionStatus: () => ({}) },
    "@/lib/voice/usage": { getVoiceUsage: () => assert.fail("quota must not be read") },
    "@/lib/server/gemini-live-token": { mintLiveToken: () => assert.fail("token must not be minted") },
    "@/lib/voice/gemini-live-setup": { LIVE_WS_URL: "" },
    "next/server": { NextResponse: Response },
  })
  assert.equal((await load("app/api/ai/execute/route.ts").POST(request({ confirm: true }))).status, 401)
  assert.equal((await load("app/api/voice/deepgram-token/route.ts").GET(get())).status, 401)
  assert.equal((await load("app/api/voice/gemini-live-token/route.ts").GET(get())).status, 401)
  assert.equal((await load("app/api/ai/video/file/route.ts").GET(get())).status, 401)
  assert.equal((await load("app/api/attachments/import-url/route.ts").POST(request({ url: "https://example.test/a.png" }))).status, 401)
})

test("provider token and execution requests stop at rate limit", async () => {
  const load = fixture(account, false, {
    "@/lib/server/code-execution-runtime": { executeMalikCode: () => assert.fail("execution not allowed"), malikCodeExecutionStatus: () => ({}) },
    "@/lib/voice/usage": { getVoiceUsage: () => assert.fail("quota must not be read") },
    "@/lib/server/gemini-live-token": { mintLiveToken: () => assert.fail("token must not be minted") },
    "@/lib/voice/gemini-live-setup": { LIVE_WS_URL: "" },
    "next/server": { NextResponse: Response },
  })
  assert.equal((await load("app/api/ai/execute/route.ts").POST(request({ confirm: true }))).status, 429)
  assert.equal((await load("app/api/voice/deepgram-token/route.ts").GET(get())).status, 429)
  assert.equal((await load("app/api/voice/gemini-live-token/route.ts").GET(get())).status, 429)
})

test("media importer refuses private DNS before making any connection", async () => {
  const noNetwork = () => assert.fail("private address must not be contacted")
  const load = fixture(account, true, {
    "node:dns/promises": { lookup: async () => [{ address: "127.0.0.1", family: 4 }] },
    "node:http": { request: noNetwork }, "node:https": { request: noNetwork },
  })
  const response = await load("app/api/attachments/import-url/route.ts").POST(request({ url: "https://example.test/image.png" }))
  assert.equal(response.status, 400)
})

test("media importer pins the checked DNS result and preserves original TLS hostname", async () => {
  const { EventEmitter } = await import("node:events")
  let calls = 0
  const load = fixture(account, true, {
    "node:dns/promises": { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
    "node:https": { request: (options, callback) => {
      calls++
      assert.equal(options.hostname, "93.184.216.34")
      assert.equal(options.servername, "example.test")
      assert.equal(options.headers.host, "example.test")
      const emitter = new EventEmitter()
      emitter.end = () => callback({
        statusCode: 200, headers: { "content-type": "image/png" },
        destroy() {}, async *[Symbol.asyncIterator]() { yield Buffer.from("test") },
      })
      return emitter
    } },
  })
  const response = await load("app/api/attachments/import-url/route.ts").POST(request({ url: "https://example.test/image.png" }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).file.size, 4)
  assert.equal(calls, 1)
})

test("shared quota failures are closed rather than granting new requests", async () => {
  const load = workTestLoader({
    "@/lib/server/durable-postgres": {
      durablePostgresConfigured: () => true,
      incrementPostgresQuota: async () => { throw new Error("offline") },
      sweepPostgresQuotas: () => {},
    },
  })
  assert.equal(await load("lib/server/request-frequency.ts").takeSharedRequestFrequency("test", "user", 2), false)
})

test("execution rejects oversized JSON before calling runner", async () => {
  const load = fixture(account, true, {
    "@/lib/server/code-execution-runtime": { executeMalikCode: () => assert.fail("oversized code must not run"), malikCodeExecutionStatus: () => ({}) },
  })
  const response = await load("app/api/ai/execute/route.ts").POST(request({ confirm: true, code: "x".repeat(600 * 1024) }))
  assert.equal(response.status, 413)
})
