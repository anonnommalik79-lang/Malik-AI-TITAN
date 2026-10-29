import assert from "node:assert/strict"
import { fetchMusicStatus, musicAudioUrl } from "../lib/media/music-client.ts"
let checks = 0
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`) }
for (const status of ["queued", "processing", "ready", "done", "failed", "error"]) await check(`real provider status ${status} retained`, async () => {
  const result = await fetchMusicStatus("test:id/space here", { fetchImpl: async (url, init) => {
    assert.match(url, /test%3Aid%2Fspace%20here/); assert.equal(init.credentials, "same-origin")
    return Response.json({ status, resultUrl: "https://audio.example/track.mp3" })
  } })
  assert.equal(result.data.status, status)
})
for (const data of [null, [], {}, { status: "unknown" }, { status: "ready" }, { status: "done", resultUrl: "javascript:alert(1)" }]) await check(`malformed status is retryable: ${JSON.stringify(data)}`, async () => {
  await assert.rejects(fetchMusicStatus("test", { fetchImpl: async () => Response.json(data) }))
})
await check("a hung provider status fetch times out", async () => {
  let signal
  await assert.rejects(fetchMusicStatus("test", { timeoutMs: 5, fetchImpl: async (_url, init) => { signal = init.signal; return new Promise(() => {}) } }), { name: "AbortError" })
  assert.equal(signal.aborted, true)
})
await check("timeout covers JSON body, not just headers", async () => {
  await assert.rejects(fetchMusicStatus("test", { timeoutMs: 5, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), { name: "AbortError" })
})
await check("leaving the studio cancels an active poll", async () => {
  const controller = new AbortController()
  const pending = fetchMusicStatus("test", { signal: controller.signal, fetchImpl: () => new Promise(() => {}) })
  controller.abort(); await assert.rejects(pending, { name: "AbortError" })
})
await check("pre-cancelled poll performs no request", async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(fetchMusicStatus("test", { signal: controller.signal, fetchImpl: () => assert.fail("stale fetch") }), { name: "AbortError" })
})
await check("ownership/authentication failure is preserved", async () => {
  const result = await fetchMusicStatus("test", { fetchImpl: async () => Response.json({ code: "MUSIC_JOB_NOT_FOUND" }, { status: 404 }) })
  assert.equal(result.response.status, 404); assert.equal(result.data.code, "MUSIC_JOB_NOT_FOUND")
})
for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///C:/secret", "https://user:pass@audio.example/a.mp3"]) {
  await check(`unsafe audio URL rejected: ${url.split(":")[0]}`, () => assert.equal(musicAudioUrl(url), ""))
}
for (const url of ["https://audio.example/a.mp3", "/api/media/music/file?requestId=test"]) {
  await check("legitimate direct audio URL retained", () => assert.equal(musicAudioUrl(url), url))
}
console.log(`Music client: ${checks}/${checks} PASS; no audio generated`)
