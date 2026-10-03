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
const products = load("lib/media/official-product-photos.ts")
const iphoneList = "2007: iPhone (первое поколение / 2G)\n2008: iPhone 3G\n2009: iPhone 3GS\n2016: iPhone SE (1-е поколение), iPhone 7, iPhone 7 Plus\n2020: iPhone SE (2-е поколение), iPhone 12 Pro Max\n2025: iPhone 17, iPhone 17 Air"
const allPhones = policy.planReferenceVisuals("Покажи все модели айфона")
assert.equal(allPhones.queries[0], "iPhone")
assert.equal(allPhones.subjects.length, Object.keys(products.APPLE_IPHONE_PHOTOS).length)
for (const prompt of ["По фотки покажи их всех", "Покажи их фото", "Show photos of them all"]) {
  assert.equal(intent.isReferenceImageRequest(prompt), true, prompt)
  const follow = policy.planReferenceVisuals(prompt, "Покажи все модели айфона", false, iphoneList)
  assert.deepEqual(follow.subjects, products.namedIPhoneSubjects(iphoneList), "use exactly the previously listed models")
  assert(follow.subjects.includes("iPhone SE (1st generation)"))
  assert(follow.subjects.includes("iPhone SE (2nd generation)"))
  assert(follow.subjects.includes("iPhone Air"))
}
assert.equal(policy.planReferenceVisuals("Кто такое призедент назарбаев").queries[0], "Nursultan Nazarbayev")
assert.deepEqual(policy.planReferenceVisuals("Покажи их фото", "Расскажи про достопримечательности Алматы", false, "## Медеу\nКаток.\n## Кок-Тобе\nГора.\n## История\nТекст.").subjects, ["Медеу", "Кок-Тобе"], "photo follow-ups work for named places too")
assert.deepEqual(policy.planAnswerVisualSlots("Кто такой Назарбаев", [
  { key: "p0", kind: "paragraph", text: "Нурсултан Назарбаев — первый президент Казахстана." },
  { key: "h1", kind: "heading", text: "Политическая карьера" },
]).map((slot) => slot.plan.queries[0]), ["Nursultan Nazarbayev"], "biography subheadings must not replace the person's identity")
assert.equal(products.officialIPhonePhoto("айфон 16 про"), null, "do not substitute a vaguely named model")
assert.equal(catalog.referenceTitleScore("iPhone 4", "iPhone 5"), 0, "model digits are part of identity")
assert.equal(catalog.referenceTitleScore("Nursultan Nazarbayev", "Nursultan Nazarbayev International Airport"), 0.5)
for (const prompt of ["Покажи мне горы Алматы", "Покажи три фотографии архитектуры Астаны с визуальными референсами. Добавь описание каждой фотографии.", "покажи мне медеу алматы", "Show me Medeu Almaty", "Найди фотографии Алматы", "Расскажи про Медеу с фото", "как выглядит Эйфелева башня", "дай фото гор Алматы"]) {
  assert.equal(intent.isReferenceImageRequest(prompt), true, prompt)
  assert.ok(policy.planReferenceVisuals(prompt), prompt)
  assert.equal(intent.isExplicitImageGenerationRequest(prompt), false, prompt)
  assert.equal(intent.isExplicitImageEditRequest(prompt, false), false, prompt)
}
for (const prompt of ["Покажи мне код функции", "Покажи мне список моделей", "Покажи мне как исправить изображение", "Объясни как найти фото", "Покажи доказательство теоремы", "Покажи логи", "Покажи возможности Malik AI", "Покажи таймер", "Напиши код с фото", "Напиши текст для фотографии", "Объясни как сгенерировать фото", "Реши 2+2", "Покажи горы Алматы без фото", "Show me Almaty, text only", "сгенерируй фото кота", "/image futuristic building", "убери человека на фото"]) {
  assert.equal(policy.planReferenceVisuals(prompt), null, "no catalogue lookup: " + prompt)
}

