import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const modules = new Map()
function load(filename) {
  filename = path.resolve(filename)
  if (modules.has(filename)) return modules.get(filename).exports
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  modules.set(filename, module)
  new Function("require", "module", "exports", javascript)((id) => {
    if (id === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    const target = id.startsWith("@/") ? path.resolve(id.slice(2)) : path.resolve(path.dirname(filename), id)
    return load(target + ".ts")
  }, module, module.exports)
  return module.exports
}
const intent = load("lib/ai/image-intent.ts")
const policy = load("lib/ai/reference-visual-policy.ts")
const catalog = load("lib/media/reference-catalog.ts")
const cache = load("lib/media/client-reference-cache.ts")
const entities = load("lib/ai/answer-entities.ts")
for (const prompt of ["Покажи мне горы Алматы", "Покажи три фотографии архитектуры Астаны с визуальными референсами. Добавь описание каждой фотографии.", "покажи мне медеу алматы", "Show me Medeu Almaty", "Найди фотографии Алматы", "Расскажи про Медеу с фото", "как выглядит Эйфелева башня", "дай фото гор Алматы"]) {
  assert.equal(intent.isReferenceImageRequest(prompt), true, prompt)
  assert.ok(policy.planReferenceVisuals(prompt), prompt)
  assert.equal(intent.isExplicitImageGenerationRequest(prompt), false, prompt)
  assert.equal(intent.isExplicitImageEditRequest(prompt, false), false, prompt)
}
for (const prompt of ["Покажи мне код функции", "Покажи мне список моделей", "Покажи мне как исправить изображение", "Объясни как найти фото", "Покажи доказательство теоремы", "Покажи логи", "Покажи возможности Malik AI", "Покажи таймер", "Напиши код с фото", "Напиши текст для фотографии", "Объясни как сгенерировать фото", "Расскажи про Алматы", "Реши 2+2", "Покажи горы Алматы без фото", "Show me Almaty, text only", "сгенерируй фото кота", "/image futuristic building", "убери человека на фото"]) {
  assert.equal(policy.planReferenceVisuals(prompt), null, "no catalogue lookup: " + prompt)
}
assert.equal(intent.isExplicitImageGenerationRequest("сгенерируй фото кота"), true)
assert.equal(intent.isExplicitImageEditRequest("убери человека на фото", true), true)
assert.equal(intent.isExplicitImageEditRequest("добавь кота", true), true)
assert.equal(intent.isExplicitImageEditRequest("добавь фото", false), false)
assert.equal(policy.planReferenceVisuals("Покажи горы Алматы", "", true), null)
assert.equal(policy.planReferenceVisuals("добавь фото"), null, "do not guess an unresolved follow-up")
assert.equal(policy.planReferenceVisuals("добавь фото", "Расскажи про горы Алматы").topic, "горы Алматы")
assert.equal(policy.planReferenceVisuals("добавь фото", "Покажи код функции"), null)
assert.equal(policy.planReferenceVisuals("Что посмотреть в Алматы").explicit, false)
assert.equal(policy.planReferenceVisuals("Покажи горы Алматы").queries[0], "mountains Almaty")
assert.equal(policy.planReferenceVisuals("Покажи фотографии архитектуры Астаны").queries[0], "architecture Astana")
assert.equal(entities.parseAnswerEntity("**Metricool** — Планирование публикаций.").description, "Планирование публикаций.")
assert.equal(entities.parseAnswerEntity("Canva\nСоздание графики.").name, "Canva")
assert.equal(entities.parseAnswerEntity("Напиши код интеграции Canva"), null)
console.log("PASS selective visual policy, screenshot queries, follow-up context and generation/edit routing")

for (const url of ["https://thumb.wikimedia.org/a.jpg", "https://upload.wikimedia.org/a.jpg"]) assert.ok(catalog.isSafeVisualUrl(url))
for (const url of ["http://thumb.wikimedia.org/a.jpg", "https://thumb.wikimedia.org.attacker.test/a.jpg", "https://user:pass@thumb.wikimedia.org/a.jpg", "data:image/png;base64,abc", "http://127.0.0.1/a.jpg"]) assert.equal(catalog.isSafeVisualUrl(url), false)
let cancelled = false
const oversized = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(catalog.REFERENCE_METADATA_LIMIT + 1)) }, cancel() { cancelled = true } }))
assert.equal(await catalog.readReferenceJson(oversized), null)
assert.ok(cancelled, "oversized metadata stream must stop downloading")
console.log("PASS current Wikimedia thumbnail host and streaming size limit")

