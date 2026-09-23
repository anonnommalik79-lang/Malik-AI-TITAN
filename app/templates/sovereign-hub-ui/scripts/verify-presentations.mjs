import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const ROOT = process.cwd()

/* A tiny module system: transpile TypeScript on the fly, resolve "@/…" to the
   project, and substitute the handful of server modules that would otherwise
   need a network, a bucket or a model. */

let modelScript = []
const modelCalls = []

const STUBS = {
  "server-only": {},
  "@aws-sdk/client-s3": {
    S3Client: class { send() { throw new Error("no bucket in tests") } },
    GetObjectCommand: class {},
    PutObjectCommand: class {},
  },
  "@/lib/server/malik-model-router": {
    runStrictMalikModel: async (input) => {
      modelCalls.push(input)
      const next = modelScript.shift()
      if (next instanceof Error) throw next
      return { content: typeof next === "function" ? next(input) : String(next ?? ""), provider: "stub", model: "stub", selectedModelId: input.modelId, latencyMs: 1 }
    },
    MalikModelRouteError: class extends Error {},
    malikModelErrorPayload: (error) => ({ message: String(error?.message || "") }),
  },
  "@/lib/ai/malik-models": { DEFAULT_MALIK_MODEL_ID: "malik-max", hasMalikProAccess: (plan) => plan === "pro" || plan === "owner" },
}

const cache = new Map()
function resolveProjectFile(specifier) {
  const base = path.join(ROOT, specifier)
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`cannot resolve ${specifier}`)
}

function load(file) {
  const absolute = path.resolve(ROOT, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }
  cache.set(absolute, box)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const localRequire = (name) => {
    if (name in STUBS) return STUBS[name]
    if (name.startsWith("@/")) return load(resolveProjectFile(name.slice(2)))
    return require(name)
  }
  new Function("require", "module", "exports", js)(localRequire, box, box.exports)
  return box.exports
}

const deck = load("lib/presentations/deck.ts")
const themes = load("lib/presentations/themes.ts")
const quota = load("lib/server/presentation-quota.ts")
const engine = load("lib/server/presentation-engine.ts")
const pptx = load("lib/presentations/pptx.ts")

