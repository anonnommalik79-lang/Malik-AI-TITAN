import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader({ "@/lib/server/plugin-pipes": { getPipesCredential: async () => ({ active: false }) } })
const github = load("lib/work/github.ts"), actualFetch = globalThis.fetch
const sha = "a".repeat(40), treeSha = "b".repeat(40), blob = "c".repeat(40)
let privateRepo = false, held = false, calls = 0, passed = 0
globalThis.fetch = async (url, init) => {
  calls++; assert.equal(new URL(url).origin, "https://api.github.com"); assert.equal(init.method, "GET")
  assert.equal(init.headers.Authorization, undefined); assert.equal(init.redirect, "error")
  if (held) return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
  const path = new URL(url).pathname
  if (path === "/repos/qa-owner/qa-repo") return Response.json({ default_branch: "main", private: privateRepo })
  if (path === "/repos/qa-owner/qa-repo/commits/main") return Response.json({ sha })
  if (path === `/repos/qa-owner/qa-repo/git/trees/${sha}`) return Response.json({ sha: treeSha, truncated: false, tree: [{ path: "README.md", type: "blob", mode: "100644", sha: blob, size: 3 }] })
  if (path === "/repos/qa-owner/qa-repo/contents/README.md") {
    assert.equal(new URL(url).searchParams.get("ref"), sha)
    return Response.json({ type: "file", encoding: "base64", content: Buffer.from("abc").toString("base64"), size: 3, sha: blob })
  }
  throw Error(`Unexpected ${url}`)
}
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`) }
try {
  await check("legacy read does not silently bypass a missing connection", async () => {
    await assert.rejects(github.readGitHub("qa-owner", { action: "snapshot", repo: "qa-owner/qa-repo" }), error => error.code === "NOT_CONNECTED")
    assert.equal(calls, 0)
  })
  await check("opt-in Work public fallback proves visibility and pins actual commit/tree", async () => {
    const snapshot = await github.readGitHub("qa-owner", { action: "snapshot", repo: "qa-owner/qa-repo" }, undefined, { allowPublic: true })
    assert.equal(snapshot.commitSha, sha); assert.equal(snapshot.treeSha, treeSha); assert.equal(snapshot.access, "public")
    assert.equal((await github.readGitHub("qa-owner", { action: "file", repo: snapshot.repo, ref: snapshot.commitSha, path: "README.md" }, undefined, { allowPublic: true })).content, "abc")
  })
  await check("private repository is rejected before commit/tree requests", async () => {
    privateRepo = true; const before = calls
    await assert.rejects(github.readGitHub("qa-owner", { action: "snapshot", repo: "qa-owner/qa-repo" }, undefined, { allowPublic: true }), error => error.code === "NOT_PUBLIC")
    assert.equal(calls, before + 1); privateRepo = false
  })
  await check("invalid repo/ref/path cannot change the fixed API origin", async () => {
    const before = calls
    for (const input of [{ action: "snapshot", repo: "https://evil.invalid" }, { action: "snapshot", repo: "qa-owner/qa-repo", ref: "../main" }, { action: "file", repo: "qa-owner/qa-repo", ref: sha, path: "../secret" }]) await assert.rejects(github.readGitHub("qa-owner", input, undefined, { allowPublic: true }))
    assert.equal(calls, before)
  })
  await check("caller cancellation aborts the real HTTP boundary", async () => {
    held = true; const controller = new AbortController()
    const request = github.readGitHub("qa-owner", { action: "snapshot", repo: "qa-owner/qa-repo" }, controller.signal, { allowPublic: true })
    setTimeout(() => controller.abort(), 20); await assert.rejects(request, error => error.name === "AbortError")
    held = false
  })
} finally { globalThis.fetch = actualFetch }
console.log(`${passed}/${passed} PASS (real GitHub driver; credential and HTTP fixture boundaries)`)

// Separate opt-in read-only evidence. Never enabled in CI; no token or paid provider.
if (process.env.MALIK_WORK_PUBLIC_GITHUB_LIVE === "1") {
  const snapshot = await github.readGitHub("qa-public-reader", { action: "snapshot", repo: "octocat/Hello-World" }, undefined, { allowPublic: true })
  const path = snapshot.tree.find(file => file.type === "blob" && /readme/i.test(file.path))?.path
  assert.ok(path); const file = await github.readGitHub("qa-public-reader", { action: "file", repo: snapshot.repo, ref: snapshot.commitSha, path }, undefined, { allowPublic: true })
  assert.ok(file.content.length > 0)
  console.log(JSON.stringify({ livePublicRead: "PASS", repo: snapshot.repo, commitSha: snapshot.commitSha, access: snapshot.access, path, contentBytes: Buffer.byteLength(file.content), requests: "4 GETs; no model, no writes" }))
}
