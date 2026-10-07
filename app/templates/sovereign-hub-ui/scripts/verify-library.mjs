import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")
let failures = 0
const check = (label, fn) => {
  try { fn(); console.log("PASS", label) }
  catch (error) { failures += 1; console.error("FAIL", label, error?.message || error) }
}

const dashboard = read("components/sovereign/dashboard.tsx")
const sidebar = read("components/sovereign/sidebar.tsx")
const sites = read("components/sovereign/website-generation/WebsiteGenerationStudio.tsx")
const builder = read("lib/website/site-template-builder.ts")

check("Library is conversation history, not a site gallery", () => {
  assert.match(dashboard, /activeView === "templates"[\s\S]{0,500}<ChatsListView chats=\{chats\}[\s\S]{0,160}libraryMode/)
  assert.doesNotMatch(dashboard, /SiteLibraryPanel/)
  assert.match(dashboard, /data-malik-library-history/)
  assert.match(dashboard, /Вся история Chat и Malik Work/)
})

check("Library is free in the sidebar", () => {
  const action = /\{ id: "library"[^\n]+\}/.exec(sidebar)?.[0] || ""
  assert.ok(action, "Library sidebar action is missing")
  assert.match(action, /icon: History/)
  assert.doesNotMatch(action, /PRO|requiresPro/)
})

check("Library reuses existing chat state and creates no Render cache", () => {
  const start = dashboard.indexOf("function ChatsListView(")
  const end = dashboard.indexOf("// =========================================================================", start)
  const view = dashboard.slice(start, end)
  assert.match(view, /chats: Chat\[\]/)
  assert.match(view, /chat\.messages\.some/)
  assert.match(view, /visibleCount/)
  assert.doesNotMatch(view, /fetch\(|clientFetchWithTimeout|\/api\//)
  assert.doesNotMatch(view, /localStorage|sessionStorage/)
  assert.doesNotMatch(view, /base64|thumbnailUrl|posterUrl|<img|<video/)
})

check("the obsolete hundred-site Library is physically gone", () => {
  assert.equal(fs.existsSync("components/sovereign/library/SiteLibraryPanel.tsx"), false)
  assert.equal(fs.existsSync("lib/library/site-library.ts"), false)
  assert.equal(fs.existsSync("public/library"), false)
  assert.equal(fs.existsSync("app/visual-test/library/page.tsx"), false)
})

check("Sites keeps its own builder and is otherwise untouched", () => {
  assert.match(sites, /@\/lib\/website\/site-template-builder/)
  assert.match(sites, /buildTemplateSite/)
  assert.match(builder, /export function buildTemplateSite/)
  assert.doesNotMatch(builder, /LIBRARY_TEMPLATES|LIBRARY_CATEGORIES|buildLibrarySite|const ROWS/)
  assert.match(builder, /\/sites\/gallery\/apple-experience\.webp/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall lightweight Library checks passed\n")
process.exit(failures ? 1 : 0)