let failures = 0
const pending = []
function check(name, fn) {
  const run = async () => {
    try {
      await fn()
      console.log(`  ok  ${name}`)
    } catch (error) {
      failures += 1
      console.error(`  FAIL ${name}\n       ${String(error?.message || error).split("\n")[0]}`)
    }
  }
  pending.push({ name, run })
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8")

/* ================================================================ parsing */

check("finds the JSON inside a code fence, a preamble or a trailing comma", () => {
  assert.deepEqual(deck.extractJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(deck.extractJson('Вот план:\n{"a":[1,2,],}'), { a: [1, 2] })
  assert.deepEqual(deck.extractJson("<think>hmm {not json}</think>[1,2]"), [1, 2])
  assert.equal(deck.extractJson("совсем не json"), null)
})

check("cleans model text the way a slide needs it", () => {
  assert.equal(deck.cleanText("**Рост** на `12%`", 50), "Рост на 12%")
  assert.equal(deck.cleanText("- пункт один", 50), "пункт один")
  assert.equal(deck.cleanText("3) третий", 50), "третий")
  const cut = deck.cleanText("Очень длинный заголовок который никак не помещается в отведённое место", 30)
  assert.ok(cut.length <= 30, cut)
  assert.ok(cut.endsWith("…"), cut)
  assert.ok(!/\s…$/.test(cut), "cut on a word, not in the middle of one")
})

check("understands the names models give layouts", () => {
  assert.equal(deck.coerceLayout("cover"), "title")
  assert.equal(deck.coerceLayout("Bar Chart"), "chart")
  assert.equal(deck.coerceLayout("roadmap"), "timeline")
  assert.equal(deck.coerceLayout("vs"), "comparison")
  assert.equal(deck.coerceLayout("nonsense", "cards"), "cards")
})

const SAMPLES = {
  title: { layout: "title", kicker: "Питч", title: "Кофейня, которая окупается за 14 месяцев", subtitle: "План запуска в Алматы", imagePrompt: "cozy coffee shop" },
  section: { layout: "section", number: "02", title: "Рынок", subtitle: "Почему сейчас" },
  bullets: { layout: "bullets", title: "Три причины", points: [{ title: "Спрос", body: "Растёт" }, "Цена: ниже рынка", { title: "Место" }] },
  "two-column": { layout: "two-column", title: "Было и стало", left: { heading: "Сейчас", points: ["a", "b"] }, right: { heading: "С нами", points: ["c", "d"] } },
  stat: { layout: "stat", title: "Цифры", stats: [{ value: "14 мес", label: "окупаемость" }, { value: "≈40%", label: "маржа" }], context: "оценка" },
  quote: { layout: "quote", quote: "«Лучший кофе в районе»", author: "Айгерим", role: "клиент" },
  "image-text": { layout: "image-text", title: "Зал на 30 мест", body: "Светлый зал у метро", points: ["Wi-Fi"], imageSide: "left", imagePrompt: "interior" },
  cards: { layout: "cards", title: "Продукт", cards: [{ title: "Эспрессо", body: "x" }, { title: "Выпечка", body: "y" }, { title: "Завтраки", body: "z" }] },
  timeline: { layout: "timeline", title: "План", steps: [{ label: "Q1", title: "Аренда" }, { label: "Q2", title: "Ремонт" }, { label: "Q3", title: "Открытие" }] },
  comparison: { layout: "comparison", title: "Мы против сети", columns: ["Сеть", "Мы"], rows: [{ label: "Цена", values: ["1500", "1100"] }, { label: "Скорость", values: ["5 мин", "2 мин"] }], verdict: "Дешевле и быстрее" },
  chart: { layout: "chart", title: "Выручка", unit: "млн ₸", data: [{ label: "2024", value: "12,5" }, { label: "2025", value: 18 }, { label: "2026", value: "24" }], takeaway: "Рост вдвое" },
  closing: { layout: "closing", title: "Инвестируйте 40 млн ₸", subtitle: "Возврат за 14 месяцев", contact: "hello@cafe.kz" },
}

check("accepts a valid example of every one of the twelve layouts", () => {
  for (const [layout, raw] of Object.entries(SAMPLES)) {
    const slide = deck.normalizeSlide(raw)
    assert.ok(slide, `${layout} was rejected`)
    assert.equal(slide.layout, layout)
    assert.ok(slide.id, `${layout} has no id`)
  }
  assert.equal(Object.keys(SAMPLES).length, 12)
})

check("reads 'Title: body' strings as a titled point", () => {
  const slide = deck.normalizeSlide(SAMPLES.bullets)
  assert.deepEqual(slide.points[1], { title: "Цена", body: "ниже рынка" })
})

check("never lets a slide carry more items than its box holds", () => {
  const many = { layout: "bullets", title: "Много", points: Array.from({ length: 9 }, (_, i) => `Пункт ${i + 1}`) }
  assert.equal(deck.normalizeSlide(many).points.length, 5)
  const cards = { layout: "cards", title: "Карточки", cards: Array.from({ length: 7 }, (_, i) => ({ title: `К${i}` })) }
  assert.equal(deck.normalizeSlide(cards).cards.length, 4)
})

check("turns '12,5%' and '1 200' into numbers a chart can draw", () => {
  assert.equal(deck.parseChartNumber("12,5%"), 12.5)
  assert.equal(deck.parseChartNumber("1 200"), 1200)
  assert.equal(deck.parseChartNumber("$3.4"), 3.4)
  assert.equal(deck.parseChartNumber("нет"), null)
  assert.equal(deck.normalizeSlide(SAMPLES.chart).data[0].value, 12.5)
})

check("degrades a chart with nothing to draw into bullets instead of an empty chart", () => {
  const slide = deck.normalizeSlide({ layout: "chart", title: "Ноль", data: [{ label: "a", value: 0 }, { label: "b", value: 0 }], points: ["Первое", "Второе"] })
  assert.equal(slide.layout, "bullets")
})

check("degrades a comparison without two columns into bullets when it has points", () => {
  const slide = deck.normalizeSlide({ layout: "comparison", title: "Сравнение", columns: ["один"], points: ["a", "b", "c"] })
  assert.equal(slide.layout, "bullets")
})

check("drops a slide that cannot be made into anything", () => {
  assert.equal(deck.normalizeSlide({ layout: "bullets", title: "" }), null)
  assert.equal(deck.normalizeSlide({ layout: "image-text", title: "Только заголовок" }), null)
  assert.equal(deck.normalizeSlide("строка"), null)
  assert.equal(deck.normalizeSlide(null), null)
})

check("strips the quotation marks a model wraps a quote in", () => {
  assert.equal(deck.normalizeSlide(SAMPLES.quote).quote, "Лучший кофе в районе")
})

check("accepts only https or data images, never an arbitrary URL", () => {
  assert.equal(deck.normalizeSlide({ ...SAMPLES.title, imageUrl: "javascript:alert(1)" }).imageUrl, undefined)
  assert.equal(deck.normalizeSlide({ ...SAMPLES.title, imageUrl: "http://x.test/a.png" }).imageUrl, undefined)
  assert.equal(deck.normalizeSlide({ ...SAMPLES.title, imageUrl: "https://x.test/a.png" }).imageUrl, "https://x.test/a.png")
})

/* ================================================================ outline */

check("an outline always opens on a cover and closes on a conclusion", () => {
  const outline = deck.normalizeOutline({
    title: "Кофейня",
    items: [
      { title: "Начало", layout: "bullets" },
      { title: "Рынок", layout: "stat" },
      { title: "Продукт", layout: "cards" },
      { title: "Итог", layout: "bullets" },
    ],
  }, "тема", 4)
  assert.equal(outline.items[0].layout, "title")
  assert.equal(outline.items.at(-1).layout, "closing")
})

check("refuses an outline too short to be a deck", () => {
  assert.equal(deck.normalizeOutline({ items: [{ title: "a" }, { title: "b" }] }, "t", 10), null)
})

check("accepts an outline given as plain strings", () => {
  const outline = deck.normalizeOutline(["Один", "Два", "Три", "Четыре", "Пять"], "Тема", 5)
  assert.equal(outline.items.length, 5)
  assert.equal(outline.title, "Тема")
})

check("keeps slide counts inside what a deck can be", () => {
  assert.equal(deck.clampSlideCount(1), deck.MIN_SLIDES)
  assert.equal(deck.clampSlideCount(99), deck.MAX_SLIDES)
  assert.equal(deck.clampSlideCount("abc"), deck.DEFAULT_SLIDES)
  assert.equal(deck.extractSlideCount("презентацию на 8 слайдов"), 8)
  assert.equal(deck.extractSlideCount("12 slides about AI"), 12)
  assert.equal(deck.extractSlideCount("просто презентация"), null)
})

check("detects the language to write the deck in", () => {
  assert.equal(deck.detectDeckLanguage("Кофейня в Алматы"), "ru")
  assert.equal(deck.detectDeckLanguage("Қазақстандағы кофехана"), "kk")
  assert.equal(deck.detectDeckLanguage("Coffee shop in Almaty"), "en")
})

/* ========================================================= chat hand-off */

check("recognises a request to make a deck", () => {
  for (const text of [
    "сделай презентацию про кофейню в Алматы",
    "Создай питч-дек для стартапа",
    "подготовь слайды на 8 слайдов о рынке ИИ",
    "make a pitch deck for my bakery",
    "нужна презентация для инвесторов",
    "бро, сделай презентацию",
  ]) {
    assert.ok(deck.isPresentationCreationRequest(text), text)
  }
})

check("leaves questions about presentations in the chat", () => {
  for (const text of [
    "как сделать хорошую презентацию?",
    "how to make a good presentation",
    "что такое слайд в powerpoint",
    "почему моя презентация скучная",
    "расскажи про Gamma",
    "",
  ]) {
    assert.equal(deck.isPresentationCreationRequest(text), false, text)
  }
})

check("pulls the topic out of the command around it", () => {
  assert.equal(deck.presentationTopic("сделай презентацию про кофейню в Алматы"), "кофейню в Алматы")
  assert.equal(deck.presentationTopic("Make a presentation about solar energy"), "solar energy")
  assert.equal(deck.presentationTopic("ИИ в медицине"), "ИИ в медицине")
  assert.equal(deck.presentationTopic("Сделай презентацию про кофейню у метро на 8 слайдов"), "кофейню у метро")
  assert.equal(deck.presentationTopic("make a pitch deck for my bakery, 12 slides"), "my bakery")
  assert.equal(deck.presentationTopic("презентация про 5G в Казахстане"), "5G в Казахстане")
})

/* ================================================================= decks */

check("a whole deck survives the trip through storage and back", () => {
  const original = {
    id: "d-test-1",
    title: "Кофейня",
    theme: "ember",
    language: "ru",
    slides: Object.values(SAMPLES).map((raw) => deck.normalizeSlide(raw)),
    prompt: "кофейня",
    createdAt: 1,
    updatedAt: 2,
  }
  const back = deck.normalizeDeck(JSON.parse(JSON.stringify(original)))
  assert.equal(back.slides.length, 12)
  assert.equal(back.theme, "ember")
  assert.deepEqual(back.slides.map((s) => s.id), original.slides.map((s) => s.id))
})

check("a stored deck with a bad theme or broken slides still opens", () => {
  const back = deck.normalizeDeck({ title: "x", theme: "neon", slides: [SAMPLES.cards, { layout: "chart" }, "мусор"] })
  assert.equal(back.theme, "obsidian")
  assert.equal(back.slides.length, 1)
})

check("prices a deck as one credit per slide plus the plan", () => {
  assert.equal(deck.deckCost(10), 11)
  assert.equal(deck.deckCost(4), 5)
})

check("every theme defines every token both renderers read", () => {
  const keys = ["bg", "surface", "text", "muted", "accent", "onAccent", "border"]
  for (const id of themes.THEME_IDS) {
    const theme = themes.DECK_THEMES[id]
    for (const key of keys) assert.match(theme[key], /^[0-9A-F]{6}$/, `${id}.${key} is not PowerPoint-safe hex`)
    assert.ok(theme.series.length >= 3)
  }
  assert.equal(themes.DEFAULT_THEME, "obsidian")
  assert.equal(themes.DECK_THEMES.obsidian.bg, "000000")
})

/* ================================================================ credits */

const withEnv = async (env, fn) => {
  const saved = {}
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value }
  try { return await fn() } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
}
const uid = () => `test-${Math.random().toString(36).slice(2)}@malik.test`

check("maps plans to tiers, with guests separate from free accounts", () => {
  assert.equal(quota.presentationTier("owner", true), "owner")
  assert.equal(quota.presentationTier("pro", true), "pro")
  assert.equal(quota.presentationTier("ultra", true), "ultra")
  assert.equal(quota.presentationTier("free", true), "free")
  assert.equal(quota.presentationTier("pro", false), "guest")
})

check("gives each tier its documented daily credits", () => {
  assert.equal(quota.presentationPlanLimits("free").dailyCredits, 24)
  assert.equal(quota.presentationPlanLimits("pro").dailyCredits, 240)
  assert.equal(quota.presentationPlanLimits("ultra").dailyCredits, 800)
  assert.equal(quota.presentationPlanLimits("guest").dailyCredits, 0)
  assert.equal(quota.presentationPlanLimits("owner").unlimited, true)
  assert.equal(quota.presentationPlanLimits("free").maxSlides, 12)
  assert.equal(quota.presentationPlanLimits("pro").maxSlides, 20)
})

check("lets pricing change from the environment without a deploy", () => withEnv({ PRESENTATION_FREE_DAILY_CREDITS: "50", PRESENTATION_FREE_MAX_SLIDES: "8" }, () => {
  assert.equal(quota.presentationPlanLimits("free").dailyCredits, 50)
  assert.equal(quota.presentationPlanLimits("free").maxSlides, 8)
}))

check("reserves credits and reports what is left", async () => {
  const user = uid()
  const result = await quota.reservePresentationCredits(user, "free", true, 11)
  assert.equal(result.ok, true)
  assert.equal(result.quota.used, 11)
  assert.equal(result.quota.remaining, 13)
})

check("refuses a reservation larger than what is left, and says how much is left", async () => {
  const user = uid()
  await quota.reservePresentationCredits(user, "free", true, 20)
  const result = await quota.reservePresentationCredits(user, "free", true, 11)
  assert.equal(result.ok, false)
  assert.equal(result.status, 429)
  assert.equal(result.code, "PRESENTATION_CREDITS_EXHAUSTED")
  assert.match(result.error, /нужно 11, осталось 4/)
})

check("asks a guest to sign in rather than showing zero credits", async () => {
  const result = await quota.reservePresentationCredits("guest:abc", "free", false, 1)
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.code, "SIGN_IN_REQUIRED")
})

