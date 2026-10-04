import assert from "node:assert/strict"
import fs from "node:fs"

/**
 * The Malik Work start screen: monochrome artwork behind the whole main
 * column, the mark, «Malik Work», «Над чем поработаем?», six task cards that
 * only prefill the composer, and the sidebar entries «Задачи» and «Malik Work».
 * The browser walkthrough (desktop, laptop, phone) is done separately; these
 * checks keep the wiring from silently disappearing.
 */

let failures = 0
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`) } catch (error) { failures += 1; console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`) }
}
const read = (file) => fs.readFileSync(file, "utf8")

check("both artworks ship as small WebP files", () => {
  for (const file of ["public/backgrounds/malik-work-desktop.webp", "public/backgrounds/malik-work-mobile.webp"]) {
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", file)
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", file)
    assert.ok(bytes.length < 400_000, `${file} is ${bytes.length} bytes`)
  }
})

check("the artwork is shown only on the empty Work task, phone and desktop each get theirs", () => {
  const css = read("app/workspace-mode.css")
  assert.match(css, /html\[data-malik-work-home="1"\][^{]*\.malik-main-column \{[^}]*malik-work-desktop\.webp/s)
  assert.match(css, /@media \(max-width: 767px\) \{[^@]*malik-work-mobile\.webp/s)
  // The black chat layers above the column are cleared only in that state.
  assert.match(css, /\.malik-chat-legend-bg/)
  // No filters on the composer: its fixed popovers must stay anchored.
  const composer = css.slice(css.indexOf("A smoked-glass composer"), css.indexOf(".malik-work-start {"))
  assert.doesNotMatch(composer, /(?:^|[\s;])(?:backdrop-)?filter\s*:/)
})

check("the start screen has the mark, the name, the question and six cards", () => {
  const panel = read("components/sovereign/WorkStartPanel.tsx")
  assert.match(panel, /malik-work-start__mark/)
  assert.match(panel, />Malik Work</)
  assert.match(panel, /Над чем поработаем\?/)
  for (const title of ["Документ", "Таблица", "Презентация", "Исследование", "Сайт", "Код"]) assert.match(panel, new RegExp(`title: "${title}"`))
  // A card prefills the composer; it never sends.
  assert.match(panel, /onClick=\{\(\) => onChoose\(prompt/)
})

check("the chat view flags the empty Work task and never scrolls it away", () => {
  const view = read("components/sovereign/chat-view.tsx")
  assert.match(view, /const workHome = workspaceMode === "work" && messages\.length === 0/)
  assert.match(view, /root\.dataset\.malikWorkHome = "1"/)
  assert.match(view, /if \(workHomeRef\.current\) return/)
  assert.match(view, /Фото · Видео · Файл · Документ · Сайт · Код · Анализ · Презентация/)
})

check("the sidebar has «Задачи» and «Malik Work», and both do something real", () => {
  const sidebar = read("components/sovereign/sidebar.tsx")
  assert.match(sidebar, /\{ id: "tasks", label: "Задачи", icon: ListChecks, action: "tasks" \}/)
  assert.match(sidebar, /\{ id: "work", label: "Malik Work", icon: MalikWorkIcon, action: "work", badge: "NEW" \}/)
  assert.match(sidebar, /openOs\("tasks"\)/)
  const dashboard = read("components/sovereign/dashboard.tsx")
  assert.match(dashboard, /window\.addEventListener\(MALIK_OPEN_WORK_EVENT, open\)/)
  assert.match(dashboard, /setWorkspaceMode\("work"\)/)
  assert.match(dashboard, /className="malik-main-column /)
})

console.log(failures ? `\n${failures} failing\n` : "\nall Work screen checks passed\n")
process.exit(failures ? 1 : 0)
