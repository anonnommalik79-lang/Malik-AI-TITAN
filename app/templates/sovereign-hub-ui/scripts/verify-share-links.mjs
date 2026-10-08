// MALIK SHARE LINKS — publishing contract, storage rules, API and safe rendering.
//
// Offline and deterministic: the real contract, store, API route and
// MalikMarkdown, with the private bucket replaced by an in-memory one that
// keeps the bucket's ETag / If-Match semantics.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// ---- the bucket ---------------------------------------------------------
const objects = new Map()
let etags = 0
let configured = true
/** Runs once right before the next conditional write, to simulate another tab. */
let beforeNextConditionalWrite = null
const bucket = {
  privateJsonStoreConfigured: () => configured,
  readPrivateJson: async (key) => objects.has(key) ? JSON.parse(objects.get(key).body) : null,
  readPrivateJsonVersioned: async (key) => {
    if (!configured) throw new Error("PRIVATE_STATE_NOT_CONFIGURED")
    const item = objects.get(key)
    return item ? { value: JSON.parse(item.body), etag: item.etag } : { value: null, etag: null }
  },
  writePrivateJson: async (key, value) => { objects.set(key, { body: JSON.stringify(value), etag: `"${++etags}"` }); return true },
  writePrivateJsonConditional: async (key, value, previous) => {
    if (beforeNextConditionalWrite) { const run = beforeNextConditionalWrite; beforeNextConditionalWrite = null; await run(key) }
    const current = objects.get(key)
    if (previous ? current?.etag !== previous : current) return { stored: false, conflict: true }
    objects.set(key, { body: JSON.stringify(value), etag: `"${++etags}"` })
    return { stored: true, conflict: false }
  },
  deletePrivateJson: async (key) => { objects.delete(key); return true },
}

// ---- who is asking ------------------------------------------------------
let viewer = { authenticated: false, userId: "guest:abc", plan: "free" }
const entitlement = {
  resolveRequestEntitlement: async () => viewer,
  resolveViewerEntitlement: async () => viewer.authenticated ? viewer : null,
}

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
    if (name === "server-only" || name.endsWith(".css")) return {}
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      const found = [base, base + ".ts", base + ".tsx", path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!found) throw new Error(`cannot resolve ${name} from ${file}`)
      if (found.endsWith(path.join("lib", "server", "private-json-store.ts"))) return bucket
      if (found.endsWith(path.join("lib", "server", "request-entitlement.ts"))) return entitlement
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

const contract = load("lib/share/contract.ts")
const store = load("lib/server/shared-answers.ts")
const { SHARE_LIMITS, sanitizeShareInput, shareTitle, shareDescription, isShareId, cleanShareSources, toPublicSharedAnswer } = contract

const visual = "```malik-visual\n" + JSON.stringify({ version: 2, type: "chart", chart: "bar", title: "Выручка по месяцам", dataKind: "example", labels: ["Янв", "Фев"], series: [{ name: "Выручка", values: [10, 20] }] }) + "\n```"
const answer = `## Итог\n\n**Malik AI** считает выручку [1].\n\n${visual}\n\n\`\`\`malik-photos\n{"version":1,"subjects":[{"name":"Astana"}]}\n\`\`\`\n\nПодробнее: [сайт](https://example.com/page).`
const input = (overrides = {}) => ({ messageId: "msg-1", question: "Сколько я заработаю на SaaS?", answer, model: "MalikLLM MAX", sources: [{ title: "Источник", url: "https://example.com/a" }], ...overrides })
const reset = () => { objects.clear(); etags = 0; configured = true; beforeNextConditionalWrite = null; store.forgetSharedAnswerCache() }

console.log("\nShare links: contract")

await check("input is cleaned: controls and bidi overrides go, photo metadata goes, visuals stay", async () => {
  const result = sanitizeShareInput(input({ question: "Вопрос‮\u0007 о выручке", answer: answer + "⁦x⁩﻿" }))
  assert.equal(result.ok, true)
  assert.equal(result.value.question, "Вопрос о выручке")
  assert.ok(!result.value.answer.includes("malik-photos"), "photo hints are internal")
  assert.ok(result.value.answer.includes("```malik-visual"), "interactive blocks are kept for the page")
  assert.ok(!/[‪-‮⁦-⁩﻿]/u.test(result.value.answer))
  assert.equal(result.value.discoverable, false, "hidden from search unless asked")
})

