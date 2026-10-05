import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40), d = "d".repeat(40), e = "e".repeat(40)
let connected = true, head = a, calls = [], owner = { userId: "qa-github-owner", plan: "pro", authenticated: true }
process.env.WORK_CONFIRMATION_SECRET = "qa-only-confirmation-secret-32-characters"
process.env.GITHUB_TOKEN = "decoy-token-must-never-be-used"
const load = workTestLoader({ "@/lib/server/plugin-pipes": { getPipesCredential: async () => ({ active: connected, value: connected ? "qa-user-pipes-token" : undefined }) }, "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner } })
const store = load("lib/os/store.ts"), backend = { ...store.memoryBackend(), durable: true }; store.configureOsBackend(backend)
const github = load("lib/work/github.ts"), route = load("app/api/work/github/route.ts").POST
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  assert.equal(new URL(url).origin, "https://api.github.com"); assert.equal(init.headers.Authorization, "Bearer qa-user-pipes-token"); assert.equal(init.redirect, "error")
  const endpoint = new URL(url).pathname, method = init.method, body = init.body ? JSON.parse(init.body) : undefined
  calls.push({ endpoint, method, body })
  let data
  if (endpoint.includes("/git/ref/heads/")) data = { object: { sha: endpoint.endsWith("/main") ? a : head } }
  else if (endpoint.includes("/contents/")) data = { type: "file", encoding: "base64", content: Buffer.from("old\n").toString("base64"), size: 4, sha: c }
  else if (endpoint.endsWith(`/git/commits/${a}`)) data = { tree: { sha: b } }
  else if (endpoint.endsWith("/git/blobs")) data = { sha: c }
  else if (endpoint.endsWith("/git/trees") && method === "POST") { assert.equal(body.base_tree, b); data = { sha: d } }
  else if (endpoint.includes("/git/trees/")) data = { sha: b, tree: [{ path: "index.ts", type: "blob", sha: c }], truncated: false }
  else if (endpoint.endsWith("/git/commits")) { assert.deepEqual(body.parents, [a]); data = { sha: e } }
  else if (endpoint.includes("/git/refs/heads/") && method === "PATCH") { assert.equal(body.force, false); head = body.sha; data = { object: { sha: head } } }
  else if (endpoint.endsWith("/git/refs")) data = { object: { sha: body.sha } }
  else if (endpoint.endsWith("/pulls")) data = { number: 1, html_url: "https://github.com/qa-owner/qa-repo/pull/1" }
  else if (endpoint === "/search/code") data = { total_count: 1, items: [{ path: "index.ts", name: "index.ts", html_url: "https://github.com/qa-owner/qa-repo/blob/main/index.ts" }] }
  else throw Error(`Unexpected endpoint ${method} ${endpoint}`)
  return Response.json(data)
}
let passed = 0; async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`) }
const payload = { action: "commit", repo: "qa-owner/qa-repo", branch: "feature/work", expectedHead: a, message: "Update", files: [{ path: "src/index.ts", content: "new\n" }] }
try {
  await check("no write without valid preview", async () => {
    await assert.rejects(github.executeGitHub(owner.userId, payload, "", "qa-operation-1"), error => error.status === 403); assert.equal(calls.length, 0)
  })
  const preview = await github.previewGitHub(owner.userId, payload)
  await check("preview reads actual files and never writes", () => {
    assert.ok(calls.every(call => call.method === "GET")); assert.equal(preview.files[0].addedLines, 1); assert.equal(preview.files[0].removedLines, 1)
  })
  await check("tampered payload, other owner and expired preview all rejected", async () => {
    for (const [id, input, now] of [[owner.userId, { ...payload, message: "Altered" }, Date.now()], ["another-owner", payload, Date.now()], [owner.userId, payload, Date.now() + 600001]]) await assert.rejects(github.executeGitHub(id, input, preview.confirmationId, "qa-invalid-op", now), error => error.status === 403)
    assert.ok(calls.every(call => call.method === "GET"))
  })
  await check("correct commit follows blobs -> base_tree -> commit -> non-force ref", async () => {
    calls = []; const result = await github.executeGitHub(owner.userId, payload, preview.confirmationId, "qa-operation-1")
    assert.equal(result.sha, e)
    assert.deepEqual(calls.filter(call => call.method !== "GET").map(call => [call.method, call.endpoint.split("/").slice(-2).join("/")]), [["POST", "git/blobs"], ["POST", "git/trees"], ["POST", "git/commits"], ["PATCH", "heads/feature/work".split("/").slice(-2).join("/")]])
    assert.doesNotMatch(JSON.stringify(result), /qa-user-pipes-token|decoy-token/)
  })
  await check("idempotency survives cleared process cache; changed key payload rejected", async () => {
    calls = []; store.configureOsBackend(backend)
    assert.equal((await github.executeGitHub(owner.userId, payload, preview.confirmationId, "qa-operation-1")).sha, e); assert.equal(calls.length, 0)
    head = a; const other = { ...payload, message: "Other" }, confirmation = await github.previewGitHub(owner.userId, other)
    await assert.rejects(github.executeGitHub(owner.userId, other, confirmation.confirmationId, "qa-operation-1"), error => error.code === "KEY_REUSED")
  })
  await check("changed head and unavailable durable storage fail closed", async () => {
    head = e; await assert.rejects(github.executeGitHub(owner.userId, payload, preview.confirmationId, "qa-head-changed"), error => error.code === "HEAD_CHANGED")
    store.configureOsBackend(store.memoryBackend()); await assert.rejects(github.executeGitHub(owner.userId, payload, preview.confirmationId, "qa-memory-store"), error => error.code === "PERSISTENCE_REQUIRED"); store.configureOsBackend(backend); head = a
  })
  await check("branch and draft pull request require confirmation and execute actual API sequence", async () => {
    const branch = { action: "branch", repo: payload.repo, base: "main", branch: "feature/new", expectedHead: a }, p = await github.previewGitHub(owner.userId, branch)
    assert.equal((await github.executeGitHub(owner.userId, branch, p.confirmationId, "qa-branch-op")).sha, a)
    const pr = { action: "pull-request", repo: payload.repo, base: "main", head: "feature/work", expectedHead: a, expectedBase: a, title: "QA draft", body: "Test", draft: true }, q = await github.previewGitHub(owner.userId, pr)
    assert.equal((await github.executeGitHub(owner.userId, pr, q.confirmationId, "qa-pr-op")).number, 1)
  })
  await check("a storage write failure prevents all external mutations", async () => {
    store.configureOsBackend({ ...backend, write: async () => false }); calls = []
    await assert.rejects(github.executeGitHub(owner.userId, payload, preview.confirmationId, "qa-storage-failed"), error => error.code === "PERSISTENCE_FAILED")
    assert.ok(calls.every(call => call.method === "GET")); store.configureOsBackend(backend)
  })
  await check("tree, file and search are scoped read APIs", async () => {
    for (const input of [{ action: "tree", repo: payload.repo, ref: "main" }, { action: "file", repo: payload.repo, ref: "main", path: "src/index.ts" }, { action: "search", repo: payload.repo, query: "example" }]) assert.ok(await github.readGitHub(owner.userId, input))
  })
  await check("missing connection and guest route return honest errors", async () => {
    connected = false; await assert.rejects(github.readGitHub(owner.userId, { action: "tree", repo: payload.repo, ref: "main" }), /GitHub не подключён/)
    owner = { ...owner, authenticated: false }; assert.equal((await route(new Request("http://qa.invalid/api/work/github", { method: "POST", body: "{}" }))).status, 401)
  })
  await check("audit contains no credentials or file contents", async () => {
    const receipts = await store.readOwnerJson(owner.userId, "work-activity"); assert.ok(receipts.length > 0); assert.doesNotMatch(JSON.stringify(receipts), /qa-user-pipes-token|decoy-token|src\/index|old\\n|new\\n/)
  })
} finally { globalThis.fetch = realFetch; delete process.env.GITHUB_TOKEN; delete process.env.WORK_CONFIRMATION_SECRET }
console.log(`${passed}/${passed} passed (actual HMAC/driver/store; fetch and Pipes credential stubbed, no real GitHub writes)`)
