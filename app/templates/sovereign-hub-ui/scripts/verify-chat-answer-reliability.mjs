import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"

const base = process.argv[2]
if (base) assert.match(base, /^[a-f\d]{7,40}$/u)
const modules = [
  "lib/ai/conversation-focus.ts", "lib/ai/domain-intelligence.ts", "lib/ai/freshness-intent.ts",
  "lib/ai/web-search-policy.ts", "lib/live-intelligence/evidence.ts",
]
const baseline = base ? Object.fromEntries(modules.map(file => [path.resolve(file),
  execFileSync("git", ["show", `${base}:app/templates/sovereign-hub-ui/${file}`], { encoding: "utf8" }),
])) : {}
const load = workTestLoader({}, baseline)
const { conversationFocus } = load("lib/ai/conversation-focus.ts")
const { resolveDomainPlan } = load("lib/ai/domain-intelligence.ts")
const { shouldUseWeb } = load("lib/ai/web-search-policy.ts")
const { classifyFreshness } = load("lib/ai/freshness-intent.ts")
const { assessSources, finalizeFreshAnswer } = load("lib/live-intelligence/evidence.ts")
const { normalizeWebSearchQuery, birthCohortDataQuery } = load("lib/ai/web-search-query.ts")
const asOf = new Date("2026-11-20T12:00:00Z")
const history = (...questions) => questions.map(content => ({ role: "user", content }))

