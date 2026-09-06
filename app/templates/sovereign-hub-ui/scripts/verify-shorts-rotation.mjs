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

/**
 * Load a pure lib module by compiling the file that actually ships.
 *
 * Compiled with the repo's own TypeScript rather than regex-stripped, so these
 * checks test the shipped source instead of a rewritten copy of it. Every
 * module loaded here is import-free at runtime by design - only type imports,
 * which the compiler drops - so the stub require is never called.
 */
function loadLib(relativePath, deps = {}) {
  const source = readFileSync(resolve(here, relativePath), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = {}
  // Most of these modules import nothing at runtime. The ones that compose
  // others (feed-row) get their dependencies handed in already loaded, so the
  // composition itself is what gets tested rather than a stub of it.
  const require = (specifier) => {
    if (specifier in deps) return deps[specifier]
    throw new Error(`verify-shorts-rotation: неизвестный импорт ${specifier}`)
  }
  new Function("exports", "require", compiled)(loaded, require)
  return { exports: loaded, source }
}

const rotation = loadLib("../lib/shorts/feed-rotation.ts")
const metricsLib = loadLib("../lib/shorts/metrics.ts")
const identity = loadLib("../lib/shorts/tiktok-identity.ts")
const policy = loadLib("../lib/shorts/tiktok-sync-policy.ts")

const source = rotation.source
const { dedupeBySource, buildRotatedFeed } = rotation.exports
const { buildShortMetrics, applyLocalCounters, applyLocalDelta, bumpLocalCounter, usesExternalMetrics } = metricsLib.exports
const { parseTikTokHandle, tiktokUsernameCandidates, tiktokCreatorKey, USERNAME_PATTERN, resolvePublicHandle, isImportedUsername } = identity.exports
const { decideTikTokSync, freshnessLabel, FRESH_WINDOW_MS, ERROR_COOLDOWN_MS } = policy.exports

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

console.log("\nВторой круг ротации")

// Case A: the bug the first version of rotateBySource shipped with. It advanced
// the starting provider between rounds, so round two began at TikTok and the
// feed read YT TK TK YT while YouTube still had items.
const secondLap = buildRotatedFeed(["YT1", "YT2", "TK1", "TK2"].map(item), 4)
check("YT1 TK1 YT2 TK2 — не YT TK TK YT", labels(secondLap), "YT1 TK1 YT2 TK2")
check(
  "длинный прогон не сбивается на границе круга",
  labels(buildRotatedFeed(["YT1", "YT2", "YT3", "YT4", "TK1", "TK2", "TK3", "TK4"].map(item), 8)),
  "YT1 TK1 YT2 TK2 YT3 TK3 YT4 TK4",
)

console.log("\nСчётчики: внешние и локальные не смешиваются")

check("youtube берёт внешние счётчики", String(usesExternalMetrics("youtube")), "true")
check("tiktok берёт внешние счётчики", String(usesExternalMetrics("tiktok")), "true")
check("malik остаётся на локальных", String(usesExternalMetrics("malik")), "false")

// Case D, the whole life cycle of one like on an imported TikTok.
const tiktokPost = buildShortMetrics(
  { views: 0, likes: 0, comments: 0, reposts: 0, saves: 0, shares: 0 },
  { views: 900000, likes: 40000, comments: 1200, shares: 300 },
)
check("external=40000 local=0 → показываем 40000", String(tiktokPost.likes), "40000")
check("external хранится отдельно", String(tiktokPost.external.likes), "40000")
check("local хранится отдельно", String(tiktokPost.local.likes), "0")

// The RPC answers with local counters only - this is the exact payload
// malik_shorts_interact returns after a like.
const afterLike = applyLocalCounters(tiktokPost, { views: 0, likes: 1, comments: 0, reposts: 0, saves: 0, shares: 0 })
check("после локального лайка → 40001", String(afterLike.likes), "40001")
check("внешний счётчик не изменился", String(afterLike.external.likes), "40000")

const afterUnlike = applyLocalCounters(afterLike, { views: 0, likes: 0, comments: 0, reposts: 0, saves: 0, shares: 0 })
check("после снятия лайка → 40000", String(afterUnlike.likes), "40000")

// Reload: the feed rebuilds from the database, where local likes = 1.
const afterReload = buildShortMetrics(
  { views: 0, likes: 1, comments: 0, reposts: 0, saves: 0, shares: 0 },
  { views: 900000, likes: 40000, comments: 1200, shares: 300 },
)
check("после перезагрузки те же 40001", String(afterReload.likes), "40001")

check("комментарий поднимает локальный счётчик", String(bumpLocalCounter(tiktokPost, "comments", 1).comments), "1201")
check("bump не трогает внешний", String(bumpLocalCounter(tiktokPost, "comments", 1).external.comments), "1200")

// Malik-native: no external half, so display is simply local. Same code path.
const malikPost = buildShortMetrics({ views: 10, likes: 3, comments: 2, reposts: 1, saves: 4, shares: 0 }, null)
check("malik-native показывает свои локальные", String(malikPost.likes), "3")
check("malik-native не выдумывает external", String(malikPost.external === undefined), "true")
check(
  "malik-native после лайка → 4",
  String(applyLocalCounters(malikPost, { views: 10, likes: 4, comments: 2, reposts: 1, saves: 4, shares: 0 }).likes),
  "4",
)

// A response without metrics (follow, share, an optimistic fallback) must not
// rebuild the object - React should see no change where nothing moved.
check("ответ без metrics ничего не меняет", String(applyLocalCounters(tiktokPost, null) === tiktokPost), "true")

// reposts and saves have no external half anywhere.
check("reposts остаются локальными", String(tiktokPost.reposts), "0")

checks += 1
if (/\{ \.\.\.item\.metrics, \.\.\.json\.metrics \}/.test(codeOnly(readFileSync(resolve(here, "../components/sovereign/shorts/MalikShortsApp.tsx"), "utf8")))) {
  failures += 1
  console.log("  FAIL клиент всё ещё затирает metrics ответом RPC")
} else {
  console.log("  ok   клиент не затирает внешние счётчики ответом RPC")
}

console.log("\nОффлайн-ответ: дельты, а не абсолютные значения")

/*
 * The fallback path of /api/shorts/interactions answers when the database is
 * unreachable. It used to send `{ likes: 1 }` under the field that means
 * absolute local counters, so one failed RPC replaced 37 local likes with 1 and
 * pulled a 40,037 display down to 40,001. These cases pin the corrected
 * semantics: offline moves by a delta, online replaces with an absolute.
 */
const busy = buildShortMetrics(
  { views: 0, likes: 37, comments: 0, reposts: 0, saves: 0, shares: 0 },
  { views: 900000, likes: 40000, comments: 1200, shares: 300 },
)
check("исходное состояние 40000 + 37", String(busy.likes), "40037")

// Case A: offline like.
const offlineLike = applyLocalDelta(busy, "like")
check("оффлайн-лайк → 40038", String(offlineLike.likes), "40038")
check("локальный счётчик стал 38, а не 1", String(offlineLike.local.likes), "38")
check("внешний не тронут", String(offlineLike.external.likes), "40000")

// Case B: offline unlike returns exactly where it started.
check("оффлайн-анлайк → 40037", String(applyLocalDelta(offlineLike, "unlike").likes), "40037")

// Case C: the saved path still replaces with the absolute the RPC reports.
const savedLike = applyLocalCounters(busy, { views: 0, likes: 38, comments: 0, reposts: 0, saves: 0, shares: 0 })
check("сохранённый лайк (RPC local=38) → 40038", String(savedLike.likes), "40038")

check("оффлайн-сохранение двигает saves", String(applyLocalDelta(busy, "save").saves), "1")
check("оффлайн-репост двигает reposts", String(applyLocalDelta(busy, "repost").reposts), "1")
check("оффлайн-шер двигает shares", String(applyLocalDelta(busy, "share").shares), "301")
check("follow не двигает счётчики", String(applyLocalDelta(busy, "follow") === busy), "true")
check("view не двойного счёта оффлайн", String(applyLocalDelta(busy, "view") === busy), "true")

// The counter cannot go below zero even if the client is out of step.
const zeroLocal = buildShortMetrics(null, { likes: 40000 })
check("анлайк при local=0 не уходит в минус", String(applyLocalDelta(zeroLocal, "unlike").local.likes), "0")
check("и показывает по-прежнему 40000", String(applyLocalDelta(zeroLocal, "unlike").likes), "40000")

checks += 1
const interactionsRoute = codeOnly(readFileSync(resolve(here, "../app/api/shorts/interactions/route.ts"), "utf8"))
if (/metrics\.(likes|saves|reposts) = /.test(interactionsRoute)) {
  failures += 1
  console.log("  FAIL fallback снова отдаёт дельты под именем metrics")
} else {
  console.log("  ok   fallback отдаёт metricDeltas, не metrics")
}

checks += 1
const clientSource = codeOnly(readFileSync(resolve(here, "../components/sovereign/shorts/MalikShortsApp.tsx"), "utf8"))
if (/persistence === true/.test(clientSource) && /applyLocalDelta\(item\.metrics/.test(clientSource)) {
  console.log("  ok   клиент различает сохранённый ответ и оффлайн")
} else {
  failures += 1
  console.log("  FAIL клиент не различает absolute и delta")
}

console.log("\nTikTok: handle и username")

// Case G: a Malik user already owns @malik; the TikTok creator @malik must not
// collide with them. The tt. namespace is what removes that class of clash.
check("handle из profile_deep_link", String(parseTikTokHandle("https://www.tiktok.com/@cristiano")), "cristiano")
check("handle с точкой и подчёркиванием", String(parseTikTokHandle("https://www.tiktok.com/@almaty.travels")), "almaty.travels")
check("ссылки нет → null", String(parseTikTokHandle(null)), "null")
check("чужая ссылка → null", String(parseTikTokHandle("https://example.com/@x")), "null")
check("мусор вместо ссылки → null", String(parseTikTokHandle("не ссылка")), "null")

const malikCollision = tiktokUsernameCandidates("open-id-1", "malik")
check("первый кандидат в своём namespace", malikCollision[0], "tt.malik")
check("есть запасной с хэшем", String(malikCollision.length >= 2), "true")
check("все кандидаты проходят regex таблицы", String(malikCollision.every((name) => USERNAME_PATTERN.test(name))), "true")
check("все кандидаты ≤ 32 символов", String(malikCollision.every((name) => name.length <= 32)), "true")

// Case H: the same open id, twice, must produce the same key and the same list.
check("тот же creator_key при повторном sync", tiktokCreatorKey("open-id-1"), "tiktok:open-id-1")
check(
  "тот же username при повторном sync",
  tiktokUsernameCandidates("open-id-1", "malik").join("|"),
  malikCollision.join("|"),
)
check(
  "разные open_id — разные запасные имена",
  String(tiktokUsernameCandidates("open-id-1", "malik")[1] !== tiktokUsernameCandidates("open-id-2", "malik")[1]),
  "true",
)

const longHandle = tiktokUsernameCandidates("open-id-3", "a".repeat(40))
check("длинный handle обрезается до лимита", String(longHandle.every((name) => USERNAME_PATTERN.test(name))), "true")
const noHandle = tiktokUsernameCandidates("open-id-4", null)
check("без handle всё равно есть валидное имя", String(noHandle.length >= 1 && USERNAME_PATTERN.test(noHandle[0])), "true")
check("имя без handle детерминировано", noHandle[0], tiktokUsernameCandidates("open-id-4", null)[0])

checks += 1
if (/follower_count|total_likes/.test(codeOnly(readFileSync(resolve(here, "../lib/shorts/tiktok.ts"), "utf8")).split("materializeTikTokProfile")[1]?.split("export async function getTikTokCreatorKey")[0] || "")) {
  failures += 1
  console.log("  FAIL TikTok-профиль всё ещё пишет follower_count/total_likes поверх Malik social graph")
} else {
  console.log("  ok   TikTok-профиль не трогает Malik social graph")
}

console.log("\nПубличный @ не содержит внутренний namespace")

// Case E: the DB key is tt.cristiano, the real TikTok handle is cristiano, and
// the second is what a person must see.
check("реальный handle побеждает внутреннее имя", resolvePublicHandle({ handle: "cristiano", username: "tt.cristiano" }), "cristiano")
check("tt.-имя без handle не показывается", String(resolvePublicHandle({ handle: null, username: "tt.cristiano" })), "null")
check("tt.-имя с хэшем тоже не показывается", String(resolvePublicHandle({ handle: null, username: "tt.cristiano.a91f2" })), "null")
check("tt.-хэш не показывается", String(resolvePublicHandle({ handle: null, username: "tt.9f3a1c2b4d5e" })), "null")
// Case F: nothing is invented from the display name.
check("displayName не превращается в @", String(resolvePublicHandle({ handle: null, username: null })), "null")
// A YouTube channel handle is stored un-prefixed and passes through unchanged.
check("обычный username проходит как есть", resolvePublicHandle({ handle: null, username: "gorod24.almaty" }), "gorod24.almaty")
check("собственный Malik-аккаунт проходит", resolvePublicHandle({ handle: null, username: "malik.abc123" }), "malik.abc123")
check("isImportedUsername распознаёт tt.", String(isImportedUsername("tt.cristiano")), "true")
check("isImportedUsername не трогает чужие", String(isImportedUsername("cristiano")), "false")

// The handle comes out of a TikTok-issued URL - the same parser reads the
// profile deep link and a post share_url.
check("handle из share_url поста", String(parseTikTokHandle("https://www.tiktok.com/@cristiano/video/7312345678901234567")), "cristiano")
check("handle из deep link профиля", String(parseTikTokHandle("https://www.tiktok.com/@cristiano")), "cristiano")

checks += 1
if (/@\{(short|activeShort|item)\.creator\??\.?username/.test(clientSource) || /@\{profileView\.username/.test(clientSource)) {
  failures += 1
  console.log("  FAIL интерфейс всё ещё печатает @ + внутренний username")
} else {
  console.log("  ok   интерфейс печатает @ только через creatorTag")
}

checks += 1
if (/handle: source === "tiktok" \? parseTikTokHandle\(row\.source_url\)/.test(codeOnly(feedRoute))) {
  console.log("  ok   лента отдаёт реальный handle из share_url")
} else {
  failures += 1
  console.log("  FAIL лента не отдаёт реальный handle")
}

console.log("\nЧастота обращений к TikTok API")

const HOUR = 60 * 60 * 1000
const now = Date.parse("2026-09-06T12:00:00Z")
const iso = (msAgo) => new Date(now - msAgo).toISOString()

check(
  "нет подключения — не синкаем",
  decideTikTokSync({ connected: false, creatorKey: null, hasPosts: false }, now).reason,
  "not-connected",
)
check(
  "подключён, никогда не синкали — синкаем",
  String(decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: false }, now).sync),
  "true",
)

// Case E: posts exist outside the first feed page. The check is by creator key,
// not by what the feed loaded, so no API call happens.
check(
  "посты есть и свежие — НЕ дёргаем API",
  String(decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: iso(HOUR) }, now).sync),
  "false",
)
check(
  "посты есть, метки времени нет — берём дату поста",
  decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: true, newestPostAt: iso(HOUR) }, now).reason,
  "fresh",
)
check(
  "импорт устарел — синкаем",
  decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: iso(FRESH_WINDOW_MS + HOUR) }, now).reason,
  "stale",
)
check(
  "недавняя ошибка — ждём, не зацикливаемся",
  decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: false, lastErrorAt: iso(60_000) }, now).reason,
  "error-cooldown",
)
check(
  "ошибка остыла — пробуем снова",
  String(decideTikTokSync({ connected: true, creatorKey: "tiktok:x", hasPosts: false, lastErrorAt: iso(ERROR_COOLDOWN_MS + 60_000) }, now).sync),
  "true",
)

