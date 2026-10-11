// TITAN Stage B — reliability, checked on the real routes and modules.
//
//   npm run test:titan-stage-b
//
// The real /api/stream/background route and its [turnId] DELETE run here;
// only the model stream (app/api/stream/route), the session and next/server
// are stand-ins (scripts/stubs). No network, no providers, no storage writes.
import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

let count = 0
let failures = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

const cancellation = await import("../lib/server/turn-cancellation.ts")
const background = await import("../app/api/stream/background/route.ts")
const turnRoute = await import("../app/api/stream/background/[turnId]/route.ts")
const turns = await import("../lib/server/background-chat-turns.ts")

const sse = (type, payload = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))
const settleAfter = async () => { await Promise.all(globalThis.__malikAfterTasks.splice(0)) }
const asUser = (userId) => { globalThis.__malikTestUser = userId }
const startTurn = (turnId) => background.POST(new Request("http://malik.test/api/stream/background", {
  method: "POST",
  headers: { "content-type": "application/json", "x-malik-background-turn-id": turnId },
  body: JSON.stringify({ originalQuestion: "Напиши длинный отчёт" }),
}))
const stopTurn = (turnId) => turnRoute.DELETE(new Request(`http://malik.test/api/stream/background/${turnId}`, { method: "DELETE" }), { params: Promise.resolve({ turnId }) })

/* ------------------------------------------------ #28 Stop on the server */

await check("the registry: only the owner's Stop aborts a running turn", () => {
  const signal = cancellation.registerRunningTurn("turn-1", "owner")
  assert.equal(cancellation.stopRunningTurn("turn-1", "intruder"), "forbidden")
  assert.equal(signal.aborted, false)
  assert.equal(cancellation.stopRunningTurn("turn-1", "owner"), "stopped")
  assert.equal(signal.aborted, true)
  cancellation.releaseRunningTurn("turn-1")
  assert.equal(cancellation.stopRunningTurn("turn-1", "owner"), "not-running")
})

await check("the registry stays bounded", () => {
  const before = cancellation.runningTurnCount()
  for (let index = 0; index < 600; index++) cancellation.registerRunningTurn(`bulk-${index}`, "owner")
  assert.ok(cancellation.runningTurnCount() <= 512, `registry grew to ${cancellation.runningTurnCount()}`)
  for (let index = 0; index < 600; index++) cancellation.releaseRunningTurn(`bulk-${index}`)
  assert.equal(cancellation.runningTurnCount(), before)
})

await check("Stop aborts the model call, keeps what was written and frees the turn", async () => {
  const turnId = crypto.randomUUID()
  asUser("owner@malik.test")
  globalThis.__malikFakeRuns = []
  globalThis.__malikFakePlan = { chunks: [sse("content", { content: "Первая часть отчёта. ", contentMode: "delta" })], hold: true }
  const response = await startTurn(turnId)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("x-malik-background-turn-id"), turnId)
  const reader = response.body.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.match(first, /Первая часть отчёта/)
  await tick(20)
  const run = globalThis.__malikFakeRuns.at(-1)
  assert.equal(run.requestAborted, false, "nothing is stopped before Stop")
  assert.equal(cancellation.runningTurnCount() >= 1, true)

  // Another account cannot stop it, and learns nothing about it.
  asUser("intruder@malik.test")
  const foreign = await stopTurn(turnId)
  assert.equal(foreign.status, 404)
  assert.equal(run.requestAborted, false)

  asUser("owner@malik.test")
  const stopped = await stopTurn(turnId)
  assert.equal(stopped.status, 200)
  assert.deepEqual(await stopped.json(), { ok: true, stopped: true })
  // The browser's own copy goes away as well (its fetch was aborted).
  await reader.cancel("user stop").catch(() => {})
  await settleAfter()
  await tick(20)

  assert.equal(run.requestAborted, true, "the model request's signal was aborted")
  assert.equal(run.cancelled, true, "the model stream was cancelled, so generation stops")
  const saved = await turns.readBackgroundChatTurn(turnId)
  assert.equal(saved.status, "failed", "a stopped answer is never reported as complete")
  assert.equal(saved.content, "Первая часть отчёта. ", "what was written is kept")
  assert.equal(saved.error, "Остановлено пользователем.")
  assert.equal(cancellation.stopRunningTurn(turnId, "owner@malik.test"), "not-running", "the finished turn is released")
})

