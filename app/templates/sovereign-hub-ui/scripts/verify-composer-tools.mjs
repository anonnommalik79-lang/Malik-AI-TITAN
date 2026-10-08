// MALIK COMPOSER TOOLS — the «+» menu model, folder upload and drawing pad.
//
// Offline and deterministic. The menu, chips, drawing and library in a real
// browser are covered by verify-composer-tools-live.mjs.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }
  cache.set(absolute, box)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    fileName: absolute,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name.endsWith(".css")) return {}
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      const found = [base, base + ".ts", base + ".tsx"].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!found) throw new Error(`cannot resolve ${name} from ${file}`)
      return load(found)
    }
    return require(name)
  }, box, box.exports)
  return box.exports
}

let checks = 0
async function check(name, run) {
  await run()
  checks += 1
  console.log(`  ok  ${name}`)
}

const model = load("components/sovereign/composer-tools/model.ts")
const folder = load("lib/uploads/folder-digest.ts")
const drawing = load("components/sovereign/drawing/drawing-model.ts")

console.log("\nComposer tools: menu")

await check("arrows wrap, skip disabled rows, Home/End go to the ends", async () => {
  const off = [false, true, false, false, true]
  assert.equal(model.moveFocus(-1, "ArrowDown", off), 0)
  assert.equal(model.moveFocus(0, "ArrowDown", off), 2, "row 1 is disabled")
  assert.equal(model.moveFocus(3, "ArrowDown", off), 0, "wraps past the disabled last row")
  assert.equal(model.moveFocus(0, "ArrowUp", off), 3)
  assert.equal(model.moveFocus(-1, "ArrowUp", off), 3)
  assert.equal(model.moveFocus(2, "Home", off), 0)
  assert.equal(model.moveFocus(0, "End", off), 3)
  assert.equal(model.moveFocus(2, "x", off), 2)
  assert.equal(model.moveFocus(0, "ArrowDown", [true, true]), -1)
})

await check("typing a letter jumps to the next row starting with it (Cyrillic too)", async () => {
  const labels = ["Фото и файлы", "Папка", "Из библиотеки", "Нарисовать", "Создать изображение", "Поиск в сети", "Глубокое исследование", "GitHub", "Gmail"]
  const off = labels.map(() => false)
  assert.equal(model.typeahead(labels, off, -1, "п"), 1)
  assert.equal(model.typeahead(labels, off, 1, "п"), 5, "the next one after the current")
  assert.equal(model.typeahead(labels, off, 0, "gm"), 8)
  assert.equal(model.typeahead(labels, off, 0, "я"), -1)
})

await check("every menu row has a label and a description, in four groups", async () => {
  const ids = model.TOOL_GROUPS.flatMap((group) => group.items)
  assert.deepEqual(ids, ["upload", "folder", "library", "draw", "image", "web", "deep", "github", "gmail"])
  for (const id of ids) assert.ok(model.TOOL_TEXT[id].label && model.TOOL_TEXT[id].description, id)
})

await check("connection states read as words and lead to the right action", async () => {
  const cases = [
    ["connected", "Подключено", "ok", "activate", false],
    ["available", "Подключить", "action", "connect", false],
    ["reauthorize", "Переподключить", "warn", "connect", false],
    ["sign_in", "Войдите", "action", "sign-in", false],
    ["unavailable", "Не настроено", "muted", "none", true],
    ["error", "Подключить", "action", "connect", false],
  ]
  for (const [state, text, tone, action, disabled] of cases) {
    const badge = model.connectorBadge({ state })
    assert.equal(badge.text, text, state)
    assert.equal(badge.tone, tone, state)
    assert.equal(badge.disabled, disabled, state)
    assert.equal(model.connectorAction({ state }), action, state)
  }
  assert.match(model.connectorBadge({ state: "connected", account: "malik@gmail.com" }).hint, /malik@gmail\.com/u)
})

await check("switch rows report their state; plain rows are not switches", async () => {
  assert.equal(model.toolChecked("web", "web", null), true)
  assert.equal(model.toolChecked("deep", "web", null), false)
  assert.equal(model.toolChecked("github", "off", "github"), true)
  assert.equal(model.toolChecked("gmail", "off", "github"), false)
  assert.equal(model.toolChecked("upload", "web", "github"), null)
})

