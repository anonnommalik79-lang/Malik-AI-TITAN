import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { inflateRawSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"

const disk = new Map()
let configured = true, writeOk = true, readFails = false, reads = 0
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value))
const load = workTestLoader({
  "@/lib/server/private-json-store": {
    privateJsonStoreConfigured: () => configured,
    writePrivateJson: async (key, value) => { if (!writeOk) return false; disk.set(key, copy(value)); return true },
    readPrivateJson: async (key, options) => {
      reads++
      if (readFails) { if (options?.throwOnReadError) throw new Error("fixture unavailable"); return null }
      return copy(disk.get(key) || null)
    },
    deletePrivateJson: async key => disk.delete(key),
  },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async request => ({ userId: request.headers.get("x-test-owner") || "owner-a" }) },
})
const store = load("lib/server/project-artifact-store.ts")
const route = load("app/api/ai/project/artifacts/[id]/download/route.ts")
process.env.MALIK_RENDER_BANDWIDTH_GUARD = "true"
delete process.env.MALIK_RENDER_MAX_RESPONSE_BYTES
const project = (files = [{ path: "index.html", content: "<!doctype html><h1>Сәлем, мир 🌍</h1>", language: "html" }]) => ({
  projectId: "fixture-project", title: "Проект Қазақстан", description: "Delivery fixture, not generated or executed code",
  status: "completed", plan: [], structure: files.map(f => f.path), files, commands: [],
  qa: { passed: true, checks: ["fixture structure"], issues: [], rounds: 1, reviewStatus: "not_run" },
  createdAt: "2026-11-01T00:00:00.000Z",
})
function cold() { delete globalThis.__malikProjectArtifacts; delete globalThis.__malikProjectArtifactCache }
function reset() { cold(); disk.clear(); configured = true; writeOk = true; readFails = false; reads = 0 }
async function request(id, headers = {}, method = "GET") {
  const req = new Request(`http://localhost/api/ai/project/artifacts/${encodeURIComponent(id)}/download`, { method, headers })
  assert.equal(typeof route[method], "function", `${method} must be implemented`)
  return route[method](req, { params: Promise.resolve({ id }) })
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex")
function unpack(bytes) {
  const result = new Map(); let offset = 0
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8), expectedCrc = bytes.readUInt32LE(offset + 14)
    const size = bytes.readUInt32LE(offset + 18), rawSize = bytes.readUInt32LE(offset + 22)
    const nameSize = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 30, offset + 30 + nameSize).toString("utf8")
    const begin = offset + 30 + nameSize + extra
    const raw = method === 8 ? inflateRawSync(bytes.subarray(begin, begin + size)) : bytes.subarray(begin, begin + size)
    assert.ok(method === 0 || method === 8); assert.equal(raw.length, rawSize)
    let crc = 0xffffffff
    for (const byte of raw) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
    assert.equal((crc ^ 0xffffffff) >>> 0, expectedCrc, name)
    assert.equal(result.has(name), false, `duplicate ZIP entry ${name}`)
    result.set(name, raw.toString("utf8")); offset = begin + size
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50)
  return result
}