// Helpful, opt-out contextual visuals for real interface guides and science diagrams.
// Never invent a screenshot or spend generation credits on a reference request.
const iosGuide = policy.planReferenceVisuals("Как сделать чтобы играла вибрация в звонке айфон")
assert.equal(iosGuide?.kind, "tutorial")
assert.equal(iosGuide?.layout, "portrait")
assert.match(iosGuide.queries[0], /iPhone.*Haptics/)
assert.deepEqual(iosGuide.visualDevice, ["iphone", "ios", "ipad"])
assert.equal(policy.planReferenceVisuals("How to enable notifications on Android")?.kind, "tutorial")
assert.equal(policy.planReferenceVisuals("Как включить Wi-Fi в Windows")?.kind, "tutorial")
assert.equal(policy.planReferenceVisuals("Объясни строение клетки")?.queries[0], "cell anatomy diagram")
for (const question of ["Реши квадратное уравнение", "Напиши код iPhone приложения", "Как настроить вибрацию iPhone без фото", "Почему не работает телефон?", "Объясни как найти фото"]) {
  assert.equal(policy.planReferenceVisuals(question), null, question)
}
for (const question of ["Сравни Python и JavaScript в таблице", "Составь чек-лист запуска Malik AI из 7 пунктов", "Покажи карточку в две колонки: слева Malik AI, справа команда"]) {
  assert.equal(policy.planReferenceVisuals(question), null, "structured answers should not request decorative photos: " + question)
}
assert.ok(policy.planReferenceVisuals("Сравни горы Казахстана в таблице с фото"), "explicit photos remain available in structured answers")

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
for (const question of ["Расскажи про Алматы", "Какие горы есть в Казахстане?", "Что такое вулкан", "Объясни историю Рима", "Қазақстанның таулары", "Explain a black hole", "Как зайти на выставку AI Digital Bridge?", "Как приготовить плов?"]) {
  assert.ok(policy.planReferenceVisuals(question), "automatic visual: " + question)
}
assert.equal(policy.planReferenceVisuals("Какие горы есть в Казахстане?").queries[0], "mountains Kazakhstan")
assert.equal(policy.planReferenceVisuals("привет"), null)
const subjects = policy.planAnswerVisualSlots("Расскажи про горы Казахстана", [
  { key: "b0", kind: "paragraph", text: "Главные горные системы страны:" },
  { key: "b1", kind: "heading", text: "Тянь-Шань" },
  { key: "b2", kind: "paragraph", text: "Высокие горы на юго-востоке." },
  { key: "b3", kind: "heading", text: "Алтай" },
  { key: "b4", kind: "heading", text: "Заилийский Алатау" },
  { key: "b5", kind: "heading", text: "Сарыарка" },
])
assert.deepEqual(subjects.map(x => x.key), ["b1", "b3", "b4"])
assert.deepEqual(subjects.map(x => x.plan.queries[0]), ["Tian Shan", "Altai", "Trans-Ili Alatau"])
assert.equal(policy.planAnswerVisualSlots("Какие горы есть в Казахстане?", [{ key: "b0", kind: "paragraph", text: "Горы страны" }])[0].row, false)
assert.equal(policy.planAnswerVisualSlots("Как включить вибрацию iPhone", [
  { key: "b0-0", kind: "item", text: "Открой Настройки" },
  { key: "b0-1", kind: "item", text: "Выбери **Звуки и тактильные сигналы**" },
])[0].key, "b0-1")
assert.deepEqual(policy.planAnswerVisualSlots("Горы Казахстана без фото", [{ key: "b0", kind: "paragraph", text: "Горы" }]), [])
const entryGuide = policy.planAnswerVisualSlots("Как зайти на выставку AI Digital Bridge?", [
  { key: "b0-0", kind: "item", text: "Открой **приложение Astana Hub**. Введи код билета." },
  { key: "b0-1", kind: "item", text: "Покажи **QR-билет** на входе." },
  { key: "b1", kind: "heading", text: "МВЦ EXPO" },
])
assert.equal(entryGuide.length, 3)
assert.equal(entryGuide[0].plan.topic, "Astana Hub")
console.log("PASS automatic multilingual visuals, inline subject/step anchors, lookup budget and generation/edit routing")

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
  // A similarly named but unrelated image is not a valid screenshot.
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { ...media(1), title: "File:Android Bluetooth settings.jpg" },
    { ...media(2), title: "File:iPhone Sounds and Haptics vibration settings.jpg" },
    { ...media(3), title: "File:iPhone wallpaper.jpg" },
  ] } })
  const relevantScreen = await catalog.lookupReferenceImages(iosGuide)
  assert.equal(relevantScreen.length, 1)
  assert.match(relevantScreen[0].url, /ipcdn-web\.apple\.com/)
  assert.equal(relevantScreen[0].credit, "Apple Support")
  globalThis.fetch = async () => Response.json({ query: { pages: [{ title: "File:Original only.jpg", imageinfo: [{ mime: "image/jpeg", url: "https://upload.wikimedia.org/huge.jpg" }] }] } })
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "never download original images to replace missing thumbnails")
  globalThis.fetch = async () => { throw new Error("Provider unavailable") }
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "outage must not fail chat")
  let officialCalls = 0
  globalThis.fetch = async () => { officialCalls++; throw new Error("External catalogue unavailable") }
  const phonePhoto = await catalog.lookupReferenceImages(policy.planReferenceVisuals("Покажи iPhone 16 Pro"))
  assert.equal(phonePhoto[0].alt, "iPhone 16 Pro")
  assert.match(phonePhoto[0].url, /^https:\/\/cdsassets\.apple\.com\//)
  assert.equal(officialCalls, 0, "verified product photos do not depend on search availability")
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { index: 1, title: "Nursultan Nazarbayev International Airport", fullurl: "https://en.wikipedia.org/wiki/Airport", thumbnail: { source: "https://upload.wikimedia.org/airport.jpg" } },
    { index: 2, title: "Nursultan Nazarbayev", fullurl: "https://en.wikipedia.org/wiki/Nursultan_Nazarbayev", thumbnail: { source: "https://upload.wikimedia.org/nazarbayev.jpg" } },
  ] } })
  const portrait = await catalog.lookupReferenceImages(policy.planReferenceVisuals("Кто такое призедент назарбаев"))
  assert.deepEqual(portrait.map((image) => image.alt), ["Nursultan Nazarbayev"], "do not show an airport for a person")
  globalThis.fetch = async (input) => String(input).includes("commons.wikimedia.org")
    ? Response.json({ query: { pages: [{ ...media(1), title: "File:Nursultan Nazarbayev International Airport.jpg" }, { ...media(2), title: "File:Nursultan Nazarbayev portrait.jpg" }] } })
    : Response.json({ query: { pages: [] } })
  assert.deepEqual((await catalog.lookupReferenceImages(policy.planReferenceVisuals("Кто такой Назарбаев"))).map((image) => image.alt), ["Nursultan Nazarbayev portrait"], "Commons fallback also rejects namesakes")
  const fallbackPlan = policy.planReferenceVisuals("Покажи горы Казахстана")
  let sameOriginCalls = 0
  globalThis.fetch = async (input) => {
    if (String(input).startsWith("/api/chat/reference-images?")) {
      sameOriginCalls++
      return Response.json({ images: [{ url: "https://upload.wikimedia.org/fallback.jpg", alt: "Горы Казахстана" }] })
    }
    throw new Error("Browser catalogue blocked")
  }
  await new Promise((resolve) => cache.subscribeReferenceImages(fallbackPlan, (images) => { assert.equal(images[0]?.alt, "Горы Казахстана"); resolve() }))
  assert.equal(sameOriginCalls, 1, "browser failures have a bounded same-origin metadata fallback")
  const fallbackCalls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    fallbackCalls.push(url.hostname)
    if (url.hostname === "commons.wikimedia.org") return Response.json({ query: { pages: [] } })
    return Response.json({ query: { pages: [{ index: 1, title: "Медеу", fullurl: "https://ru.wikipedia.org/wiki/Медеу", thumbnail: { source: "https://upload.wikimedia.org/medeuthumb.jpg" } }] } })
  }
  const articleFallback = await catalog.lookupReferenceImages(plan)
  assert.equal(articleFallback[0]?.alt, "Медеу")
  assert.ok(fallbackCalls.some((host) => host.endsWith(".wikipedia.org")), "a missed Commons search must still reach article thumbnails")
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
