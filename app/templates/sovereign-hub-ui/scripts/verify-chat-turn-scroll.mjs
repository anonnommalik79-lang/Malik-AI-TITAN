import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const scrollCode = readFileSync(resolve(root, "components/sovereign/ChatTurnScrollRuntime.tsx"), "utf8")
const sidebarCode = readFileSync(resolve(root, "components/sovereign/sidebar.tsx"), "utf8")
const sectionsCode = readFileSync(resolve(root, "components/sovereign/SidebarSectionRuntime.tsx"), "utf8")

let checks = 0
const check = (name, run) => { run(); checks += 1; console.log(`PASS ${name}`) }

console.log("\nreference sidebar + free generation scrolling")

check("sidebar matches the requested section order and keeps session history at the bottom", () => {
  const main = sidebarCode.indexOf("Основное")
  const create = sidebarCode.indexOf("Создание")
  const tools = sidebarCode.indexOf("Инструменты")
  const history = sidebarCode.indexOf("История чатов")
  const footer = sidebarCode.indexOf("malik-sidebar-footer")
  assert.ok(main >= 0 && create > main && tools > create && history > tools && footer > history)
  assert.match(sidebarCode, /Сегодня/)
  assert.match(sidebarCode, /Вчера/)
  assert.match(sidebarCode, /Ранее/)
})

check("reference navigation contains image generation and no visible newsroom action", () => {
  assert.match(sidebarCode, /id: "photo-generation"[\s\S]*label: "Генерация изображений"/)
  assert.match(sidebarCode, /view: "photo-generation"/)
  assert.doesNotMatch(sidebarCode, /id: "newsroom"/)
})

check("new chat can own the reference active state", () => {
  assert.match(sidebarCode, /action\.id === "new"/)
  assert.match(sidebarCode, /activeView === "home" && !activeChatId/)
  assert.match(sidebarCode, /#19172d/)
})

check("legacy DOM mutation sidebar layer is gone", () => {
  assert.doesNotMatch(sectionsCode, /MutationObserver|ensureGroupLabel|appendChild/)
  assert.match(sectionsCode, /malik-founder-nav/)
})

check("send preserves the current viewport while blocking forced bottom jumps", () => {
  assert.match(scrollCode, /pendingThreadTop = thread\.scrollTop/)
  assert.match(scrollCode, /top >= this\.scrollHeight - 2/)
  assert.match(scrollCode, /overflow-anchor/)
  assert.doesNotMatch(scrollCode, /anchorFreshTurn|userBox\.top|topInset|setRunway/)
})

check("streaming has stable free scroll room without per-token observer work", () => {
  assert.match(scrollCode, /padding-bottom: clamp\(120px, 18vh, 190px\)/)
  assert.match(scrollCode, /wheel.*cancelPendingPlacement/)
  assert.match(scrollCode, /touchmove.*cancelPendingPlacement/)
  assert.doesNotMatch(scrollCode, /characterData:\s*true/)
})

console.log(`\n${checks} sidebar/scroll checks passed.`)