test("multi-file Unicode project survives storage, cold read, download and ZIP CRC", async () => {
  reset()
  const files = [
    ...project().files,
    { path: "styles/main.css", content: "h1 { color: blue; }\n", language: "css" },
    { path: "данные/Қазақстан.json", content: '{"city":"Алматы","emoji":"🌍"}', language: "json" },
  ]
  const artifact = await store.putProjectArtifact(project(files), "OWNER-A")
  cold()
  const response = await request(artifact.id)
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer()), entries = unpack(bytes)
  for (const file of files) assert.equal(entries.get(file.path), file.content)
  assert.equal(entries.size, files.length + 1)
  assert.notEqual(JSON.parse(entries.get("PROOF_PASSPORT.json")).status, "PASS", "download must not invent runtime/build evidence")
  if (process.env.MALIK_ARTIFACT_QA_DIR) {
    mkdirSync(process.env.MALIK_ARTIFACT_QA_DIR, { recursive: true })
    writeFileSync(path.join(process.env.MALIK_ARTIFACT_QA_DIR, "downloaded-project.zip"), bytes)
    writeFileSync(path.join(process.env.MALIK_ARTIFACT_QA_DIR, "expected-files.json"), JSON.stringify(files))
  }
})
test("changing the caller's source does not mutate the saved result", async () => {
  reset(); const original = project(), artifact = await store.putProjectArtifact(original, "owner-a")
  original.files[0].content = "changed after saving"
  assert.notEqual((await store.getProjectArtifact(artifact.id, "owner-a")).project.files[0].content, original.files[0].content)
})
test("changing a returned snapshot does not mutate the cache", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  const first = await store.getProjectArtifact(artifact.id, "owner-a"); first.project.files[0].content = "mutated"
  assert.notEqual((await store.getProjectArtifact(artifact.id, "owner-a")).project.files[0].content, "mutated")
})
for (const name of ["../escape.js", "/root.js", "C:/root.js", "a\\b.js", "a//b.js", "a/./b.js", "a/../b.js", "a/evil\u0000.js", "a/end.", "CON.txt"]) {
  test(`reject unsafe or extraction-ambiguous filename ${JSON.stringify(name)}`, async () => {
    reset(); await assert.rejects(() => store.putProjectArtifact(project([{ path: name, content: "x", language: "text" }]), "owner-a"))
    assert.equal(disk.size, 0)
  })
}
for (const names of [["app.ts", "app.ts"], ["App.ts", "app.ts"], ["é.txt", "e\u0301.txt"]]) {
  test(`reject extraction collision ${JSON.stringify(names)}`, async () => {
    reset(); await assert.rejects(() => store.putProjectArtifact(project(names.map(name => ({ path: name, content: "x", language: "text" }))), "owner-a"))
  })
}
test("reject oversized source before storage or ZIP allocation", async () => {
  reset(); await assert.rejects(() => store.putProjectArtifact(project([{ path: "large.txt", content: "x".repeat(4 * 1024 * 1024 + 1), language: "text" }]), "owner-a"))
  assert.equal(disk.size, 0)
})
test("cache is bounded by payload bytes and evicted durable projects can reopen", async () => {
  reset(); const saved = []
  for (let n = 0; n < 11; n++) saved.push(await store.putProjectArtifact(project([{ path: "data.txt", content: `${n}\n${"x".repeat(850000)}`, language: "text" }]), "owner-a"))
  const cache = globalThis.__malikProjectArtifactCache || globalThis.__malikProjectArtifacts
  const bytes = [...cache.values()].reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.artifact || entry)), 0)
  assert.ok(bytes <= 8 * 1024 * 1024, `cached payload ${bytes} exceeds 8 MiB`)
  const before = reads
  assert.equal((await store.getProjectArtifact(saved[0].id, "owner-a")).id, saved[0].id)
  assert.ok(reads > before, "oldest project must have been evicted from memory, not cloud storage")
})
test("configured storage write failure cannot report a successfully saved project", async () => {
  reset(); writeOk = false
  await assert.rejects(() => store.putProjectArtifact(project(), "owner-a"))
})
test("unconfigured storage preserves the existing temporary-download fallback", async () => {
  reset(); configured = false; writeOk = false
  const artifact = await store.putProjectArtifact(project(), "owner-a")
  assert.equal((await request(artifact.id)).status, 200)
})
test("owner isolation is enforced for warm and cold downloads", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  assert.equal((await request(artifact.id, { "x-test-owner": "owner-b" })).status, 404)
  cold(); assert.equal((await request(artifact.id, { "x-test-owner": "owner-b" })).status, 404)
})
test("malformed IDs cannot alias existing private objects", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a"); cold()
  assert.equal((await request(`${artifact.id}!`)).status, 404)
  assert.equal(reads, 0, "malformed identifiers must not reach storage")
})
test("mismatched stored ID or modified sealed content is not delivered", async () => {
  for (const change of [value => { value.id = "00000000-0000-4000-8000-000000000000" }, value => { value.project.files[0].content += "tampered" }]) {
    reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
    change([...disk.values()][0]); cold()
    assert.equal((await request(artifact.id)).status, 404)
  }
})
test("storage outage is retryable 503, not a false missing-file 404", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a"); cold(); readFails = true
  const response = await request(artifact.id); assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "5")
  readFails = false; assert.equal((await request(artifact.id)).status, 200, "an outage must not overwrite or delete the saved result")
})
test("large compressible source downloads within the existing Render bandwidth guard", async () => {
  reset(); const content = "// Түсініктеме: проверка UTF-8\n".repeat(27000)
  const artifact = await store.putProjectArtifact(project([{ path: "main.js", content, language: "javascript" }]), "owner-a")
  const response = await request(artifact.id); assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length < 900000)
  assert.equal(unpack(bytes).get("main.js"), content)
})
test("same saved artifact has stable bytes, ETag, length and SHA-256", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  const first = await request(artifact.id), bytes = Buffer.from(await first.arrayBuffer())
  await new Promise(resolve => setTimeout(resolve, 15)); cold()
  const second = await request(artifact.id)
  assert.deepEqual(Buffer.from(await second.arrayBuffer()), bytes)
  assert.equal(first.headers.get("etag"), `"${digest(bytes)}"`)
  assert.equal(second.headers.get("etag"), first.headers.get("etag"))
  assert.equal(first.headers.get("x-malik-archive-sha256"), digest(bytes))
  assert.equal(Number(first.headers.get("content-length")), bytes.length)
  assert.match(first.headers.get("content-disposition"), /filename\*=UTF-8''/)
  assert.match(first.headers.get("cache-control"), /private, no-store/)
})
test("HEAD verifies the same owner and metadata without an archive body", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  const head = await request(artifact.id, {}, "HEAD"), get = await request(artifact.id)
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0)
  for (const key of ["etag", "content-length", "content-disposition"]) assert.equal(head.headers.get(key), get.headers.get(key))
  assert.equal((await request(artifact.id, { "x-test-owner": "owner-b" }, "HEAD")).status, 404)
})
test("interrupted downloads resume two byte ranges into the exact original ZIP", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  const full = await request(artifact.id), bytes = Buffer.from(await full.arrayBuffer()), etag = full.headers.get("etag")
  const a = await request(artifact.id, { range: "bytes=0-99", "if-range": etag })
  const b = await request(artifact.id, { range: "bytes=100-", "if-range": etag })
  assert.equal(a.status, 206); assert.equal(b.status, 206)
  assert.equal(a.headers.get("content-range"), `bytes 0-99/${bytes.length}`)
  assert.deepEqual(Buffer.concat([Buffer.from(await a.arrayBuffer()), Buffer.from(await b.arrayBuffer())]), bytes)
  const suffix = await request(artifact.id, { range: "bytes=-22" })
  assert.equal(suffix.status, 206); assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-22))
  assert.equal((await request(artifact.id, { range: "bytes=0-9", "if-range": '"old-version"' })).status, 200)
  assert.equal((await request(artifact.id, { range: "bytes=9999999-" })).status, 416)
})
test("conditional download still requires ownership", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a"), response = await request(artifact.id)
  const etag = response.headers.get("etag"); assert.ok(etag)
  assert.equal((await request(artifact.id, { "if-none-match": etag })).status, 304)
  assert.equal((await request(artifact.id, { "if-none-match": etag, "x-test-owner": "owner-b" })).status, 404)
})
test("structurally valid legacy records remain downloadable", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  delete [...disk.values()][0].integrity; cold()
  assert.equal((await request(artifact.id)).status, 200)
})
test("expired downloads keep the existing expiry policy", async () => {
  reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
  const saved = [...disk.values()][0]; saved.createdAt = Date.now() - 86400000; saved.expiresAt = Date.now() - 1; cold()
  assert.equal((await request(artifact.id)).status, 404)
})
test("large temporary downloads remain available within the bounded cache", async () => {
  reset(); configured = false; writeOk = false
  const artifact = await store.putProjectArtifact(project([{ path: "large.txt", content: "x".repeat(4 * 1024 * 1024 - 100), language: "text" }]), "owner-a")
  assert.equal((await request(artifact.id)).status, 200)
})
for (const [range, status] of [["bytes=-0", 416], ["bytes=10-2", 416], ["bytes=99999999999999999999-", 416], ["items=0-9", 200], ["bytes=0-9,20-29", 200], ["bytes=0-999999", 206]]) {
  test(`bounded range handling: ${range}`, async () => {
    reset(); const artifact = await store.putProjectArtifact(project(), "owner-a")
    assert.equal((await request(artifact.id, { range })).status, status)
  })
}