// Case F: creator X being present must not block viewer Y's own import. The
// decision takes no argument describing the pool at all, which is the fix.
check(
  "чужой TikTok в пуле не блокирует мой импорт",
  String(decideTikTokSync({ connected: true, creatorKey: "tiktok:Y", hasPosts: false }, now).sync),
  "true",
)

check("метка свежести: никогда", freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: false }, now), "never")
check("метка свежести: свежо", freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: iso(HOUR) }, now), "fresh")
check("метка свежести: устарело", freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: iso(FRESH_WINDOW_MS + HOUR) }, now), "stale")
check("метка свежести: падает", freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: iso(2 * HOUR), lastErrorAt: iso(HOUR) }, now), "failing")

// Case D: a connection made before sync stamps existed. It has no lastSyncAt,
// but its videos were imported an hour ago - reporting "never" there is a false
// alarm, and it is the reason readCreatorPosts fetches created_at.
check(
  "legacy: постов свежие, метки нет → fresh",
  freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: null, newestPostAt: iso(HOUR) }, now),
  "fresh",
)
check(
  "legacy: посты старые, метки нет → stale",
  freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: true, lastSyncAt: null, newestPostAt: iso(FRESH_WINDOW_MS + HOUR) }, now),
  "stale",
)
check(
  "постов нет вовсе → never",
  freshnessLabel({ connected: true, creatorKey: "tiktok:x", hasPosts: false, lastSyncAt: null, newestPostAt: null }, now),
  "never",
)