await check("a chosen connection prefixes /plugin once, never twice", async () => {
  assert.equal(model.withConnector("мои PR", "github"), "/plugin github мои PR")
  assert.equal(model.withConnector("  письма  ", "gmail"), "/plugin gmail письма")
  assert.equal(model.withConnector("", "gmail"), "/plugin gmail")
  assert.equal(model.withConnector("/plugin notion заметки", "github"), "/plugin notion заметки")
  assert.equal(model.withConnector("обычный вопрос", null), "обычный вопрос")
})

await check("a sent /plugin message splits into the connection and the words", async () => {
  assert.deepEqual(model.splitPluginCommand("/plugin github мои репозитории"), { plugin: "github", rest: "мои репозитории" })
  assert.deepEqual(model.splitPluginCommand("/plugin GMAIL"), { plugin: "gmail", rest: "" })
  assert.equal(model.splitPluginCommand("как дела /plugin github"), null)
  assert.equal(model.splitPluginCommand("/plugins github"), null)
})

await check("returning from OAuth switches on only the connection this tab asked for", async () => {
  const base = "https://malikaiworld.world/dashboard"
  assert.deepEqual(model.readConnectorReturn(`${base}?plugin=github&plugin_status=connected`, "github"), { connector: "github", ok: true })
  assert.deepEqual(model.readConnectorReturn(`${base}?plugin=gmail&plugin_status=error`, "gmail"), { connector: "gmail", ok: false })
  assert.equal(model.readConnectorReturn(`${base}?plugin=github&plugin_status=connected`, "gmail"), null)
  assert.equal(model.readConnectorReturn(`${base}?plugin=github&plugin_status=connected`, null), null)
  assert.equal(model.readConnectorReturn(`${base}?plugin=github`, "github"), null)
  assert.equal(model.readConnectorReturn("not a url", "github"), null)
})

await check("the field's hint follows the mode", async () => {
  assert.match(model.composerPlaceholder("База", "off", "github"), /репозитори/u)
  assert.match(model.composerPlaceholder("База", "web", "gmail"), /почте/u, "a connection wins over a mode")
  assert.match(model.composerPlaceholder("База", "deep", null), /исследовать/u)
  assert.match(model.composerPlaceholder("База", "web", null), /интернете/u)
  assert.equal(model.composerPlaceholder("База", "off", null), "База")
})

await check("a chat started through a connection gets a readable title", async () => {
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  assert.match(dashboard, /const pluginTurn = splitPluginCommand\(cleanContent\)/u)
  assert.match(dashboard, /getMalikPlugin\(pluginTurn\.plugin\)\?\.name/u)
})

console.log("\nComposer tools: folder")

const entry = (filePath, size = 100, type = "") => ({ path: filePath, size, type })

await check("service folders, lock files, minified bundles and secrets stay on the computer", async () => {
  const plan = folder.planFolder([
    entry("app/.git/config"), entry("app/node_modules/react/index.js"), entry("app/dist/main.js"), entry("app/.next/cache.json"),
    entry("app/package-lock.json"), entry("app/.DS_Store"), entry("app/public/app.min.js"), entry("app/src/app.js.map"),
    entry("app/.env"), entry("app/.env.local"), entry("app/config/prod.env"), entry("app/keys/server.pem"), entry("app/id_rsa"), entry("app/credentials.json"), entry("app/.npmrc"),
    entry("app/.env.example"), entry("app/README.md"), entry("app/package.json"), entry("app/src/index.ts"), entry("app/src/deep/util.ts"),
    entry("app/docs/plan.pdf", 2000, "application/pdf"), entry("app/img/logo.png", 3000, "image/png"), entry("app/bin/tool.exe", 9000),
    entry("app/data/huge.json", 5_000_000),
  ])
  assert.equal(plan.folderName, "app")
  assert.deepEqual(plan.text.map((item) => item.path), ["app/README.md", "app/package.json", "app/.env.example", "app/src/index.ts", "app/src/deep/util.ts"], "README first, then the manifest, then by depth")
  assert.deepEqual(plan.media.map((item) => item.path), ["app/docs/plan.pdf", "app/img/logo.png"])
  assert.deepEqual(plan.skipped, { service: 8, secrets: 7, tooLarge: 1, unsupported: 1 })
})

