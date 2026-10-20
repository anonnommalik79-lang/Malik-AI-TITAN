// Malik Site Forge: which chat requests it takes, how a model plan is checked
// and merged, honest contacts, photographs, escaping, the quality review, edits
// through the plan, history compaction and the real chat route.
//
//   node scripts/verify-site-forge.mjs
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { workTestLoader } from "./work-test-loader.mjs"

const after = []
const modelCalls = []
let modelAnswer = () => null
const forbidden = () => { throw new Error("Forbidden provider/tool invoked") }
class RouteError extends Error {}
const owner = { userId: "fixture-account", authenticated: true, plan: "pro" }
const chatModelCalls = []
const load = workTestLoader({
  "./oil-report.css": {}, "./malik-tex.css": {},
  "next/server": { after: (fn) => after.push(fn) },
  "@/lib/malik-god-router": { asPlainText: (answer) => answer.content, malikGodAnswer: async (body, selection, _p, onToken) => { chatModelCalls.push(body); const content = "Обычный ответ."; onToken?.(content); return { content, provider: "mock-model", model: "mock", selectedModelId: selection?.modelId, usedWeb: false, sources: [], attempts: [] } }, gatherSourcesForPrompt: forbidden, sourceContext: () => "" },
  "@/lib/server/plugin-runtime": { parsePluginCommand: () => null },
  "@/lib/server/plugin-model-answer": { runPluginModelAnswer: forbidden },
  "@/lib/ai/project-builder": { generateProjectWithBrain: forbidden },
  "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: true }), recordChatUsage: async () => {} },
  "@/lib/server/malik-model-router": {
    resolveStrictMalikSelection: async (_request, body) => ({ modelId: body?.model || "malik-max", entitlement: owner }),
    runStrictMalikModel: async (input) => { modelCalls.push(input); const content = modelAnswer(input); if (content === null) throw new Error("provider down"); return { content, provider: "mock", model: "mock", selectedModelId: input.modelId, latencyMs: 1 } },
    MalikModelRouteError: RouteError, malikModelErrorPayload: (error) => ({ error: error.message }),
  },
  "@/lib/server/presentation-photos": { findPhoto: async ({ query }) => ({ url: `https://images.example-photos.test/${encodeURIComponent(query)}.jpg`, credit: `Фото: Автор · Openverse · CC BY 2.0`, link: "https://openverse.org/x" }) },
  "@/lib/server/malik-coder-orchestrator": { runMalikCoderOrchestrator: forbidden },
  "@/lib/server/malik-agent-runtime": { prepareMalikAgentRuntime: async () => null },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner },
  "@/lib/server/work-quota": { reserveWorkQuota: async () => ({ ok: true, receipt: { id: "fixture" } }), refundWorkQuota: async () => {}, WorkQuotaError: RouteError },
  "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: (body) => body },
  "@/lib/server/project-artifact-store": { putProjectArtifact: forbidden },
  "@/lib/server/multimodal-router": { estimateMultimodalTokens: () => 0, hasMalikAttachments: (items) => Array.isArray(items) && items.length > 0, routeMalikAttachments: forbidden },
  "@/lib/server/daily-multimodal-quota": { DAILY_MULTIMODAL_TOKEN_LIMIT: 10000, getDailyMultimodalQuota: () => ({ remaining: 10000 }), recordDailyMultimodalTokens: () => {} },
  "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: true }) },
  "@/lib/server/scheduled-tasks": { createScheduledTask: forbidden, scheduledTasksStatus: () => ({ ready: false }) },
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler, observeComputeResult: () => {} },
})

const { pickBlueprint, BLUEPRINTS } = load("lib/sites/forge/blueprints.ts")
const { fallbackPlan, mergePlan, withSampleContacts, parseDays, nameFromPrompt, cityFromPrompt, reviewPlan, plannerPrompt } = load("lib/sites/forge/plan.ts")
const { forgeSite, readForgeSite } = load("lib/sites/forge/index.ts")
const { siteForgeTurn, compactForgeHistory, forgeChatMessage } = load("lib/sites/forge/chat.ts")
const { reviewSiteHtml } = load("lib/sites/forge/quality.ts")
const { resolvePhotos, matchScore } = load("lib/sites/forge/photos.ts")
const { renderSite } = load("lib/sites/forge/render.ts")
const { resolveAccent, contrast } = load("lib/sites/forge/styles.ts")
const { CURATED_PHOTOS } = load("lib/sites/forge/photo-library.ts")
const { fixWrongKeyboardLayout } = load("lib/ai/keyboard-layout.ts")
const { POST } = load("app/api/stream/route-impl.ts")