const savedFetch = globalThis.fetch
const savedStorage = globalThis.localStorage
const savedKey = process.env.UNSPLASH_ACCESS_KEY
const stored = new Map()
globalThis.localStorage = { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) }
delete process.env.UNSPLASH_ACCESS_KEY
const calls = []
const media = (index) => ({ index, title: "File:Almaty mountains " + index + ".jpg", imageinfo: [{ mime: "image/jpeg", thumburl: "https://thumb.wikimedia.org/mountains" + index + ".jpg?utm_source=commons", url: "https://upload.wikimedia.org/massive-original.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Almaty_mountains.jpg", extmetadata: { Artist: { value: "<b>Photographer</b>" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] })
try {
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, "commons.wikimedia.org", "chat must not contact Render or image hosts for metadata")
    assert.equal(options.credentials, "omit")
    assert.equal(url.searchParams.get("origin"), "*")
    assert.equal(url.searchParams.get("iiurlwidth"), "480")
    assert.equal(url.searchParams.get("gsrlimit"), "6")
    calls.push(url.searchParams.get("gsrsearch"))
    return Response.json({ query: { pages: [media(3), media(1), media(2), media(4)] } })
  }
  const plan = policy.planReferenceVisuals("Покажи горы Алматы")
  const images = await catalog.lookupReferenceImages(plan)
  assert.equal(images.length, 3)
  assert.deepEqual(calls, ["mountains Almaty"], "translated query succeeds in one request")
  assert.ok(images[0].url.endsWith("mountains1.jpg"), "use search rank and remove tracking params")
  assert.equal(images[0].credit, "Photographer")
  assert.equal(images[0].license, "CC BY-SA 4.0")
  assert.ok(new TextEncoder().encode(JSON.stringify(images)).byteLength <= catalog.REFERENCE_RESULT_LIMIT)
  calls.length = 0
  const reads = []
  await new Promise((resolve) => {
    const listener = (result) => { reads.push(result); if (reads.length === 2) resolve() }
    cache.subscribeReferenceImages(plan, listener)
    cache.subscribeReferenceImages(plan, (result) => listener(result))
  })
  assert.equal(calls.length, 1, "concurrent messages share catalogue fetch")
  cache.subscribeReferenceImages(plan, (result) => assert.equal(result.length, 3))
  assert.equal(calls.length, 1, "remounted messages use cache")
  assert.ok([...stored.values()].every((value) => value.length <= 128 * 1024))
  assert.ok([...stored.values()].every((value) => !value.includes("massive-original")))
  // React StrictMode cleanup/re-subscribe must not trigger duplicate lookups.
  const strictPlan = policy.planReferenceVisuals("Покажи горы Астаны")
  const stop = cache.subscribeReferenceImages(strictPlan, () => {})
  stop()
  await new Promise((resolve) => cache.subscribeReferenceImages(strictPlan, resolve))
  assert.equal(calls.length, 2)
  globalThis.fetch = async () => Response.json({ query: { pages: [{ title: "File:Original only.jpg", imageinfo: [{ mime: "image/jpeg", url: "https://upload.wikimedia.org/huge.jpg" }] }] } })
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "never download original images to replace missing thumbnails")
  globalThis.fetch = async () => { throw new Error("Provider unavailable") }
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "outage must not fail chat")
  const route = load("app/api/chat/reference-images/route.ts")
  let requests = 0
  globalThis.fetch = async () => { requests++; return Response.json({ query: { pages: [media(1)] } }) }
  const req = new Request("https://malik.test/api/chat/reference-images?q=" + encodeURIComponent("Покажи горы Алматы"))
  const [first, second] = await Promise.all([route.GET(req), route.GET(req)])
  assert.equal((await first.json()).images.length, 1)
  assert.equal((await second.json()).images.length, 1)
  assert.equal(requests, 1, "compatibility endpoint also deduplicates metadata")
  const rejected = await route.GET(new Request("https://malik.test/api/chat/reference-images?q=" + encodeURIComponent("Покажи горы Алматы без фото")))
  assert.deepEqual(await rejected.json(), { images: [] })
  assert.equal(requests, 1, "irrelevant request must never hit the catalogue")
  console.log("PASS browser-direct metadata, thumbnails, attribution, caching, deduplication and outage fallback")
} finally {
  globalThis.fetch = savedFetch
  globalThis.localStorage = savedStorage
  if (savedKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY
  else process.env.UNSPLASH_ACCESS_KEY = savedKey
}