await check("the tree lists folders before files, indented", async () => {
  const tree = folder.folderTree(["src/b.ts", "README.md", "src/a/x.ts", "docs/plan.md"])
  assert.equal(tree, ["docs/", "  plan.md", "src/", "  a/", "    x.ts", "  b.ts", "README.md"].join("\n"))
  assert.match(folder.folderTree(Array.from({ length: 20 }, (_, at) => `f${String(at).padStart(2, "0")}.txt`), 5), /… и ещё 15$/u)
})

await check("a file that contains ``` can never break the document's fences", async () => {
  const digest = folder.buildFolderDigest("app", [{ path: "app/README.md", text: "Пример:\n```js\nconsole.log(1)\n```\n" }], ["app/README.md"])
  assert.match(digest.markdown, /## Файлы\n\n### README\.md\n\n````markdown\nПример:\n```js/u)
  assert.match(digest.markdown, /\n````\n/u)
  assert.match(digest.markdown, /# Папка «app»/u)
  assert.match(digest.markdown, /## Структура\n\n```\napp\/\n  README\.md\n```/u)
})

await check("the document keeps to its budget and lists what did not fit", async () => {
  const files = Array.from({ length: 5 }, (_, at) => ({ path: `app/f${at}.ts`, text: "x".repeat(400) }))
  const digest = folder.buildFolderDigest("app", files, files.map((file) => file.path), { digestChars: 1500, perFileChars: 300 })
  assert.ok(digest.markdown.length <= 1500 + 200)
  assert.ok(digest.included.length >= 1 && digest.omitted.length >= 1)
  assert.deepEqual(digest.truncated, digest.included, "each file was longer than 300 characters")
  assert.match(digest.markdown, /Файл обрезан/u)
  assert.match(digest.markdown, /## Не поместились в документ\n\n(?:- f\d\.ts\n)+$/u)
  assert.equal(digest.omitted.at(-1), "f4.ts")
})

await check("a picked folder becomes one document plus photos, with a plain summary", async () => {
  const make = (relative, text, type = "text/plain") => {
    const file = new File([text], relative.split("/").pop(), { type })
    Object.defineProperty(file, "webkitRelativePath", { value: relative })
    return file
  }
  const files = [
    make("shop/README.md", "# Магазин\n"),
    make("shop/src/cart.ts", "export const total = 1\n"),
    make("shop/node_modules/x/index.js", "junk"),
    make("shop/.env", "SECRET=1"),
    make("shop/assets/a.png", "png", "image/png"),
    make("shop/assets/b.png", "png", "image/png"),
    make("shop/assets/c.png", "png", "image/png"),
    make("shop/src/blob.ts", "abc\u0000def"),
  ]
  const prepared = await folder.prepareFolder(files, 3)
  assert.equal(prepared.error, "")
  assert.equal(prepared.document.name, "shop.md")
  assert.match(prepared.document.text, /### src\/cart\.ts/u)
  assert.ok(!prepared.document.text.includes("SECRET"), "secrets never reach the document")
  assert.ok(!prepared.document.text.includes("junk"))
  assert.equal(prepared.media.length, 2, "one slot went to the document")
  assert.equal(prepared.notice, "Папка «shop»: 2 файла в одном документе, 2 вложения. Пропущено: 1 служебных, 1 с ключами и паролями, 1 неподдерживаемых, 1 фото и файлов сверх лимита вложений.")
})

await check("an empty or unreadable folder says so instead of attaching nothing", async () => {
  const file = new File(["x"], "tool.exe")
  Object.defineProperty(file, "webkitRelativePath", { value: "bin/tool.exe" })
  const prepared = await folder.prepareFolder([file], 5)
  assert.equal(prepared.document, null)
  assert.match(prepared.error, /В папке «bin» нет файлов, которые Malik AI может прочитать/u)
  assert.match((await folder.prepareFolder([file], 0)).error, /лимит вложений/u)
})

console.log("\nComposer tools: drawing")

const stroke = (tool = "pen") => ({ tool, color: "#111111", size: 9, points: [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 0, p: 0.5 }] })

await check("undo, redo and clear form one history", async () => {
  let history = drawing.emptyHistory()
  history = drawing.pushAction(history, { kind: "stroke", stroke: stroke() })
  history = drawing.pushAction(history, { kind: "stroke", stroke: stroke() })
  assert.equal(drawing.visibleStrokes(history.done).length, 2)
  history = drawing.pushAction(history, { kind: "clear" })
  assert.equal(drawing.visibleStrokes(history.done).length, 0)
  assert.equal(drawing.hasInk(history), false)
  history = drawing.undoAction(history)
  assert.equal(drawing.visibleStrokes(history.done).length, 2, "a clear can be undone")
  history = drawing.redoAction(history)
  assert.equal(drawing.visibleStrokes(history.done).length, 0)
  history = drawing.undoAction(drawing.undoAction(history))
  history = drawing.pushAction(history, { kind: "stroke", stroke: stroke() })
  assert.equal(history.undone.length, 0, "a new stroke drops the redo stack")
  assert.equal(drawing.undoAction(drawing.emptyHistory()).done.length, 0)
})

await check("eraser-only marks do not count as a drawing; history is bounded", async () => {
  let history = drawing.pushAction(drawing.emptyHistory(), { kind: "stroke", stroke: stroke("eraser") })
  assert.equal(drawing.hasInk(history), false)
  history = drawing.pushAction(history, { kind: "stroke", stroke: stroke("marker") })
  assert.equal(drawing.hasInk(history), true)
  for (let at = 0; at < drawing.HISTORY_LIMIT + 50; at++) history = drawing.pushAction(history, { kind: "stroke", stroke: stroke() })
  assert.equal(history.done.length, drawing.HISTORY_LIMIT)
})

await check("lines are smoothed through midpoints; samples too close are dropped", async () => {
  const points = [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 0, p: 0.5 }, { x: 20, y: 10, p: 0.5 }, { x: 30, y: 10, p: 0.5 }]
  const segments = drawing.smoothSegments(points)
  assert.equal(segments.length, 3)
  assert.deepEqual(segments[0].to, { x: 15, y: 5, p: 0.5 })
  assert.deepEqual(segments.at(-1).to, points.at(-1))
  assert.deepEqual(drawing.smoothSegments([points[0]]), [])
  const kept = drawing.addPoint([{ x: 0, y: 0, p: 0.5 }], { x: 1, y: 0, p: 0.5 })
  assert.equal(kept.length, 1)
  assert.equal(drawing.addPoint(kept, { x: 3, y: 0, p: 0.5 }).length, 2)
})

await check("a stylus changes the pen width; marker and eraser are wider", async () => {
  assert.ok(drawing.strokeWidth("pen", 9, 1) > drawing.strokeWidth("pen", 9, 0.1))
  assert.equal(drawing.strokeWidth("pen", 9, 0), drawing.strokeWidth("pen", 9, 0.5), "no pressure = a mouse")
  assert.ok(drawing.strokeWidth("marker", 9) > drawing.strokeWidth("pen", 9, 1))
  assert.ok(drawing.strokeWidth("eraser", 9) > drawing.strokeWidth("marker", 9))
})

await check("a photo under the drawing is whole and centred", async () => {
  assert.deepEqual(drawing.fitContain(800, 800, 1600, 1000), { x: 300, y: 0, width: 1000, height: 1000 })
  assert.deepEqual(drawing.fitContain(3200, 1000, 1600, 1000), { x: 0, y: 250, width: 1600, height: 500 })
  assert.deepEqual(drawing.fitContain(0, 0, 1600, 1000), { x: 0, y: 0, width: 1600, height: 1000 })
  assert.match(drawing.drawingFileName(new Date(2026, 9, 9, 1, 2, 3)), /^malik-drawing-20261009-010203\.png$/u)
})

console.log("\nComposer tools: black and white")

await check("the menu, chips, library, drawing pad and image studio use no colour", async () => {
  const files = [
    "components/sovereign/composer-tools/composer-tools.css",
    "components/sovereign/composer-tools/library-picker.css",
    "components/sovereign/drawing/drawing-pad.css",
    "components/sovereign/image-studio/image-studio.css",
    "components/sovereign/drawing/drawing-model.ts",
  ]
  const channels = (value) => {
    const hex = /^#([0-9a-f]{3,8})$/iu.exec(value)?.[1]
    if (hex) {
      const full = hex.length <= 4 ? hex.split("").map((digit) => digit + digit).join("") : hex
      return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16))
    }
    return value.match(/\d+(?:\.\d+)?/gu).slice(0, 3).map(Number)
  }
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8")
    for (const value of source.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/giu) || []) {
      const [r, g, b] = channels(value)
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 12, `${file}: ${value} is a colour`)
    }
  }
  const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
  assert.ok(!/localError && <div className="[^"]*(?:red|rose|amber)-/u.test(chat), "the composer's error line is black and white")
})

console.log(`\n${checks} composer-tool checks passed`)
