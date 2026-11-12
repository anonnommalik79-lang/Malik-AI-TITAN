// The video studio never loses a finished video, names why a file does not
// play, and no hidden script swallows its buttons. Plus: questions about the
// world are answered from today's web, with photos of the subject.
import assert from "node:assert/strict"
import fs from "node:fs"
import { inspectVideoBytes, videoProbeVerdict } from "@/lib/media/video-file-check"
import { deliverGeneratedVideo, VideoDeliveryError } from "@/lib/media/browser-video-qa"
import { latinBrandName, normalizeColloquial, withLatinBrand } from "@/lib/ai/colloquial"
import { normalizeWebSearchQuery } from "@/lib/ai/web-search-query"
import { namedSubjectInFile } from "@/lib/media/reference-catalog"
import { sourceReferencePhotos } from "@/lib/media/source-reference-photos"
import { normalizeFactAudit, worthFactAuditPanel } from "@/lib/ai/fact-audit"
import { shouldUseWeb } from "@/lib/ai/web-search-policy"
import { classifyFreshness } from "@/lib/ai/freshness-intent"
import { allowsAnswerPhotoHints, latinBrandTopic, planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { videoModelConfigured } from "@/lib/ai/env"

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

await check("public video readiness includes actual video-studio providers without treating names as verified live", () => {
  // Snapshot only in-process variables. Nothing touches Render or provider APIs.
  const names = [
    "BEDROCK_VIDEO_MODEL_ID", "BEDROCK_VIDEO_FALLBACK_MODEL_ID", "AWS_BEDROCK_VIDEO_MODEL",
    "RUNWAY_API_KEY", "RUNWAYML_API_SECRET", "LUMA_API_KEY", "FAL_KEY", "FAL_API_KEY",
    "GOOGLE_VEO_API_KEY", "VEO_API_KEY", "DASHSCOPE_API_KEY",
    "NOVAI_API_KEY", "MAGIC_HOUR_API_KEY", "PIXAZO_API_KEY", "PIXAZO_API_KEY_1",
    "PIXAZO_API_KEY_2", "PIXAZO_API_KEY_3", "PIXAZO_API_KEY_4", "CLIPTAPS_API_KEY",
    "POLLO_API_KEY", "POLLO_VIDEO_ENABLED", "HF_TOKEN", "MALIKVIDEO_HF_TOKEN",
    "MALIKVIDEO_H3_MODE", "MALIKVIDEO_H3_ENABLED", "MALIKVIDEO_H3_BASE_URL",
  ]
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  const configured = (values) => {
    for (const name of names) delete process.env[name]
    for (const [name, value] of Object.entries(values)) process.env[name] = value
    return videoModelConfigured()
  }
  try {
    assert.equal(configured({}), false)
    for (const key of ["NOVAI_API_KEY", "MAGIC_HOUR_API_KEY", "PIXAZO_API_KEY_4", "CLIPTAPS_API_KEY", "DASHSCOPE_API_KEY", "RUNWAYML_API_SECRET", "GOOGLE_VEO_API_KEY"]) {
      assert.equal(configured({ [key]: "fixture-key" }), true, key)
    }
    assert.equal(configured({ POLLO_API_KEY: "fixture-key" }), false, "Pollo requires explicit enable")
    assert.equal(configured({ POLLO_API_KEY: "fixture-key", POLLO_VIDEO_ENABLED: "true" }), true)
    assert.equal(configured({ MALIKVIDEO_H3_ENABLED: "true" }), false, "H3 worker requires real URL config")
    assert.equal(configured({ MALIKVIDEO_H3_ENABLED: "true", MALIKVIDEO_H3_BASE_URL: "https://worker.example" }), true)
    assert.equal(configured({ HF_TOKEN: "fixture-key" }), true, "H3 HF mode uses HF_TOKEN")
    assert.equal(configured({ HF_TOKEN: "fixture-key", MALIKVIDEO_H3_MODE: "worker" }), false, "forced worker mode must not report HF configured")
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})

await check("one-word answers do not start an irrelevant photo search", () => {
  for (const question of ["Ответь только словом: ОК", "Скажи одним словом: да", "Reply only OK"]) {
    assert.equal(planReferenceVisuals(question), null, question)
    assert.equal(allowsAnswerPhotoHints(question), false, question)
  }
  assert.ok(planReferenceVisuals("а щя га скоко оценивается хиггсфиелд ии"), "real world topics still show photos")
})

await check("a slang question about a Cyrillic-typed brand is searched by its Latin name", () => {
  assert.equal(latinBrandName("а щя га скоко оценивается хиггсфиелд ии"), "Higgsfield AI")
  assert.equal(latinBrandName("расскажи про мистраль аи"), "Mistral AI")
  assert.equal(latinBrandName("что такое ии"), null)
  assert.match(withLatinBrand("скоко оценивается хиггсфиелд ии"), /Higgsfield AI$/)
  assert.equal(normalizeWebSearchQuery("а щя скоко стоит биткоин"), "сейчас сколько стоит биткоин")
  const router = fs.readFileSync("lib/malik-god-router.ts", "utf8")
  assert.match(router, /valuation funding round/)
  assert.match(router, /const prompt = withLatinBrand\(question\)/, "ranking sees the Latin name")
})

await check("a photo is of its subject, not of something retouched with it", () => {
  // The real Commons hit for «Higgsfield AI» on 2026-11-08.
  assert.equal(namedSubjectInFile("Higgsfield AI", "File:Ryan Hofmann (2026).png", "Portrait of Ryan Hofmann, founder of Alterra Studio, Seattle, 2026. Retouched with AI-assisted tools (Adobe Photoshop, Higgsfield)."), false)
  assert.equal(namedSubjectInFile("Medeu", "File:DSC 1234.jpg", "The Medeu skating rink in winter"), true)
  assert.equal(namedSubjectInFile("Medeu", "File:Medeu rink.jpg", ""), true)
  assert.equal(namedSubjectInFile("горы", "File:x.jpg", ""), true, "generic topics keep the old rule")
})


await check("a web answer about a company gets a grid of photos from the articles it read", () => {
  const plan = planReferenceVisuals("а щя га скоко оценивается хиггсфиелд ии")
  const source = (host, path) => ({ title: "Higgsfield AI raises $50M, valued at $1.3 billion", url: `https://${host}/${path}`, domain: host, image: `https://${host}/media/${path}.jpg` })
  const photos = sourceReferencePhotos(plan, [source("www.reuters.com", "a"), source("www.reuters.com", "b"), source("techcrunch.com", "c"), source("www.forbes.com", "d"), source("www.theverge.com", "e"), source("www.wired.com", "f")])
  assert.equal(photos.length, 4, "up to four")
  assert.deepEqual(photos.map((photo) => new URL(photo.sourceUrl).hostname), ["www.reuters.com", "techcrunch.com", "www.forbes.com", "www.theverge.com"], "one per site")
  assert.equal(photos[0].alt, "Higgsfield AI", "named by the brand, not the slang")
})

await check("a one-number answer gets no fact-check frame; an unsupported fact keeps it", () => {
  const unchecked = normalizeFactAudit({ status: "unchecked", checked: 1, supported: 0, summary: "x", claims: [{ id: "c1", kind: "figure", value: "391", sentence: "391", verdict: "unchecked" }] })
  assert.equal(worthFactAuditPanel(unchecked, "391"), false)
  const bad = normalizeFactAudit({ checked: 1, supported: 0, summary: "x", claims: [{ id: "c1", kind: "citation", value: "[3]", sentence: "x [3]", verdict: "bad-citation" }] })
  assert.equal(worthFactAuditPanel(bad, "Цена $97 000 [3]"), true, "a broken citation is always shown")
  assert.equal(worthFactAuditPanel(unchecked, "x".repeat(400)), true, "long answers keep the panel")
})

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log("\nall video studio and fresh-answer checks passed")