await check("a turn that finished normally is saved complete and cannot be stopped afterwards", async () => {
  const turnId = crypto.randomUUID()
  asUser("owner@malik.test")
  globalThis.__malikFakePlan = { chunks: [sse("content", { content: "Готовый ответ.", contentMode: "delta" }), sse("done", { provider: "fake" })], hold: false }
  const response = await startTurn(turnId)
  assert.match(await response.text(), /event: done/)
  await settleAfter()
  const saved = await turns.readBackgroundChatTurn(turnId)
  assert.equal(saved.status, "complete")
  assert.equal(saved.content, "Готовый ответ.")
  const late = await stopTurn(turnId)
  assert.deepEqual(await late.json(), { ok: true, stopped: false })
})

await check("closing the tab without Stop does not stop the answer", async () => {
  const turnId = crypto.randomUUID()
  asUser("owner@malik.test")
  globalThis.__malikFakeRuns = []
  globalThis.__malikFakePlan = { chunks: [sse("content", { content: "Пишу…", contentMode: "delta" })], hold: true }
  const response = await startTurn(turnId)
  // A teed branch's cancel settles only when both copies are gone, so the
  // browser side does not wait for it, and neither does this test.
  void response.body.cancel("tab closed").catch(() => {})
  await tick(30)
  const run = globalThis.__malikFakeRuns.at(-1)
  assert.equal(run.requestAborted, false)
  assert.equal(run.cancelled, false, "the server copy keeps the model running")
  assert.equal((await turns.readBackgroundChatTurn(turnId)).status, "pending")
  // Clean up the held stream.
  asUser("owner@malik.test")
  await stopTurn(turnId)
  await settleAfter()
})

await check("every layer passes the stop on to the model call", () => {
  const route = fs.readFileSync("app/api/stream/route.ts", "utf8")
  assert.match(route, /new Request\(request\.url, \{[^}]*signal: request\.signal \}\)/, "the prompt rewrite keeps the signal")
  const compute = fs.readFileSync("lib/malik-compute/runtime.ts", "utf8")
  assert.match(compute, /request\.signal\.addEventListener\("abort", abort/, "Compute cancels the model stream on abort")
  const impl = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(impl, /cancel\(\) \{\s*cancelled = true\s*generation\.abort\(\)/, "a cancelled stream aborts generation")
  const client = fs.readFileSync("components/sovereign/AccountChatPersistence.tsx", "utf8")
  assert.match(client, /method: "DELETE",\s*cache: "no-store",\s*keepalive: true/, "Stop calls the server")
})

/* ----------------------------------- #26 finished turns are forgotten */

const persistenceSource = fs.readFileSync("components/sovereign/AccountChatPersistence.tsx", "utf8")
const ast = ts.createSourceFile("persistence.tsx", persistenceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const extracted = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === "forgetWhenFinished").map((node) => node.getText(ast)).join("\n")
const { forgetWhenFinished } = new Function(`${ts.transpileModule(extracted, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}\nreturn { forgetWhenFinished }`)()
const encoder = new TextEncoder()
const chunked = (parts) => new Response(new ReadableStream({
  start(controller) { for (const part of parts) controller.enqueue(encoder.encode(part)); controller.close() },
}), { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": "t" } })

await check("a turn whose final event arrived is forgotten, even with the event split across chunks", async () => {
  let forgotten = 0
  const response = forgetWhenFinished(chunked([sse("content", { content: "Ответ" }), "event: do", "ne\ndata: {\"type\":\"done\"}\n\n"]), () => { forgotten += 1 })
  assert.equal(response.headers.get("x-malik-background-turn-id"), "t", "headers survive")
  const text = await response.text()
  assert.match(text, /Ответ/)
  assert.equal(forgotten, 1)
})

await check("a broken stream without the final event stays recoverable", async () => {
  let forgotten = 0
  await forgetWhenFinished(chunked([sse("content", { content: "event: done внутри текста" })]), () => { forgotten += 1 }).text()
  assert.equal(forgotten, 0, "text that merely mentions the event does not count")
})

await check("a reader that stops right after the final event still forgets the turn", async () => {
  let forgotten = 0
  const response = forgetWhenFinished(new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(sse("done", {}))) },
  }), { headers: { "content-type": "text/event-stream" } }), () => { forgotten += 1 })
  const reader = response.body.getReader()
  await reader.read()
  await reader.cancel()
  assert.equal(forgotten, 1)
})

