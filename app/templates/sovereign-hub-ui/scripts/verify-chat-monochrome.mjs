import assert from "node:assert/strict"
import fs from "node:fs"

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

const css = fs.readFileSync("app/chat-monochrome-final.css", "utf8")
const layout = fs.readFileSync("app/layout.tsx", "utf8")
const view = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")

console.log("\nMALIK Chat in black and white")

check("the monochrome pass is the last stylesheet in the chain", () => {
  const imports = [...layout.matchAll(/^import "\.\/([^"]+\.css)"/gm)].map((match) => match[1])
  assert.equal(imports.at(-1), "chat-monochrome-final.css", `last was ${imports.at(-1)}`)
})

check("every loading, analysis, source and status surface is desaturated", () => {
  for (const surface of [
    ".malik-thinking-line",
    ".malik-thinking-dots",
    ".malik-thinking-card",
    ".malik-ai-avatar.is-working",
    ".malik-activity",
    ".malik-activity-icon",
    ".malik-live-source-icons",
    ".malik-source-inline",
    ".malik-source-pill",
    ".malik-source-icon",
    ".malik-canvas-progress",
    ".malik-art-progress",
    ".malik-image-loading-pc-final",
    ".malik-image-loading-mobile-final",
    ".malik-video-analysis-pulse",
    ".malik-response-model",
    ".malik-composer-context-row",
    ".malik-fact-audit",
    ".malik-user-lightning-reaction",
  ]) {
    assert.ok(css.includes(`#malik-root ${surface}`), `not covered: ${surface}`)
  }
  assert.equal((css.match(/filter: grayscale\(1\) !important/g) || []).length >= 4, true)
})

check("the composer loses its gold without being filtered", () => {
  // A filtered element becomes the containing block for fixed children, and
  // the model menu and attachment sheet open out of this shell.
  const block = css.slice(css.indexOf("#malik-root .malik-composer-panel"))
  assert.doesNotMatch(block, /malik-composer-panel[^{]*\{[^}]*grayscale/)
  assert.match(css, /#malik-root \.malik-composer-panel::before/)
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /rgba\(\s*(?:177|201|228|232|243)\s*,/)
})

check("no overlay or drawer is filtered, so nothing fixed gets re-anchored", () => {
  for (const portal of ["sources-drawer", "attachment-menu", "-backdrop", "-layer"]) {
    assert.ok(!css.includes(portal), `filtering ${portal} would tear the overlay off the viewport`)
  }
})

check("grey type is grey to the pixel, not fringed by subpixel rendering", () => {
  assert.match(css, /#malik-root,\s*\n#malik-root \* \{[^}]*-webkit-font-smoothing: antialiased/)
  assert.match(css, /-moz-osx-font-smoothing: grayscale/)
})

check("the chat uses neutral greys, never Tailwind's blue-tinted slate", () => {
  // slate-600 is rgb(71, 85, 105): a grey with 34 points of blue in it.
  assert.doesNotMatch(view, /\b(?:text|bg|border)-slate-\d{2,3}\b/)
})

check("the fact panel itself is written without a single colour", () => {
  const start = view.indexOf("function FactClaimRow")
  const end = view.indexOf("function MalikActionPlanCard")
  assert.ok(start > 0 && end > start)
  const panel = view.slice(start, end)
  assert.doesNotMatch(
    panel,
    /\b(?:text|bg|border|ring|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    "the verification panel must read the same on a grayscale screen",
  )
})

console.log(failures ? `\n${failures} check(s) failed\n` : "\nchat monochrome: all checks passed\n")
process.exit(failures ? 1 : 0)
