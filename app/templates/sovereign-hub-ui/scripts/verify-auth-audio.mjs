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
    location: { assign() {} },
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

console.log("PASS auth screen: silent typewriter types, never fans out, and clears every timer on unmount")
