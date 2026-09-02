import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

const source = fs.readFileSync(new URL("../components/sovereign/SovereignMobileRegister.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount({ phone = true, autoplay = true } = {}) {
  const effects = [], contexts = [], timers = new Map(), documentEvents = new Map(), windowEvents = new Map()
  let id = 0, ticks = 0, restarts = 0, letters = ""
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} })
  const node = () => ({ connect() {}, disconnect() {}, gain: parameter(), frequency: parameter(), Q: parameter() })
  class AudioContext {
    constructor() { this.state = autoplay ? "running" : "suspended"; this.currentTime = 0; this.pending = []; this.resumes = 0; contexts.push(this) }
    createGain() { return node() }
    createBiquadFilter() { return node() }
    createDynamicsCompressor() { return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() } }
    createOscillator() { return { ...node(), start() { ticks++ }, stop() {} } }
    resume() {
      this.resumes++
      if (autoplay) { this.unlock(); return Promise.resolve() }
      return new Promise((resolve) => this.pending.push(resolve))
    }
    unlock() { this.state = "running"; this.onstatechange?.(); this.pending.splice(0).forEach((resolve) => resolve()) }
    suspend() { this.state = "suspended"; this.onstatechange?.(); return Promise.resolve() }
    close() { this.state = "closed"; this.onstatechange?.(); return Promise.resolve() }
  }
  const react = {
    useCallback: (callback) => callback,
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, (value) => {
      if (typeof value === "function") restarts++
      else if (typeof value === "string") letters = value
    }],
    useEffect: (effect) => effects.push(effect),
  }
  const window = { AudioContext, innerWidth: phone ? 390 : 1440,
    setTimeout: (fn) => { timers.set(++id, fn); return id }, clearTimeout: (timer) => timers.delete(timer),
    addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: (name) => windowEvents.delete(name),
    location: { assign() {} }, history: { length: 1 },
  }
  const document = { visibilityState: "visible", addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: (name) => documentEvents.delete(name) }
  const navigator = { userAgent: phone ? "iPhone Mobile" : "Windows Chrome", vibrate() {} }
  const module = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  new Function("require", "module", "exports", "window", "document", "navigator", "Element", compiled)(
    (name) => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {},
    module, module.exports, window, document, navigator, class Element {},
  )
  const tree = module.exports.SovereignMobileRegister()
  const cleanups = effects.map((effect) => effect())
  return { contexts, tree, document, documentEvents, windowEvents,
    stats: () => ({ ticks, restarts, letters }),
    nextLetter: () => { const [timer, callback] = timers.entries().next().value; timers.delete(timer); callback() },
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
  }
}

const allowed = mount()
assert.equal(allowed.contexts.length, 1, "Create audio on entry without a tap")
assert.equal(allowed.stats().restarts, 1, "Synchronize letters on actual start")
allowed.nextLetter()
assert.ok(allowed.stats().ticks > 0, "Allowed autoplay produces character audio nodes")
for (const name of ["onTouchStartCapture", "onPointerDownCapture", "onClickCapture"]) allowed.tree.props[name]({ target: null })
assert.equal(allowed.stats().restarts, 1, "Three events must not restart three times")
allowed.document.visibilityState = "hidden"
allowed.documentEvents.get("visibilitychange")()
assert.equal(allowed.contexts[0].state, "suspended")
allowed.document.visibilityState = "visible"
allowed.windowEvents.get("pageshow")()
assert.equal(allowed.contexts[0].state, "running")
allowed.cleanup()
assert.equal(allowed.contexts[0].state, "closed")
assert.equal(allowed.contexts[0].onstatechange, null)

const blocked = mount({ autoplay: false })
assert.equal(blocked.contexts[0].resumes, 1, "Try autoplay once, even when blocked")
blocked.nextLetter()
assert.ok(blocked.stats().letters, "Animation must continue while resume stays pending")
assert.equal(blocked.stats().ticks, 0, "Do not claim audio before the context is running")
blocked.tree.props.onClickCapture({ target: null })
assert.equal(blocked.contexts[0].resumes, 2, "A real gesture retries the pending resume")
blocked.contexts[0].unlock()
await Promise.resolve()
assert.equal(blocked.stats().restarts, 1)
blocked.nextLetter()
assert.ok(blocked.stats().ticks > 0)
blocked.cleanup()
const desktop = mount({ phone: false })
assert.equal(desktop.contexts.length, 0, "Desktop stays silent")
desktop.cleanup()
console.log("PASS auth audio: allowed entry autoplay, blocked autoplay without freezing, single synchronized gesture, resume, cleanup, silent desktop (simulated browser policy)")