check("refunds what was reserved and not delivered", async () => {
  const user = uid()
  await quota.reservePresentationCredits(user, "free", true, 8)
  const after = await quota.refundPresentationCredits(user, "free", true, 3)
  assert.equal(after.used, 5)
  assert.equal(after.remaining, 19)
})

check("a refund can never take the balance below zero", async () => {
  const user = uid()
  const after = await quota.refundPresentationCredits(user, "free", true, 50)
  assert.equal(after.used, 0)
})

check("parallel batches cannot overspend a balance between them", async () => {
  const user = uid()
  // 24 credits, ten batches of four fired at once: exactly six can be paid for.
  const results = await Promise.all(Array.from({ length: 10 }, () => quota.reservePresentationCredits(user, "free", true, 4)))
  assert.equal(results.filter((r) => r.ok).length, 6)
  const now = await quota.getPresentationQuota(user, "free", true)
  assert.equal(now.used, 24)
  assert.equal(now.remaining, 0)
})

check("the owner is never stopped", async () => {
  const user = uid()
  for (let i = 0; i < 5; i += 1) {
    const result = await quota.reservePresentationCredits(user, "owner", true, 500)
    assert.equal(result.ok, true)
  }
  const now = await quota.getPresentationQuota(user, "owner", true)
  assert.equal(now.unlimited, true)
  assert.equal(now.remaining, -1)
})