await check("JSON and error responses pass through untouched", async () => {
  const json = Response.json({ ok: false }, { status: 409 })
  assert.equal(forgetWhenFinished(json, () => { throw new Error("must not run") }), json)
})

/* ------------------------------------------ #99 👍/👎 kept on the server */

const feedbackRoute = await import("../app/api/chat/feedback/route.ts")
const feedbackStore = await import("../lib/server/answer-feedback.ts")
const feedbackClient = await import("../lib/ai/answer-feedback-client.ts")
const postMark = (body, headers = { "content-type": "application/json" }) => feedbackRoute.POST(new Request("http://malik.test/api/chat/feedback", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }))
const readMarks = async (query = "") => feedbackRoute.GET(new Request(`http://malik.test/api/chat/feedback${query}`))

await check("a mark is saved, read back, changed and cleared", async () => {
  asUser("reader@malik.test"); globalThis.__malikTestPlan = "free"
  assert.equal((await postMark({ messageId: "msg-1", value: "up", modelId: "malik-max" })).status, 200)
  assert.deepEqual((await (await readMarks()).json()).feedback, { "msg-1": "up" })
  await postMark({ messageId: "msg-1", value: "down", modelId: "malik-max" })
  assert.deepEqual((await (await readMarks()).json()).feedback, { "msg-1": "down" })
  await postMark({ messageId: "msg-1", value: null })
  assert.deepEqual((await (await readMarks()).json()).feedback, {})
})

await check("marks are private to their account", async () => {
  asUser("first@malik.test")
  await postMark({ messageId: "private-1", value: "up" })
  asUser("second@malik.test")
  assert.deepEqual((await (await readMarks()).json()).feedback, {})
})

await check("bad input is refused: id, value, size, content type", async () => {
  asUser("reader@malik.test")
  assert.equal((await postMark({ messageId: "../../etc", value: "up" })).status, 400)
  assert.equal((await postMark({ messageId: "ok-id", value: "maybe" })).status, 400)
  assert.equal((await postMark({ messageId: "ok-id", value: "up", note: "x".repeat(3_000) })).status, 413)
  assert.equal((await postMark("{\"messageId\":\"ok-id\",\"value\":\"up\"}", { "content-type": "text/plain" })).status, 415, "a cross-site form post is refused")
})

await check("daily totals follow changes and only the owner can read them", async () => {
  asUser("counter@malik.test")
  await postMark({ messageId: "count-1", value: "up", modelId: "malik-max" })
  await postMark({ messageId: "count-2", value: "up", modelId: "malik-max" })
  await postMark({ messageId: "count-2", value: "down", modelId: "malik-max" })
  globalThis.__malikTestPlan = "free"
  assert.equal((await readMarks("?summary=7")).status, 403)
  globalThis.__malikTestPlan = "owner"
  const days = (await (await readMarks("?summary=7")).json()).days
  const todayCounts = days[0]
  assert.ok(todayCounts.byModel["malik-max"].up >= 1)
  assert.ok(todayCounts.byModel["malik-max"].down >= 1)
  globalThis.__malikTestPlan = "free"
  // Pure counting: a changed mark moves one count, a cleared mark removes it.
  const daily = { version: 1, date: "2026-01-01", up: 0, down: 0, byModel: {} }
  feedbackStore.applyToDaily(daily, undefined, { messageId: "a", value: "up", modelId: "m", at: "" })
  feedbackStore.applyToDaily(daily, { messageId: "a", value: "up", modelId: "m", at: "" }, { messageId: "a", value: "down", modelId: "m", at: "" })
  feedbackStore.applyToDaily(daily, { messageId: "a", value: "down", modelId: "m", at: "" }, null)
  assert.deepEqual([daily.up, daily.down, daily.byModel.m.up, daily.byModel.m.down], [0, 0, 0, 0])
})