await check("bad input is refused with a reason", async () => {
  assert.deepEqual(sanitizeShareInput(null), { ok: false, code: "INVALID_BODY" })
  assert.deepEqual(sanitizeShareInput([]), { ok: false, code: "INVALID_BODY" })
  assert.deepEqual(sanitizeShareInput(input({ messageId: "" })), { ok: false, code: "INVALID_MESSAGE" })
  assert.deepEqual(sanitizeShareInput(input({ messageId: "x".repeat(201) })), { ok: false, code: "INVALID_MESSAGE" })
  assert.deepEqual(sanitizeShareInput(input({ answer: "  \n " })), { ok: false, code: "EMPTY_ANSWER" })
  assert.deepEqual(sanitizeShareInput(input({ answer: "я".repeat(SHARE_LIMITS.answerBytes) })), { ok: false, code: "ANSWER_TOO_LARGE" })
  const long = sanitizeShareInput(input({ question: "в".repeat(5000) }))
  assert.equal(long.value.question.length, SHARE_LIMITS.questionChars + 1)
  assert.ok(long.value.question.endsWith("…"))
})

await check("sources keep their numbers: an unusable one stays an empty slot", async () => {
  const sources = cleanShareSources([
    { title: "Один", url: "https://one.kz/a" },
    { title: "Плохой", url: "javascript:alert(1)" },
    { title: "", url: "https://www.three.kz/b" },
    { title: "С паролем", url: "https://user:pass@four.kz/" },
    { title: "Хвост", url: "http://five.kz/" },
  ])
  assert.deepEqual(sources, [
    { title: "Один", url: "https://one.kz/a" },
    { title: "Плохой", url: "" },
    { title: "three.kz", url: "https://www.three.kz/b" },
  ])
})

await check("title and preview text read like the answer, not like Markdown or JSON", async () => {
  assert.equal(shareTitle("  **Сколько** я заработаю?\nвторая строка"), "Сколько я заработаю?")
  assert.equal(shareTitle(""), "Ответ Malik AI")
  const description = shareDescription(sanitizeShareInput(input()).value.answer)
  assert.ok(description.startsWith("Итог Malik AI считает выручку."), description)
  assert.ok(description.includes("Выручка по месяцам"), "a chart is described by its title")
  assert.ok(!/[{}#*`\[]/u.test(description), description)
  const clipped = shareDescription("слово ".repeat(100))
  assert.ok(clipped.length <= 180 && clipped.endsWith("…"))
})

await check("ids are 12 unambiguous characters and do not repeat", async () => {
  const ids = new Set(Array.from({ length: 3000 }, () => store.newShareId()))
  assert.equal(ids.size, 3000)
  for (const id of ids) assert.ok(isShareId(id) && id.length === 12 && !/[0O1lI]/u.test(id), id)
  assert.equal(isShareId("../../etc"), false)
  assert.equal(isShareId("short"), false)
})

console.log("\nShare links: storage")

await check("sharing the same answer twice gives the same link", async () => {
  reset()
  const first = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
  assert.equal(first.ok, true)
  assert.equal(first.existing, false)
  const again = await store.createSharedAnswer("Owner@Malik.kz", sanitizeShareInput(input()).value)
  assert.equal(again.ok, true)
  assert.equal(again.existing, true)
  assert.equal(again.record.id, first.record.id)
  assert.equal([...objects.keys()].filter((key) => key.startsWith("public/answers/")).length, 1)
  const changed = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input({ answer: "Другой ответ" })).value)
  assert.notEqual(changed.record.id, first.record.id)
})

await check("the page never reveals who shared it", async () => {
  reset()
  const created = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
  const visible = toPublicSharedAnswer(await store.readSharedAnswer(created.record.id))
  assert.deepEqual(Object.keys(visible).sort(), ["answer", "createdAt", "discoverable", "id", "model", "question", "sources"])
  assert.ok(!JSON.stringify(visible).includes("owner@malik.kz"))
})

await check("only the author or the founder can change or remove a link", async () => {
  reset()
  const created = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
  const id = created.record.id
  assert.equal(store.canManageSharedAnswer(created.record, { userId: "someone@else.kz" }), false)
  assert.equal(store.canManageSharedAnswer(created.record, { userId: "guest:abc" }), false)
  assert.equal(store.canManageSharedAnswer(created.record, null), false)
  assert.equal(store.canManageSharedAnswer(created.record, { userId: "founder@malik.kz", moderator: true }), true)
  assert.deepEqual(await store.deleteSharedAnswer(id, { userId: "someone@else.kz" }), { ok: false, code: "FORBIDDEN" })
  assert.deepEqual(await store.setSharedAnswerDiscoverable(id, { userId: "someone@else.kz" }, true), { ok: false, code: "FORBIDDEN" })
  assert.ok(await store.readSharedAnswer(id))
})