/* ================================================================= engine */

const outlineJson = JSON.stringify({
  title: "Кофейня",
  items: [
    { title: "Кофейня окупается за 14 месяцев", point: "p", layout: "title" },
    { title: "Спрос растёт", point: "p", layout: "stat" },
    { title: "Три продукта", point: "p", layout: "cards" },
    { title: "План", point: "p", layout: "timeline" },
    { title: "Мы против сети", point: "p", layout: "comparison" },
    { title: "Инвестируйте", point: "p", layout: "closing" },
  ],
})

check("an outline that fails once is asked for again, with the reason", async () => {
  modelScript = ["я не знаю что такое JSON", outlineJson]
  modelCalls.length = 0
  const outline = await engine.generateOutline({ topic: "кофейня", count: 6, language: "ru", tone: "confident" })
  assert.equal(outline.items.length, 6)
  assert.equal(modelCalls.length, 2)
  assert.match(modelCalls[1].prompt, /could not be used/)
})

check("an outline that fails twice is an error, not a made-up deck", async () => {
  modelScript = ["нет", "всё ещё нет"]
  await assert.rejects(() => engine.generateOutline({ topic: "кофейня", count: 6, language: "ru", tone: "confident" }), /не смогла составить план/)
})

check("places slides by their number when the model skips one, then asks only for the gap", async () => {
  const outline = deck.normalizeOutline(JSON.parse(outlineJson), "кофейня", 6)
  modelScript = [
    // Batch of 4 starting at slide 1: the model returns 1, 3, 4 and forgets 2.
    JSON.stringify({ slides: [{ n: 1, ...SAMPLES.title }, { n: 3, ...SAMPLES.cards }, { n: 4, ...SAMPLES.timeline }] }),
    // The retry is for slide 2 alone.
    JSON.stringify({ slides: [{ n: 2, ...SAMPLES.stat }] }),
  ]
  modelCalls.length = 0
  const result = await engine.generateSlides({ topic: "кофейня", outline, startIndex: 0, count: 4, language: "ru", tone: "confident" })
  assert.deepEqual(result.slides.map((s) => s.index), [0, 1, 2, 3])
  assert.deepEqual(result.slides.map((s) => s.slide.layout), ["title", "stat", "cards", "timeline"])
  assert.deepEqual(result.missing, [])
  assert.equal(modelCalls.length, 2)
  assert.match(modelCalls[1].prompt, /Write ONLY these 1 slide/)
})