await check("an account keeps at most 500 marks, newest kept", () => {
  let doc = { version: 1, items: [] }
  for (let index = 0; index < 520; index++) doc = feedbackStore.applyToUser(doc, `m-${index}`, { messageId: `m-${index}`, value: "up", at: "" })
  assert.equal(doc.items.length, 500)
  assert.equal(doc.items.at(-1).messageId, "m-519")
  assert.equal(doc.items[0].messageId, "m-20")
})

await check("with storage: a signed-in account's marks go to the bucket and survive a write race", async () => {
  globalThis.__malikStoreConfigured = true
  const bucket = globalThis.__malikMemoryBucket
  try {
    asUser("cloud@malik.test"); globalThis.__malikTestAuthenticated = true
    bucket.conflictsToInject = 2
    const response = await postMark({ messageId: "cloud-1", value: "up", modelId: "malik-max" })
    assert.deepEqual(await response.json(), { ok: true, value: "up", where: "cloud" })
    const keys = [...bucket.objects.keys()]
    const userObject = keys.find((key) => key.startsWith("feedback/users/"))
    assert.ok(userObject, "the account's marks are in the bucket")
    assert.doesNotMatch(userObject, /cloud@malik/, "the object name never contains the e-mail")
    assert.deepEqual((await (await readMarks()).json()).feedback, { "cloud-1": "up" })
    assert.ok(keys.some((key) => key.startsWith("feedback/daily/")), "daily totals are stored")
    // A guest never creates objects in the bucket.
    const before = bucket.objects.size
    asUser("guest:abc"); globalThis.__malikTestAuthenticated = false
    assert.equal((await (await postMark({ messageId: "guest-1", value: "down" })).json()).where, "memory")
    assert.equal([...bucket.objects.keys()].filter((key) => key.startsWith("feedback/users/")).length, 1, "no per-guest object")
    assert.equal(bucket.objects.size, before, "a guest's mark only moves the existing daily totals")
  } finally {
    globalThis.__malikStoreConfigured = false
    globalThis.__malikTestAuthenticated = true
  }
})

await check("the same button again clears the mark; the chat restores and saves marks", () => {
  assert.equal(feedbackClient.nextAnswerMark(undefined, "up"), "up")
  assert.equal(feedbackClient.nextAnswerMark("up", "up"), null)
  assert.equal(feedbackClient.nextAnswerMark("up", "down"), "down")
  const view = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
  assert.match(view, /loadAnswerFeedback\(\)\.then/)
  assert.match(view, /saveAnswerFeedback\(messageId, next, modelId\)/)
})

/* -------------------------------- #97 paid plans are not held to the free cap */

const os = await import("node:os")
const path = await import("node:path")
process.env.MALIK_COMPUTE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "malik-quota-"))
const quota = await import("../lib/server/daily-text-token-quota.ts")

