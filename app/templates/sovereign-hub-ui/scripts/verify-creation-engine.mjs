import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { calculateUnitEconomics, economicsMarkdown, parseEconomicsInputs } from "../lib/business/unit-economics.ts"
import { directMediaUrl } from "../lib/os/media-reference.ts"
import { normalizeLaunchPack, pitchesMarkdown, roadmapMarkdown } from "../lib/business/launch-pack.ts"
import { prepareDocument, translatePreparedDocument } from "../lib/translator/document.ts"
import { brandImageInBrowser } from "../lib/media/browser-watermark.ts"
import { verifyDirectVideo } from "../lib/media/browser-video-qa.ts"

const inputs = parseEconomicsInputs({ currency: "KZT", price: 1000, variableCost: 200, monthlyCustomers: 100, monthlyFixedCosts: 40000, monthlyMarketingSpend: 10000, newCustomers: 20, monthlyChurnPercent: 10 })
const result = calculateUnitEconomics(inputs)
assert.equal(result.monthlyRevenue, 100000)
assert.equal(result.contributionPerCustomer, 800)
assert.equal(result.grossMarginPercent, 80)
assert.equal(result.monthlyProfit, 40000)
assert.equal(result.cac, 500)
assert.equal(result.ltv, 8000)
assert.equal(result.ltvToCac, 16)
assert.equal(result.breakEvenCustomers, 50)
assert.deepEqual(result.pricingScenarios.map((row) => row.price), [900, 1000, 1100])
assert.match(economicsMarkdown(result), /не прогнозируют|не прогноз|не подтверждённые|не подтвержденные|не подтверждённые показатели/)

const missing = calculateUnitEconomics(parseEconomicsInputs({ price: 1200 }))
assert.equal(missing.monthlyRevenue, null)
assert.equal(missing.cac, null)
assert.equal(missing.ltv, null)
assert.ok(missing.missing.includes("monthlyCustomers"))
assert.match(economicsMarkdown(missing), /Нет данных/)
assert.throws(() => parseEconomicsInputs({ price: -1 }))
assert.throws(() => parseEconomicsInputs({ monthlyChurnPercent: 101 }))
assert.throws(() => parseEconomicsInputs({ currency: "???" }))

assert.equal(directMediaUrl("https://cdn.example.com/video.mp4", "https://malikaiworld.world"), "https://cdn.example.com/video.mp4")
assert.equal(directMediaUrl("https://malikaiworld.world/api/media/video/file", "https://malikaiworld.world"), null)
assert.equal(directMediaUrl("http://cdn.example.com/video.mp4"), null)
assert.equal(directMediaUrl("https://127.0.0.1/file.mp4"), null)
assert.equal(directMediaUrl("https://user:secret@cdn.example.com/file.mp4"), null)
assert.equal(directMediaUrl("data:video/mp4;base64,AAAA"), null)

const phase = { outcome: "Проверена гипотеза", actions: ["Опросить клиентов", "Собрать лендинг"], evidence: ["10 интервью с записями"] }
const launch = normalizeLaunchPack({
  roadmap: { day7: phase, day30: phase, day90: phase },
  pitches: { seconds30: "Сервис электрического транспорта для Казахстана помогает городам снижать расходы и выбросы.", minutes2: "Продукт проверяет конкретную проблему владельцев транспорта в Казахстане. ".repeat(4), minutes5: "Команда проверяет спрос, стоимость привлечения и маржинальность до масштабирования в новые города. ".repeat(5) },
  openQuestions: ["Сколько активных клиентов подтверждено?"],
})
assert.ok(launch)
assert.match(roadmapMarkdown(launch), /До 90-го дня/)
assert.match(pitchesMarkdown(launch), /Факты для подтверждения/)
assert.equal(normalizeLaunchPack({ roadmap: { day7: phase }, pitches: {} }), null)

const doc = prepareDocument("plan.md", "# Заголовок\n\n- Первый пункт\n- Второй пункт\n\n```js\nconst x = 1\n```\n")
assert.equal(doc.translatableCount, 3)
assert.equal(await translatePreparedDocument(doc, async (line) => line.toUpperCase()), "# ЗАГОЛОВОК\n\n- ПЕРВЫЙ ПУНКТ\n- ВТОРОЙ ПУНКТ\n\n```js\nconst x = 1\n```\n")
assert.throws(() => prepareDocument("report.docx", "hello"), /TXT и Markdown/)
assert.throws(() => prepareDocument("report.txt", "a".repeat(40_001)), /слишком длинный/)

