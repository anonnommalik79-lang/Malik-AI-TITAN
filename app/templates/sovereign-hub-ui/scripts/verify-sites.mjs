import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * The sites engine was pinned to one provider that is not in the registry and
 * one model the repo marks as retired, with `allowedProviders` that excluded
 * every strong provider actually configured in production. The planner
 * therefore failed on essentially every request and every site came out of the
 * deterministic fallback — the same layout and the same copy for everyone.
 *
 * This guards the rebuild: no pinned model, a real quality gate, and a retry
 * that carries the specific deficiencies back to the model.
 */

function codeOf(file) {
  // Only comments that start their own line are stripped. Matching "/*"
  // anywhere would also match it inside a string - this file's own providers
  // send an Accept header of "...,*/*;q=0.8" - and the fake comment then ran to
  // the next "*/" somewhere far below, silently deleting the very code the
  // assertions were about. Deleted code cannot fail a grep, so the tests went
  // green while checking nothing.
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

async function loadModule(file, stubs = {}) {
  let code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const [specifier, replacement] of Object.entries(stubs)) {
    code = code.replace(
      new RegExp(`import\\s*(?:\\{[^}]*\\}|[\\w*\\s,]+)\\s*from\\s*["']${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}["'];?`, "g"),
      replacement,
    )
  }
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

// ---------------------------------------------------------------- no pinning

const route = codeOf("lib/sites/generate-site-route.ts")
assert.equal(route.includes("zai-glm-4.7"), false, "Мёртвая модель не должна быть прибита в коде")
assert.equal(route.includes('provider: "cerebras"'), false, "Провайдер не должен быть прибит гвоздями")
assert.equal(route.includes("allowedProviders"), false, "Список провайдеров не должен исключать рабочие")
assert.match(route, /planWebsite/, "Маршрут должен использовать новый планировщик")
assert.match(route, /quality/, "Ответ должен нести оценку качества плана")

const planner = codeOf("lib/sites/site-planner.ts")

// The call itself is what matters: diagnostic labels elsewhere may mention a
// provider or model name without pinning anything.
const call = planner.slice(planner.indexOf("routeAI({"), planner.indexOf("})", planner.indexOf("signal: input.signal")))
assert.ok(call.length > 100, "Не удалось найти вызов модели в планировщике")
assert.equal(/\bprovider:/.test(call), false, "Вызов не должен фиксировать провайдера")
assert.equal(/\bmodel:/.test(call), false, "Вызов не должен фиксировать модель")
assert.equal(/allowedProviders/.test(call), false, "Вызов не должен ограничивать список провайдеров")

assert.match(planner, /MAX_ATTEMPTS/, "Должны быть повторные попытки")
assert.match(planner, /repairNote/, "Повтор должен нести список конкретных проблем")

// -------------------------------------------------------- the quality gate

const { scoreWebsitePlan } = await loadModule("lib/sites/site-planner.ts", {
  "@/lib/ai/router": "const routeAI = async () => ({ success: false });",
  "./skill-engine": "const parseWebsitePlan = (x) => x;",
})

const strong = {
  version: "malik-sites/v1",
  locale: "ru",
  brand: { name: "Кофейня Алма" },
  seo: { title: "Кофейня Алма", description: "Спешелти кофе и завтраки в центре Алматы, бронь стола онлайн." },
  design: { theme: "dark", accent: "#c98b4f", style: "editorial", radius: "medium", density: "airy", heroLayout: "editorial", motion: "subtle" },
  navigation: [{ label: "Меню", href: "#menu" }, { label: "Бронь", href: "#booking" }],
  hero: {
    title: "Спешелти кофе в центре Алматы",
    subtitle: "Обжариваем зерно каждую неделю и подаём завтраки до полудня, в пяти минутах от Панфилова.",
    primaryCta: { label: "Забронировать стол", href: "#booking" },
  },
  sections: [
    { type: "features", id: "menu", title: "Что в меню", items: [{ title: "Фильтр", body: "Три сорта на выбор" }] },
    { type: "pricing", id: "prices", title: "Цены", items: [{ title: "Фильтр", price: "1200 ₸" }] },
    { type: "steps", id: "how", title: "Как забронировать", items: [{ title: "Выберите время" }] },
    { type: "faq", id: "faq", title: "Частые вопросы", items: [{ title: "Есть ли веранда?", body: "Да, работает до октября." }] },
  ],
  footer: { tagline: "Кофейня Алма", links: [] },
}

const strongScore = scoreWebsitePlan(strong, "Создай сайт для кофейни в Алматы с меню, ценами и бронью")
assert.ok(strongScore.score >= 85, `Сильный план должен проходить, получено ${strongScore.score}: ${strongScore.reasons}`)

// Each defect must be caught, and named.
const cases = [
  ["общий заголовок", { ...strong, hero: { ...strong.hero, title: "Добро пожаловать" } }, /общий/],
  ["мало секций", { ...strong, sections: strong.sections.slice(0, 2) }, /секций/],
  ["заглушки в тексте", { ...strong, hero: { ...strong.hero, subtitle: "Lorem ipsum dolor sit amet consectetur" } }, /заглушк/],
  ["пустой hero", { ...strong, hero: { ...strong.hero, title: "" } }, /hero/],
  ["язык не тот", { ...strong, locale: "en" }, /английск/],
  ["бренд не выведен", { ...strong, brand: { name: "Malik Project" } }, /бренд/],
]
for (const [label, plan, expected] of cases) {
  const scored = scoreWebsitePlan(plan, "Создай сайт для кофейни в Алматы")
  assert.ok(scored.score < 85, `«${label}» должно снижать оценку, получено ${scored.score}`)
  assert.ok(scored.reasons.some((reason) => expected.test(reason)), `«${label}» должно быть названо: ${scored.reasons}`)
}
assert.equal(scoreWebsitePlan(null, "x").score, 0, "Отсутствующий план — ноль")

// ------------------------------------------------------- the retry actually retries

async function runPlanner(answers) {
  const mod = await loadModule("lib/sites/site-planner.ts", {
    "@/lib/ai/router": `
      const answers = ${JSON.stringify(answers)};
      let call = 0;
      globalThis.__prompts = [];
      const routeAI = async (req) => {
        globalThis.__prompts.push(req.prompt);
        const a = answers[call++];
        if (!a) return { success: false, provider: "p" + call, model: "m" + call };
        return { success: true, provider: "p" + call, model: "m" + call, output: JSON.stringify(a) };
      };
    `,
    "./skill-engine": "const parseWebsitePlan = (raw) => JSON.parse(raw);",
  })
  const outcome = await mod.planWebsite({
    prompt: "Создай сайт для кофейни в Алматы",
    template: "adaptive",
    plannerPrompt: "PLAN",
    userId: "test",
    skillIds: [],
  })
  return { outcome, prompts: globalThis.__prompts }
}

const weak = { ...strong, hero: { ...strong.hero, title: "Добро пожаловать" }, sections: strong.sections.slice(0, 1) }

// Weak first, strong second: the engine must not settle for the weak one.
const retried = await runPlanner([weak, strong])
assert.equal(retried.outcome.plan.hero.title, strong.hero.title, "Слабый план должен быть отвергнут ради сильного")
assert.equal(retried.outcome.attempts.length, 2, "Должно быть ровно две попытки")
assert.ok(retried.outcome.attempts[0].score < retried.outcome.attempts[1].score, "Вторая попытка должна быть лучше")
assert.match(retried.prompts[1], /REJECTED/, "Повтор должен получить список проблем предыдущей попытки")
assert.match(retried.prompts[1], /общий/, "В повторе должна быть названа конкретная проблема")

// A good first answer costs exactly one call.
const once = await runPlanner([strong])
assert.equal(once.outcome.attempts.length, 1, "Хороший план не должен вызывать модель повторно")

// Everything failed: no plan, but the attempts are recorded for diagnostics.
const dead = await runPlanner([])
assert.equal(dead.outcome.plan, null, "Если моделей нет — план пустой, маршрут возьмёт локальный")
assert.equal(dead.outcome.attempts.length, 3, "Все попытки должны быть зафиксированы")

// The comprehension line travels out of the plan.
const withUnderstanding = await runPlanner([{ ...strong, understood: "Нужен сайт кофейни с меню и бронью" }])
assert.equal(withUnderstanding.outcome.understood, "Нужен сайт кофейни с меню и бронью", "Понятое должно возвращаться наружу")

// -------------------------------------------------- skills carry real rules

const { SITE_SKILLS, selectSiteSkills } = await loadModule("lib/sites/skill-registry.ts")
assert.ok(SITE_SKILLS.length >= 15, `Скиллов должно быть много, сейчас ${SITE_SKILLS.length}`)
for (const skill of SITE_SKILLS) {
  assert.ok(Array.isArray(skill.rules) && skill.rules.length >= 2, `Скилл «${skill.id}» должен нести конкретные правила`)
  for (const rule of skill.rules) {
    assert.ok(rule.length > 25, `Правило скилла «${skill.id}» слишком общее: ${rule}`)
  }
}

// Selection has to react to what the user actually asked for.
const coffee = selectSiteSkills("сайт кофейни с ценами и бронью", "").map((skill) => skill.id)
assert.ok(coffee.includes("stripe-clarity"), "Запрос с ценами должен подтянуть коммерческий скилл")
const dashboard = selectSiteSkills("тёмный дашборд для аналитики", "").map((skill) => skill.id)
assert.ok(dashboard.includes("linear-hierarchy"), "Тёмный дашборд должен подтянуть скилл тёмной иерархии")

// Always-on skills must be present whatever the request.
for (const request of ["магазин обуви", "юридическая фирма", "crypto dashboard"]) {
  const ids = selectSiteSkills(request, "").map((skill) => skill.id)
  assert.ok(ids.includes("content-truth"), `Правила честного текста обязаны быть всегда (${request})`)
  assert.ok(ids.includes("web-vitals"), `Семантика и производительность обязаны быть всегда (${request})`)
}

// ------------------------------------------------- the prompt carries them

const engine = codeOf("lib/sites/skill-engine.ts")
assert.match(engine, /RULE: \$\{|RULE: /, "Правила скиллов должны попадать в промпт планировщика")
assert.match(engine, /understood/, "Планировщик обязан отчитаться, что он понял")
assert.match(engine, /Never "Добро пожаловать"/, "Промпт должен прямо запрещать шаблонные заголовки")

console.log(`✅ Sites: планировщик без привязки к модели, ${SITE_SKILLS.length} скиллов с правилами, качество плана проверяется`)