await check("each plan gets its own daily text allowance", () => {
  delete process.env.PRO_DAILY_TEXT_TOKEN_LIMIT
  assert.equal(quota.dailyTextTokenLimitFor("free"), quota.DAILY_TEXT_TOKEN_LIMIT)
  assert.equal(quota.dailyTextTokenLimitFor(false), quota.DAILY_TEXT_TOKEN_LIMIT, "the old boolean form still works")
  assert.equal(quota.dailyTextTokenLimitFor(true), null)
  assert.equal(quota.dailyTextTokenLimitFor("owner"), null)
  assert.equal(quota.dailyTextTokenLimitFor("pro"), null, "PRO is not capped at the free 10k")
  assert.equal(quota.dailyTextTokenLimitFor("ultra"), null)
  process.env.PRO_DAILY_TEXT_TOKEN_LIMIT = "250000"
  assert.equal(quota.dailyTextTokenLimitFor("pro"), 250_000, "the owner can set a PRO cap")
  process.env.PRO_DAILY_TEXT_TOKEN_LIMIT = "500"
  assert.equal(quota.dailyTextTokenLimitFor("pro"), quota.DAILY_TEXT_TOKEN_LIMIT, "a PRO cap never falls below the free one")
  process.env.PRO_DAILY_TEXT_TOKEN_LIMIT = "nonsense"
  assert.equal(quota.dailyTextTokenLimitFor("pro"), null)
  delete process.env.PRO_DAILY_TEXT_TOKEN_LIMIT
})

await check("a PRO account past 10k keeps working; a free one is stopped", () => {
  const user = `workos:quota-${Date.now()}`
  quota.recordGeneratedTextTokens(user, false, "я".repeat(quota.DAILY_TEXT_TOKEN_LIMIT * 3 + 30))
  assert.equal(quota.getDailyTextTokenQuota(user, "free").remaining, 0)
  const pro = quota.getDailyTextTokenQuota(user, "pro")
  assert.equal(pro.unlimited, true)
  process.env.PRO_DAILY_TEXT_TOKEN_LIMIT = "50000"
  const capped = quota.getDailyTextTokenQuota(user, "pro")
  assert.equal(capped.limit, 50_000)
  assert.ok(capped.remaining > 0 && capped.remaining < 50_000)
  delete process.env.PRO_DAILY_TEXT_TOKEN_LIMIT
})

await check("the chat routes and the Compute gate use the account's plan", () => {
  const impl = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(impl, /getDailyTextTokenQuota\(entitlement\.userId, entitlement\.plan\)/)
  const chat = fs.readFileSync("app/api/ai/chat/route.ts", "utf8")
  assert.match(chat, /getDailyTextTokenQuota\(entitlement\.userId, entitlement\.plan\)/)
  const runtime = fs.readFileSync("lib/malik-compute/runtime.ts", "utf8")
  assert.match(runtime, /const paid = getDailyTextTokenQuota\(identity\.userId, plan\)/)
  assert.match(runtime, /identity\.guest \? "free"/, "a guest is never treated as paid")
})

/* ------------------------------------------------- #98 security headers */

await check("every response carries the security baseline; the full CSP is report-only", async () => {
  const config = (await import("../next.config.mjs")).default
  const rules = await config.headers()
  const global = rules.find((rule) => rule.source === "/:path*")
  assert.ok(global, "a rule covers every path")
  const header = (name) => global.headers.find((item) => item.key.toLowerCase() === name.toLowerCase())?.value || ""
  assert.match(header("Content-Security-Policy"), /frame-ancestors 'self'/)
  assert.match(header("Content-Security-Policy"), /object-src 'none'/)
  assert.match(header("Content-Security-Policy"), /base-uri 'self'/)
  assert.doesNotMatch(header("Content-Security-Policy"), /script-src|default-src/, "nothing the app needs is enforced yet")
  assert.match(header("Content-Security-Policy-Report-Only"), /default-src 'self'/)
  assert.equal(header("X-Frame-Options"), "SAMEORIGIN")
  assert.equal(header("X-Content-Type-Options"), "nosniff")
  assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin")
  assert.match(header("Permissions-Policy"), /microphone=\(self\)/, "voice keeps the microphone")
  // The caching rules that existed before are still there.
  assert.ok(rules.some((rule) => rule.source === "/reference-photos/:path*"))
})

/* ------------------------------------------- answer layouts (pure rules) */

const layouts = await import("../lib/ai/answer-layouts.ts")

