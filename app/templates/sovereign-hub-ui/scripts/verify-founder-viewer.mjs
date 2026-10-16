import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const saved = { owner: process.env.MALIK_OWNER_EMAIL, pin: process.env.MALIK_OWNER_WORKOS_USER_ID, key: process.env.WORKOS_API_KEY }
process.env.MALIK_OWNER_EMAIL = "owner@example.test"
process.env.WORKOS_API_KEY = "fixture-only"
delete process.env.MALIK_OWNER_WORKOS_USER_ID
let calls = 0, record = {}, fail = false
const { verifyFounderHistoryViewer: verify, founderHistoryAccessDenied: denied } = workTestLoader({
  "@/lib/server/request-safety": { fetchWithTimeout: async () => {
    calls++
    if (fail) throw new Error("offline fixture")
    return Response.json(record)
  } },
})("lib/server/founder-viewer-verification.ts")
try {
  assert.equal(await verify(null), false)
  assert.equal(await verify({ id: "other", email: "other@example.test", emailVerified: true }), false)
  assert.equal(calls, 0)
  assert.equal(await verify({ id: "owner", email: "owner@example.test", emailVerified: true }), true)
  const stale = { id: "owner", email: "owner@example.test", emailVerified: false }
  record = { id: "owner", email: stale.email, email_verified: true }
  assert.equal(await verify(stale), true)
  record = { ...record, id: "different-id" }
  assert.equal(await verify(stale), false)
  record = { id: "owner", email: "other@example.test", email_verified: true }
  assert.equal(await verify(stale), false)
  record = { id: "owner", email: stale.email, email_verified: false }
  assert.equal(await verify(stale), false)
  fail = true
  assert.equal(await verify(stale), false)
  process.env.MALIK_OWNER_WORKOS_USER_ID = "owner"
  assert.equal(await verify(stale), true)
  assert.equal(denied(null).status, 403)
  assert.equal((await denied(null).json()).reason, "SIGN_IN_REQUIRED")
  const browser = new Request("https://app.example.test/api/founder/storage-health", { headers: { accept: "text/html" } })
  assert.equal(denied(null, browser).status, 303)
  assert.equal(denied(null, browser).headers.get("location"), "/sign-in?returnTo=%2Ffounder%2Fhistory")
  assert.equal(denied(stale, browser).headers.get("location"), "/founder/history")
  console.log("PASS founder viewer: 14 access/identity/redirect assertions; provider is a fixture")
} finally {
  for (const [key, value] of [["MALIK_OWNER_EMAIL", saved.owner], ["MALIK_OWNER_WORKOS_USER_ID", saved.pin], ["WORKOS_API_KEY", saved.key]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
}