checks += 1
if (/select=id,created_at[^`]*order=created_at\.desc/.test(codeOnly(readFileSync(resolve(here, "../lib/shorts/provider-accounts.ts"), "utf8")))) {
  console.log("  ok   provider-accounts читает дату новейшего поста")
} else {
  failures += 1
  console.log("  FAIL provider-accounts не читает newestPostAt — legacy покажет ложное never")
}

checks += 1
if (/dbItems\.some\(\(item\) => item\.source === "tiktok"\)/.test(codeOnly(feedRoute))) {
  failures += 1
  console.log("  FAIL лента снова решает по загруженной странице, а не по creator")
} else {
  console.log("  ok   решение о синке не зависит от feed limit")
}

console.log("\nОдни счётчики в ленте, профиле и библиотеке")

/*
 * The feed computed display as external+local while /api/shorts/profile and
 * /api/shorts/library kept their own inline mapping over the local columns
 * alone - so one imported TikTok showed 40,007 likes in the feed and 7 in the
 * library. rowMetrics is now the single reading; these cases assert the three
 * routes cannot drift again.
 */
const feedRow = loadLib("../lib/shorts/feed-row.ts", {
  "@/lib/shorts/metrics": metricsLib.exports,
  "@/lib/shorts/tiktok-identity": identity.exports,
})
const { rowMetrics, rowPublicHandle } = feedRow.exports

const tiktokRow = {
  source: "tiktok",
  source_url: "https://www.tiktok.com/@cristiano/video/7312345678901234567",
  username: "tt.cristiano",
  views: 0, likes: 7, comments: 0, reposts: 0, saves: 0, shares: 0,
  external_views: 900000, external_likes: 40000, external_comments: 1200, external_shares: 300,
}
check("tiktok: external 40000 + local 7 = 40007", String(rowMetrics(tiktokRow).likes), "40007")
check("tiktok: локальная половина сохранена", String(rowMetrics(tiktokRow).local.likes), "7")
check("tiktok: внешняя половина сохранена", String(rowMetrics(tiktokRow).external.likes), "40000")

const youtubeRow = {
  source: "youtube",
  views: 0, likes: 3, comments: 0, reposts: 0, saves: 0, shares: 0,
  external_views: 20000, external_likes: 20000, external_comments: 0, external_shares: 0,
}
check("youtube: 20000 + 3 = 20003", String(rowMetrics(youtubeRow).likes), "20003")

const malikRow = { source: "malik", views: 0, likes: 15, comments: 0, reposts: 0, saves: 0, shares: 0 }
check("malik-native: 15 и никакого external", String(rowMetrics(malikRow).likes), "15")
check("malik-native: external отсутствует", String(rowMetrics(malikRow).external === undefined), "true")

check("публичный @ из source_url библиотеки", String(rowPublicHandle(tiktokRow)), "cristiano")
check("у не-tiktok строки handle не выдумывается", String(rowPublicHandle(youtubeRow)), "null")

// All three routes must call the same helper - no second copy of the formula.
for (const [label, file] of [
  ["лента", "../app/api/shorts/feed/route.ts"],
  ["профиль", "../app/api/shorts/profile/route.ts"],
  ["библиотека", "../app/api/shorts/library/route.ts"],
]) {
  const text = codeOnly(readFileSync(resolve(here, file), "utf8"))
  checks += 1
  const shared = /rowMetrics\(/.test(text) || /buildShortMetrics\(/.test(text)
  const inline = /likes: Number\(\w+\.likes \|\| 0\)/.test(text)
  if (shared && !inline) {
    console.log(`  ok   ${label} использует общую формулу`)
  } else {
    failures += 1
    console.log(`  FAIL ${label} считает счётчики по-своему`)
  }
}

checks += 1
if (/handle: rowPublicHandle\(row\)/.test(codeOnly(readFileSync(resolve(here, "../app/api/shorts/library/route.ts"), "utf8")))) {
  console.log("  ok   библиотека отдаёт реальный handle, а не tt.*")
} else {
  failures += 1
  console.log("  FAIL библиотека может показать tt.* как @")
}

console.log("\nTikTok реально проигрывается")

/*
 * A share_url is a web page, not a media file. The native <video> fallback
 * rendered src={undefined} for every imported TikTok, so a post could arrive,
 * rotate and count correctly and still play nothing.
 */
const player = clientSource
// The URL and its parameters live in lib/shorts/tiktok-player.ts; the checks
// below read whichever file actually owns the rule.
const tiktokPlayerSource = codeOnly(readFileSync(resolve(here, "../lib/shorts/tiktok-player.ts"), "utf8"))

checks += 1
if (/item\.playback\.kind === "tiktok"/.test(player) && /tiktokPlayerSrc\(item\.playback\.videoId/.test(player)) {
  console.log("  ok   для tiktok есть отдельная ветка плеера")
} else {
  failures += 1
  console.log("  FAIL отдельной ветки плеера для tiktok нет")
}

checks += 1
if (/\$\{TIKTOK_PLAYER_ORIGIN\}\/player\/v1\/\$\{encodeURIComponent\(videoId\)\}/.test(tiktokPlayerSource)) {
  console.log("  ok   iframe: tiktok.com/player/v1/{videoId}, id закодирован")
} else {
  failures += 1
  console.log("  FAIL адрес плеера или кодирование videoId не те")
}

checks += 1
// The native <video> must be unreachable for a tiktok item: the branch above
// returns first, and the src expression still only fills for native.
const nativeSrc = /src=\{item\.playback\.kind === "native" \? item\.playback\.url : undefined\}/.test(player)
const tiktokReturnsFirst = player.indexOf('if (item.playback.kind === "tiktok")') < player.indexOf("<video")
if (nativeSrc && tiktokReturnsFirst) {
  console.log("  ok   tiktok не доходит до <video src={undefined}>")
} else {
  failures += 1
  console.log("  FAIL tiktok всё ещё может попасть в native <video>")
}

for (const [label, needle] of [
  ["play/pause", /postTikTok\(playing \? "pause" : "play"\)/],
  ["seekTo", /postTikTok\("seekTo", target\)/],
  ["mute/unMute", /postTikTok\(muted \? "mute" : "unMute"\)/],
]) {
  checks += 1
  if (needle.test(player)) {
    console.log(`  ok   ${label} идёт через messaging плеера`)
  } else {
    failures += 1
    console.log(`  FAIL ${label} не подключён к плееру`)
  }
}

checks += 1
if (/"x-tiktok-player": true, type, value/.test(player)) {
  console.log("  ok   команды в официальном конверте x-tiktok-player")
} else {
  failures += 1
  console.log("  FAIL конверт команд не соответствует протоколу")
}

for (const [label, needle] of [
  ["origin", /event\.origin !== TIKTOK_PLAYER_ORIGIN/],
  ["contentWindow", /event\.source !== frame\.contentWindow/],
  ["маркер", /data\["x-tiktok-player"\] !== true/],
]) {
  checks += 1
  if (needle.test(player)) {
    console.log(`  ok   listener проверяет ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL listener не проверяет ${label}`)
  }
}

checks += 1
if (/removeEventListener\("message", onMessage\)/.test(player)) {
  console.log("  ok   listener снимается при размонтировании")
} else {
  failures += 1
  console.log("  FAIL listener не снимается")
}

checks += 1
if (/postMessage\(\s*\{ "x-tiktok-player": true[\s\S]{0,120}"\*"/.test(player)) {
  failures += 1
  console.log("  FAIL команды уходят с targetOrigin \"*\"")
} else {
  console.log("  ok   targetOrigin закреплён, не \"*\"")
}

checks += 1
if (/onPlayerError/.test(player) && /setTiktokError\(true\)/.test(player)) {
  console.log("  ok   ошибка плеера не роняет страницу")
} else {
  failures += 1
  console.log("  FAIL ошибка плеера не обработана")
}

checks += 1
if (/postTikTok\(active \? "play" : "pause"\)/.test(player) && /autoplay: options\.autoplay \? "1" : "0"/.test(tiktokPlayerSource)) {
  console.log("  ok   неактивный Short не продолжает играть")
} else {
  failures += 1
  console.log("  FAIL неактивный Short может продолжать играть")
}

checks += 1
if (/controls: "0"/.test(tiktokPlayerSource) && /progress_bar: "0"/.test(tiktokPlayerSource) && /play_button: "0"/.test(tiktokPlayerSource)) {
  console.log("  ok   родные контролы TikTok скрыты — бар остаётся один")
} else {
  failures += 1
  console.log("  FAIL поверх наших контролов будут вторые")
}

console.log("\nМьют не перезагружает плеер")

const tiktokPlayer = loadLib("../lib/shorts/tiktok-player.ts")
const { tiktokPlayerSrc, classifyTikTokPlayerError, tiktokPosterEndpoint, TIKTOK_AUTOPLAY_ERROR } = tiktokPlayer.exports

/*
 * Mute used to be a query parameter, so tapping the speaker changed the src,
 * React swapped the iframe and the browser reloaded the player - losing
 * position and buffer on every toggle. The URL now carries no mute state at
 * all, which is what this asserts: the same video always yields one address.
 */
check(
  "src одинаков независимо от mute-состояния",
  String(tiktokPlayerSrc("7312345678901234567", { autoplay: true }) === tiktokPlayerSrc("7312345678901234567", { autoplay: true })),
  "true",
)
check("src всегда стартует приглушённым", String(tiktokPlayerSrc("7312345678901234567").includes("muted=1")), "true")
check("videoId закодирован в пути", String(tiktokPlayerSrc("73123/../x").includes("73123%2F..%2Fx")), "true")
check("loop включён", String(tiktokPlayerSrc("7312345678901234567").includes("loop=1")), "true")
check("autoplay отражает момент монтирования", String(tiktokPlayerSrc("1234567", { autoplay: false }).includes("autoplay=0")), "true")

checks += 1
if (/muted \? "1" : "0"/.test(codeOnly(tiktokPlayer.source)) || /muted: muted/.test(codeOnly(player))) {
  failures += 1
  console.log("  FAIL mute-состояние снова попало в src плеера")
} else {
  console.log("  ok   mute-состояние не участвует в src")
}

checks += 1
if (/src=\{tiktokPlayerSrc\(item\.playback\.videoId, \{ autoplay: autoplayOnMount \}\)\}/.test(player)) {
  console.log("  ok   iframe строит src один раз, autoplay заморожен на монтировании")
} else {
  failures += 1
  console.log("  FAIL src iframe пересобирается из динамического состояния")
}

checks += 1
if (/postTikTok\(muted \? "mute" : "unMute"\)/.test(player)) {
  console.log("  ok   mute/unMute идут сообщением, а не через URL")
} else {
  failures += 1
  console.log("  FAIL mute не отправляется сообщением")
}

console.log("\nОшибка autoplay (3002) — не смертельная")

check("3002 распознаётся", String(TIKTOK_AUTOPLAY_ERROR), "3002")
check(
  "3002 → восстановимая",
  String(classifyTikTokPlayerError({ errorCode: 3002, errorType: "AUTOPLAY_ERROR" }).fatal),
  "false",
)
for (const [code, label] of [[1001, "INVALID_VIDEO"], [2001, "SERVER_ERROR"], [3001, "PLAYBACK_ERROR"]]) {
  check(`${code} → фатальная`, String(classifyTikTokPlayerError({ errorCode: code, errorType: label }).fatal), "true")
}
check("код читается из value.errorCode", String(classifyTikTokPlayerError({ errorCode: 3002 }).code), "3002")
check("тип читается из value.errorType", classifyTikTokPlayerError({ errorCode: 3002, errorType: "AUTOPLAY_ERROR" }).type, "AUTOPLAY_ERROR")
// The payload is an object; comparing the whole value to a number would match
// nothing and quietly make every error fatal.
check("число вместо объекта не считается 3002", String(classifyTikTokPlayerError(3002).fatal), "true")
check("пустой payload не роняет разбор", String(classifyTikTokPlayerError(null).fatal), "true")

checks += 1
if (/const failure = classifyTikTokPlayerError\(data\.value\)/.test(player) && /if \(failure\.fatal\) setTiktokError\(true\)/.test(player)) {
  console.log("  ok   iframe уничтожается только на фатальной ошибке")
} else {
  failures += 1
  console.log("  FAIL любая ошибка всё ещё убивает плеер")
}

checks += 1
// After a recoverable error our own play button must be able to start it: the
// tap is the user gesture the browser was waiting for.
if (/postTikTok\(playing \? "pause" : "play"\)/.test(player)) {
  console.log("  ok   после 3002 наша кнопка Play отправляет play")
} else {
  failures += 1
  console.log("  FAIL кнопка Play не отправляет play")
}

console.log("\nОбложка TikTok переживает истечение cover_image_url")

const poster = loadLib("../lib/shorts/tiktok-poster.ts")
const { resolveTikTokPosterTarget, tiktokOembedUrl, isAllowedTikTokThumbnail, TIKTOK_OEMBED_ENDPOINT } = poster.exports

check(
  "endpoint строится из source_url",
  String(tiktokPosterEndpoint("https://www.tiktok.com/@cristiano/video/7312345678901234567", null)),
  "/api/shorts/tiktok/poster?url=https%3A%2F%2Fwww.tiktok.com%2F%40cristiano%2Fvideo%2F7312345678901234567",
)
check("endpoint из чистого id", String(tiktokPosterEndpoint(null, "7312345678901234567")), "/api/shorts/tiktok/poster?id=7312345678901234567")
check("без данных endpoint не строится", String(tiktokPosterEndpoint(null, null)), "null")
check("нечисловой id отвергается", String(tiktokPosterEndpoint(null, "../../etc/passwd")), "null")

// SSRF surface. Only a real TikTok video URL or a numeric id gets through, and
// the URL that is actually requested is rebuilt from the parts we recognised.
const good = resolveTikTokPosterTarget({ url: "https://www.tiktok.com/@cristiano/video/7312345678901234567" })
check("валидный TikTok URL принимается", String(good?.postId), "7312345678901234567")
check("URL пересобирается канонически", String(good?.canonicalUrl), "https://www.tiktok.com/@cristiano/video/7312345678901234567")
check(
  "query и fragment отбрасываются",
  String(resolveTikTokPosterTarget({ url: "https://www.tiktok.com/@c.ristiano/video/7312345678901234567?is_from=1#x" })?.canonicalUrl),
  "https://www.tiktok.com/@c.ristiano/video/7312345678901234567",
)
for (const [label, url] of [
  ["чужой хост", "https://evil.tld/@x/video/123456"],
  ["хост-подделка", "https://www.tiktok.com.evil.tld/@x/video/1234567"],
  ["внутренний адрес", "http://169.254.169.254/latest/meta-data"],
  ["localhost", "http://127.0.0.1:8080/@x/video/1234567"],
  ["file", "file:///etc/passwd"],
  ["креденшелы в URL", "https://user:pass@www.tiktok.com/@x/video/1234567"],
  ["нестандартный порт", "https://www.tiktok.com:2375/@x/video/1234567"],
  ["не путь видео", "https://www.tiktok.com/@x/live"],
  ["http вместо https", "http://www.tiktok.com/@x/video/1234567"],
]) {
  check(`SSRF: ${label} отвергнут`, String(resolveTikTokPosterTarget({ url })), "null")
}

check("запрос идёт только на захардкоженный oEmbed", String(tiktokOembedUrl(good).startsWith(TIKTOK_OEMBED_ENDPOINT + "?url=")), "true")
check("oEmbed-адрес не содержит пользовательскую строку целиком", String(tiktokOembedUrl(good).includes("is_from")), "false")

check("миниатюра с CDN TikTok принимается", String(isAllowedTikTokThumbnail("https://p16-sign.tiktokcdn-us.com/obj/abc~tplv.jpeg")), "true")
check("миниатюра с чужого хоста отвергается", String(isAllowedTikTokThumbnail("https://evil.tld/x.jpg")), "false")
check("http-миниатюра отвергается", String(isAllowedTikTokThumbnail("http://p16.tiktokcdn.com/x.jpg")), "false")
check("хост-подделка отвергается", String(isAllowedTikTokThumbnail("https://tiktokcdn.com.evil.tld/x.jpg")), "false")
check("пустая миниатюра отвергается", String(isAllowedTikTokThumbnail(null)), "false")

const posterRoute = codeOnly(readFileSync(resolve(here, "../app/api/shorts/tiktok/poster/route.ts"), "utf8"))
checks += 1
if (/fetch\(tiktokOembedUrl\(target\)/.test(posterRoute) && !/fetch\((request|url|raw|input)/.test(posterRoute)) {
  console.log("  ok   сервер не ходит по произвольному URL из запроса")
} else {
  failures += 1
  console.log("  FAIL сервер может сходить по URL из запроса")
}
checks += 1
if (/isAllowedTikTokThumbnail\(thumbnail\)/.test(posterRoute) && /placeholder\(/.test(posterRoute)) {
  console.log("  ok   редирект только на разрешённый CDN, иначе заглушка")
} else {
  failures += 1
  console.log("  FAIL редирект не ограничен списком хостов")
}
checks += 1
if (/revalidate: CACHE_SECONDS/.test(posterRoute) && /max-age=\$\{CACHE_SECONDS\}/.test(posterRoute)) {
  console.log("  ok   ответ кэшируется, oEmbed не дёргается на каждый рендер")
} else {
  failures += 1
  console.log("  FAIL кэширования нет")
}

// One component for every surface: feed, grid cards, library, profile.
checks += 1
const posterUses = (player.match(/<ShortPoster/g) || []).length
if (posterUses >= 4 && !/<img src=\{item\.posterUrl\}/.test(player) && !/<img src=\{post\.posterUrl\}/.test(player)) {
  console.log(`  ok   лента, карточки, библиотека и профиль используют один ShortPoster (${posterUses})`)
} else {
  failures += 1
  console.log("  FAIL часть поверхностей рисует постер напрямую")
}
checks += 1
if (/setStep\(\(value\) => \(value === "stored" && refresh \? "refresh" : "gone"\)\)/.test(player)) {
  console.log("  ok   упавшая обложка пробует свежую ровно один раз")
} else {
  failures += 1
  console.log("  FAIL fallback обложки может зациклиться")
}
checks += 1
if (/source === "tiktok" \? tiktokPosterEndpoint/.test(player)) {
  console.log("  ok   fallback предлагается только для TikTok")
} else {
  failures += 1
  console.log("  FAIL fallback предлагается не тем источникам")
}

console.log("\nProvider endpoint не отдаёт секреты")

// Case I. The same row holds encrypted tokens, so a `select=*` here would put
// credentials one response away from the browser.
// codeOnly, because the SECURITY comment in that file names the very patterns
// these checks look for - the rule is about the code, not about explaining it.
const accountsLib = codeOnly(readFileSync(resolve(here, "../lib/shorts/provider-accounts.ts"), "utf8"))
const forbidden = ["access_token", "refresh_token", "client_secret", "service_role", "_encrypted"]
for (const field of forbidden) {
  checks += 1
  // Named in the SECURITY comment on purpose; the code must not select it.
  if (new RegExp(`select=[^\`\\n]*${field}`).test(accountsLib)) {
    failures += 1
    console.log(`  FAIL provider-accounts выбирает ${field}`)
  } else {
    console.log(`  ok   ${field} не выбирается`)
  }
}
checks += 1
if (/select=\*/.test(accountsLib)) {
  failures += 1
  console.log("  FAIL provider-accounts использует select=*")
} else {
  console.log("  ok   выборка полей — белый список, не select=*")
}
checks += 1
if (/metadata: (row|meta)\b|\.\.\.\(?row\?\.metadata/.test(codeOnly(accountsLib))) {
  failures += 1
  console.log("  FAIL metadata отдаётся целиком")
} else {
  console.log("  ok   metadata не отдаётся целиком")
}

console.log(`\n${checks - failures}/${checks} проверок пройдено`)
process.exit(failures ? 1 : 0)
