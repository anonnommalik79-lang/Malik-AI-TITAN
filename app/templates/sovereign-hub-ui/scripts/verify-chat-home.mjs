import assert from "node:assert/strict"
import fs from "node:fs"

/**
 * The chat home on the cosmos artwork: the monochrome picture behind the
 * whole main column, «Malik AI» with its tagline (desktop) or motto (phone),
 * and a composer with real mode chips. The browser walkthrough (desktop,
 * laptop, phone) is run separately; these checks keep the wiring in place.
 */

let failures = 0
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`) } catch (error) { failures += 1; console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`) }
}
const read = (file) => fs.readFileSync(file, "utf8")
/** A selector list split on its top-level commas (not those inside :is(…)). */
function splitSelectors(list) {
  const parts = []
  let depth = 0, current = ""
  for (const char of list) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue }
    current += char
  }
  return [...parts, current].filter((part) => part.trim())
}
const home = read("components/sovereign/hybrid/MalikHybridHome.tsx")
const css = read("app/malik-cosmos-home.css")

check("both artworks ship as small WebP files", () => {
  for (const file of ["public/backgrounds/malik-chat-desktop.webp", "public/backgrounds/malik-chat-mobile.webp"]) {
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", file)
    assert.ok(bytes.length < 400_000, `${file} is ${bytes.length} bytes`)
  }
})

check("the words are real text, not painted into a picture", () => {
  assert.match(home, /<h1 aria-label="Malik AI">/)
  assert.match(home, /Ваш универсальный ИИ-ассистент/)
  assert.match(home, /Задавайте любые вопросы, получайте идеи, тексты, изображения, анализ, решения и многое другое\./)
  assert.match(home, /<span>More than AI<\/span><span>A brighter tomorrow<\/span>/)
})

check("every chip does something real", () => {
  assert.match(home, /aria-pressed=\{webOn\} onClick=\{onToggleWeb\}/)
  assert.match(home, /aria-pressed=\{deepOn\} onClick=\{onToggleDeep\}/)
  assert.match(home, /onClick=\{onOpenCode\}/)
  assert.match(home, /onClick=\{onCreateImage\}/)
  assert.match(home, /onClick=\{onOpenVideo\}/)
  assert.match(home, /onClick=\{onOpenMusic\}/)
  assert.match(home, /onSourcePlugin\?\.\(plugin\.prompt\)/)
  assert.match(home, /role="menuitemcheckbox" aria-checked=\{memoryOn\}/)
  // Deep analysis needs the web.
  assert.match(home, /if \(next\) setWebOn\(true\)/)
  assert.match(read("components/sovereign/dashboard.tsx"), /onOpenMusic=\{\(\) => safeOpenView\(currentPlan === "pro"/)
})

check("the artwork is shown only while the home is on screen", () => {
  assert.match(home, /root\.dataset\.malikChatHome = "1"/)
  assert.match(home, /delete root\.dataset\.malikChatHome/)
  for (const rule of css.split("}").filter((part) => part.includes("{") && !part.trim().startsWith("@") && !part.includes("/*"))) {
    const selector = rule.split("{")[0].trim()
    if (!selector || selector.startsWith("@media")) continue
    for (const part of splitSelectors(selector)) {
      assert.match(part.trim(), /^html\[data-malik-chat-home="1"\] body:has\(#malik-root\) #malik-root/, `unscoped: ${part.trim().slice(0, 80)}`)
    }
  }
  assert.match(css, /malik-chat-desktop\.webp/)
  assert.match(css, /@media \(max-width: 767px\) \{[^@]*malik-chat-mobile\.webp/s)
  // The old picture's invisible hotspots never sit over the new artwork.
  assert.match(css, /\.thome-mobile-story-actions, \.thome-mobile-quick-actions/)
})

check("the stylesheet loads after the other home sheets and before the monochrome pass", () => {
  const layout = read("app/layout.tsx")
  const imports = [...layout.matchAll(/^import "\.\/([^"]+\.css)"/gm)].map((match) => match[1])
  assert.equal(imports.at(-1), "chat-monochrome-final.css")
  assert.equal(imports.at(-2), "malik-cosmos-home.css")
})

console.log(failures ? `\n${failures} failing\n` : "\nall chat home checks passed\n")
process.exit(failures ? 1 : 0)