check("reports the slides it could not get instead of inventing them", async () => {
  const outline = deck.normalizeOutline(JSON.parse(outlineJson), "кофейня", 6)
  modelScript = [JSON.stringify({ slides: [{ n: 5, ...SAMPLES.comparison }] }), "мусор"]
  const result = await engine.generateSlides({ topic: "кофейня", outline, startIndex: 4, count: 2, language: "ru", tone: "confident" })
  assert.deepEqual(result.slides.map((s) => s.index), [4])
  assert.deepEqual(result.missing, [5])
})

check("every generated slide gets its own id and no picture address from the model", async () => {
  const outline = deck.normalizeOutline(JSON.parse(outlineJson), "кофейня", 6)
  modelScript = [JSON.stringify({ slides: [
    { n: 1, ...SAMPLES.title, id: "s1", imageUrl: "https://tracker.test/pixel.png" },
    { n: 2, ...SAMPLES.stat, id: "s1" },
  ] })]
  const result = await engine.generateSlides({ topic: "кофейня", outline, startIndex: 0, count: 2, language: "ru", tone: "confident" })
  const ids = result.slides.map((s) => s.slide.id)
  assert.equal(new Set(ids).size, 2, "ids must be unique")
  assert.ok(!ids.includes("s1"), "the model's id is not used")
  assert.equal(result.slides[0].slide.imageUrl, undefined, "a model cannot put a picture address on a slide")
})