const originalFetch = globalThis.fetch
const originalBitmap = globalThis.createImageBitmap
const originalDocument = globalThis.document
const drawn = []
let closed = false
try {
  globalThis.fetch = async () => new Response(new Blob(["image"], { type: "image/png" }), { headers: { "content-type": "image/png" } })
  globalThis.createImageBitmap = async () => ({ width: 1920, height: 1080, close() { closed = true } })
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: () => drawn.push("draw"), strokeText: () => drawn.push("stroke"), fillText: () => drawn.push("fill") }), toBlob: (done) => done(new Blob(["branded"], { type: "image/png" })) }) }
  const branded = await brandImageInBrowser("https://cdn.example.com/photo.png")
  assert.equal(branded.type, "image/png")
  assert.deepEqual(drawn, ["draw", "stroke", "fill"])
  assert.equal(closed, true)
  globalThis.fetch = async () => { throw new Error("cors") }
  await assert.rejects(() => brandImageInBrowser("https://cdn.example.com/no-cors.png"), /CORS/)
} finally {
  globalThis.fetch = originalFetch
  globalThis.createImageBitmap = originalBitmap
  globalThis.document = originalDocument
}

console.log("creation engine: economics, launch, translation, watermark, direct media passed")

const savedDocument = globalThis.document
const savedWindow = globalThis.window
try {
  globalThis.window = { setTimeout, clearTimeout }
  let videoWidth = 1920
  globalThis.document = { createElement: () => ({
    preload: "", muted: false, playsInline: false, videoWidth, videoHeight: 1080, duration: 7.5,
    src: "", onloadedmetadata: null, onerror: null,
    removeAttribute(name) { if (name === "src") this.src = "" },
    load() { if (this.src) queueMicrotask(() => this.onloadedmetadata?.()) },
  }) }
  assert.deepEqual(await verifyDirectVideo("https://cdn.example.com/movie.mp4", "https://malikaiworld.world"), {
    url: "https://cdn.example.com/movie.mp4", width: 1920, height: 1080, durationSeconds: 7.5,
  })
  videoWidth = 0
  await assert.rejects(() => verifyDirectVideo("https://cdn.example.com/empty.mp4", "https://malikaiworld.world"), /пустой или повреждённый/)
  await assert.rejects(() => verifyDirectVideo("https://malikaiworld.world/api/media/video/file", "https://malikaiworld.world"), /прямую ссылку/)
} finally {
  globalThis.document = savedDocument
  globalThis.window = savedWindow
}
console.log("creation engine: browser video metadata QA passed")

const ownershipSource = ts.transpileModule(fs.readFileSync("lib/server/music-job-ownership.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import ["']server-only["'];?/, "").replace(/import \{[^}]+\} from ["']\.\/private-json-store["'];?/, `
  const privateJsonStoreConfigured = () => true;
  const writePrivateJson = async (key, value) => { globalThis.__testMusicStore.set(key, value); return true; };
  const readPrivateJson = async (key) => globalThis.__testMusicStore.get(key) || null;
`)
const musicStoreBefore = globalThis.__testMusicStore
globalThis.__testMusicStore = new Map()
try {
  const ownership = await import(`data:text/javascript,${encodeURIComponent(ownershipSource)}`)
  await ownership.recordMusicJobOwner("CaseSensitive-01", "alice@example.com")
  assert.equal(await ownership.musicJobBelongsTo("CaseSensitive-01", "alice@example.com"), true)
  assert.equal(await ownership.musicJobBelongsTo("CaseSensitive-01", "bob@example.com"), false)
  assert.equal(await ownership.musicJobBelongsTo("casesensitive-01", "alice@example.com"), false)
  globalThis.__malikMusicJobOwners?.clear()
  assert.equal(await ownership.musicJobBelongsTo("CaseSensitive-01", "alice@example.com"), true, "ownership survives process cache loss when durable storage works")
} finally {
  globalThis.__testMusicStore = musicStoreBefore
  delete globalThis.__malikMusicJobOwners
}
console.log("creation engine: music job ownership passed")

for (const route of ["status", "download", "file"]) {
  const code = fs.readFileSync(`app/api/media/music/${route}/route.ts`, "utf8")
  assert.match(code, /musicJobBelongsTo\(requestId, user\.userId\)/, `${route}: status must be scoped to the owner`)
  assert.match(code, /directMediaUrl/, `${route}: provider audio must go directly to the browser`)
}
const audioArtifactRoute = fs.readFileSync("app/api/os/projects/[id]/audio-artifacts/route.ts", "utf8")
assert.match(audioArtifactRoute, /musicJobBelongsTo\(requestId, owner\.userId\)/)
assert.match(audioArtifactRoute, /kind: "audio"/)
assert.doesNotMatch(audioArtifactRoute, /response\.arrayBuffer\(/)
console.log("creation engine: music route ownership and direct delivery passed")
