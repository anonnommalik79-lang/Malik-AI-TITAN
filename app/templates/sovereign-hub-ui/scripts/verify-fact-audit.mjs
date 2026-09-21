import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

function loadTypeScriptModule(file) {
  const source = fs.readFileSync(file, "utf8")
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const box = { exports: {} }
  new Function("require", "module", "exports", js)(
    (name) => { throw new Error(`unexpected require(${name})`) }, box, box.exports,
  )
  return box.exports
}

const { auditAnswerFacts } = loadTypeScriptModule("lib/ai/fact-audit.ts")

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const source = (snippet, title = "Отчёт") => ({ title, url: "https://example.org/a", domain: "example.org", snippet })
const audit = (answer, sources, prompt) => auditAnswerFacts({ answer, sources, prompt })
const claimFor = (result, value) => result.claims.find((claim) => claim.value === value)

console.log("\nMALIK Fact grounding audit")

/* ---------------------------------------------------------------- silence */

check("stays silent when no page was read", () => {
  assert.equal(audit("Рынок вырос на 42% в 2024 году.", []), null)
})

check("stays silent when the answer states no checkable figure", () => {
  assert.equal(audit("Рынок заметно вырос за последний год.", [source("рынок вырос")]), null)
})

check("stays silent on an empty answer", () => {
  assert.equal(audit("", [source("42%")]), null)
})

/* ------------------------------------------------------- grounded figures */

check("confirms a figure the page states, and names the page", () => {
  const result = audit("Доля выросла до 42%.", [source("нет чисел"), source("доля достигла 42% по итогам года")])
  assert.equal(result.status, "clean")
  assert.equal(result.missing, 0)
  assert.deepEqual(claimFor(result, "42%").sourceIndexes, [2])
  assert.equal(claimFor(result, "42%").verdict, "supported")
})

check("accepts a percentage rounded to the place it was written to", () => {
  const result = audit("Доля — 42%.", [source("точное значение 42,3 процента")])
  assert.equal(result.missing, 0)
})

check("rejects a percentage that disagrees with the page", () => {
  const result = audit("Доля — 85%.", [source("доля составила 83%")])
  assert.equal(result.missing, 1)
  assert.equal(claimFor(result, "85%").verdict, "missing")
})

check("accepts a large amount rounded into a sentence", () => {
  const result = audit("Выручка — 1,2 млн долларов.", [source("revenue reached 1 247 000 USD last year")])
  assert.equal(result.missing, 0, JSON.stringify(result.claims))
})

check("matches a scaled amount written out in full on the page", () => {
  const result = audit("Компания привлекла 3,5 млн.", [source("привлекла 3 500 000 тенге")])
  assert.equal(result.missing, 0)
})

check("matches a scaled amount written with the scale word on the page", () => {
  const result = audit("Выручка 2 400 000 долларов.", [source("revenue of 2.4 million dollars")])
  assert.equal(result.missing, 0)
})

check("treats thousands separators as the same number", () => {
  const result = audit("Продано 12 400 машин.", [source("12,400 units sold")])
  assert.equal(result.missing, 0)
})

check("accepts an amount the page rounds differently within its own precision", () => {
  const result = audit("Сумма 12 400 тенге.", [source("итог 12 437 тенге")])
  assert.equal(result.missing, 0)
})

check("counts a year only when the page states that exact year", () => {
  const good = audit("Запуск состоялся в 2024 году.", [source("launched in 2024")])
  assert.equal(good.missing, 0)
  const bad = audit("Запуск состоялся в 2019 году.", [source("launched in 2024")])
  assert.equal(bad.missing, 1)
})

check("a year is never matched by a nearby year", () => {
  const result = audit("Правило действует с 2021 года.", [source("в силе с 2024 года")])
  assert.equal(claimFor(result, "2021 года").verdict, "missing")
})

/* ---------------------------------------------------- invented statistics */

check("flags a figure that appears in none of the pages", () => {
  const result = audit(
    "Рынок вырос на 42% и достиг 8,3 млрд долларов.",
    [source("рынок вырос на 42% за год, данных по объёму нет")],
  )
  assert.equal(result.status, "flagged")
  assert.equal(result.missing, 1)
  assert.equal(claimFor(result, "8,3 млрд").verdict, "missing")
  assert.match(claimFor(result, "8,3 млрд").note, /нет ни в одном/i)
})

check("puts the problems at the top of the list", () => {
  const result = audit(
    "Доля 42%, выручка 8,3 млрд, год 2024.",
    [source("доля 42% в 2024 году")],
  )
  assert.equal(result.claims[0].verdict, "missing")
})

check("keeps the sentence the figure stands in", () => {
  const result = audit("Первый абзац.\n\nРынок достиг 8,3 млрд долларов в 2024 году.", [source("2024")])
  assert.match(claimFor(result, "8,3 млрд").sentence, /Рынок достиг/)
})

/* -------------------------------------------------- citation arithmetic */