let total = 0, passed = 0
function check(name, test) {
  total++
  try { test(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.message}`) }
}
function lookup(question, messages, controls = {}) {
  const plan = resolveDomainPlan({ prompt: question, messages })
  const focus = plan.context.followUp ? conversationFocus(question, messages) : { searchText: question }
  return { ...focus, web: shouldUseWeb(focus.searchText, controls, plan), freshness: classifyFreshness(focus.searchText, asOf) }
}

check("RU: a company follow-up replaces the earlier CEO subject", () => {
  const result = lookup("А Tesla?", history("Кто сейчас CEO NVIDIA?"), { research: false })
  assert.equal(result.searchText, "Кто сейчас CEO Tesla")
  assert.equal(result.web, true)
})
check("EN: a library follow-up replaces the earlier version subject", () => {
  const result = lookup("And what about Next.js?", history("What is the current stable version of React?"))
  assert.equal(result.searchText, "What is the current stable version of Next.js")
})
check("RU: a pronoun after a subject swap uses the newest company", () => {
  const result = lookup("А сколько ему лет?", history("Кто сейчас CEO NVIDIA?", "А Tesla?"))
  assert.match(result.searchText, /Tesla/u)
  assert.doesNotMatch(result.searchText, /NVIDIA/u)
})
check("RU: a complete new question keeps its own subject", () => {
  const result = lookup("А какая сейчас версия Python?", history("Какая сейчас версия React?"))
  assert.equal(result.searchText, "А какая сейчас версия Python?")
})
for (const [language, earlier, followUp, oldWord] of [
  ["RU", "Какие новости Алматы были вчера?", "А сегодня?", "вчера"],
  ["EN", "What happened in Almaty yesterday?", "What about today?", "yesterday"],
  ["KK", "Алматыда кеше қандай жаңалық болды?", "Ал бүгін ше?", "кеше"],
]) check(`${language}: the latest date controls the search window`, () => {
  const result = lookup(followUp, history(earlier))
  assert.doesNotMatch(result.searchText, new RegExp(oldWord, "iu"))
  assert.equal(result.freshness.window?.label, "today")
  assert.equal(result.web, true)
})
check("an explicit historical year replaces the current period", () => {
  const result = lookup("А в 2020 году?", history("Кто сейчас CEO NVIDIA?"))
  assert.doesNotMatch(result.searchText, /сейчас/u)
  assert.equal(result.freshness.historical, true)
})
check("RU: explicit re-enable restores the subject despite an unchecked Web toggle", () => {
  const result = lookup("Теперь поищи", history("Какая версия Next.js без интернета?"), { research: false })
  assert.match(result.searchText, /Next\.js/u)
  assert.doesNotMatch(result.searchText, /без интернета/u)
  assert.equal(result.web, true)
})
check("EN: explicit re-enable restores the subject", () => {
  const result = lookup("Now look it up", history("Which version of React without internet?"), { research: false })
  assert.match(result.searchText, /React/u)
  assert.doesNotMatch(result.searchText, /without internet/u)
  assert.equal(result.web, true)
})
check("explicit re-enable remains in effect on the next date follow-up", () => {
  const result = lookup("А сегодня?", history("Какие новости Алматы были вчера без интернета?", "Теперь поищи"))
  assert.equal(result.web, true)
  assert.equal(result.freshness.window?.label, "today")
})
check("a new entity alone cannot switch web back on", () => {
  assert.equal(lookup("А Tesla?", history("Кто сейчас CEO NVIDIA без интернета?")).web, false)
})
check("the latest no-web instruction wins over a forced toggle", () => {
  assert.equal(lookup("А сегодня без веб-поиска?", history("Какие новости Алматы были вчера?"), { forceResearch: true }).web, false)
})
check("disabled research wins over an explicit browser search", () => {
  assert.equal(lookup("Поищи последние новости", [], { disableResearch: true }).web, false)
})
check("legal evidence remains required with the optional Web toggle off", () => {
  const legal = "Какие требования закона к трудовому договору в Казахстане?"
  assert.equal(resolveDomainPlan({ prompt: legal }).evidence.web, "required")
  assert.equal(lookup(legal, [], { research: false }).web, true)
})
check("Newton's laws and a self-contained calculation do not use the web", () => {
  assert.equal(lookup("Объясни закон Ньютона", []).web, false)
  assert.equal(lookup("Calculate 17 × 23", []).web, false)
})

const birthQuestion = "сколько сейчас на данный момент людей всех мире 2009 года"
const birthCorrection = "Нет щяс люди родившився 2009скок штуков в мире на даный момент"
const birthConversation = [
  ...history(birthQuestion),
  { role: "assistant", content: "Население Земли в 2009 году." },
  ...history(birthCorrection),
  { role: "assistant", content: "Оценка числа живущих людей 2009 года рождения." },
]
check("colloquial questions about people alive now use current demographic data", () => {
  for (const question of [birthQuestion, birthCorrection, "How many people born in 2009 are alive today worldwide?"]) {
    const result = lookup(question, [])
    assert.equal(result.web, true)
    assert.equal(result.freshness.reason, "demographic-statistic")
    assert.equal(result.freshness.window, undefined)
    assert.match(birthCohortDataQuery(normalizeWebSearchQuery(question), "2026"), /single year of age 2026.*2009/u)
  }
})
check("the screenshot's short ranking question keeps the latest correction and searches", () => {
  const result = lookup("2009скок месте стойт", birthConversation, { research: false })
  assert.equal(result.anchor, birthCorrection)
  assert.match(result.searchText, /место в рейтинге/u)
  assert.equal(result.freshness.reason, "demographic-statistic")
  assert.equal(result.web, true)
})
check("a short reaction explains the preceding statistic without another search", () => {
  const result = lookup("Поя мало", birthConversation)
  assert.equal(result.anchor, birthCorrection)
  assert.equal(result.searchText, "Поя мало")
  assert.equal(result.web, false)
})
check("a new named ranking has its own subject", () => {
  assert.equal(conversationFocus("Кто первый в рейтинге теннисистов мира?", birthConversation).anchor, "")
})

const question = "Какая актуальная стабильная версия React?"
const intent = classifyFreshness(question, asOf)
const source = assessSources(question, [{
  title: "React 19.2.0 stable release", url: "https://react.dev/blog/fixture-release",
  domain: "react.dev", snippet: "React version 19.2.0 is available.", publishedAt: "2026-11-20T08:00:00Z",
}], intent)
const verify = (answer, format, citations = source) =>
  finalizeFreshAnswer(answer, intent, source, citations, { question, format })

check("a real citation number alone cannot support a fabricated release", () => {
  assert.match(verify("Актуальная версия React — 99.0.0 [1]."), /Не удалось подтвердить/u)
})
check("inline code cannot hide a fabricated release number", () => {
  assert.match(verify("Актуальная версия React — `99.0.0` [1]."), /Не удалось подтвердить/u)
})
check("the cited release keeps its exact version and date receipt", () => {
  const answer = verify("Актуальная версия React — `19.2.0` [1].")
  assert.match(answer, /19\.2\.0/u)
  assert.match(answer, /Источники проверены/u)
})
check("the typographic citation used by live providers keeps the supported answer", () => {
  assert.match(verify("Актуальная версия React 19.2.0 【1】."), /19\.2\.0 \[1\]/u)
  assert.match(verify("Актуальная версия React 19.2.0 【99】."), /Не удалось подтвердить/u)
})
check("an unsourced current claim cannot acquire an automatic citation", () => {
  assert.match(verify("Версия React 99.0.0."), /Не удалось подтвердить/u)
})
check("citation to a connected file alone cannot prove the public release", () => {
  const privateItem = { title: "Internal README", url: "https://github.com/example/private", domain: "github.com", snippet: "19.2.0" }
  assert.match(verify("Актуальная версия React 19.2.0 [2]", undefined, [...source, privateItem]), /Не удалось подтвердить/u)
})
check("a real link included in the answer counts as a citation", () => {
  assert.match(verify("Актуальная версия React 19.2.0. https://react.dev/blog/fixture-release"), /Источники проверены/u)
})
check("current JSON preserves exact values and has no prose appended", () => {
  const raw = '{"version":"19.2.0","source":"[1]","largeIdentifier":9007199254740993}'
  assert.equal(verify(raw, "json"), raw)
})
check("fenced JSON is returned as valid JSON without fences", () => {
  const raw = '{"version":"19.2.0","sources":["https://react.dev/blog/fixture-release"]}'
  assert.equal(verify("```json\n" + raw + "\n```", "json"), raw)
})
check("JSON failure is parseable and carries no unsupported version", () => {
  const output = JSON.parse(verify('{"version":"99.0.0","source":"[1]"}', "json"))
  assert.equal(output.status, "unverified")
  assert.equal(output.version, undefined)
})
check("malformed current JSON yields a structured failure", () => {
  const output = JSON.parse(verify('{"version":"19.2.0","source":"[1]"', "json"))
  assert.equal(output.reason, "invalid-json")
})
check("the official latest release replaces an older version even when its number is in the release notes", () => {
  const catalog = assessSources(question, [{
    title: "facebook/react latest stable v19.2.0", url: "https://github.com/facebook/react/releases/tag/v19.2.0",
    domain: "github.com", snippet: "Update from React 18.3.1 to React 19.2.0.",
    provider: "github-releases", currentCatalog: true, releaseVersion: "19.2.0",
    publishedAt: "2026-10-01T08:00:00Z",
  }], intent)
  const corrected = finalizeFreshAnswer("Актуальная стабильная версия React — 18.3.1 [1].", intent, catalog, catalog, { question })
  assert.match(corrected, /19\.2\.0\*\* \[1\]/u)
  assert.doesNotMatch(corrected, /18\.3\.1/u)
})

check("a stale third-party model article cannot establish the latest family or date", () => {
  const question = "Когда вышел последняя модель Gpt"
  const intent = classifyFreshness(question, asOf)
  const sources = assessSources(question, [{ title: "GPT-5.6", url: "https://en.wikipedia.org/wiki/GPT-5", domain: "en.wikipedia.org", snippet: "GPT-5.6 was released on June 26, 2026." }], intent)
  assert.match(finalizeFreshAnswer("Последняя модель — GPT-5.6, вышла 26 июня 2026 [1].", intent, sources, sources, { question }), /Не удалось подтвердить/u)
})

check("an unrelated full date is rejected for a non-software current question", () => {
  const question = "Когда выйдет последнее обновление стандарта?"
  const intent = classifyFreshness(question, asOf)
  const sources = assessSources(question, [{ title: "Standards body", url: "https://standards.example.org/updates", domain: "standards.example.org", snippet: "The new edition goes into effect on November 19, 2026.", publishedAt: "2026-11-18" }], intent)
  assert.match(finalizeFreshAnswer("Обновление вступило в силу 18 ноября 2026 года [1].", intent, sources, sources, { question }), /Не удалось подтвердить/u)
  assert.match(finalizeFreshAnswer("Обновление вступило в силу 19 ноября 2026 года [1].", intent, sources, sources, { question }), /19 ноября/u)
})

check("a cited store page cannot validate an invented price", () => {
  const question = "Сколько стоит телефон в этом магазине?"
  const intent = classifyFreshness(question, asOf)
  const sources = assessSources(question, [{ title: "Телефон X", url: "https://shop.example.org/item", domain: "shop.example.org", snippet: "Цена телефона X — 319 990 ₸." }], intent)
  assert.match(finalizeFreshAnswer("Цена — 449 990 ₸ [1].", intent, sources, sources, { question }), /Не удалось подтвердить/u)
  assert.match(finalizeFreshAnswer("Цена — 319 990 ₸ [1].", intent, sources, sources, { question }), /319 990/u)
})

console.log(`${passed}/${total} chat reliability fixtures, ${base || "working tree"}`)
process.exitCode = passed === total ? 0 : 1
