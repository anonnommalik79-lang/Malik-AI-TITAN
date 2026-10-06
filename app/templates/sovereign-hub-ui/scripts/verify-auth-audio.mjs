import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * The typewriter on the mobile sign-in screen.
 *
 * This file used to guard a typing SOUND: an AudioContext opened on entry,
 * unlocked by the first gesture when autoplay was blocked, suspended on
 * visibilitychange and closed on unmount. That feature was removed with the
 * screen it belonged to (7be8f2f "Replace mobile guest sign-in with Microsoft")
 * and there is no audio anywhere on /auth any more, so the old assertions were
 * guarding nothing and failing on the first line.
 *
 * What the screen still promises is the silent typewriter, and the property
 * that matters about it is the one that used to leak: every timer it starts
 * must be cleared when the component goes away. A phone that leaves this page
 * with a chain of setTimeouts still running keeps waking the CPU.
 */

const source = fs.readFileSync(new URL("../components/sovereign/SovereignMobileRegister.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount() {
  const effects = []
  const timers = new Map()
  let id = 0
  let typed = ""
  const destinations = []
  const react = {
    useCallback: (callback) => callback,
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, (value) => { if (typeof value === "string") typed = value }],
    useEffect: (effect) => effects.push(effect),
  }
  const window = {
    innerWidth: 390,
    setTimeout: (fn) => { timers.set(++id, fn); return id },
    clearTimeout: (timer) => timers.delete(timer),
    addEventListener() {},
    removeEventListener() {},
    location: { assign(path) { destinations.push(path) } },
    history: { length: 1 },
  }
  const document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }
  const navigator = { userAgent: "iPhone Mobile", vibrate() {} }
  const module = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  new Function("require", "module", "exports", "window", "document", "navigator", "Element", compiled)(
    (name) => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {},
    module, module.exports, window, document, navigator, class Element {},
  )
  const tree = module.exports.SovereignMobileRegister()
  const cleanups = effects.map((effect) => effect())
  return {
    tree,
    destinations,
    pending: () => timers.size,
    typed: () => typed,
    /** Fire the oldest scheduled callback, the way a real clock would. */
    tick: () => {
      const entry = timers.entries().next().value
      if (!entry) return false
      const [timer, callback] = entry
      timers.delete(timer)
      callback()
      return true
    },
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
  }
}

const screen = mount()
assert.ok(screen.tree, "the sign-in screen must render")
assert.equal(screen.pending(), 1, "the typewriter schedules its first letter and nothing else")

assert.equal(screen.tick(), true, "the first letter must be scheduled")
assert.ok(screen.typed().length > 0, "typing must produce visible text")
assert.equal(screen.pending(), 1, "exactly one timer stays in flight while typing")

for (let step = 0; step < 12; step += 1) screen.tick()
assert.ok(screen.typed().length > 0, "the phrase keeps filling in")
assert.ok(screen.pending() <= 1, "the typewriter must never fan out into parallel timers")

screen.cleanup()
assert.equal(screen.pending(), 0, "unmount must clear every scheduled timer")
assert.equal(screen.tick(), false, "nothing may still be scheduled after unmount")

// And the removed feature must not creep back in unnoticed.
assert.equal(/AudioContext|createOscillator|webkitAudioContext/.test(source), false,
  "the sign-in screen is silent - add real tests here before adding sound back")

function buttons(node) {
  if (Array.isArray(node)) return node.flatMap(buttons)
  if (!node?.props) return []
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props.children)]
}
const actions = mount()
for (const button of buttons(actions.tree)) button.props.onClick()
assert.deepEqual(actions.destinations, [
  "/guest?feature=chat", "/guest?feature=images", "/guest?feature=video", "/guest?feature=music", "/guest?feature=work",
  "/sign-in?provider=google", "/sign-in?provider=apple", "/sign-in?provider=microsoft", "/sign-in?provider=email", "/guest",
], "every visible feature and sign-in control must navigate to its own destination")
actions.cleanup()

const entrySource = fs.readFileSync(new URL("../lib/auth/entry-target.ts", import.meta.url), "utf8")
const entryModule = { exports: {} }
new Function("module", "exports", ts.transpileModule(entrySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(entryModule, entryModule.exports)
const { guestEntryPath, dashboardEntry, selectSignInProvider } = entryModule.exports
const hosted = "https://api.workos.com/user_management/authorize?provider=authkit&screen_hint=sign-in&client_id=client_test&state=sealed%2Bstate&redirect_uri=https%3A%2F%2Fmalikaiworld.world%2Fcallback&code_challenge=challenge&code_challenge_method=S256"
for (const [input, provider] of [["google", "GoogleOAuth"], ["apple", "AppleOAuth"], ["microsoft", "MicrosoftOAuth"]]) {
  const url = new URL(selectSignInProvider(hosted, input))
  assert.equal(url.searchParams.get("provider"), provider)
  assert.equal(url.searchParams.has("screen_hint"), false)
  for (const key of ["client_id", "state", "redirect_uri", "code_challenge", "code_challenge_method"]) {
    assert.equal(url.searchParams.get(key), new URL(hosted).searchParams.get(key), `${input} preserves ${key}`)
  }
}
for (const input of ["email", null, "unknown", "https://evil.example/"]) assert.equal(selectSignInProvider(hosted, input), hosted)
for (const input of [null, "unknown", "//evil.example", ["work"], "work&redirect=https://evil.example"]) {
  assert.equal(guestEntryPath(input), "/dashboard", "unsupported feature values cannot redirect off site")
  assert.deepEqual(dashboardEntry(input), { initialView: "home" })
}
for (const [feature, view] of [["chat", "home"], ["images", "photo-generation"], ["video", "video-generation"], ["music", "music-generation"], ["work", "home"]]) {
  assert.equal(guestEntryPath(feature), `/dashboard?feature=${feature}`)
  assert.deepEqual(dashboardEntry(feature), { initialView: view, initialWorkspaceMode: feature === "work" ? "work" : "chat" })
}

console.log("PASS auth screen: typewriter lifecycle, all ten controls, provider PKCE preservation, and safe feature destinations")