await check("FAQ: bullet, bold and «Вопрос:» forms; code and short sections untouched", () => {
  const listed = layouts.faqToDetails("### FAQ\n\n- **Это бесплатно?** Да, базовый план.\n  Продолжение ответа.\n- **Есть ли API?** Есть.\n")
  assert.equal((listed.match(/<details>/g) || []).length, 2)
  assert.match(listed, /<summary>Это бесплатно\?<\/summary>\n\nДа, базовый план\.\nПродолжение ответа\./)
  const labelled = layouts.faqToDetails("## Вопросы и ответы\nВопрос: Как войти?\nЧерез Google.\nВопрос: Как выйти?\nКнопкой.")
  assert.equal((labelled.match(/<details>/g) || []).length, 2)
  const single = "## FAQ\n\n**Один вопрос?**\nОтвет."
  assert.equal(layouts.faqToDetails(single), single, "one question is not an accordion")
  const fenced = "```md\n## FAQ\n**А?**\nб\n**В?**\nг\n```"
  assert.equal(layouts.faqToDetails(fenced), fenced, "code is never rewritten")
  const unrelated = "## Итоги\n\n**Почему так?** Потому.\n\n**Что дальше?** План."
  assert.equal(layouts.faqToDetails(unrelated), unrelated, "only sections named FAQ")
  assert.doesNotMatch(layouts.faqToDetails("## FAQ\n**<b>А</b>?**\nx\n**Б?**\ny"), /<b>/, "no HTML from the model in a summary")
})

await check("contents: only for long answers with at least four sections", () => {
  const headings = [1, 2, 2, 3, 2].map((level, position) => ({ position, level, text: `**Раздел ${position}**` }))
  const outline = layouts.answerOutline(headings, 4_000)
  assert.equal(outline.length, 5)
  assert.deepEqual(outline.map((item) => item.depth), [0, 1, 1, 2, 1])
  assert.equal(outline[0].text, "Раздел 0", "emphasis is stripped")
  assert.equal(layouts.answerOutline(headings, 1_000), null)
  assert.equal(layouts.answerOutline(headings.slice(0, 3), 9_000), null)
})

await check("decision matrix: normalised weights, raw-weight totals accepted, ties and gaps", () => {
  const headers = ["Критерий", "Вес", "A", "B"]
  const rows = [["Цена", "3", "8/10", "6"], ["Скорость", "2", "6", "9"]]
  const matrix = layouts.weightedMatrix(headers, rows)
  assert.deepEqual(matrix.options.map((option) => option.total), [7.2, 7.2])
  assert.equal(matrix.winner, null, "a tie names no winner")
  const raw = layouts.weightedMatrix(headers, [...rows, ["Итого", "", "36", "36"]])
  assert.equal(raw.modelTotals.mismatch, false, "a total on the raw weights (3+2) is correct too")
  assert.equal(layouts.weightedMatrix(headers, [["Цена", "3", "8", "—"], ["Скорость", "2", "6", "9"]]), null, "a missing score is not guessed")
  assert.equal(layouts.weightedMatrix(["Критерий", "A", "B", "C"], rows), null, "no weight column, no matrix")
  assert.equal(layouts.weightedMatrix(headers, [["Цена", "-1", "8", "6"], ["Скорость", "2", "6", "9"]]), null)
})

await check("plus / minus labels in Russian, Kazakh and English", () => {
  for (const text of ["Плюсы", "**Преимущества:**", "Pros", "Артықшылықтары", "✅ Плюсы"]) assert.equal(layouts.prosConsLabel(text), "pros", text)
  for (const text of ["Минусы", "Недостатки:", "Cons", "Кемшіліктері", "Риски"]) assert.equal(layouts.prosConsLabel(text), "cons", text)
  for (const text of ["Заключение", "Процесс", "Конструкция"]) assert.equal(layouts.prosConsLabel(text), null, text)
})

console.log(failures ? `\n${failures}/${count} checks FAILED` : `\n${count}/${count} checks passed`)
process.exit(failures ? 1 : 0)
