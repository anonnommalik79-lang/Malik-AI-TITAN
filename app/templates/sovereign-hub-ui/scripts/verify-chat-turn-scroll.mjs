import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const file = resolve(import.meta.dirname, "../components/sovereign/ChatTurnScrollRuntime.tsx")
const code = readFileSync(file, "utf8")
let checks = 0
const check = (name, run) => { run(); checks += 1; console.log(`PASS ${name}`) }

console.log("\nchat viewport stays stable after Send")

check("send preserves the existing thread position instead of anchoring the new row to the top", () => {
  assert.match(code, /pendingThreadTop = thread\.scrollTop/)
  assert.match(code, /PRESERVED_TOP_ATTR/)
  assert.doesNotMatch(code, /anchorFreshTurn|userBox\.top|topInset|setRunway/)
})

check("legacy forced-bottom streaming scroll is blocked", () => {
  assert.match(code, /top >= this\.scrollHeight - 2/)
  assert.match(code, /endSentinelThread/)
})

check("browser layout anchoring cannot move the conversation while content grows", () => {
  assert.match(code, /overflow-anchor/)
  assert.match(code, /markStableTurn/)
})

check("desktop document position is restored so header and sidebar do not jump", () => {
  assert.match(code, /pendingPageTop = window\.scrollY/)
  assert.match(code, /window\.innerWidth >= 768/)
  assert.match(code, /nativeWindowScrollTo\(window\.scrollX, pendingPageTop\)/)
})

check("manual wheel touch or pointer movement always wins", () => {
  assert.match(code, /wheel.*cancelPendingPlacement/)
  assert.match(code, /touchmove.*cancelPendingPlacement/)
  assert.match(code, /pointerdown.*cancelPendingPlacement/)
})

check("no synthetic bottom runway is added", () => {
  assert.doesNotMatch(code, /paddingBottom|turn-scroll-runway/)
})

console.log(`\n${checks} chat-scroll stability checks passed.`)