const PLAN = {
  understood: "Сайт кофейни Aroma Beans в Алматы с меню, заказом и бронью",
  blueprint: "coffee", direction: "roastery", accent: "#2F5D50", order: true,
  brand: { name: "Aroma Beans", tagline: "Кофе свежей обжарки у Ботанического сада", description: "Кофейня, где зерно обжаривают на месте, а круассаны пекут к открытию." },
  hero: { title: "Кофе, который обжарили этим утром", subtitle: "Эспрессо, фильтр и выпечка из собственной пекарни — с собой или за большим столом у окна.", primaryCta: "Забронировать стол", secondaryCta: "Смотреть меню", badges: ["Своя обжарка", "Выпечка к 8:00", "Wi‑Fi и розетки"] },
  highlights: [{ icon: "flame", title: "Своя обжарка", text: "Обжариваем каждую неделю." }, { icon: "wheat", title: "Пекарня", text: "Круассаны к открытию." }, { icon: "wifi", title: "Для работы", text: "Тихий зал и розетки." }],
  catalog: { title: "Меню", subtitle: "Напитки и выпечка", currency: "₸", categories: [{ id: "coffee", name: "Кофе" }, { id: "bakery", name: "Выпечка" }, { id: "cold", name: "Холодное" }], items: [
    { name: "Капучино", description: "Двойной эспрессо и молоко.", price: 1400, category: "coffee", badge: "Хит", photo: "cappuccino latte art" },
    { name: "Флэт уайт", description: "Больше кофе.", price: 1500, category: "coffee", photo: "flat white coffee" },
    { name: "Раф", description: "Сливки и ваниль.", price: "от 1700", category: "Кофе", photo: "latte cup" },
    { name: "Фильтр", description: "Сорт недели.", price: 1200, category: "coffee", photo: "pour over coffee" },
    { name: "Круассан", description: "Масло и хруст.", price: 900, category: "bakery", photo: "croissant" },
    { name: "Миндальный круассан", description: "Миндальный крем.", price: 1200, category: "bakery", photo: "croissants" },
    { name: "Айс латте", description: "Со льдом.", price: 1600, category: "cold", photo: "iced latte" },
    { name: "Колд брю", description: "16 часов.", price: 1500, category: "cold", photo: "iced coffee" },
  ] },
  about: { title: "Маленькая обжарка", paragraphs: ["Мы начинали с одной кофемашины.", "Сегодня у нас своя обжарка."], values: [{ title: "Свежесть", text: "Три недели от обжарки." }, { title: "Честность", text: "Дата на каждой пачке." }] },
  steps: [{ title: "Выберите", text: "Добавьте в корзину." }, { title: "Отправьте", text: "Заказ уходит в WhatsApp." }, { title: "Заберите", text: "Без очереди." }],
  gallery: [{ photo: "latte art", caption: "Латте-арт" }, { photo: "coffee beans", caption: "Зерно" }, { photo: "croissants bakery", caption: "Выпечка" }, { photo: "cafe interior", caption: "Зал" }],
  faq: [{ q: "Есть растительное молоко?", a: "Да, овсяное и миндальное." }, { q: "Можно с собой?", a: "Да." }, { q: "Есть Wi‑Fi?", a: "Да, быстрый." }],
  booking: { kind: "table", title: "Бронь", subtitle: "Выберите время.", services: ["Стол у окна", "Большой стол"] },
  contacts: { city: "Алматы", address: "ул. Тимирязева, 1", phone: "+7 777 123 45 67", email: "hi@aroma.kz", whatsapp: "", telegram: "aroma_beans", instagram: "aroma.beans", hours: [{ label: "Пн–Пт", open: "08:00", close: "22:00" }, { label: "Сб, Вс", open: "09:00", close: "23:00" }] },
  seo: { title: "Aroma Beans — кофейня в Алматы", description: "Кофе свежей обжарки, выпечка и бронь стола." },
}