await check("search visibility is stored on the page and in the author's list", async () => {
  reset()
  const created = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
  const id = created.record.id
  const shown = await store.setSharedAnswerDiscoverable(id, { userId: "owner@malik.kz" }, true)
  assert.equal(shown.ok, true)
  assert.equal((await store.readSharedAnswer(id)).discoverable, true)
  const list = JSON.parse(objects.get(`public/answer-owners/${store.shareOwnerHash("owner@malik.kz")}.json`).body)
  assert.equal(list.items[0].discoverable, true)
})

await check("removing a link stops the page at once and clears the author's list", async () => {
  reset()
  const created = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
  const id = created.record.id
  assert.ok(await store.readSharedAnswer(id), "cached as live first")
  assert.deepEqual(await store.deleteSharedAnswer(id, { userId: "owner@malik.kz" }), { ok: true, record: null })
  assert.equal(await store.readSharedAnswer(id), null)
  const list = JSON.parse(objects.get(`public/answer-owners/${store.shareOwnerHash("owner@malik.kz")}.json`).body)
  assert.equal(list.items.length, 0)
  assert.deepEqual(await store.deleteSharedAnswer(id, { userId: "owner@malik.kz" }), { ok: false, code: "NOT_FOUND" })
})

await check("the founder can remove anyone's link", async () => {
  reset()
  const created = await store.createSharedAnswer("author@mail.kz", sanitizeShareInput(input()).value)
  assert.deepEqual(await store.deleteSharedAnswer(created.record.id, { userId: "founder@malik.kz", moderator: true }), { ok: true, record: null })
})

await check("daily limit refuses without leaving an orphan page", async () => {
  reset()
  const owner = store.shareOwnerHash("busy@malik.kz")
  const now = Date.now()
  objects.set(`public/answer-owners/${owner}.json`, { etag: '"seed"', body: JSON.stringify({ version: 1, items: Array.from({ length: SHARE_LIMITS.perDay }, (_, at) => ({ id: `Seeded${String(at).padStart(6, "0")}`, messageKey: `k${at}`, title: "t", createdAt: new Date(now - at * 1000).toISOString(), discoverable: false })) }) })
  const result = await store.createSharedAnswer("busy@malik.kz", sanitizeShareInput(input()).value, now)
  assert.deepEqual(result, { ok: false, code: "DAILY_LIMIT" })
  assert.equal([...objects.keys()].filter((key) => key.startsWith("public/answers/")).length, 0)
})

await check("another tab writing the list at the same moment loses nothing", async () => {
  reset()
  const owner = store.shareOwnerHash("owner@malik.kz")
  const listKey = `public/answer-owners/${owner}.json`
  // The other tab adds its own link between this request's read and write.
  let injected = false
  const realWrite = bucket.writePrivateJsonConditional
  bucket.writePrivateJsonConditional = async (key, value, previous) => {
    if (key === listKey && !injected) {
      injected = true
      objects.set(listKey, { etag: '"other-tab"', body: JSON.stringify({ version: 1, items: [{ id: "OtherTab0000", messageKey: "other", title: "other", createdAt: new Date().toISOString(), discoverable: false }] }) })
    }
    return realWrite(key, value, previous)
  }
  try {
    const result = await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value)
    assert.equal(result.ok, true)
    const ids = JSON.parse(objects.get(listKey).body).items.map((item) => item.id)
    assert.deepEqual(ids.sort(), [result.record.id, "OtherTab0000"].sort())
  } finally {
    bucket.writePrivateJsonConditional = realWrite
  }
})

await check("five answers shared at once all land in the list", async () => {
  reset()
  const results = await Promise.all(Array.from({ length: 5 }, (_, at) => store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input({ messageId: `m${at}`, answer: `Ответ ${at}` })).value)))
  assert.ok(results.every((result) => result.ok))
  const list = JSON.parse(objects.get(`public/answer-owners/${store.shareOwnerHash("owner@malik.kz")}.json`).body)
  assert.equal(list.items.length, 5)
  assert.equal(new Set(list.items.map((item) => item.id)).size, 5)
})

await check("without a bucket nothing pretends to work", async () => {
  reset()
  configured = false
  assert.deepEqual(await store.createSharedAnswer("owner@malik.kz", sanitizeShareInput(input()).value), { ok: false, code: "STORAGE_UNAVAILABLE" })
  assert.equal(await store.readSharedAnswer("AbCdEfGhJkMn"), null)
  assert.deepEqual(await store.deleteSharedAnswer("AbCdEfGhJkMn", { userId: "owner@malik.kz" }), { ok: false, code: "STORAGE_UNAVAILABLE" })
})

console.log("\nShare links: API")

