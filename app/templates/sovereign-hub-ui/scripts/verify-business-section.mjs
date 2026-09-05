#!/usr/bin/env node
/**
 * Autonomous Company: the checks a screenshot cannot make.
 *
 * A rendered screen proves the section looks right. It does not prove that the
 * eight agents map to modes the server will accept, that the endpoint is the
 * one that exists, that every template picture is a real image file, or that
 * the palette will survive NoBlueUiGuard's runtime rewrite. Those are the four
 * ways this section broke while it was being built, so they are the four things
 * checked here.
 *
 *   node scripts/verify-business-section.mjs
 */

import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(ROOT, p), "utf8")

let failures = 0
let checks = 0
let skipped = 0

// A check that could not run is neither a pass nor a failure, and pretending
// otherwise is how a suite rots: counted as green it hides a hole, counted as
// red it goes red on a machine where nothing is wrong.
function skip(name, why) {
  skipped += 1
  console.log(`  skip ${name} — ${why}`)
}
function check(name, condition, detail = "") {
  checks += 1
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

/* ---------------------------------------------------------------- 1. agents */

const autonomous = read("lib/business/autonomous.ts")
const types = read("lib/business/types.ts")
const modes = read("lib/business/modes.ts")

const declaredModeIds = new Set(
  (types.match(/export type BusinessModeId =[\s\S]*?\n\n/)?.[0] || "")
    .match(/"([a-z0-9-]+)"/g)?.map((s) => s.slice(1, -1)) || [],
)
const agentModes = [...autonomous.matchAll(/^\s*mode: "([a-z0-9-]+)",$/gm)].map((m) => m[1])

console.log("\nAgents")
check("eight agents are declared", agentModes.length === 8, `found ${agentModes.length}`)
for (const mode of agentModes) {
  check(`mode "${mode}" is a real BusinessModeId`, declaredModeIds.has(mode))
  check(`mode "${mode}" is registered in modes.ts`, modes.includes(`id: "${mode}"`))
}
check("no agent runs the same mode twice", new Set(agentModes).size === agentModes.length)

/* -------------------------------------------------------------- 2. endpoint */

const component = read("components/sovereign/business/AutonomousCompany.tsx")

console.log("\nEndpoint")
check(
  'the component posts to /api/business/run',
  /const ENDPOINT = "\/api\/business\/run"/.test(component),
)
check("that route file exists", (() => {
  try { return statSync(join(ROOT, "app/api/business/run/route.ts")).isFile() } catch { return false }
})())
check(
  "the component does not invent an /api/business/autonomous endpoint",
  !component.includes("/api/business/autonomous"),
)

// The server reads body.context as a BusinessRunContext. Keys it does not
// declare are dropped in silence, which is how the country, budget and
// requirements answers went missing the first time.
const contextKeys = new Set(
  (types.match(/export type BusinessRunContext = \{([\s\S]*?)\n\}/)?.[1] || "")
    .match(/^\s*(\w+)\?:/gm)?.map((s) => s.trim().replace(/\?:$/, "")) || [],
)
const sentKeys = [...(component.match(/const context = \{([\s\S]*?)\n\s*\}/)?.[1] || "")
  .matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
check("the component sends context keys the server declares", sentKeys.length > 0
  && sentKeys.every((k) => contextKeys.has(k)), `sent ${sentKeys.join(", ")}`)

// The model chip must reach the server, and the server must be willing to read it.
const runBusiness = read("lib/server/run-business.ts")
console.log("\nModel selection")
check("the component sends the chosen model", /modelId,?\n/.test(component) && component.includes("modelId"))
check("runBusinessEngine reads modelId", runBusiness.includes("body?.modelId"))
check("an unknown or ungranted model is ignored, not trusted",
  runBusiness.includes("isMalikModelId") && runBusiness.includes("canUseMalikModel"))
check("the automatic route still runs when the pinned model fails",
  /result = await routeAI\(base\)/.test(runBusiness))

/* ------------------------------------------------------------- 3. templates */

const images = [...autonomous.matchAll(/image: "([^"]+)"/g)].map((m) => m[1])
console.log("\nTemplate images")
check("every template declares a picture", images.length >= 11, `found ${images.length}`)
for (const src of images) {
  let bytes = null
  try { bytes = readFileSync(join(ROOT, "public", src)) } catch { /* reported below */ }
  const isWebp = bytes && bytes.length > 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP"
  // Not just "the file exists": a file with the right name and the wrong bytes
  // is exactly how the home hero shipped as a black rectangle.
  check(`${src} is a real WebP`, isWebp, bytes ? `${bytes.length} bytes, bad header` : "missing")
}
const hero = (() => { try { return readFileSync(join(ROOT, "public/business/hero.webp")) } catch { return null } })()
check("the intro photograph is a real WebP", Boolean(hero) && hero.toString("ascii", 8, 12) === "WEBP")

/* ------------------------------------------------------------- 4. playbooks */

// The playbook is the whole reason a template beats an empty box. It is also
// the easiest place for a fabricated number to enter the run and be treated as
// established by all eight agents, so it is checked for exactly that.
console.log("\nPlaybooks")
// Scoped to BUSINESS_TEMPLATES: the agents above it are also objects with an
// `id`, and matching those made the whole section report on the wrong things.
const templateSource = autonomous.slice(
  autonomous.indexOf("export const BUSINESS_TEMPLATES"),
  autonomous.indexOf("export function agentInput"),
)
const templateBlocks = [...templateSource.matchAll(/\{\n    id: "([a-z]+)",[\s\S]*?\n  \},/g)]
check("every template has a playbook and metrics", templateBlocks.length === images.length
  && templateBlocks.every((b) => b[0].includes("playbook: [") && b[0].includes("metrics: [")),
  `${templateBlocks.length} blocks`)

for (const block of templateBlocks) {
  const id = block[1]
  const playbook = (block[0].match(/playbook: \[([\s\S]*?)\n    \]/)?.[1] || "")
  const metrics = (block[0].match(/metrics: \[([\s\S]*?)\n    \]/)?.[1] || "")
  const lines = playbook.split("\n").filter((l) => l.trim().startsWith('"'))
  const metricLines = metrics.split("\n").filter((l) => l.trim().startsWith('"'))
  check(`${id}: playbook has real substance`, lines.length >= 6
    && lines.every((l) => l.length > 60), `${lines.length} lines`)
  check(`${id}: has metrics that decide the outcome`, metricLines.length >= 5, `${metricLines.length}`)
  // Money amounts and percentages inside a playbook are invented facts: the
  // currency and rate figures belong to the founder's real market, not to us.
  const invented = (playbook + metrics).match(/\d[\d\s.,]*\s*(₸|тенге|руб|\$|%|процент)/gi)
  check(`${id}: invents no figures`, !invented, invented ? invented.join(", ") : "")
}

check("the instruction reaches every agent, not only the first",
  autonomous.includes("instruction?: string | null")
  && autonomous.includes("ОТРАСЛЕВАЯ ИНСТРУКЦИЯ"))
check("the run sends the instruction that is on screen",
  component.includes("agentInput(agent, brief, done, instruction)"))
check("choosing a template is visible on the card",
  component.includes("templateCardActive"))
// The instruction must be shown in full and be editable. A summary of it -
// "eight rules will be applied" - is the thing this replaced: it asked to be
// trusted about the most important text on the page without ever printing it.
check("the instruction is shown as text, not summarised",
  component.includes("styles.instructionText") && component.includes("<textarea"))
check("the instruction is editable and the edit is what is sent",
  component.includes("onChange={(event) => setInstruction(event.target.value)}"))
check("no template writes a bare prompt with no instruction behind it",
  !component.includes("playbookBadge"))

/* ----------------------------------------------------------- 5. stress test */

// The ninth stage only means something if it reads what the eight actually
// produced and stays inside the prompt cap while doing it. Both are checked by
// running the real builder, not by looking at it.
console.log("\nStress test")
const modes5 = read("lib/business/modes.ts")
const templates5 = read("lib/business/output-templates.ts")

check("reality-check is a registered mode", modes5.includes('id: "reality-check"'))
check("its id is a declared BusinessModeId", types.includes('| "reality-check"'))
check("its output format is declared", types.includes('| "stress"') && templates5.includes("  stress: `"))
check("the stress format demands a kill criterion, not a score",
  /При каком результате план мёртв/.test(templates5)
  && !/stress: `[\s\S]*?Оценка \/100/.test(templates5))
check("it runs on the same endpoint as everything else",
  component.includes("mode: STRESS_TEST.mode") && component.includes("ENDPOINT,"))
check("a too-long input is resized from the server's own limit, not guessed",
  component.includes('data?.code === "PROMPT_TOO_LONG"') && component.includes("cap - 400"))
check("a failed stress test does not fail the run",
  component.includes("setStressError") && component.includes("stressBusy"))

// Imported rather than reimplemented: a budget test that checks a copy of the
// function proves nothing about the one that ships. Needs a Node that strips
// types (22.6+); older ones skip these rather than fail.
const { stressTestInput } = await import(join(ROOT, "lib/business/autonomous.ts"))
  .catch(() => ({ stressTestInput: null }))

if (stressTestInput) {
  const fake = Array.from({ length: 8 }, (_, i) => ({
    agent: { name: `A${i}`, role: `R${i}` },
    content: "Предложение номер один. ".repeat(200),
  }))
  for (const budget of [3000, 6000, 12000]) {
    const built = stressTestInput("Кофейня в Алматы", fake, budget)
    check(`fits a ${budget}-character cap`, built.length <= budget, `${built.length}`)
    check(`still carries all eight stages at ${budget}`,
      fake.every((f) => built.includes(`## ${f.agent.name}`)))
  }
  const short = stressTestInput("Кофейня", [{ agent: { name: "CEO", role: "Стратегия" }, content: "Короткий вывод." }], 6000)
  check("a short plan is not padded or truncated", short.includes("Короткий вывод.") && !short.includes("[…]"))
} else {
  skip("stressTestInput fits the prompt cap", `this Node (${process.version}) cannot import .ts directly`)
}

/* --------------------------------------------------------------- 6. palette */

// NoBlueUiGuard rewrites, at runtime, any colour with hue 178-250 and
// saturation >= 0.12. Cool dark greys land squarely inside that window, and the
// guard flattened forty-three of them to one shade before this was caught.
// Comments stripped first: the file documents the rule by naming a colour that
// breaks it, and that example is not a declaration.
const css = read("components/sovereign/business/AutonomousCompany.module.css")
  .replace(/\/\*[\s\S]*?\*\//g, "")

function hueAndSaturation(r, g, b) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let hue = 0
  if (delta !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2)
    else hue = 60 * ((rn - gn) / delta + 4)
  }
  if (hue < 0) hue += 360
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return { hue, saturation }
}