test("requests: new sites, edits of the last site, and everything else", () => {
  for (const prompt of ["создай сайт на кофейню фулл страницами рабочий крутым дизайном", "сделай лендинг для барбершопа", "make a website for my dental clinic", "кофехана сайтын жаса", "нужен сайт для салона красоты в Астане", "сайт для пиццерии создай пожалуйста"]) {
    assert.deepEqual(siteForgeTurn(prompt), { kind: "new" }, prompt)
  }
  for (const prompt of ["как создать сайт?", "сколько стоит сайт", "создай сайт на react и next.js", "сделай сайт с бэкендом на node.js", "исправь мой сайт", "что такое лендинг", "создай презентацию про кофе", "Кто такой Абай?", "сделай сайт как https://apple.com"]) {
    assert.equal(siteForgeTurn(prompt), null, prompt)
  }
  assert.equal(siteForgeTurn("создай сайт на кофейню", { attachments: [{ kind: "image" }] }), null)
  // The user's own message, typed half on the wrong layout, reaches the forge once read.
  const typed = "rfhjxt lfk vjtve vfkbrbb создай сайт на кофейню фулл страницами"
  assert.equal(siteForgeTurn(fixWrongKeyboardLayout(typed).text).kind, "new")
})

test("blueprints: the business decides structure, booking and art direction", () => {
  const cases = { "сайт кофейни": "coffee", "сайт пекарни": "coffee", "сайт ресторана": "restaurant", "сайт пиццерии": "restaurant", "сайт барбершопа": "barber", "сайт салона красоты": "beauty", "сайт цветочного магазина": "beauty", "сайт фитнес клуба": "fitness", "сайт стоматологии": "clinic", "website for a boutique hotel": "hotel", "сайт магазина кроссовок": "shop", "сайт юридической фирмы": "studio", "сайт для моего бизнеса": "generic" }
  for (const [prompt, id] of Object.entries(cases)) assert.equal(pickBlueprint(prompt).id, id, prompt)
  assert.equal(new Set(BLUEPRINTS.map((blueprint) => blueprint.direction)).size, 7)
  for (const blueprint of BLUEPRINTS) {
    const plan = fallbackPlan(`сайт ${blueprint.id}`, blueprint)
    assert.ok(plan.catalog.items.length >= 4, blueprint.id)
    assert.ok(plan.catalog.items.every((item) => plan.catalog.categories.some((category) => category.id === item.category)), `${blueprint.id} categories`)
  }
})

test("plan: names, cities, hours and days are read from the request", () => {
  assert.equal(nameFromPrompt("сайт для кофейни «Арома»"), "Арома")
  assert.equal(nameFromPrompt("website for a cafe called Daybreak"), "Daybreak")
  assert.equal(cityFromPrompt("сайт барбершопа в Астане"), "Астана")
  assert.deepEqual(parseDays("Пн–Пт").sort(), [1, 2, 3, 4, 5])
  assert.deepEqual(parseDays("Сб, Вс").sort(), [0, 6])
  assert.deepEqual(parseDays("Ежедневно").length, 7)
  assert.deepEqual(parseDays("Mon-Sat").sort(), [1, 2, 3, 4, 5, 6])
})

test("plan: a model plan is merged safely onto the blueprint", () => {
  const base = fallbackPlan("создай сайт на кофейню")
  const merged = mergePlan(JSON.stringify(PLAN), base)
  assert.equal(merged.brand.name, "Aroma Beans")
  assert.equal(merged.catalog.items.length, 8)
  const raf = merged.catalog.items.find((item) => item.name === "Раф")
  assert.equal(raf.price, 1700); assert.equal(raf.from, true); assert.equal(raf.category, "coffee")
  assert.deepEqual(merged.contacts.hours.map((hours) => hours.days.length), [5, 2])
  // Garbage never breaks the plan.
  const broken = mergePlan('{"brand":{"name":"<b>X</b>"},"accent":"red","direction":"neon","catalog":{"items":[{"name":"A","price":"бесплатно"}]},"hero":{"title":"Lorem ipsum dolor"}}', base)
  assert.equal(broken.accent, null); assert.equal(broken.direction, base.direction)
  assert.equal(broken.catalog.items.length, base.catalog.items.length)
  assert.equal(broken.hero.title, base.hero.title.replace(base.brand.name, "<b>X</b>"))
  assert.deepEqual(mergePlan("not json at all", base).catalog, base.catalog)
  assert.ok(reviewPlan("{}", base).length >= 3)
  assert.equal(reviewPlan(JSON.stringify(PLAN), merged).length, 0)
})

