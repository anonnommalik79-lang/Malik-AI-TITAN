import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import postcss from "postcss"

// Component-handler tests with mocked React hooks, not a browser/layout test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const storage = new Map()
let width = 390, states = [], cursor = 0, selectedModelId = "malik-20b", plan = "free"
globalThis.window = {
  matchMedia: (query) => {
    assert.equal(query, "(max-width: 768px)")
    return { matches: width <= 768 }
  },
  localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
}
globalThis.document = { body: {}, cookie: "" }
const element = (type, props) => ({ type, props })
function DesktopPhotoSelector() {}
const stubs = {
  react: {
    useState: (initial) => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    },
    useEffect() {},
    useRef: () => ({ current: null }),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  },
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "react-dom": { createPortal: (children) => element("portal", { children }) },
  "lucide-react": new Proxy({}, { get: (_target, name) => `icon-${String(name)}` }),
  "./MalikImageModelSelector": { MalikImageModelSelector: DesktopPhotoSelector },
}
function load(relativePath) {
  const module = { exports: {} }
  const source = fs.readFileSync(path.join(root, relativePath), "utf8")
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const require = (name) => {
    if (name in stubs) return stubs[name]
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts")
    throw new Error(`Unexpected import: ${name}`)
  }
  new Function("require", "module", "exports", js)(require, module, module.exports)
  return module.exports
}
const { MalikModelSelector } = load("components/sovereign/MalikModelSelector.tsx")
const render = () => {
  cursor = 0
  return MalikModelSelector({ selectedModelId, plan, onSelect: (id) => { selectedModelId = id } })
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== "object") return []
  return [tree, ...nodes(tree.props?.children)]
}
const find = (tree, predicate) => {
  const found = nodes(tree).find(predicate)
  assert.ok(found, "Expected selector element")
  return found
}
const clickTrigger = (tree) => find(tree, (node) => node.props?.className === "malik-model-selector__trigger").props.onClick()
const clickPhoto = (tree) => find(tree, (node) => node.type === "button" && node.props["aria-pressed"] !== undefined && node.props.children?.includes(" Фото")).props.onClick()
const chooseRow = (tree, id) => find(tree, (node) => node.props?.model?.id === id).props.onChoose()
const hasDesktopPhoto = (tree) => nodes(tree).some((node) => node.type === DesktopPhotoSelector)
const reset = (newWidth, newPlan = "free") => {
  width = newWidth; states = []; storage.clear(); plan = newPlan; selectedModelId = "malik-20b"
}

for (const viewport of [320, 375, 390, 430, 680, 768, 769, 1024, 1440]) {
  reset(viewport)
  assert.equal(hasDesktopPhoto(render()), viewport > 768, `Standalone photo at ${viewport}px`)
}
console.log("PASS mobile-only combined selector; desktop keeps the separate photo control")

reset(390)
clickTrigger(render())
clickPhoto(render())
chooseRow(render(), "leonardo-lucid")
assert.equal(storage.get("malik_image_model_v1"), "leonardo-lucid")
assert.equal(storage.get("malik_image_mode_v1"), "1")
assert.match(document.cookie, /malik_image_model_v1=leonardo-lucid/)
assert.equal(find(render(), (n) => n.props?.className === "malik-model-selector__trigger").props["aria-expanded"], false)
clickTrigger(render())
assert.equal(find(render(), (n) => n.props?.model?.id === "leonardo-lucid").props.selected, true)
find(render(), (n) => n.type === "button" && n.props["aria-pressed"] !== undefined && n.props.children?.includes(" Модели")).props.onClick()
chooseRow(render(), "malik-fast-120b")
assert.equal(storage.get("malik_image_mode_v1"), "0")
assert.equal(selectedModelId, "malik-fast-120b")
console.log("PASS photo selection persists, reopens on photo, and switching to text disables photo mode")

for (const userPlan of ["free", "pro"]) {
  reset(390, userPlan)
  clickTrigger(render()); clickPhoto(render()); chooseRow(render(), "malik-image-1-premium")
  assert.equal(storage.get("malik_image_mode_v1") === "1", userPlan === "pro")
  assert.equal(nodes(render()).some((n) => n.props?.role === "dialog"), userPlan === "free")
}
console.log("PASS photo Free/Plus access rules are preserved")

reset(1440)
const photo = find(render(), (n) => n.type === DesktopPhotoSelector)
photo.props.onSelect("flux-schnell"); photo.props.onActiveChange(true)
clickTrigger(render())
assert.equal(nodes(render()).some((n) => n.props?.["aria-label"] === "Тип модели"), false)
assert.equal(nodes(render()).some((n) => n.props?.model?.id === "flux-schnell"), false)
chooseRow(render(), "malik-27b")
assert.equal(storage.get("malik_image_mode_v1"), "1", "Desktop photo state stays independent")
width = 390
assert.equal(hasDesktopPhoto(render()), false)
clickTrigger(render())
assert.equal(find(render(), (n) => n.props?.model?.id === "flux-schnell").props.selected, true)
width = 1440
assert.equal(hasDesktopPhoto(render()), true)
assert.equal(nodes(render()).some((n) => n.props?.["aria-label"] === "Тип модели"), false)
console.log("PASS desktop layout and mode remain independent; resizing preserves the chosen photo model")

const css = postcss.parse(fs.readFileSync(path.join(root, "app/malik-mobile-worldclass.css"), "utf8"))
for (const className of ["thome-composer-right", "malik-inline-composer__right"]) {
  const rule = css.nodes.flatMap((node) => node.nodes ?? []).find((node) => node.selector === `#malik-root .malik-dashboard-shell .${className}`)
  assert.equal(rule.parent.params, "(max-width: 768px)")
  const declarations = Object.fromEntries(rule.nodes.map((node) => [node.prop, node.value]))
  assert.equal(declarations.display, "grid")
  assert.equal(declarations["grid-template-columns"], "minmax(0, 1fr) 40px")
  assert.equal(declarations["min-width"], "0")
}
console.log("PASS both composer action rows reserve 40px for send under the mobile breakpoint only")