check("flags a citation pointing past the end of the source list", () => {
  const result = audit("Так считает отрасль [7]. Доля 42% [1].", [source("доля 42%"), source("b"), source("c")])
  const broken = claimFor(result, "[7]")
  assert.equal(broken.verdict, "bad-citation")
  assert.match(broken.note, /источников всего 3/)
})

check("accepts a citation that points at a real source", () => {
  const result = audit("Доля 42% [2].", [source("a"), source("доля 42%")])
  assert.equal(result.claims.some((claim) => claim.kind === "citation"), false)
  assert.equal(result.status, "clean")
})

check("does not read a citation marker as a figure", () => {
  const result = audit("Год 2024 [2024].", [source("2024")])
  assert.equal(result.claims.filter((claim) => claim.kind === "figure").length, 1)
})

check("reports a broken citation once, however often it is repeated", () => {
  const result = audit("Раз [9]. Два [9]. Три [9].", [source("что-то")])
  assert.equal(result.claims.filter((claim) => claim.value === "[9]").length, 1)
  assert.equal(result.brokenCitations, 1)
})

check("speaks up for a broken citation even when the answer states no figure", () => {
  const result = audit("Так считает отрасль [4].", [source("мнение отрасли")])
  assert.equal(result.checked, 0)
  assert.equal(result.status, "flagged")
  assert.match(result.summary, /^1 ссылка ведёт на несуществующий источник$/)
})

check("reports figures and broken citations in one sentence", () => {
  const result = audit("Доля 42% [1], объём 8,3 млрд [5].", [source("доля 42%")])
  assert.equal(result.missing, 1)
  assert.equal(result.brokenCitations, 1)
  assert.match(result.summary, /1 из 2 фактов подтверждено источниками · 1 не найдено · 1 ссылка ведёт на несуществующий источник/)
})

check("does not let a citation index count as a source hit", () => {
  const result = audit("Доля 42% [1].", [source("в источнике есть только слово доля")])
  assert.equal(claimFor(result, "42%").verdict, "missing")
})

/* ------------------------------------------------------------ false alarms */

check("ignores numbers inside a fenced code block", () => {
  const answer = "Вот код:\n\n```js\nconst port = 8080\nconst limit = 999999\n```\n\nПорт берётся из конфига."
  assert.equal(audit(answer, [source("конфигурация сервера")]), null)
})

check("ignores numbers inside inline code", () => {
  assert.equal(audit("Поставь `max_tokens = 4096` в конфиг.", [source("настройка")]), null)
})

check("ignores numbers inside a link", () => {
  assert.equal(audit("Смотри https://example.org/2019/07/12345 — там всё.", [source("страница")]), null)
})

check("ignores a version number", () => {
  assert.equal(audit("Проект собран на Next.js 16.1 и React 19.2.", [source("сборка")]), null)
})

check("ignores counting and structure", () => {
  assert.equal(audit("Есть 5 причин. Доставка занимает 24 часа. Это топ-10 рынка.", [source("рынок")]), null)
})

check("counts a number the user supplied in the question as grounded", () => {
  const result = audit("При выручке 750 000 тенге налог составит эту сумму.", [source("ставка налога")], "у меня выручка 750 000 тенге")
  assert.equal(result.missing, 0)
  assert.match(claimFor(result, "750 000 тенге").note, /из вашего вопроса/i)
})

/* ---------------------------------------------------------------- shaping */

check("reports the same figure once, however often the answer repeats it", () => {
  const result = audit("Доля 42%. Ещё раз: 42%. И снова 42%.", [source("доля 42%")])
  assert.equal(result.claims.filter((claim) => claim.value === "42%").length, 1)
  assert.equal(result.checked, 1)
})

check("caps the reported list but keeps the counts honest", () => {
  const answer = Array.from({ length: 60 }, (_, index) => `Показатель ${1000 + index * 7} единиц.`).join(" ")
  const result = audit(answer, [source("нет чисел здесь")])
  assert.equal(result.checked, 60)
  assert.equal(result.missing, 60)
  assert.equal(result.claims.length, 24)
})

check("summarises a clean answer without alarming the reader", () => {
  const result = audit("Доля 42% и 2024 год.", [source("доля 42% в 2024 году")])
  assert.equal(result.status, "clean")
  assert.match(result.summary, /^Все 2 факта подтверждены источниками$/)
})

check("summarises a flagged answer with the count that needs checking", () => {
  const result = audit("Доля 42%, объём 8,3 млрд.", [source("доля 42%")])
  assert.match(result.summary, /1 из 2 фактов подтверждено источниками · 1 не найдено/)
})

check("declines the Russian word for fact correctly", () => {
  assert.match(audit("Доля 42%.", [source("доля 41%")]).summary, /0 из 1 факта/)
  assert.match(audit("A 1100, B 1200, C 1300, D 1400, E 1500.", [source("нет")]).summary, /из 5 фактов/)
  assert.match(audit("A 1100, B 1200, C 1300, D 1400, E 1500, F 1600, G 1700, H 1800, I 1900 год, J 2000 год, K 1150.", [source("нет")]).summary, /из 11 фактов/)
})