const createRoute = load("app/api/share/route.ts")
const changeRoute = load("app/api/share/[id]/route.ts")
const post = (body) => createRoute.POST(new Request("https://malikaiworld.world/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
const context = (id) => ({ params: Promise.resolve({ id }) })

await check("a guest is asked to sign in; nothing is stored", async () => {
  reset()
  viewer = { authenticated: false, userId: "guest:abc", plan: "free" }
  const response = await post(input())
  assert.equal(response.status, 401)
  const data = await response.json()
  assert.equal(data.error, "AUTH_REQUIRED")
  assert.match(data.message, /Войдите/u)
  assert.equal(objects.size, 0)
})

await check("a signed-in author gets a link, and the same link again", async () => {
  reset()
  viewer = { authenticated: true, userId: "api-author@malik.kz", plan: "free" }
  const created = await post(input({ messageId: "api-1" }))
  assert.equal(created.status, 201)
  const first = await created.json()
  assert.equal(first.ok, true)
  assert.match(first.share.path, /^\/a\/[A-Za-z0-9]{12}$/u)
  assert.equal(created.headers.get("cache-control"), "private, no-store")
  const again = await (await post(input({ messageId: "api-1" }))).json()
  assert.equal(again.existing, true)
  assert.equal(again.share.id, first.share.id)
})

await check("an oversized answer is refused with 413 and a readable reason", async () => {
  reset()
  viewer = { authenticated: true, userId: "api-big@malik.kz", plan: "free" }
  // Just over the answer limit: the request is read, the answer is refused.
  const response = await post(input({ messageId: "api-big", answer: "я".repeat(SHARE_LIMITS.answerBytes / 2 + 1) }))
  assert.equal(response.status, 413)
  const data = await response.json()
  assert.equal(data.error, "ANSWER_TOO_LARGE")
  assert.match(data.message, /256 КБ/u)
  // Far over it: the body is not even read.
  const huge = await post(input({ messageId: "api-huge", answer: "я".repeat(SHARE_LIMITS.requestBytes) }))
  assert.equal(huge.status, 413)
  assert.match((await huge.json()).message, /256 КБ/u)
  assert.equal(objects.size, 0)
})

await check("PATCH and DELETE: author yes, stranger no, malformed id is 404", async () => {
  reset()
  viewer = { authenticated: true, userId: "api-owner@malik.kz", plan: "free" }
  const { share } = await (await post(input({ messageId: "api-own" }))).json()
  const patch = (id, body) => changeRoute.PATCH(new Request(`https://malikaiworld.world/api/share/${id}`, { method: "PATCH", body: JSON.stringify(body) }), context(id))
  const remove = (id) => changeRoute.DELETE(new Request(`https://malikaiworld.world/api/share/${id}`, { method: "DELETE" }), context(id))
  assert.equal((await patch(share.id, { discoverable: "yes" })).status, 400)
  const shown = await patch(share.id, { discoverable: true })
  assert.equal(shown.status, 200)
  assert.deepEqual((await shown.json()).share, { id: share.id, discoverable: true })
  viewer = { authenticated: true, userId: "stranger@malik.kz", plan: "free" }
  assert.equal((await remove(share.id)).status, 403)
  assert.equal((await remove("../secret")).status, 404)
  viewer = { authenticated: true, userId: "api-owner@malik.kz", plan: "free" }
  assert.equal((await remove(share.id)).status, 200)
  assert.equal((await remove(share.id)).status, 404)
})

console.log("\nShare links: rendering")

const { MalikMarkdown } = load("components/sovereign/MalikMarkdown.tsx")
const sample = "Смотрите [сайт](https://example.com/x) и [файл](/api/ai/project/artifacts/abc/download).\n\n```html\n<!doctype html><html><body><h1>Привет</h1></body></html>\n```"

await check("a public page marks outside links as user content and does not link the app's API", async () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: sample, allowImages: false, shared: true }))
  assert.match(html, /href="https:\/\/example\.com\/x"[^>]*rel="nofollow ugc noreferrer noopener"/u)
  assert.ok(!html.includes('href="/api/'), "no link into the app's API")
  assert.ok(html.includes("файл"), "the label stays")
  assert.ok(!html.includes("Предпросмотр"), "published code is not run")
})

await check("the chat itself renders exactly as before", async () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: sample, allowImages: false }))
  assert.match(html, /href="https:\/\/example\.com\/x"[^>]*rel="noreferrer noopener"/u)
  assert.ok(html.includes('href="/api/ai/project/artifacts/abc/download"'))
  assert.ok(html.includes("Предпросмотр"))
})

await check("interactive blocks render on a public page", async () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: visual, allowImages: false, shared: true }))
  assert.ok(html.includes("Выручка по месяцам"), "the chart card is drawn")
})

console.log(`\n${checks} share-link checks passed`)