check("a rewrite into another layout does not take a picture address from the model", async () => {
  const original = { ...deck.normalizeSlide(SAMPLES.bullets), id: "s-keep" }
  modelScript = [JSON.stringify({ ...SAMPLES["image-text"], imageUrl: "https://tracker.test/pixel.png" })]
  const slide = await engine.rewriteSlide({ deckTitle: "x", slide: original, layout: "image-text", neighbours: [], language: "ru", tone: "confident" })
  assert.equal(slide.id, "s-keep")
  assert.equal(slide.imageUrl, undefined)
})

check("a rewritten slide keeps its place and its picture", async () => {
  const original = { ...deck.normalizeSlide(SAMPLES["image-text"]), id: "s-keep-me", imageUrl: "https://img.test/a.png" }
  modelScript = [JSON.stringify({ ...SAMPLES["image-text"], title: "Зал на 40 мест", id: "s-new-id" })]
  const slide = await engine.rewriteSlide({ deckTitle: "Кофейня", slide: original, neighbours: [], language: "ru", tone: "confident" })
  assert.equal(slide.id, "s-keep-me")
  assert.equal(slide.imageUrl, "https://img.test/a.png")
  assert.equal(slide.title, "Зал на 40 мест")
})

check("a rewrite into a different layout is asked for explicitly", async () => {
  const original = deck.normalizeSlide(SAMPLES.bullets)
  modelScript = [JSON.stringify(SAMPLES.cards)]
  modelCalls.length = 0
  const slide = await engine.rewriteSlide({ deckTitle: "x", slide: original, layout: "cards", neighbours: [], language: "ru", tone: "confident" })
  assert.equal(slide.layout, "cards")
  assert.match(modelCalls[0].prompt, /Rebuild this slide as layout "cards"/)
})

check("the model is told never to invent statistics", async () => {
  const outline = deck.normalizeOutline(JSON.parse(outlineJson), "кофейня", 6)
  modelScript = [JSON.stringify({ slides: [{ n: 1, ...SAMPLES.title }] })]
  modelCalls.length = 0
  await engine.generateSlides({ topic: "кофейня", outline, startIndex: 0, count: 1, language: "ru", tone: "confident" })
  assert.match(modelCalls[0].systemPrompt, /NEVER invent precise statistics/)
  assert.match(modelCalls[0].systemPrompt, /CLAIM/)
})

/* =================================================================== pptx */

check("exports a real PowerPoint file with every slide, the chart, the table and the notes", async () => {
  const JSZip = require("jszip")
  const slides = Object.values(SAMPLES).map((raw) => ({ ...deck.normalizeSlide(raw), notes: "Что сказать на этом слайде." }))
  const file = await pptx.buildPptx({ title: "Кофейня", theme: "obsidian", slides })
  assert.ok(Buffer.isBuffer(file) && file.length > 20_000, `file is ${file.length} bytes`)

  const zip = await JSZip.loadAsync(file)
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  assert.equal(slideFiles.length, 12)
  assert.ok(Object.keys(zip.files).some((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)), "the chart is a real chart")
  assert.ok(Object.keys(zip.files).some((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)), "speaker notes are in the notes pane")

  const allText = (await Promise.all(slideFiles.map((name) => zip.file(name).async("string")))).join(" ")
  assert.match(allText, /Кофейня, которая окупается за 14 месяцев/)
  assert.match(allText, /<a:tbl>/, "the comparison is a native table")
  assert.match(allText, /000000/, "the theme background made it into the file")
})

check("an image that could not be fetched leaves a panel, not a broken file", async () => {
  const slide = { ...deck.normalizeSlide(SAMPLES["image-text"]), imageUrl: "https://nowhere.test/x.png" }
  const file = await pptx.buildPptx({ title: "x", theme: "paper", slides: [slide] })
  assert.ok(file.length > 10_000)
})