test("contacts: only what the user gave is real; the rest are marked examples", () => {
  const given = withSampleContacts(mergePlan(JSON.stringify(PLAN), fallbackPlan("кофейня")), "сайт кофейни, телефон +7 777 123 45 67, адрес ул. Тимирязева, 1")
  assert.equal(given.contacts.phone, "+7 777 123 45 67")
  assert.deepEqual(given.samples, ["email"])
  assert.equal(given.contacts.email, "hello@example.com")
  const invented = withSampleContacts(mergePlan(JSON.stringify(PLAN), fallbackPlan("кофейня")), "сайт кофейни")
  assert.deepEqual(invented.samples, ["phone", "email", "address"])
  assert.equal(invented.contacts.phone, "+7 700 000 00 00")
  assert.notEqual(invented.contacts.phone, PLAN.contacts.phone, "a phone the model made up must not reach the site")
})

test("photos: curated photos match the subject; live search fills the rest within budget", async () => {
  const coffee = pickBlueprint("кофейня")
  const plan = withSampleContacts(mergePlan(JSON.stringify(PLAN), fallbackPlan("кофейня")), "кофейня")
  const photos = await resolvePhotos(plan, coffee)
  const cappuccino = plan.catalog.items.find((item) => item.name === "Капучино")
  assert.match(photos[`item:${cappuccino.id}`].alt, /cappuccino|coffee|latte|cup/i)
  assert.match(photos.hero.url, /^https:\/\/images\.unsplash\.com\/photo-/)
  const urls = Object.values(photos).map((photo) => photo.url.split("?")[0])
  assert.equal(new Set(urls).size, urls.length, "no photograph repeats")
  assert.ok(matchScore("croissant", CURATED_PHOTOS.find((photo) => photo.topic === "croissant")) > matchScore("croissant", CURATED_PHOTOS.find((photo) => photo.topic === "burger")))
  // A business outside the library: the finder is asked, and a slow or failing one never blocks.
  const barber = pickBlueprint("барбершоп")
  const barberPlan = fallbackPlan("барбершоп", barber)
  const found = await resolvePhotos(barberPlan, barber, { finder: async (query) => (/fail/.test(query) ? Promise.reject(new Error("x")) : { url: `https://img.test/${encodeURIComponent(query)}`, credit: "Фото: A · Openverse · CC BY 2.0" }) })
  assert.ok(found.hero && found["about"])
  const slow = await resolvePhotos(barberPlan, barber, { finder: () => new Promise(() => {}), budgetMs: 50 })
  assert.equal(Object.keys(slow).length, 0)
})

test("render: six pages, escaping, embedded plan, readable accent", async () => {
  const evil = mergePlan(JSON.stringify({ ...PLAN, brand: { ...PLAN.brand, name: "</script><img src=x onerror=alert(1)>" }, catalog: { ...PLAN.catalog, items: PLAN.catalog.items.map((item, index) => (index === 0 ? { ...item, name: 'Капучино" onmouseover="x' } : item)) } }), fallbackPlan("кофейня"))
  const { html, pages } = renderSite(withSampleContacts(evil, "кофейня"), {})
  assert.deepEqual(pages, ["home", "catalog", "about", "gallery", "booking", "contacts"])
  assert.doesNotMatch(html, /<img src=x onerror/)
  assert.doesNotMatch(html, /"Капучино" onmouseover/)
  assert.equal((html.match(/<\/script>/g) || []).length, (html.match(/<script\b/g) || []).length, "no early script end")
  assert.equal(readForgeSite(html).plan.brand.name, "</script><img src=x onerror=alert(1)>")
  assert.ok(contrast(resolveAccent("roastery", "#FFFF00").accent, "#FBFAF8") >= 2.6, "an unreadable accent falls back")
  assert.equal(resolveAccent("roastery", "#123456").accentInk, "#FFFFFF")
})