check("never returns more shape than the stream can carry", () => {
  const result = audit("Доля 42% и объём 8,3 млрд.", [source("доля 42%")])
  const json = JSON.stringify(result)
  assert.ok(json.length < 40_000, `payload too large: ${json.length}`)
  for (const claim of result.claims) {
    assert.ok(claim.sentence.length <= 171, claim.sentence)
    assert.ok(["supported", "missing", "bad-citation"].includes(claim.verdict))
    assert.ok(["figure", "citation"].includes(claim.kind))
  }
})

check("gives every claim a stable id so the UI can key on it", () => {
  const result = audit("Доля 42%, объём 8,3 млрд [9].", [source("доля 42%")])
  const ids = result.claims.map((claim) => claim.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids, audit("Доля 42%, объём 8,3 млрд [9].", [source("доля 42%")]).claims.map((claim) => claim.id))
})

/* -------------------------------------------------------- reading it back */

const { normalizeFactAudit } = loadTypeScriptModule("lib/ai/fact-audit.ts")

check("reads its own output back unchanged", () => {
  const original = audit("Доля 42%, объём 8,3 млрд [9].", [source("доля 42%")])
  assert.deepEqual(normalizeFactAudit(JSON.parse(JSON.stringify(original))), original)
})

check("drops anything that is not a real audit", () => {
  for (const value of [null, undefined, "", 0, [], {}, { checked: "нет" }, { claims: [] }]) {
    assert.equal(normalizeFactAudit(value), null, JSON.stringify(value))
  }
})

check("drops malformed claim rows rather than half-drawing them", () => {
  const result = normalizeFactAudit({
    checked: 2,
    supported: 1,
    missing: 1,
    brokenCitations: 0,
    summary: "1 из 2 фактов подтверждено источниками · 1 не найдено",
    claims: [
      { id: "ok", value: "42%", verdict: "supported", sourceIndexes: [1, "x", -3] },
      { id: "", value: "нет id", verdict: "supported" },
      { id: "bad-verdict", value: "8,3 млрд", verdict: "мнение" },
      "не объект",
    ],
  })
  assert.equal(result.claims.length, 1)
  assert.deepEqual(result.claims[0].sourceIndexes, [1])
  assert.equal(result.claims[0].kind, "figure")
})

check("recomputes the status it was handed, rather than trusting it", () => {
  const result = normalizeFactAudit({ checked: 3, supported: 1, missing: 2, status: "clean", summary: "врёт", claims: [] })
  assert.equal(result.status, "flagged")
})

/* ----------------------------------------------------------- the wiring */

const read = (file) => fs.readFileSync(file, "utf8")

check("the router audits every answer written from open pages", () => {
  const router = read("lib/malik-god-router.ts")
  assert.match(router, /import \{ auditAnswerFacts, type MalikFactAudit \} from "@\/lib\/ai\/fact-audit"/)
  assert.match(router, /factAudit: auditGroundedAnswer\(content, sources, prompt\)/)
  assert.match(router, /factAudit: auditGroundedAnswer\(result\.content, sources, prompt\)/)
  assert.match(router, /factAudit: answer\.factAudit \?\? null/)
})

check("a failing audit can never take the answer down with it", () => {
  const router = read("lib/malik-god-router.ts")
  const guard = router.slice(router.indexOf("function auditGroundedAnswer"))
  assert.match(guard.slice(0, 600), /try \{[\s\S]*catch/)
})

check("the chat stream carries the audit on its done event", () => {
  const stream = read("app/api/stream/route-impl.ts")
  assert.match(stream, /factAudit: "factAudit" in answer \? answer\.factAudit \?\? null : null/)
})

check("the dashboard keeps the audit on the message it belongs to", () => {
  const dashboard = read("components/sovereign/dashboard.tsx")
  assert.match(dashboard, /import \{ normalizeFactAudit \} from "@\/lib\/ai\/fact-audit"/)
  assert.match(dashboard, /factAudit: normalizeFactAudit\(payload\?\.factAudit\)/)
})

check("the chat renders the audit above the source list", () => {
  const view = read("components/sovereign/chat-view.tsx")
  assert.match(view, /function FactAuditPanel\(/)
  assert.match(view, /message\.research\?\.factAudit \? \(\s*<FactAuditPanel/)
  assert.ok(
    view.indexOf("<FactAuditPanel") < view.lastIndexOf("<SourceDeck research={message.research} />"),
    "the verdict must come before the reading list",
  )
})

check("the audit is part of the JSON chat answer too", () => {
  assert.match(read("lib/malik-god-router.ts"), /export function asJson[\s\S]*factAudit/)
})

console.log(failures ? `\n${failures} check(s) failed\n` : "\nfact grounding audit: all checks passed\n")
process.exit(failures ? 1 : 0)