check("names the download so every operating system accepts it", () => {
  assert.equal(pptx.pptxFileName("Кофейня: план / 2026?"), "Кофейня-план-2026.pptx")
  assert.equal(pptx.pptxFileName(""), "presentation.pptx")
})

/* ================================================================= wiring */

check("the studio is in the sidebar and the dashboard, and a chat request opens it", () => {
  const sidebar = read("components/sovereign/sidebar.tsx")
  assert.match(sidebar, /id: "presentation-generation", label: "Презентации"/)
  const dashboard = read("components/sovereign/dashboard.tsx")
  assert.match(dashboard, /import\("\.\/presentations\/PresentationStudio"\)/)
  assert.match(dashboard, /activeView === "presentation-generation"\) \{\s*return <PresentationStudio username=\{username\} \/>/)
  assert.match(dashboard, /isPresentationCreationRequest\(cleanContent\)/)
  assert.match(dashboard, /"malik\.presentation\.handoff"/)
  assert.match(read("components/sovereign/presentations/PresentationStudio.tsx"), /const HANDOFF_KEY = "malik\.presentation\.handoff"/)
})

check("a slide is drawn in its own shadow root, out of reach of the app's global CSS", () => {
  const renderer = read("components/sovereign/presentations/SlideRenderer.tsx")
  assert.match(renderer, /attachShadow\(\{ mode: "open" \}\)/)
  assert.match(renderer, /adoptedStyleSheets/)
  assert.match(renderer, /createPortal\(/)
  assert.match(renderer, /getRootNode\(\)/, "focus is checked inside the shadow root, not on document")
  const css = read("components/sovereign/presentations/deck-css.ts")
  assert.match(css, /:host \{/)
  assert.match(css, /\.deck-slide \{/)
  const studioCss = read("components/sovereign/presentations/presentation-studio.css")
  assert.doesNotMatch(studioCss, /^\.deck-h \{/m, "slide styles live in the shadow stylesheet only")
  assert.match(studioCss, /min-width: 1280px !important/, "the phone stylesheet cannot squeeze the canvas")
  assert.match(studioCss, /body > \*:not\(\.deck-print\) \{ display: none !important; \}/, "print is every slide, not the first page")
})

check("the studio chrome stays black and white", () => {
  const studioCss = read("components/sovereign/presentations/presentation-studio.css")
  const chrome = studioCss.slice(0, studioCss.indexOf("the deck"))
  const colours = chrome.match(/#[0-9a-fA-F]{3,6}\b/g) || []
  for (const colour of colours) {
    const hex = colour.slice(1).length === 3 ? colour.slice(1).split("").map((c) => c + c).join("") : colour.slice(1)
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    assert.ok(r === g && g === b, `${colour} is not a neutral grey`)
  }
  for (const [, r, g, b] of chrome.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) assert.ok(r === g && g === b, `rgb(${r}, ${g}, ${b}) is not a neutral grey`)
})

check("credits are reserved before the model runs and refunded when it fails", () => {
  const route = read("app/api/presentations/route.ts")
  const outlineBlock = route.slice(route.indexOf('if (action === "outline")'), route.indexOf('if (action === "slides")'))
  assert.ok(outlineBlock.indexOf("reservePresentationCredits") < outlineBlock.indexOf("generateOutline("), "reserve must come first")
  assert.match(route, /const quota = reserved \? await refund\(reserved\)/, "the catch must refund")
  assert.match(route, /Paid only for what arrived/)
  assert.match(route, /result\.missing\.length \* PRESENTATION_COSTS\.slide/)
})

check("presentations are metered by credits, not by the chat's token budget", () => {
  assert.doesNotMatch(read("app/api/presentations/route.ts"), /withCompute/)
})

check("one account cannot run more than a few generations at once", () => {
  assert.match(read("app/api/presentations/route.ts"), /MAX_PARALLEL = 3/)
})

check("the export fetches only public https images, never an address or this machine", () => {
  const route = read("app/api/presentations/export/route.ts")
  assert.match(route, /url\.protocol !== "https:"/)
  assert.match(route, /isIP\(host\)/)
  assert.match(route, /host === "localhost"/)
  assert.match(route, /MAX_IMAGE_BYTES/)
  assert.match(route, /IMAGE_TIMEOUT_MS/)
})

/* ================================================================== run */

for (const { run } of pending) await run()
console.log(failures ? `\n${failures} check(s) failed\n` : `\npresentations: all ${pending.length} checks passed\n`)
process.exit(failures ? 1 : 0)