test("skills: every site carries 20+ GitHub interface skills, and only the ones it really has are claimed", async () => {
  const { FORGE_SKILLS, appliedSkills, plannerSkillRules, skillLines } = load("lib/sites/forge/skills.ts")
  for (const prompt of ["создай сайт на кофейню", "сайт барбершопа", "website for a boutique hotel", "сайт стоматологии"]) {
    const site = await forgeSite({ prompt })
    assert.ok(site.skills.length >= 20, `${prompt}: ${site.skills.length} skills`)
    assert.ok(site.skills.every((skill) => /^https:\/\/github\.com\//.test(skill.url)), "each skill links to its GitHub project")
    for (const id of ["magicui-bento", "swiper-rail", "photoswipe", "govuk-forms", "aos-reveal", "schema-org"]) assert.ok(site.skills.some((skill) => skill.id === id), `${prompt}: ${id}`)
    assert.equal(site.skills.some((skill) => skill.id === "polaris-cart"), site.plan.order, "the basket skill only where there is a basket")
  }
  // Nothing is claimed for a page that does not carry it.
  assert.deepEqual(appliedSkills("<!doctype html><p>plain</p>", fallbackPlan("кофейня")).map((skill) => skill.id), [])
  assert.ok(FORGE_SKILLS.length >= 24)
  const rules = plannerSkillRules("создай лендинг кофейни с ценами", "coffee")
  assert.ok(rules.some((line) => /Never invent customer names/.test(line)), rules.join("\n"))
  assert.match(plannerPrompt("создай сайт на кофейню", fallbackPlan("кофейня")), /DESIGN-SYSTEM COPY RULES/)
  const site = await forgeSite({ prompt: "создай сайт на кофейню" })
  const message = forgeChatMessage(site, "new")
  assert.match(message, /\*\*Скиллы интерфейсов: \d+\*\*/)
  assert.match(message, /\[Magic UI · Bento Grid\]\(https:\/\/github\.com\/magicuidesign\/magicui\)/)
  assert.equal(skillLines(site.skills, "ru").length, 5)
  // Search engines never learn an example phone or address.
  const ld = JSON.parse(site.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.equal(ld.telephone, undefined)
  assert.equal(ld.address.streetAddress, undefined)
  assert.equal(ld.openingHoursSpecification[0].opens, "08:00")
  const real = await forgeSite({ prompt: "сайт кофейни «Арома», ул. Сатпаева 5, телефон +7 701 555 44 33" })
  const realLd = JSON.parse(real.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.equal(realLd.telephone, "+7 701 555 44 33")
})

test("studio and OS: local businesses get the forge, edits go through the plan, software keeps its engine", async () => {
  const routed = []
  const studio = workTestLoader({
    "@/lib/ai/router": { routeAI: async (input) => { routed.push(input); const plan = input.prompt.includes("CURRENT PLAN:") ? { ...JSON.parse(input.prompt.split("CURRENT PLAN:\n")[1].split("\n\nUSER REQUEST")[0]), direction: "edge" } : PLAN; return { success: true, provider: "groq", model: "fixture-model", output: JSON.stringify(plan) } } },
    "@/lib/server/presentation-photos": { findPhoto: async () => null },
  })
  const { handleSkillWebsiteGenerationRequest } = studio("lib/sites/generate-site-route.ts")
  const { forgeTakes } = studio("lib/sites/forge/server.ts")
  const call = async (body) => (await handleSkillWebsiteGenerationRequest(new Request("http://fixture/api/generate/website", { method: "POST", body: JSON.stringify(body) }))).json()

  const made = await call({ prompt: "создай сайт для кофейни в Алматы" })
  assert.equal(made.engine, "malik-forge/v1")
  assert.equal(made.provider, "groq")
  assert.match(made.html, /data-page="booking"/)
  assert.ok(made.skillCount >= 20 && made.skills.every((skill) => skill.url.startsWith("https://github.com/")))
  assert.equal(made.plan.brand.name, "Aroma Beans")
  assert.ok(routed.every((input) => !input.provider && !input.model), "no provider or model is pinned")

  const edited = await call({ prompt: "сделай темнее", previousHtml: made.html })
  assert.equal(edited.plan.brand.name, "Aroma Beans")
  assert.equal(edited.plan.direction, "edge")
  assert.match(edited.message, /обновлён/)

  const saas = await call({ prompt: "создай лендинг для SaaS платформы аналитики" })
  assert.equal(saas.engine, "malik-sites/v4", "a software landing keeps the landing-page engine")

  assert.equal(forgeTakes("Создай лендинг для компании Brew. Продукт: приложение для заказа кофе", { strict: true }), false)
  assert.equal(forgeTakes("Создай лендинг для компании «Brew». Продукт: кофейня с собственной обжаркой", { strict: true }), true)
})

test("publish: a forge site gets a public link; only a re-rendered forge page can be published", async () => {
  const objects = new Map()
  let etagCounter = 0
  const store = {
    privateJsonStoreConfigured: () => true,
    readPrivateJson: async (key) => (objects.has(key) ? JSON.parse(objects.get(key).body) : null),
    readPrivateJsonVersioned: async (key) => (objects.has(key) ? { value: JSON.parse(objects.get(key).body), etag: objects.get(key).etag } : { value: null, etag: null }),
    writePrivateJson: async (key, value) => { objects.set(key, { body: JSON.stringify(value), etag: `e${++etagCounter}` }); return true },
    writePrivateJsonConditional: async (key, value, etag) => {
      const current = objects.get(key)
      if ((etag === null && current) || (etag !== null && current?.etag !== etag)) return { stored: false, conflict: true }
      objects.set(key, { body: JSON.stringify(value), etag: `e${++etagCounter}` })
      return { stored: true, conflict: false }
    },
    deletePrivateJson: async (key) => objects.delete(key),
  }
  let viewer = { authenticated: true, userId: "user-aliya", plan: "free" }
  const pub = workTestLoader({
    "./private-json-store": store,
    "@/lib/server/private-json-store": store,
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => viewer },
  })
  const { preparePublishedSite, PUBLISHED_SITE_CSP } = pub("lib/sites/forge/publish.ts")
  const { publishSite, readPublishedSite, unpublishSite } = pub("lib/server/published-sites.ts")
  const { POST } = pub("app/api/sites/publish/route.ts")
  const { GET } = pub("app/site/[id]/route.ts")

  const site = await forgeSite({ prompt: "создай сайт на кофейню «Арома»" })
  assert.equal(preparePublishedSite("<!doctype html><html><body><script>steal()</script></body></html>").code, "NOT_A_SITE")
  // Whatever was added to the posted page is gone: the server renders the plan again.
  const tampered = site.html.replace("</main>", "<script>fetch('/api/account').then(r=>r.text()).then(t=>top.postMessage(t,'*'))</script></main>").replace(/"url":"https:[^"]+"/, '"url":"javascript:alert(1)"')
  const prepared = preparePublishedSite(tampered)
  assert.equal(prepared.ok, true)
  assert.doesNotMatch(prepared.html, /api\/account|javascript:alert/)
  assert.equal(prepared.brand, "Арома")
  assert.match(PUBLISHED_SITE_CSP, /^sandbox allow-scripts/)
  assert.doesNotMatch(PUBLISHED_SITE_CSP, /allow-same-origin/, "the page never shares the app's origin")

  const first = await publishSite("user-aliya", site.html)
  assert.equal(first.ok, true)
  assert.equal(first.updated, false)
  const again = await publishSite("user-aliya", site.html.replace(/Ваши контакты/, "Ваши контакты"))
  assert.equal(again.record.id, first.record.id, "the same site keeps its link")
  assert.equal(again.updated, true)
  const other = await publishSite("user-aliya", (await forgeSite({ prompt: "сайт барбершопа «Бритва»" })).html)
  assert.notEqual(other.record.id, first.record.id)

  const page = await GET(new Request("http://fixture/site/x"), { params: Promise.resolve({ id: first.record.id }) })
  assert.equal(page.status, 200)
  assert.match(page.headers.get("content-security-policy"), /sandbox/)
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow")
  assert.match(await page.text(), /data-page="booking"/)
  assert.equal((await GET(new Request("http://fixture/site/x"), { params: Promise.resolve({ id: "ABCDEFGHJKLM" }) })).status, 404)

  assert.equal((await unpublishSite(first.record.id, { userId: "user-someone-else" })).code, "FORBIDDEN")
  assert.equal((await unpublishSite(first.record.id, { userId: "user-aliya" })).ok, true)
  assert.equal(await readPublishedSite(first.record.id), null)

  const post = (html) => POST(new Request("http://fixture/api/sites/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) }))
  const created = await post(site.html)
  assert.equal(created.status, 201)
  assert.match((await created.json()).site.path, /^\/site\/[A-Za-z0-9]{12}$/)
  assert.equal((await post("<html>not a forge site</html>")).status, 422)
  viewer = { authenticated: false, userId: "guest-1", plan: "free" }
  const guest = await post(site.html)
  assert.equal(guest.status, 401)
  assert.match((await guest.json()).message, /Войдите/)
})

test("the Sites studio route works: forge for businesses, a provider-agnostic edit for other pages", async () => {
  const routed = []
  const studio = workTestLoader({
    "@/lib/ai/router": { routeAI: async (input) => { routed.push(input); return input.task === "code" ? { success: true, provider: "groq", model: "fixture", output: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body>edited</body></html>", latencyMs: 1 } : { success: false } } },
    "@/lib/server/presentation-photos": { findPhoto: async () => null },
    "@/lib/malik-compute/runtime": { withCompute: (handler) => handler },
  })
  const { POST } = studio("app/api/generate/website/route.ts")
  const post = async (body) => { const response = await POST(new Request("http://fixture/api/generate/website", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); return { status: response.status, data: await response.json() } }
  const made = await post({ prompt: "Создай сайт для кофейни «Зерно» в Алматы" })
  assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 200))
  assert.equal(made.data.engine, "malik-forge/v1")
  const edited = await post({ prompt: "сделай темнее", previousHtml: made.data.html })
  assert.equal(edited.data.plan.brand.name, "Зерно", "a forge page is edited through its plan")
  const other = await post({ prompt: "сделай кнопку синей", previousHtml: "<!doctype html><html><body>old</body></html>" })
  assert.equal(other.status, 200)
  assert.match(other.data.html, /edited/)
  assert.ok(routed.every((input) => !input.model && !input.provider), "no model is pinned")
  assert.doesNotMatch(fs.readFileSync("app/api/generate/website/route.ts", "utf8"), /runStrictMalikModel\(|malik-coder-32b/, "MalikCoder cannot be run through the strict router")
})

test("quality: forge sites pass; a typical model site's faults are named", async () => {
  for (const prompt of ["создай сайт на кофейню", "сайт барбершопа", "website for a boutique hotel", "сайт стоматологии", "сайт салона красоты", "сайт пиццерии", "сайт магазина одежды", "сайт фитнес клуба", "сайт юриста"]) {
    const site = await forgeSite({ prompt })
    assert.equal(site.quality.ok, true, `${prompt}: ${JSON.stringify(site.quality.issues)}`)
    assert.ok(site.html.length < 160_000, `${prompt}: ${site.html.length} bytes`)
  }
  const bad = `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width"><title>AROMA</title></head><body><nav><ul class="nav-links"><li><a href="#menu">Меню</a></li><li><a href="#">О нас</a></li></ul></nav><section id="menu"><button onclick="alert('Добавлено в заказ')">В корзину</button></section><div>Карта (Google Maps Placeholder)</div><input type="text" placeholder="Имя"><img src="https://via.placeholder.com/300"><script>function add(){alert('ok')}</script></body></html>`
  const review = reviewSiteHtml(bad)
  const codes = review.issues.map((issue) => issue.code)
  for (const code of ["ALERT", "PLACEHOLDER", "PAGES", "DEAD_LINK", "IMG_ALT", "IMG_PLACEHOLDER", "FORM_LABEL", "MOBILE_MENU"]) assert.ok(codes.includes(code), `${code} in ${codes}`)
  assert.equal(review.ok, false)
})

test("forge: the model writes the plan, a weak plan is sent back once with the reviewer's notes", async () => {
  const prompts = []
  let calls = 0
  const model = async ({ prompt }) => { prompts.push(prompt); calls += 1; return calls === 1 ? '{"hero":{"title":"Добро пожаловать"}}' : JSON.stringify(PLAN) }
  const site = await forgeSite({ prompt: "создай сайт на кофейню Aroma Beans", model })
  assert.equal(calls, 2)
  assert.match(prompts[1], /PREVIOUS PLAN WAS REJECTED/)
  assert.match(prompts[1], /catalog\.items/)
  assert.equal(site.plan.brand.name, "Aroma Beans")
  assert.equal(site.planner.used, true)
  assert.equal(site.quality.ok, true)
  // No model at all: still a complete site, and the chat says the copy is a template.
  const offline = await forgeSite({ prompt: "создай сайт на кофейню", model: async () => { throw new Error("down") } })
  assert.equal(offline.planner.used, false)
  assert.match(forgeChatMessage(offline, "new"), /шаблона Malik/)
})

test("edits: a change is made on the plan and keeps everything else", async () => {
  const first = await forgeSite({ prompt: "создай сайт на кофейню", model: async () => JSON.stringify(PLAN) })
  const history = [{ role: "user", content: "создай сайт на кофейню" }, { role: "assistant", content: forgeChatMessage(first, "new") }]
  const turn = siteForgeTurn("сделай сайт темнее и добавь в меню матча латте за 1900", { messages: history })
  assert.equal(turn.kind, "edit")
  assert.equal(turn.plan.brand.name, "Aroma Beans")
  let seen = ""
  const edited = await forgeSite({ prompt: "сделай темнее и добавь матча латте за 1900", basePlan: turn.plan, editInstruction: "сделай темнее и добавь матча латте за 1900", model: async ({ prompt }) => { seen = prompt; const plan = JSON.parse(prompt.split("CURRENT PLAN:\n")[1].split("\n\nUSER REQUEST")[0]); plan.direction = "edge"; plan.catalog.items.push({ name: "Матча латте", description: "Японская матча и молоко.", price: 1900, category: "coffee", photo: "matcha latte" }); return JSON.stringify(plan) } })
  assert.match(seen, /CURRENT PLAN/)
  assert.equal(edited.plan.direction, "edge")
  assert.ok(edited.plan.catalog.items.some((item) => item.name === "Матча латте"))
  assert.ok(edited.plan.catalog.items.some((item) => item.name === "Капучино"))
  assert.equal(siteForgeTurn("создай сайт для барбершопа", { messages: history }).kind, "new", "another business is a new site")
  assert.equal(siteForgeTurn("а что ещё можно добавить на сайт кофейни?", { messages: history }), null, "a question is not an edit")
  // In history the 100 KB page is one line.
  const compact = compactForgeHistory(history)
  assert.ok(compact[1].content.length < 1500, `${compact[1].content.length}`)
  assert.match(compact[1].content, /Malik Site Forge: сайт «Aroma Beans»/)
})

async function stream(body) {
  const response = await POST(new Request("http://fixture/api/stream", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ stream: true, workspaceMode: "chat", ...body }) }))
  assert.equal(response.status, 200)
  const events = (await response.text()).split("\n\n").filter((frame) => frame.includes("data: ")).map((frame) => JSON.parse(frame.split("\ndata: ")[1]))
  for (const deferred of after.splice(0)) await deferred()
  const done = events.filter((event) => event.type === "done")
  return { events, done, answer: (done[0]?.finalContent ?? events.filter((event) => event.type === "content").map((event) => event.content).join("")).replace(/\r(?!\n)/g, "\n") }
}

test("chat: existing Forge sites retain lossless, finished and previewable edits", async () => {
  const first = await forgeSite({ prompt: "создай сайт на кофейню", model: async () => JSON.stringify(PLAN) })
  const history = [{ role: "user", content: "создай сайт на кофейню" }, { role: "assistant", content: forgeChatMessage(first, "new") }]
  modelCalls.length = 0
  modelAnswer = () => JSON.stringify(PLAN)
  const { answer, done, events } = await stream({ originalQuestion: "сделай сайт темнее", messages: history })
  assert.equal(done.length, 1)
  assert.equal(done[0].provider, "malik-site-forge")
  assert.equal(modelCalls.length, 1)
  assert.equal(modelCalls[0].modelId, "malik-max")
  assert.match(answer, /\*\*Сайт «Aroma Beans» обновлён/)
  assert.match(answer, /```html filename=index\.html\n<!doctype html>/)
  assert.match(answer, /Перед публикацией замените/)
  assert.ok(events.some((event) => event.type === "progress" && /фотографии/.test(event.text || "")))
  const html = answer.slice(answer.indexOf("<!doctype html>"), answer.lastIndexOf("</html>") + 7)
  assert.equal(reviewSiteHtml(html).ok, true)
  // The oil ensemble does not write site copy; the default model does.
  modelCalls.length = 0
  await stream({ originalQuestion: "сделай сайт темнее", messages: history, modelId: "malik-oil-1tb", model: "malik-oil-1tb" })
  assert.equal(modelCalls[0].modelId, "malik-max")
})

test("chat: the next question does not drag the whole site into the model's context", async () => {
  const first = await forgeSite({ prompt: "создай сайт на кофейню", model: async () => JSON.stringify(PLAN) })
  const answer = forgeChatMessage(first, "new")
  chatModelCalls.length = 0
  await stream({ originalQuestion: "Кто такой Абай?", messages: [{ role: "user", content: "создай сайт на кофейню" }, { role: "assistant", content: answer }, { role: "user", content: "Кто такой Абай?" }] })
  const sent = JSON.stringify(chatModelCalls[0].messages)
  assert.ok(sent.length < 3000, `${sent.length} chars of history`)
  assert.doesNotMatch(sent, /<!doctype html>/)
})
