import assert from "node:assert/strict"
import fs from "node:fs"

const read = (p) => fs.readFileSync(p, "utf8")
const company = read("components/sovereign/business/AutonomousCompany.tsx")
const dashboard = read("components/sovereign/dashboard.tsx")
const sidebar = read("components/sovereign/sidebar.tsx")
const agent = read("app/api/business/agent/route.ts")
const autonomous = read("app/api/business/autonomous/route.ts")
const build = read("app/api/business/build-project/route.ts")
const gemini = read("app/api/business/gemini-check/route.ts")
const plans = read("lib/billing/plans.ts")

assert.match(sidebar, /business-autonomous[^\n]+badge: "PRO"/)
assert.doesNotMatch(/business-autonomous[^\n]+/.exec(sidebar)?.[0] || "", /requiresPro/, "Free user must be able to enter the section before the upsell")
assert.match(dashboard, /<AutonomousCompany[\s\S]{0,280}plan=\{currentPlan\}[\s\S]{0,280}onOpenBilling/)
assert.match(company, /const proAccess = hasMalikProAccess\(plan\)/)
assert.match(company, /if \(!requirePro\(\)\) return[\s\S]{0,120}const brief = prompt\.trim\(\)/, "Run must be blocked client-side")
assert.match(company, /Приобрести Malik PRO/)
assert.match(company, /Ты можешь открыть раздел, посмотреть шаблоны и написать идею/)
assert.match(company, /if \(!proAccess\) \{[\s\S]{0,100}setGemini\(null\)/, "Free preview must not ping Gemini")
assert.match(company, /applyTemplate[\s\S]{0,140}if \(!requirePro\(\)\) return/)
assert.match(company, /startCustom[\s\S]{0,140}if \(!requirePro\(\)\) return/)

for (const [name, code] of [["agent", agent], ["autonomous", autonomous], ["build", build], ["gemini", gemini]]) {
  assert.match(code, /hasMalikProAccess/)
  assert.match(code, /MALIK_PRO_REQUIRED/)
  assert.match(code, /status: 402/)
}

assert.doesNotMatch(plans, /Бизнес под ключ — бесплатно/)
assert.match(plans, /Бизнес под ключ \/ Autonomous Company — 8 AI-агентов/)

console.log("Business under key: Malik PRO preview + client paywall + server hard gate: OK")
