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
const photoHints = load("lib/ai/answer-photo-hints.ts")
const portraits = load("lib/media/verified-portraits.ts")
for (const alias of ["Илон Маск", "Илона Маска", "Илон Рив Маск", "Elon Reeve Musk", "Elon Musk"]) {
  assert.equal(policy.referenceSearchTopic(alias), "Elon Musk")
  assert.equal(portraits.verifiedPortrait(alias)?.alt, "Elon Musk")
}
assert.equal(portraits.verifiedPortrait("Elon Musk statue"), null)
assert(fs.statSync("public/reference-photos/elon-musk.jpg").size < 100000, "same-origin reserve stays tiny")
assert.equal(catalog.isSafeVisualUrl("/reference-photos/elon-musk.jpg"), true)
assert.equal(catalog.isSafeVisualUrl("/reference-photos/../secret.jpg"), false)
const hints = (subjects) => photoHints.parseAnswerPhotoHints(JSON.stringify({ version: 1, subjects }))
const subject = { name: "Альберт Эйнштейн", query: "Albert Einstein", layout: "portrait" }
assert.equal(photoHints.groundedAnswerPhotoPlans(hints([subject]), "Кто такой Эйнштейн", "Альберт Эйнштейн — физик.")[0].queries[0], "Albert Einstein")
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([subject]), "Кто такой Эйнштейн", "Имя не названо."), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([subject]), "Кто такой Эйнштейн без фото", "Альберт Эйнштейн — физик."), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([subject]), "Напиши код", "Альберт Эйнштейн"), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([{ name: "iPhone 16", query: "iPhone 16 Pro" }]), "Сравни телефоны", "iPhone 16"), [])
assert.deepEqual(hints([{ name: "iPhone 16 Pro", query: "iPhone 17 Pro" }]), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(
  hints([{ name: "Эмма Уотсон", query: "Emma Watson", kind: "person", layout: "portrait" }]),
  "Кто спикеры AI Digital Bridge?", "Эмма Уотсон — не указана среди подтверждённых спикеров.",
), [], "an unconfirmed participant must not get a speaker photo card")
assert.equal(photoHints.groundedAnswerPhotoPlans(
  hints([{ name: "Багдат Мусин", query: "Bagdat Mussin", kind: "person", layout: "portrait" }]),
  "Покажи спикера форума", "Багдат Мусин — спикер согласно официальной программе.",
).length, 1, "explicitly stated participant names can still have a sourced portrait")

