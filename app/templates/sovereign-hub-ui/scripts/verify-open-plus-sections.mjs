import assert from "node:assert/strict"
import fs from "node:fs"

const read = (file) => fs.readFileSync(file, "utf8")
const sidebar = read("components/sovereign/sidebar.tsx")
const dashboard = read("components/sovereign/dashboard.tsx")
const music = read("components/sovereign/music-generation/MusicGenerationStudio.tsx")
const projects = read("components/sovereign/projects/ProjectsWorkspace.tsx")
const business = read("components/sovereign/business/AutonomousCompany.tsx")
const musicApi = read("app/api/media/music/route.ts")
const shorts = read("app/shorts/ShortsPage.tsx")

for (const id of ["projects", "music-generation", "business-autonomous", "shorts"]) {
  const item = sidebar.split("\n").find((line) => line.includes(`id: "${id}"`))
  assert.ok(item, `Missing sidebar action: ${id}`)
  assert.doesNotMatch(item, /requiresPro/, `Must enter before paying: ${id}`)
}
assert.doesNotMatch(sidebar, /action\.requiresPro/)
assert.match(dashboard, /return <MusicGenerationStudio username=\{username\} plan=\{currentPlan\}/)
assert.doesNotMatch(dashboard, /activeView === "music-generation"[\s\S]{0,220}return <SovereignBillingPanel/)
assert.doesNotMatch(dashboard, /activeView === "projects"[\s\S]{0,220}return <SovereignBillingPanel/)
assert.match(dashboard, /onOpenMusic=\{\(\) => safeOpenView\("music-generation", "welcome"\)\}/)
assert.match(dashboard, /renderProjectChat=\{\(requirePro\)/)
assert.match(projects, /if \(!hasMalikProAccess\(plan\)\)/)
assert.match(projects, /renderProjectChat\(requirePro\)/)
assert.match(music, /if \(!proAccess\) \{[\s\S]{0,100}setUpgradeOpen\(true\)/)
assert.match(musicApi, /code: "MALIK_PRO_REQUIRED".*status: 402/)
assert.doesNotMatch(shorts, /redirect\(.*sign-in/)
assert.match(business, /if \(!requirePro\(\)\) return\s*const brief/)
assert.doesNotMatch(business, /applyTemplate[\s\S]{0,140}if \(!requirePro\(\)\) return/)
assert.doesNotMatch(business, /startCustom[\s\S]{0,140}if \(!requirePro\(\)\) return/)
console.log("PASS: Plus previews open before upgrade; paid POSTs and actions are gated; Shorts public browsing")
