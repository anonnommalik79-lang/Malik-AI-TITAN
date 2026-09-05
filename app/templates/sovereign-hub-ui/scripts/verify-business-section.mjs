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

/* --------------------------------------------------------------- 4. palette */

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

/* ------------------------------------------------------- 5. the shell's CSS */

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

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) {
  console.error(`${failures} failed`)
  process.exit(1)
}
