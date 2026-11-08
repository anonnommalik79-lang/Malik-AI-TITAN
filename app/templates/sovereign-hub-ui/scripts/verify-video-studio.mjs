// The video studio never loses a finished video, names why a file does not
// play, and no hidden script swallows its buttons. Plus: questions about the
// world are answered from today's web, with photos of the subject.
import assert from "node:assert/strict"
import fs from "node:fs"
import { inspectVideoBytes, videoProbeVerdict } from "@/lib/media/video-file-check"
import { deliverGeneratedVideo, VideoDeliveryError } from "@/lib/media/browser-video-qa"
import { normalizeColloquial } from "@/lib/ai/colloquial"
import { shouldUseWeb } from "@/lib/ai/web-search-policy"
import { classifyFreshness } from "@/lib/ai/freshness-intent"
import { latinBrandTopic, planReferenceVisuals } from "@/lib/ai/reference-visual-policy"

globalThis.window ??= globalThis
let failures = 0
const check = async (name, run) => {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}\n     ${String(error.message).split("\n").slice(0, 6).join("\n     ")}`) }
}
const bytes = (text, prefix = []) => new Uint8Array([...prefix, ...Buffer.from(text, "latin1")])
const mp4 = (codec, faststart = true) => bytes(`ftypisom\0\0\0\0isomiso2${faststart ? `moov....trak....stsd....${codec}....` : ""}mdat${"x".repeat(200)}${faststart ? "" : `moov....stsd....${codec}`}`, [0, 0, 0, 32])

await check("a real MP4 is recognised with its codec", () => {
  assert.deepEqual(inspectVideoBytes(mp4("avc1")), { container: "mp4", codec: "h264", faststart: true })
  assert.equal(inspectVideoBytes(mp4("hvc1")).codec, "h265")
  assert.equal(inspectVideoBytes(mp4("av01")).codec, "av1")
  const late = mp4("avc1", false)
  assert.equal(inspectVideoBytes(late.subarray(0, 60)).codec, "unknown", "the codec table is at the end")
  assert.equal(inspectVideoBytes(late.subarray(0, 60), late.subarray(60)).codec, "h264", "the tail finds it")
  assert.equal(inspectVideoBytes(late).faststart, false)
})

await check("an error page or JSON instead of a video is caught", () => {
  assert.equal(inspectVideoBytes(bytes("<!DOCTYPE html><html><body>Access denied</body></html>")).container, "html")
  assert.equal(inspectVideoBytes(bytes('{"error":"expired"}')).container, "json")
  assert.equal(inspectVideoBytes(bytes("V_VP9", [0x1a, 0x45, 0xdf, 0xa3])).codec, "vp9")
})

await check("every reason a video does not open is said in plain words", () => {
  assert.match(videoProbeVerdict({ reachable: false, httpStatus: 403 }).message, /закрыл доступ.*403/u)
  assert.equal(videoProbeVerdict({ reachable: false, httpStatus: 404 }).retry, true)
  assert.match(videoProbeVerdict({ reachable: true, container: "html" }).message, /страницу с ошибкой/u)
  assert.match(videoProbeVerdict({ reachable: true, container: "mp4", codec: "h265" }).message, /H\.265.*Safari или Edge/u)
  assert.equal(videoProbeVerdict({ reachable: true, container: "mp4", codec: "h264" }).playableThroughMalik, true)
  assert.match(videoProbeVerdict(null).message, /Проверить ещё раз/u)
})

const ok = (url) => ({ url, width: 1280, height: 720, durationSeconds: 5 })
const probeFetch = (probe) => async () => new Response(JSON.stringify({ ok: true, probe }), { status: 200 })

await check("a playable provider file is shown directly", async () => {
  const seen = []
  const result = await deliverGeneratedVideo({ url: "https://cdn.example.com/v.mp4", taskId: "t1", origin: "https://malikaiworld.world", waits: [0], verify: async (src) => { seen.push(src); return ok(src) } })
  assert.equal(result.via, "provider")
  assert.deepEqual(seen, ["https://cdn.example.com/v.mp4"])
})

await check("a CDN that refuses the browser falls back to the Malik stream", async () => {
  const seen = []
  const result = await deliverGeneratedVideo({
    url: "https://cdn.example.com/v.mp4", taskId: "task 7", origin: "https://malikaiworld.world", waits: [0, 0],
    verify: async (src) => { seen.push(src); if (src.startsWith("https://")) throw new Error("Видео создано, но файл не воспроизводится в этом браузере."); return ok(src) },
  })
  assert.equal(result.via, "malik")
  assert.equal(result.video.url, "/api/media/video/brand-source?taskId=task%207")
  assert.equal(result.originalUrl, "https://cdn.example.com/v.mp4", "the provider link is kept for sharing and opening")
  assert.equal(seen.length, 3, "two direct tries, then Malik")
})

await check("a file nobody can play keeps its link and names the reason", async () => {
  const error = await deliverGeneratedVideo({
    url: "https://cdn.example.com/v.mp4", taskId: "t9", origin: "https://malikaiworld.world", waits: [0],
    verify: async () => { throw new Error("Видео создано, но файл не воспроизводится в этом браузере.") },
    fetcher: probeFetch({ reachable: true, container: "mp4", codec: "h265" }),
  }).catch((cause) => cause)
  assert.ok(error instanceof VideoDeliveryError)
  assert.match(error.message, /H\.265/u)
  assert.equal(error.originalUrl, "https://cdn.example.com/v.mp4")
  assert.equal(error.retry, false)
})

await check("an empty file is not retried for nothing", async () => {
  let tries = 0
  await deliverGeneratedVideo({
    url: "https://cdn.example.com/v.mp4", taskId: "t2", origin: "https://malikaiworld.world", waits: [0, 0, 0],
    verify: async (src) => { if (src.startsWith("https://")) { tries++; throw new Error("Видеомодель вернула пустой или повреждённый файл.") } throw new Error("x") },
    fetcher: probeFetch(null),
  }).catch(() => null)
  assert.equal(tries, 1)
})

await check("the studio is wired: nothing finished is thrown away, no dead buttons", () => {
  const studio = fs.readFileSync("components/sovereign/video-generation/VideoGenerationStudio.tsx", "utf8")
  assert.match(studio, /deliverGeneratedVideo\(/)
  assert.doesNotMatch(studio, /verifyDirectVideo\(/, "the old check threw a finished video away")
  assert.doesNotMatch(studio, /usage-limits/, "the daily limit is the server's, per account")
  assert.doesNotMatch(studio, /ROUTER_VIDEO_CATALOG|mv2__tune|2K · Pro|16 сек · Pro/, "no permanently disabled or do-nothing buttons")
  assert.equal((studio.match(/onError=\{playerFailed\}/g) || []).length, 2, "both players fall back to the Malik stream")
  assert.match(studio, /ACTIVE_JOB_KEY/, "a running task survives leaving the page")
  assert.match(studio, /historyStrip/)
  assert.match(studio, /CATEGORY_TEMPLATES\[activeCategory\]/, "gallery tabs filter")
  assert.match(studio, /CAMERA_MOVES/)
  const runtime = fs.readFileSync("components/sovereign/MalikVideoModelRuntime.tsx", "utf8")
  assert.doesNotMatch(runtime, /\.mv2__generate/, "no global script swallows the generate button")
})

await check("a failed render gives the day's video back, once", () => {
  const status = fs.readFileSync("app/api/media/video/status/route.ts", "utf8")
  assert.match(status, /refundVideoAccountDailyQuota\(user\.userId, job\.createdAt\)/)
  assert.match(status, /!job\.quotaRefunded/)
  assert.match(status, /quotaRefunded: true/)
  const probe = fs.readFileSync("app/api/media/video/probe/route.ts", "utf8")
  assert.match(probe, /getVideoJob\(taskId, user\.userId\)/, "only the owner's own job is probed")
  assert.match(probe, /bytes=0-/)
})

await check("people's spelling is understood", () => {
  assert.equal(normalizeColloquial("а щя га скоко оценивается хиггсфиелд ии"), "сейчас га сколько оценивается хиггсфиелд ии")
  assert.equal(normalizeColloquial("чо как седня"), "что как сегодня")
})

await check("questions about the world are answered from today's web", () => {
  for (const question of ["а щя га скоко оценивается хиггсфиелд ии", "какая оценка Higgsfield", "сколько людей в Алматы", "чем занимается Higgsfield", "кто CEO OpenAI", "сколько привлёк стартап Pika"]) {
    assert.equal(shouldUseWeb(question), true, question)
  }
  assert.equal(classifyFreshness("а щя скоко оценивается хиггсфиелд ии").needsSearch, true)
  for (const question of ["сколько будет 2+2", "кто ты", "сколько мне лет если я родился в 2000", "напиши стих про осень", "как дела", "дай оценку моему эссе"]) {
    assert.equal(shouldUseWeb(question), false, question)
  }
})

await check("a brand typed in Cyrillic gets photos under its Latin name", () => {
  assert.equal(latinBrandTopic("хиггсфиелд ии"), "Higgsfield AI")
  assert.equal(latinBrandTopic("кот"), null)
  assert.deepEqual(planReferenceVisuals("а щя га скоко оценивается хиггсфиелд ии")?.queries[0], "Higgsfield AI")
  assert.equal(planReferenceVisuals("чем занимается Higgsfield")?.queries[0], "Higgsfield")
  assert.equal(planReferenceVisuals("сколько будет 2+2"), null)
})

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log("\nall video studio and fresh-answer checks passed")