assert.deepEqual(hints([{ name: "Фото", query: "https://evil.example/secret" }]).map((item) => item.query), ["Фото"])
assert.deepEqual(photoHints.parseAnswerPhotoHints("x".repeat(8193)), [])
assert.deepEqual(hints(Array.from({ length: 13 }, () => subject)), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([{ name: "iPhone 4", query: "iPhone 4" }]), "Телефоны", "iPhone 40"), [])
assert.deepEqual(photoHints.groundedAnswerPhotoPlans(hints([subject]), "Люди", "```text\nАльберт Эйнштейн\n```"), [])
const hidden = 'Текст.\n\n```malik-photos\n{"version":1}\n```\n\nКонец.'
assert.equal(photoHints.stripAnswerPhotoHints(hidden), "Текст.\n\n\nКонец.")
assert.equal(photoHints.stripAnswerPhotoHints("Ответ.\n```malik-photos\n{partial"), "Ответ.")
assert.equal(photoHints.stripAnswerPhotoHints("```js\nconst x = 'malik-photos'\n```"), "```js\nconst x = 'malik-photos'\n```")
assert.ok(policy.planReferenceVisuals("Теперь покажи их фото", "Расскажи про Медеу без фото") || policy.planReferenceVisuals("Покажи их фото", "Расскажи про Медеу без фото"))
assert.equal(catalog.referenceTopicMatches("Medeu", "Almaty city centre"), false)
assert.equal(catalog.referenceTopicMatches("Medeu", "File:DSC123.jpg A view of the Medeu skating rink"), true)
assert.equal(catalog.referenceTitleScore("Samsung Galaxy S24", "Samsung Galaxy S24 Ultra"), 0)
// A single conversational question about a person should contain its portrait in
// the FIRST reply; no second "Покажи фото" message must be necessary.
for (const request of ["Жириновский знаешь", "Жириновский знаешь?", "Ты знаешь Жириновского?", "Знаешь Владимира Жириновского?"]) {
  const plan = policy.planReferenceVisuals(request)
  assert(plan && plan.person && plan.entity, "person intent on the first turn: " + request)
  const slots = policy.planAnswerVisualSlots(request, [
    { key: "intro", kind: "paragraph", text: "Владимир Жириновский (1946–2022) — российский политик." },
  ])
  assert.equal(slots.length, 1, "exactly one photo on first answer: " + request)
  assert.equal(slots[0].key, "intro")
  assert.equal(slots[0].plan.topic, "Владимир Жириновский")
  assert.equal(slots[0].plan.person, true)
  assert.equal(slots[0].plan.layout, "portrait")
}
const emphasizedPerson = policy.planAnswerVisualSlots("Жириновский знаешь", [
  { key: "intro", kind: "paragraph", text: "**Владимир Жириновский** (1946–2022) — политик." },
])
assert.equal(emphasizedPerson[0]?.plan.topic, "Владимир Жириновский")
assert.equal(policy.planReferenceVisuals("знаешь код?")?.person || false, false, "non-person subjects must not be person portraits")
assert.equal(policy.planReferenceVisuals("Жириновский знаешь? без фото"), null, "respect text-only request")
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
assert.equal(policy.planReferenceVisuals("Кто такой Назарбаев").person, true)
assert.equal(policy.planReferenceVisuals("Кто такой Назарбаев").layout, "portrait")
const inferredPortrait = policy.planAnswerVisualSlots("Расскажи про Илона Маска", [
  { key: "intro", kind: "paragraph", text: "Илон Маск — предприниматель." },
])
assert.equal(inferredPortrait[0].plan.person, true)
assert.deepEqual(inferredPortrait[0].plan.queries, ["Elon Musk", "Илон Маск"])
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
globalThis.localStorage = { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) }
delete process.env.UNSPLASH_ACCESS_KEY
const calls = []
const media = (index) => ({ index, title: "File:Almaty mountains " + index + ".jpg", imageinfo: [{ mime: "image/jpeg", thumburl: "https://thumb.wikimedia.org/mountains" + index + ".jpg?utm_source=commons", url: "https://upload.wikimedia.org/massive-original.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Almaty_mountains.jpg", extmetadata: { Artist: { value: "<b>Photographer</b>" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] })
try {
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, "commons.wikimedia.org", "chat must not contact Render or image hosts for metadata")
    assert.equal(options.credentials, "omit")
    assert.equal(url.searchParams.get("origin"), "*")
    assert.equal(url.searchParams.get("iiurlwidth"), "1000")
    assert.equal(url.searchParams.get("gsrlimit"), "6")
    calls.push(url.searchParams.get("gsrsearch"))
    return Response.json({ query: { pages: [3, 1, 2, 4].map((index) => ({ ...media(index), title: "File:" + url.searchParams.get("gsrsearch") + " " + index + ".jpg" })) } })
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
  assert.equal(cache.reportReferenceImageFailure(plan, images[0].url), true)
  assert.equal(cache.reportReferenceImageFailure(plan, images[0].url), false, "a failed URL cannot create an infinite retry loop")
  const replacement = await new Promise((resolve) => cache.subscribeReferenceImages(plan, resolve))
  assert.equal(replacement.length, 3)
  assert(replacement.every((image) => image.url !== images[0].url), "exclude failed thumbnails even when upstream adds tracking parameters")
  assert.equal(replacement[0].url.endsWith("mountains2.jpg"), true)
  // React StrictMode cleanup/re-subscribe must not trigger duplicate lookups.
  const strictPlan = policy.planReferenceVisuals("Покажи горы Астаны")
  const stop = cache.subscribeReferenceImages(strictPlan, () => {})
  stop()
  await new Promise((resolve) => cache.subscribeReferenceImages(strictPlan, resolve))
  assert.equal(calls.length, 3)
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
  const sciencePlan = policy.planReferenceVisuals("Объясни строение сердца")
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { title: "File:Heart diagram-en.svg", imageinfo: [{ mime: "image/svg+xml", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Heart.svg/500px-Heart.svg.png", url: "https://upload.wikimedia.org/massive-original.svg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Heart.svg" }] },
  ] } })
  const diagram = await catalog.lookupReferenceImages(sciencePlan)
  assert.equal(diagram.length, 1, "science illustrations work too, not just portraits/products")
  assert(diagram[0].url.endsWith(".png"), "use the small raster preview of a scientific SVG")
  const alternateDiagram = await catalog.lookupReferenceImages(sciencePlan, undefined, { excludedUrls: [diagram[0].url] })
  assert.match(alternateDiagram[0].url, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\//)
  assert(!alternateDiagram[0].url.includes("massive-original"), "CDN recovery preserves the exact illustration without downloading originals")
  globalThis.fetch = async () => Response.json({ query: { pages: [{ title: "File:Original only.jpg", imageinfo: [{ mime: "image/jpeg", url: "https://upload.wikimedia.org/huge.jpg" }] }] } })
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "never download original images to replace missing thumbnails")
  globalThis.fetch = async () => { throw new Error("Provider unavailable") }
  assert.deepEqual(await catalog.lookupReferenceImages(plan), [], "outage must not fail chat")
  let officialCalls = 0
  globalThis.fetch = async () => { officialCalls++; throw new Error("External catalogue unavailable") }
  const muskPlan = policy.planAnswerVisualSlots("Расскажи про Илона Маска", [{ key: "intro", kind: "paragraph", text: "Илон Рив Маск — предприниматель." }])[0].plan
  const muskPhoto = await catalog.lookupReferenceImages(muskPlan)
  assert.equal(muskPhoto[0].alt, "Elon Musk")
  const reservedMusk = await catalog.lookupReferenceImages(muskPlan, undefined, { excludedUrls: [muskPhoto[0].url] })
  assert.equal(reservedMusk[0].url, "/reference-photos/elon-musk.jpg", "external image failure uses a verified same-origin reserve")
  assert.equal(officialCalls, 0, "Musk full-name request works even during catalogue outage")
  const phonePhoto = await catalog.lookupReferenceImages(policy.planReferenceVisuals("Покажи iPhone 16 Pro"))
  assert.equal(phonePhoto[0].alt, "iPhone 16 Pro")
  assert.match(phonePhoto[0].url, /^https:\/\/cdsassets\.apple\.com\//)
  assert.equal(officialCalls, 0, "verified product photos do not depend on search availability")
  const namePlan = { topic: "John Michael Doe", queries: ["John Michael Doe"], person: true, entity: true, explicit: true, layout: "portrait" }
  globalThis.fetch = async () => Response.json({ query: { redirects: [{ from: "John Michael Doe", to: "John Doe" }], pages: [{ title: "John Doe", fullurl: "https://en.wikipedia.org/wiki/John_Doe", thumbnail: { source: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Doe.jpg/500px-Doe.jpg" } }] } })
  const redirected = await catalog.lookupReferenceImages(namePlan)
  assert.equal(redirected[0]?.alt, "John Doe", "canonical redirects may legitimately omit the middle name")
  const samePortrait = await catalog.lookupReferenceImages(namePlan, undefined, { excludedUrls: [redirected[0].url] })
  assert.match(samePortrait[0]?.url, /^https:\/\/upload\.wikimedia\.org\//)
  assert.equal(samePortrait[0]?.alt, "John Doe", "alternate CDN keeps the same person's same photograph")
  globalThis.fetch = async () => Response.json({ query: { pages: [{ title: "John Michael Doe", pageprops: { disambiguation: "" }, fullurl: "https://en.wikipedia.org/wiki/John_Doe", thumbnail: { source: "https://upload.wikimedia.org/map.jpg" } }] } })
  assert.deepEqual(await catalog.lookupReferenceImages(namePlan), [], "a disambiguation page is not a portrait")
  globalThis.fetch = async (input) => {
    const params = new URL(String(input)).searchParams
    if (params.get("list") === "search") return Response.json({ query: { search: [
      { title: "John Doe airport", snippet: "John Michael Doe" },
      { title: "John Doe", snippet: "John <span>Michael</span> Doe is a person." },
    ] } })
    return Response.json({ query: { pages: params.get("titles") === "John Doe" ? [{ title: "John Doe", fullurl: "https://en.wikipedia.org/wiki/John_Doe", thumbnail: { source: "https://upload.wikimedia.org/doe.jpg" } }] : [] } })
  }
  assert.equal((await catalog.lookupReferenceImages(namePlan))[0]?.alt, "John Doe", "full name search verifies the source text before retrieving the canonical portrait")
  globalThis.fetch = async (input) => new URL(String(input)).hostname === "ru.wikipedia.org"
    ? Response.json({ query: { pages: [{ title: "Иван Доу", fullurl: "https://ru.wikipedia.org/wiki/Иван_Доу", langlinks: [{ lang: "en", title: "Ivan Doe" }] }] } })
    : Response.json({ query: { pages: [{ title: "Ivan Doe", fullurl: "https://en.wikipedia.org/wiki/Ivan_Doe", thumbnail: { source: "https://upload.wikimedia.org/ivan.jpg" } }] } })
  assert.equal((await catalog.lookupReferenceImages({ ...namePlan, topic: "Иван Доу", queries: ["Иван Доу"] }))[0]?.alt, "Ivan Doe", "missing local photo uses that person's linked English article")
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { index: 1, title: "Nursultan Nazarbayev International Airport", fullurl: "https://en.wikipedia.org/wiki/Airport", thumbnail: { source: "https://upload.wikimedia.org/airport.jpg" } },
    { index: 2, title: "Nursultan Nazarbayev", fullurl: "https://en.wikipedia.org/wiki/Nursultan_Nazarbayev", thumbnail: { source: "https://upload.wikimedia.org/nazarbayev.jpg" } },
  ] } })
  const portrait = await catalog.lookupReferenceImages(policy.planReferenceVisuals("Кто такое призедент назарбаев"))
  assert.deepEqual(portrait.map((image) => image.alt), ["Nursultan Nazarbayev"], "do not show an airport for a person")
  globalThis.fetch = async (input) => String(input).includes("commons.wikimedia.org")
    ? Response.json({ query: { pages: [{ ...media(1), title: "File:Nursultan Nazarbayev International Airport.jpg" }, { ...media(2), title: "File:Nursultan Nazarbayev portrait.jpg" }] } })
    : Response.json({ query: { pages: [] } })
  assert.deepEqual(await catalog.lookupReferenceImages(policy.planReferenceVisuals("Кто такой Назарбаев")), [],
    "when the canonical portrait is missing, never substitute a namesake from Commons")
  assert.equal(catalog.referenceTitleCoverage("mountains Almaty", "File:Random airport.jpg"), 0)
  assert.equal(catalog.referenceTitleCoverage("mountains Almaty", "File:Almaty mountains.jpg"), 1)
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
  const articleFallback = await catalog.lookupReferenceImages({ topic: "Медеу", queries: ["Медеу"], explicit: true, layout: "landscape" })
  assert.equal(articleFallback[0]?.alt, "Медеу")
  assert.ok(fallbackCalls.some((host) => host.endsWith(".wikipedia.org")), "a missed Commons search must still reach article thumbnails")
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { ...media(1), title: "File:Almaty city centre.jpg" },
    { ...media(2), title: "File:DSC123.jpg", imageinfo: [{ ...media(2).imageinfo[0], extmetadata: { ImageDescription: { value: "<p>The Medeu skating rink near Almaty.</p>" } } }] },
  ] } })
  const exactPlace = await catalog.lookupReferenceImages({ topic: "Medeu", queries: ["Medeu"], explicit: true, layout: "landscape" })
  assert.deepEqual(exactPlace.map((image) => image.url), ["https://thumb.wikimedia.org/mountains2.jpg"], "generic ranking must not replace the requested place with its surrounding city")
  let simultaneous = 0, maximum = 0, delivered = 0
  const gates = []
  globalThis.fetch = async (input) => {
    simultaneous++; maximum = Math.max(maximum, simultaneous)
    await new Promise((resolve) => gates.push(resolve))
    simultaneous--; delivered++
    const topic = new URL(String(input)).searchParams.get("gsrsearch")
    return Response.json({ query: { pages: [{ ...media(1), title: "File:" + topic + ".jpg" }] } })
  }
  const queued = Array.from({ length: 12 }, (_, index) => new Promise((resolve) => cache.subscribeReferenceImages({ topic: "Subject" + index, queries: ["Subject" + index], explicit: true, layout: "landscape" }, resolve)))
  const cancelQueued = cache.subscribeReferenceImages({ topic: "Cancelled subject", queries: ["Cancelled subject"], explicit: true, layout: "landscape" }, () => assert.fail("unmounted queued lookup must not deliver"))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(gates.length, 6, "at most six catalogue lookups start together")
  cancelQueued()
  gates.splice(0).forEach((release) => release())
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(gates.length, 6)
  gates.splice(0).forEach((release) => release())
  const queuedResults = await Promise.all(queued)
  assert.equal(queuedResults.length, 12)
  assert.equal(delivered, 12)
  assert.equal(maximum, 6)
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
  const businessSlots = policy.planAnswerVisualSlots("Бизнес под ключ с помощью ИИ", [
    { key: "p0", kind: "paragraph", text: "Работа делится на несколько этапов." },
    { key: "i0", kind: "item", text: "**Анализ рынка и продуктовая матрица**: стратегия." },
    { key: "i1", kind: "item", text: "**Регламенты и регламентация (SOP)**: инструкции." },
    { key: "i2", kind: "item", text: "**Контент-маркетинг**: публикации." },
  ])
  assert.deepEqual(businessSlots, [], "abstract business bullets must not generate the three useless photo searches from the reported screenshot")
  const brand = load("lib/media/reference-brand-assets.ts")
  assert.equal(brand.referenceBrandAsset("Claude Monet"), null, "an artist must never get an AI logo")
  const mark = brand.referenceBrandAsset("Malik AI")
  assert.equal(mark?.url, "/brand/malik-mark.svg", "Malik AI has a bundled official logo")
  assert.equal(mark?.role, "logo")
  assert.equal(mark?.sourceUrl, "https://malikaiworld.world/")
  assert.match(fs.readFileSync(mark.url.slice(1).replace(/^/, "public/"), "utf8"), /M4 53 46 11v42H4Z/, "use the existing official mark geometry")
  for (const name of ["Malik AI", "MALIK AI", "MalikAI", "Malik AI (Sovereign Hub)", "MalikLLM MAX", "Malik Work", "Малик ИИ"]) {
    assert.equal(brand.referenceBrandAsset(name)?.url, mark.url, "same canonical brand mark for " + name)
  }
  for (const name of ["Malik", "Malik AI competitor", "Claude Monet", "Malik AI Review", "Malik AI fake"]) {
    assert.equal(brand.referenceBrandAsset(name), null, "never borrow the Malik logo for another subject: " + name)
  }
  assert.equal(catalog.isSafeVisualUrl(mark.url), true, "bundled icon is an exact allowed same-origin path")
  for (const unsafe of ["/brand/../secret", "/brand/malik-mark.svg?redirect=evil", "/brand/other.svg"]) {
    assert.equal(catalog.isSafeVisualUrl(unsafe), false, "arbitrary local paths must stay blocked")
  }
  assert.equal(catalog.sanitizeReferenceImages([mark])[0]?.url, "/brand/malik-mark.svg", "verified first-party SVG survives image metadata validation")
  const cardSource = fs.readFileSync("components/sovereign/MalikAnswerCards.tsx", "utf8")
  assert.match(cardSource, /referenceBrandAsset\(title\)/, "brand is resolved from the card title, even without an image field")
  assert.match(cardSource, /image\.logo \? " is-logo" : " is-photo"/, "official brand uses logo presentation")
  requests = 0
  globalThis.fetch = async () => { requests++; throw new Error("Should not search for a known logo") }
  for (const name of ["ChatGPT", "Claude", "GitHub", "Malik AI", "MalikLLM MAX"]) {
    const logos = await catalog.lookupReferenceImages({ topic: name, queries: [name], entity: true, explicit: true, layout: "landscape" })
    assert.equal(logos[0].role, "logo")
    assert.match(logos[0].alt, /логотип/)
  }
  assert.equal(requests, 0, "exact brand logos have no metadata round trip")
  globalThis.fetch = async () => Response.json({ query: { pages: [
    { title: "File:Acme office.jpg", imageinfo: [{ mime: "image/jpeg", thumburl: "https://upload.wikimedia.org/acme-office.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Acme_office.jpg" }] },
    { title: "File:Other logo.svg", imageinfo: [{ mime: "image/svg+xml", thumburl: "https://upload.wikimedia.org/other-logo.svg.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Other_logo.svg" }] },
    { title: "File:Acme logo.svg", imageinfo: [{ mime: "image/svg+xml", thumburl: "https://upload.wikimedia.org/acme-logo.svg.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Acme_logo.svg" }] },
  ] } })
  const genericLogo = await catalog.lookupReferenceImages({ topic: "Acme", queries: ["Acme"], logo: true, entity: true, explicit: true, layout: "landscape" })
  assert.equal(genericLogo.length, 1)
  assert.equal(genericLogo[0].role, "logo")
  assert.match(genericLogo[0].url, /acme-logo/)
  const officeOnly = { topic: "Acme office", queries: ["Acme office"], logo: true, entity: true, explicit: true, layout: "landscape" }
  assert.deepEqual(await catalog.lookupReferenceImages(officeOnly), [], "missing logo must never fall back to an office or another brand")
  assert.notEqual(cache.referenceCacheKey(officeOnly), cache.referenceCacheKey({ ...officeOnly, logo: false }), "photo and logo caches are distinct")
  let abortedLookups = 0, hedgeCalls = 0
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith("/api/chat/reference-images?")) {
      hedgeCalls++
      return Response.json({ images: [{ url: "https://upload.wikimedia.org/hedge.jpg", alt: "Hedge subject" }] })
    }
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { abortedLookups++; reject(new Error("aborted")) }, { once: true }))
  }
  const hedgePlan = { topic: "Hedge subject", queries: ["Hedge subject"], entity: true, explicit: true, layout: "landscape" }
  const started = performance.now()
  const hedged = await new Promise((resolve) => cache.subscribeReferenceImages(hedgePlan, resolve))
  assert.equal(hedged[0].alt, "Hedge subject")
  assert(performance.now() - started < 1200, "server fallback starts early, not after the old 9-second direct timeout")
  assert.equal(hedgeCalls, 1)
  assert(abortedLookups > 0, "a successful hedge cancels the stuck catalogue")
  let outageCalls = 0
  globalThis.fetch = async () => { outageCalls++; throw new Error("Offline") }
  const outagePlan = { topic: "Negative cache test", queries: ["Negative cache test"], entity: true, explicit: true, layout: "landscape" }
  assert.deepEqual(await new Promise((resolve) => cache.subscribeReferenceImages(outagePlan, resolve)), [])
  const callsAfterFailure = outageCalls
  assert.deepEqual(await new Promise((resolve) => cache.subscribeReferenceImages(outagePlan, resolve)), [])
  assert.equal(outageCalls, callsAfterFailure, "a remount honours the negative cache instead of restarting another 45-second retry cycle")
  assert.equal(cache.REFERENCE_LOOKUP_BUDGET_MS, 8000)
  let deadlineAborts = 0
  globalThis.fetch = async (_input, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { deadlineAborts++; reject(new Error("deadline")) }, { once: true }))
  const deadlineStarted = performance.now()
  let watchdog
  const deadlineResult = await Promise.race([
    new Promise((resolve) => cache.subscribeReferenceImages({ topic: "Deadline test", queries: ["Deadline test"], entity: true, explicit: true, layout: "landscape" }, resolve)),
    new Promise((_resolve, reject) => { watchdog = setTimeout(() => reject(new Error("Photo lookup exceeded its entire-turn budget")), 9500) }),
  ]).finally(() => clearTimeout(watchdog))
  assert.deepEqual(deadlineResult, [])
  assert(performance.now() - deadlineStarted < 9500)
  assert(deadlineAborts >= 2, "both stuck catalogue paths must be aborted at the deadline")
  let slowCommonsAborted = false
  globalThis.fetch = async (input, options) => {
    if (String(input).includes("commons.wikimedia.org")) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { slowCommonsAborted = true; reject(new Error("cancelled")) }, { once: true }))
    return Response.json({ query: { pages: [{ title: "Mount Example", fullurl: "https://en.wikipedia.org/wiki/Mount_Example", thumbnail: { source: "https://upload.wikimedia.org/mount-example.jpg" } }] } })
  }
  const fastStarted = performance.now()
  const fast = await catalog.lookupReferenceImages({ topic: "Mount Example", queries: ["Mount Example"], explicit: true, layout: "landscape" }, undefined, { fast: true })
  assert.equal(fast[0].alt, "Mount Example")
  assert(performance.now() - fastStarted < 800, "article thumbnails don't wait for stalled Commons queries")
  assert.equal(slowCommonsAborted, true)
  const tutorialRecovery = policy.planReferenceVisuals("Как включить Bluetooth в Windows")
  let tutorialServerCalls = 0
  globalThis.fetch = async (input) => {
    if (!String(input).startsWith("/api/chat/reference-images?")) return Response.json({ query: { pages: [] } })
    tutorialServerCalls++
    const params = new URL(String(input), "https://malik.test").searchParams
    const rebuilt = policy.planReferenceVisuals(params.get("q"))
    assert.equal(rebuilt.kind, "tutorial", "server recovery preserves screenshot intent")
    assert.deepEqual(rebuilt.visualDevice, tutorialRecovery.visualDevice)
    assert.deepEqual(rebuilt.visualTerms, tutorialRecovery.visualTerms)
    return Response.json({ images: [{ url: "https://upload.wikimedia.org/windows-bluetooth.png", alt: "Windows Bluetooth settings" }] })
  }
  const recoveredScreen = await new Promise((resolve) => cache.subscribeReferenceImages(tutorialRecovery, resolve))
  assert.equal(recoveredScreen[0].alt, "Windows Bluetooth settings")
  assert.equal(tutorialServerCalls, 1, "a tutorial also recovers when direct catalogue access fails")
  console.log("PASS exact zero-search logos, abstract-photo suppression, early fallback, cancelled losers, real 8-second outage deadline and negative caching")
  console.log("PASS browser-direct metadata, thumbnails, attribution, caching, deduplication and outage fallback")
} finally {
  globalThis.fetch = savedFetch
  globalThis.localStorage = savedStorage
  if (savedKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY
  else process.env.UNSPLASH_ACCESS_KEY = savedKey
}

// Strong photos, no empty frames, no giant emblems.
{
  assert.equal(catalog.isVectorThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Emblem.svg/500px-Emblem.svg.png"), true)
  assert.equal(catalog.isVectorThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg/1000px-Photo.jpg"), false)
  const photo = catalog.referencePhotoQuality("Scarlet Witch", "File:Scarlet Witch cosplay.jpg", { mime: "image/jpeg", width: 2400, height: 1600 })
  const emblem = catalog.referencePhotoQuality("Scarlet Witch", "File:Scarlet Witch emblem.svg", { mime: "image/svg+xml", thumburl: "https://upload.wikimedia.org/x/a/ab/E.svg/500px-E.svg.png", width: 512, height: 512 })
  const tiny = catalog.referencePhotoQuality("Scarlet Witch", "File:Scarlet Witch.jpg", { mime: "image/jpeg", width: 200, height: 260 })
  assert(photo > emblem, "a large real photo outranks an emblem")
  assert(photo > tiny, "a large photo outranks a tiny file")
  assert(catalog.referencePhotoQuality("Apple logo", "File:Apple logo.svg", { mime: "image/svg+xml" }, true) > 0, "logos stay allowed when a logo is wanted")
  const gallery = fs.readFileSync("components/sovereign/MalikVisualGallery.tsx", "utf8")
  assert.doesNotMatch(gallery, /Изображение недоступно|Превью недоступно|Превью \$\{/, "no empty-frame or size lines in answers")
  const blocks = fs.readFileSync("components/sovereign/answer-blocks.css", "utf8")
  assert.match(blocks, /\.malik-answer-photo-hero__figure img \{[^}]*max-height: min\(460px, 62vh\)/, "hero photos have a height cap")
  assert.match(blocks, /\.malik-answer-photo-row__image img \{[^}]*max-height:/, "row photos have a height cap")
  console.log("PASS strong-photo ranking, vector emblems demoted, no empty frames, capped photo height")
}

const lengthyAlmaty = "Расскажи про горы Казахстана\n" + "исторические данные и заметки\n".repeat(180)
assert.ok(lengthyAlmaty.length > 2500)
assert.ok(policy.allowsAnswerPhotoHints(lengthyAlmaty), "long geography brief still allows grounded photo hints")
assert.ok(policy.planReferenceVisuals(lengthyAlmaty), "long visual brief receives a bounded topical visual query")
assert.ok(policy.planReferenceVisuals(lengthyAlmaty).queries.every((query) => query.length <= 220), "never search a full pasted brief")
assert.equal(policy.planReferenceVisuals(lengthyAlmaty + "\nТолько текст, без фото"), null, "tail opt-out still wins even in long prompts")
assert.equal(policy.planReferenceVisuals("Реши квадратное уравнение\n" + "условия задачи\n".repeat(200)), null, "math does not get decorative photos")
console.log("PASS long briefs: bounded relevant photo search, tail opt-out and non-visual tasks")
