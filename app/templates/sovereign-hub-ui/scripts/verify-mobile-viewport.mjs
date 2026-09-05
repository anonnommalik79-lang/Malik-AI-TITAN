import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = await readFile(new URL("../lib/mobile-viewport.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { observeMobileViewport } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)

function setup({ width = 430, height = 932, visual = true } = {}) {
  const attributes = new Map()
  const properties = new Map()
  const callbacks = new Map()
  let sequence = 0
  const root = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
    },
  }
  const media = Object.assign(new EventTarget(), { matches: width <= 767 })
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0, scale: 1 })
  const doc = Object.assign(new EventTarget(), { documentElement: root, activeElement: null })
  const win = Object.assign(new EventTarget(), {
    innerWidth: width, innerHeight: height,
    visualViewport: visual ? viewport : null,
    matchMedia: () => media,
    requestAnimationFrame: (fn) => { callbacks.set(++sequence, fn); return sequence },
    cancelAnimationFrame: (id) => callbacks.delete(id),
  })
  const flush = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach((fn) => fn()) }
  const event = (target, name) => { target.dispatchEvent(new Event(name)); flush() }
  const stop = observeMobileViewport(win, doc)
  return { attributes, properties, callbacks, viewport, doc, win, media, stop, flush, event }
}

// Safari keeps innerHeight intact, shrinks visualViewport, and pans its top.
const phone = setup()
assert.equal(phone.properties.get("--malik-viewport-height"), "932px")
phone.doc.activeElement = { matches: () => true }
phone.event(phone.doc, "focusin")
phone.viewport.height = 510
phone.viewport.offsetTop = 86
phone.event(phone.viewport, "resize")
assert.equal(phone.attributes.get("data-malik-keyboard"), "open")
assert.equal(phone.properties.get("--malik-viewport-height"), "510px")
assert.equal(phone.properties.get("--malik-viewport-top"), "86px")

// Sending/unmounting the home input must not move the dock below a keyboard
// that is still animating out. Restore the full canvas on the resize event.
phone.doc.activeElement = null
phone.event(phone.doc, "focusout")
assert.equal(phone.attributes.get("data-malik-keyboard"), "open")
phone.viewport.height = 932
phone.viewport.offsetTop = 0
phone.event(phone.viewport, "resize")
assert.equal(phone.attributes.get("data-malik-keyboard"), "closed")
assert.equal(phone.properties.get("--malik-viewport-height"), "932px")
assert.equal(phone.properties.get("--malik-viewport-top"), "0px")

// Deliberate zoom must not reflow the UI or be treated as the keyboard.
phone.viewport.scale = 2
phone.viewport.height = 466
phone.event(phone.viewport, "resize")
assert.equal(phone.properties.get("--malik-viewport-height"), "932px")
assert.equal(phone.attributes.get("data-malik-keyboard"), "closed")
phone.viewport.scale = 1

// Rotate to a short viewport: discard the old portrait keyboard baseline.
phone.win.innerWidth = 740
phone.win.innerHeight = 360
phone.viewport.height = 360
phone.doc.activeElement = { matches: () => true }
phone.event(phone.win, "resize")
assert.equal(phone.attributes.get("data-malik-keyboard"), "closed")
assert.equal(phone.properties.get("--malik-viewport-height"), "360px")

// Resize/scroll events share one animation frame; unmount cancels pending work.
phone.viewport.dispatchEvent(new Event("resize"))
phone.viewport.dispatchEvent(new Event("scroll"))
assert.equal(phone.callbacks.size, 1)
phone.stop()
assert.equal(phone.callbacks.size, 0)
assert.equal(phone.attributes.size, 0)
assert.equal(phone.properties.size, 0)
phone.event(phone.viewport, "resize")
assert.equal(phone.attributes.size, 0)

// No desktop variables/attributes or persistent overrides after widening.
const desktop = setup({ width: 1440, height: 900 })
assert.equal(desktop.attributes.size, 0)
assert.equal(desktop.properties.size, 0)
desktop.stop()
const widened = setup()
widened.win.innerWidth = 1440
widened.media.matches = false
widened.event(widened.media, "change")
assert.equal(widened.attributes.size, 0)
assert.equal(widened.properties.size, 0)
widened.stop()

// Older browsers fall back to innerHeight. Browser restoration refreshes it.
const fallback = setup({ visual: false })
fallback.win.innerHeight = 760
fallback.event(fallback.win, "pageshow")
assert.equal(fallback.properties.get("--malik-viewport-height"), "760px")
fallback.stop()
console.log("PASS mobile viewport: keyboard open/send/close, pan, rotation, pinch zoom, event cleanup, desktop isolation, fallback")
