#!/usr/bin/env node
/**
 * Provider rotation and dedupe for the Malik Shorts feed.
 *
 * The mixer this replaces was built on Math.random, so there was nothing to
 * assert: the same input produced a different feed every call. These cases are
 * the contract - strict alternation while both providers have content, no empty
 * slots when one runs out, and one video counted once.
 *
 *   node scripts/verify-shorts-rotation.mjs
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
// Imported dynamically so a checkout without node_modules gets one clear line
// instead of an ERR_MODULE_NOT_FOUND stack trace.
let ts
try {
  ts = (await import("typescript")).default
} catch {
  console.error("Нужен typescript из node_modules. Сначала: npm install")
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, "../lib/shorts/feed-rotation.ts"), "utf8")

// Compiled with the repo's own TypeScript rather than regex-stripped, so this
// check tests the file that ships instead of a rewritten copy of it. The helper
// has no runtime imports - only a type-only one, which the compiler drops - so
// nothing needs resolving and the stub require is never called.
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const loaded = {}
new Function("exports", "require", compiled)(loaded, () => ({}))
const { rotateBySource, dedupeBySource, buildRotatedFeed, usesExternalMetrics } = loaded

let failures = 0
let checks = 0

function item(label) {
  const source = label.startsWith("YT") ? "youtube" : label.startsWith("TK") ? "tiktok" : "malik"
  return { id: label, sourceId: label, source, label }
}

function labels(items) {
  return items.map((entry) => entry.label).join(" ")
}

function check(name, actual, expected) {
  checks += 1
  if (actual === expected) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ожидалось: ${expected}`)
    console.log(`       получено : ${actual}`)
  }
}

console.log("\nСтрогое чередование")

// Case 1 from the brief: two full providers alternate one-for-one.
check(
  "YT1 YT2 YT3 + TK1 TK2 TK3",
  labels(buildRotatedFeed(["YT1", "YT2", "YT3", "TK1", "TK2", "TK3"].map(item), 6)),
  "YT1 TK1 YT2 TK2 YT3 TK3",
)

// Case 2: three providers make a three-beat round.
check(
  "YT1 YT2 + TK1 TK2 + M1 M2",
  labels(buildRotatedFeed(["YT1", "YT2", "TK1", "TK2", "M1", "M2"].map(item), 6)),
  "YT1 TK1 M1 YT2 TK2 M2",
)

// Case 3: TikTok runs dry after one item and must not leave a gap.
check(
  "YT1 YT2 YT3 + TK1 — без пустых слотов",
  labels(buildRotatedFeed(["YT1", "YT2", "YT3", "TK1"].map(item), 4)),
  "YT1 TK1 YT2 YT3",
)

console.log("\nОдин провайдер не роняет ленту")

check(
  "TikTok отсутствует — YouTube и Malik продолжаются",
  labels(buildRotatedFeed(["YT1", "YT2", "M1", "M2"].map(item), 4)),
  "YT1 M1 YT2 M2",
)

check(
  "YouTube отсутствует — TikTok и Malik продолжаются",
  labels(buildRotatedFeed(["TK1", "TK2", "M1", "M2"].map(item), 4)),
  "TK1 M1 TK2 M2",
)

check(
  "остался один провайдер — отдаётся он",
  labels(buildRotatedFeed(["TK1", "TK2", "TK3"].map(item), 3)),
  "TK1 TK2 TK3",
)

check("пустой вход — пустая лента", labels(buildRotatedFeed([], 10)), "")

console.log("\nПорядок детерминированный")

const input = ["YT1", "YT2", "YT3", "TK1", "TK2", "M1"].map(item)
const runs = new Set()
for (let i = 0; i < 25; i += 1) runs.add(labels(buildRotatedFeed(input.map((entry) => ({ ...entry })), 6)))
check("25 прогонов дают один результат", String(runs.size), "1")

// Both files explain in comments what they replaced, and those comments name
// Math.random. Stripping comments first keeps the check on the code.
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

checks += 1
if (/Math\.random/.test(codeOnly(source))) {
  failures += 1
  console.log("  FAIL в ротации остался Math.random")
} else {
  console.log("  ok   Math.random в ротации нет")
}

checks += 1
const feedRoute = readFileSync(resolve(here, "../app/api/shorts/feed/route.ts"), "utf8")
if (/Math\.random|function shuffle/.test(codeOnly(feedRoute))) {
  failures += 1
  console.log("  FAIL в feed/route.ts остался случайный порядок")
} else {
  console.log("  ok   feed/route.ts больше не тасует источники")
}

console.log("\nПорядок внутри провайдера сохраняется")

// The provider's own ordering is its recommendation; rotation must interleave
// buckets without reordering what is inside them.
const ordered = buildRotatedFeed(["YT1", "YT2", "YT3", "TK1", "TK2", "TK3"].map(item), 6)
check(
  "YouTube идёт в исходном порядке",
  ordered.filter((entry) => entry.source === "youtube").map((entry) => entry.label).join(" "),
  "YT1 YT2 YT3",
)
check(
  "TikTok идёт в исходном порядке",
  ordered.filter((entry) => entry.source === "tiktok").map((entry) => entry.label).join(" "),
  "TK1 TK2 TK3",
)

console.log("\nДедупликация")

check(
  "один и тот же tiktok:ABC не повторяется",
  dedupeBySource([
    { id: "a", sourceId: "ABC", source: "tiktok" },
    { id: "b", sourceId: "ABC", source: "tiktok" },
  ]).length.toString(),
  "1",
)

check(
  "youtube:123 и tiktok:123 — два разных видео",
  dedupeBySource([
    { id: "a", sourceId: "123", source: "youtube" },
    { id: "b", sourceId: "123", source: "tiktok" },
  ]).length.toString(),
  "2",
)

check(
  "malik-посты без source_id различаются по id",
  dedupeBySource([
    { id: "uuid-1", source: "malik" },
    { id: "uuid-2", source: "malik" },
  ]).length.toString(),
  "2",
)

console.log("\nСчётчики внешних видео")

check("youtube берёт внешние счётчики", String(usesExternalMetrics("youtube")), "true")
check("tiktok берёт внешние счётчики", String(usesExternalMetrics("tiktok")), "true")
check("malik остаётся на локальных", String(usesExternalMetrics("malik")), "false")

checks += 1
const routeSource = feedRoute
if (/views: external \? count\(externalViews\)/.test(routeSource) && /shares: external && externalShares/.test(routeSource)) {
  console.log("  ok   feed/route.ts отдаёт внешние счётчики для tiktok")
} else {
  failures += 1
  console.log("  FAIL feed/route.ts всё ещё показывает локальные нули для tiktok")
}

console.log(`\n${checks - failures}/${checks} проверок пройдено`)
process.exit(failures ? 1 : 0)