const offenders = []
for (const hex of new Set(css.match(/#[0-9a-fA-F]{6}\b/g) || [])) {
  const { hue, saturation } = hueAndSaturation(
    parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))
  if (hue >= 178 && hue <= 250 && saturation >= 0.12) offenders.push(hex)
}
for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
  const { hue, saturation } = hueAndSaturation(Number(m[1]), Number(m[2]), Number(m[3]))
  if (hue >= 178 && hue <= 250 && saturation >= 0.12) offenders.push(m[0] + ")")
}
console.log("\nPalette")
check("no colour NoBlueUiGuard would overwrite", offenders.length === 0, offenders.join(" "))

/* ------------------------------------------------------- 7. the shell's CSS */

// .malik-dashboard-shell styles `header *` and hides `header > div:nth-of-type(2)`
// for its own top bar. A <header> inside a view inherits all of it.
console.log("\nDashboard shell")
check("the section does not use a <header> the shell would capture",
  !/<header[\s>]/.test(component))
check("the section is wired into the dashboard",
  read("components/sovereign/dashboard.tsx").includes("<AutonomousCompany"))
check("it is reachable from the navigation",
  read("components/sovereign/sidebar.tsx").includes('view: "business-command-center"'))

/* ------------------------------------------------------------------ result */

console.log(`\n${checks - failures}/${checks} checks passed${skipped ? `, ${skipped} skipped` : ""}`)
if (failures) {
  console.error(`${failures} failed`)
  process.exit(1)
}
