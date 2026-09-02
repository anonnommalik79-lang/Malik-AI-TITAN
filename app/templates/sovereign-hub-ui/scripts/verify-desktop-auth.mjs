import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
const auth = read("components/sovereign/SovereignVideoAuth.tsx")
const isolation = read("app/auth/auth-isolation.css")
const guard = read("components/sovereign/NoBlueUiGuard.tsx")

// Only the desktop scene is brand-safe; mobile stays outside that subtree.
assert.match(auth, /<SovereignMobileRegister\s*\/>[\s\S]*?<main className="sva-root sva-desktop-only" data-preserve-brand-color="true">/)
assert.match(read("lib/brand-assets.ts"), /AUTH_DRAGON_JPG\s*=\s*"\/images\/sovereign-auth-founder\.png"/)
assert.match(auth, /useState\(AUTH_DRAGON_JPG\)/)
assert.match(auth, /\.sva-root\s*\{\s*position: fixed;/)
assert.match(auth, /\.sva-shell\s*\{\s*position: absolute;/)
assert.match(auth, /@media \(max-width: 980px\)\s*\{\s*\.sva-desktop-only\s*\{ display: none !important;/)
assert.doesNotMatch(isolation, /position:\s*relative\s*!important/)
assert.doesNotMatch(isolation, /opacity:\s*\.92\s*!important/)

assert.ok(isolation.includes("background: linear-gradient(168deg, #080c1c 0%, #060816 38%, #0a0618 100%) !important;"), "The real form must cover the printed form in the artwork")

// Exercise the real guard in memory. No browser, credentials or network needed.
const compiled = ts.transpileModule(`${guard}\nexport { neutralizeElement };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
class TestElement {
  constructor(protectedScene) {
    this.protectedScene = protectedScene
    this.writes = new Map()
    this.style = { setProperty: (name, value) => this.writes.set(name, value) }
  }
  closest(selector) {
    return this.protectedScene && selector.includes("[data-preserve-brand-color='true']") ? this : null
  }
}
class TestSvgElement extends TestElement {}
const aura = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "radial-gradient(rgba(80, 180, 255, 0.08), transparent)",
  boxShadow: "none",
  textShadow: "none",
  getPropertyValue: () => "",
}
let computedReads = 0
const module = { exports: {} }
new Function("require", "module", "exports", "window", "HTMLElement", "SVGElement", compiled)(
  (name) => { assert.equal(name, "react"); return { useEffect() {} } },
  module, module.exports,
  { getComputedStyle: () => { computedReads++; return aura } },
  TestElement, TestSvgElement,
)

const dragonAura = new TestElement(true)
module.exports.neutralizeElement(dragonAura)
assert.equal(computedReads, 0, "Desktop brand layers must be skipped before recoloring")
assert.equal(dragonAura.writes.size, 0, "The dragon must not get an opaque gray overlay")

const normalUi = new TestElement(false)
module.exports.neutralizeElement(normalUi)
assert.equal(normalUi.writes.get("background-image"), "none")
assert.equal(normalUi.writes.get("background-color"), "#1b1b1d", "The neutral guard must still work outside desktop auth")
console.log("PASS desktop auth: original dragon/layout, isolated glass card, mobile boundary, brand-safe guard")
