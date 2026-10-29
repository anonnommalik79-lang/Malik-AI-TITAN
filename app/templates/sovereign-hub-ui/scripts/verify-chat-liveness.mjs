// A live answer must never be abandoned while the server is still working.
//
// Regression: a long tax question to MalikLLM MAX failed after 87 s with
// «Сервис ответа временно недоступен». The browser gave up 60 s before the
// first word even though the server was alive and sending heartbeats (MAX
// itself allows 75-150 s to the first token), polled the saved answer for
// only 20 s, then fired a duplicate request and printed a generic error.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }
  cache.set(absolute, box)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      return load([base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)))
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

const { fetchRecoverableChat, chatStreamTimings, CHAT_FAILURE_TEXT } = load("lib/ai/chat-stream-recovery.ts")
const { briefNeedsDeep, letteredItemCount } = load("lib/ai/brief-quality.ts")

const encoder = new TextEncoder()
const event = (type, rest = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`
const sse = (text, headers = {}) => new Response(text, { headers: { "content-type": "text/event-stream", ...headers } })
/** A server stream that writes each part after its delay, like a real SSE response. */
function timedSse(parts, headers = {}) {
  const stream = new ReadableStream({
    async start(controller) {
      for (const [delay, text] of parts) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        if (text === null) { controller.error(new TypeError("network error")); return }
        controller.enqueue(encoder.encode(text))
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream", ...headers } })
}
const request = (prompt = "Объясни, как считается ИПН с зарплаты") => ({ method: "POST", body: JSON.stringify({ originalQuestion: prompt, workspaceMode: "chat" }) })
const TURN = "6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f"

const taxPrompt = [
  "Проверь расчёт зарплаты в Казахстане на 2026 год и найди ошибки.",
  "Условия:",
  "А) Все лимиты привязаны строго к МЗП, а не к МРП.",
  "Б) Переменная личного вычета (14 МРП) физически вычитается из базы ИПН (Gross - ОПВ - ВОСМС - Вычет).",
  "В) Сам налог ИПН реально отнимается при вычислении чистой зарплаты на руки.",
].join("\n")

await check("a lettered brief (А) Б) В)) counts as a large brief", async () => {
  assert.equal(letteredItemCount(taxPrompt), 3)
  assert.equal(briefNeedsDeep(taxPrompt), true)
  assert.equal(letteredItemCount("Inline: A) first; B) second; C) third"), 3)
  assert.equal(briefNeedsDeep("Привет, как дела?"), false)
  assert.equal(briefNeedsDeep("x".repeat(3600)), true)
})

await check("the browser waits longer than the server's own MAX deadlines", async () => {
  const engine = fs.readFileSync("lib/server/malik-max-engine.ts", "utf8")
  const wallFn = engine.match(/export function maxResponseWallMs[\s\S]*?\n\}/)?.[0] || ""
  const timingBlock = engine.match(/const timing = fastMode[\s\S]*?\n  const totalMs/)?.[0] || ""
  const windows = [...wallFn.matchAll(/(\d+)_000/g), ...timingBlock.matchAll(/firstDeadlineMs: (\d+)_000/g)].map((m) => Number(m[1]) * 1000)
  assert.ok(windows.length >= 4, "MAX deadlines must be readable from the engine")
  const longestServerWindow = Math.max(...windows)
  for (const prompt of ["Сколько будет 2+2?", taxPrompt]) {
    const timing = chatStreamTimings({ originalQuestion: prompt, workspaceMode: "chat" })
    assert.ok(timing.firstTextMs > longestServerWindow, `first-text ceiling ${timing.firstTextMs} must exceed server window ${longestServerWindow}`)
    assert.ok(timing.recoveryMs >= 5 * 60_000, "a saved server answer is awaited for minutes, not 20 seconds")
    assert.ok(timing.idleMs >= 4 * 15_000, "silence limit must cover several 15 s heartbeats")
  }
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /heartbeat = setInterval\([\s\S]{0,400}\}, 15_000\)/, "the server heartbeat that proves liveness must stay at 15 s")
})

await check("heartbeats keep a slow answer alive past the old first-word cutoff", async () => {
  let posts = 0
  const beats = Array.from({ length: 12 }, () => [40, event("progress", { phase: "generating", text: "Ожидаю ответ сервиса…" })])
  const response = await fetchRecoverableChat("/api/stream", request(taxPrompt), {
    idleMs: 400, firstTextMs: 10_000, recoveryMs: 1_000, pollMs: 5,
    fetcher: async () => { posts++; return timedSse([...beats, [40, event("content", { content: "Полный расчёт" })], [10, event("done", { sources: [] })]]) },
  })
  const text = await response.text()
  assert.equal(posts, 1, "no duplicate request while the server was working")
  assert.match(text, /Полный расчёт/)
  assert.match(text, /event: done/)
  assert.doesNotMatch(text, /event: error/)
})

await check("a server that goes silent is noticed by the silence limit, before any word", async () => {
  let posts = 0
  const started = Date.now()
  const response = await fetchRecoverableChat("/api/stream", request(), {
    idleMs: 120, firstTextMs: 60_000, recoveryMs: 500, pollMs: 5,
    fetcher: async () => {
      posts++
      return posts === 1
        ? new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } })
        : sse(event("content", { content: "Ответ после повтора" }) + event("done"))
    },
  })
  assert.match(await response.text(), /Ответ после повтора/)
  assert.equal(posts, 2)
  assert.ok(Date.now() - started < 5_000, "a dead connection is detected in seconds, not minutes")
})

await check("a dropped connection waits for the still-running server turn instead of duplicating it", async () => {
  let posts = 0, polls = 0
  const response = await fetchRecoverableChat("/api/stream", request(taxPrompt), {
    idleMs: 400, firstTextMs: 10_000, recoveryMs: 5_000, pollMs: 5,
    fetcher: async (url) => {
      if (url === "/api/stream") { posts++; return timedSse([[10, event("progress", { text: "Думает…" })], [20, null]], { "x-malik-background-turn-id": TURN }) }
      polls++
      if (polls < 4) return Response.json({ ok: true, turn: { status: "pending" } })
      return Response.json({ ok: true, turn: { status: "complete", content: "Готовый ответ с сервера", sources: [] } })
    },
  })
  const text = await response.text()
  assert.equal(posts, 1, "the original request is the only one")
  assert.equal(polls, 4)
  assert.match(text, /ответ ещё готовится на сервере/)
  assert.match(text, /Готовый ответ с сервера/)
  assert.doesNotMatch(text, /event: error/)
})

await check("a turn still running at the recovery deadline is never raced by a duplicate", async () => {
  let posts = 0
  const response = await fetchRecoverableChat("/api/stream", request(), {
    idleMs: 400, firstTextMs: 10_000, recoveryMs: 150, pollMs: 5,
    fetcher: async (url) => {
      if (url === "/api/stream") { posts++; return timedSse([[5, null]], { "x-malik-background-turn-id": TURN }) }
      return Response.json({ ok: true, turn: { status: "pending" } })
    },
  })
  const text = await response.text()
  assert.equal(posts, 1)
  assert.match(text, /event: error/)
  assert.ok(text.includes(CHAT_FAILURE_TEXT.stuck))
})

await check("a failed server turn reports its real reason, without a duplicate request or a generic error", async () => {
  let posts = 0
  const response = await fetchRecoverableChat("/api/stream", request(), {
    idleMs: 400, firstTextMs: 10_000, recoveryMs: 2_000, pollMs: 5,
    fetcher: async (url) => {
      if (url === "/api/stream") { posts++; return timedSse([[5, null]], { "x-malik-background-turn-id": TURN }) }
      return Response.json({ ok: true, turn: { status: "failed", error: "MalikLLM MAX не получила ответ. Повторите запрос." } })
    },
  })
  const text = await response.text()
  assert.equal(posts, 1, "the server job owns this answer; it is never raced")
  assert.match(text, /MalikLLM MAX не получила ответ/)
  assert.doesNotMatch(text, /Сервис ответа временно недоступен/)
})

await check("a request the server never registered is repeated once, with a reason if that fails too", async () => {
  let posts = 0
  const response = await fetchRecoverableChat("/api/stream", request(), {
    idleMs: 400, firstTextMs: 10_000, recoveryMs: 500, pollMs: 5,
    fetcher: async () => { posts++; return posts === 1 ? timedSse([[5, null]]) : new Response("", { status: 503 }) },
  })
  const text = await response.text()
  assert.equal(posts, 2)
  assert.match(text, /HTTP 503/)
  assert.doesNotMatch(text, /Сервис ответа временно недоступен/)
})

await check("the generic «Сервис ответа временно недоступен» is gone from the client", async () => {
  const source = fs.readFileSync("lib/ai/chat-stream-recovery.ts", "utf8")
  assert.doesNotMatch(source, /["'`]Сервис ответа временно недоступен/, "no code path may produce the generic message")
})

// Regression: «Кто основал Apple…» kept the server busy for eleven minutes
// without a word (the turn's lease was renewed, so the server was alive), and
// the person got «Сервер слишком долго не отдаёт готовый ответ». The server
// now holds every text answer to a deadline and always delivers something.
const { chatAnswerDeadline, withinChatDeadline } = load("lib/ai/chat-deadline.ts")
const never = () => new Promise(() => {})
const tiny = { rescueAtMs: 40, rescueMs: 40, hardMs: 120 }
function deadlineRun(overrides = {}) {
  const log = []
  let wrote = false
  return {
    log,
    write: () => { wrote = true },
    run: {
      wrote: () => wrote,
      stop: () => log.push("stop"),
      rescue: async () => { log.push("rescue"); return "rescued" },
      partial: (reason) => { log.push("partial:" + reason); return "partial" },
      ...overrides,
    },
  }
}

await check("a silent pipeline is stopped and replaced by a direct answer", async () => {
  const { run, log } = deadlineRun()
  const started = Date.now()
  assert.equal(await withinChatDeadline(never(), tiny, started, run), "rescued")
  assert.deepEqual(log, ["stop", "rescue"])
  assert.ok(Date.now() - started < 1_000)
})

await check("an answer that is still being written at the hard deadline is delivered as written", async () => {
  const { run, log, write } = deadlineRun()
  write()
  assert.equal(await withinChatDeadline(never(), tiny, Date.now(), run), "partial")
  assert.deepEqual(log, ["stop", "partial:time"])
})

await check("a failure before any word is rescued; mid-answer it keeps the text", async () => {
  const failing = () => Promise.reject(Object.assign(new Error("provider down"), { status: 503 }))
  const silent = deadlineRun()
  assert.equal(await withinChatDeadline(failing(), tiny, Date.now(), silent.run), "rescued")
  const midway = deadlineRun()
  midway.write()
  assert.equal(await withinChatDeadline(failing(), tiny, Date.now(), midway.run), "partial")
  assert.deepEqual(midway.log, ["stop", "partial:interrupted"])
})

await check("quota, sign-in and the person's own stop are never papered over", async () => {
  for (const error of [Object.assign(new Error("limit"), { status: 429 }), Object.assign(new Error("stopped"), { name: "AbortError" })]) {
    const { run, log } = deadlineRun()
    await assert.rejects(withinChatDeadline(Promise.reject(error), tiny, Date.now(), run), error)
    assert.deepEqual(log, [])
  }
})

await check("an answer in time passes through untouched", async () => {
  const { run, log } = deadlineRun()
  assert.equal(await withinChatDeadline(Promise.resolve("answer"), tiny, Date.now(), run), "answer")
  assert.deepEqual(log, [])
})

await check("deadlines fit inside each other and inside the browser's wait", async () => {
  const engine = fs.readFileSync("lib/server/malik-max-engine.ts", "utf8")
  const wallFn = engine.match(/export function maxResponseWallMs[\s\S]*?\n\}/)?.[0] || ""
  assert.match(wallFn, /if \(codeMode\) return longBrief \? 300_000 : 240_000\s+return longBrief \? 160_000 : 115_000/, "engine walls changed: update chatAnswerDeadline")
  const walls = { "false,false": 115_000, "false,true": 160_000, "true,false": 240_000, "true,true": 300_000 }
  for (const code of [false, true]) for (const deep of [false, true]) {
    const d = chatAnswerDeadline({ code, deep })
    assert.ok(d.rescueAtMs >= walls[`${code},${deep}`] + 30_000, "the full pipeline gets its whole engine window, plus search, first")
    assert.ok(d.rescueAtMs + d.rescueMs < d.hardMs, "a rescue finishes before the hard deadline")
  }
  for (const prompt of ["Сколько будет 2+2?", taxPrompt]) {
    const deep = briefNeedsDeep(prompt)
    const timing = chatStreamTimings({ originalQuestion: prompt, workspaceMode: "chat" })
    assert.ok(timing.firstTextMs > chatAnswerDeadline({ code: true, deep }).hardMs, "the server always speaks before the browser gives up")
  }
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /withinChatDeadline\(answerPromise, deadline, startedAt/, "the live chat stream is held to the deadline")
  assert.match(route, /owner !== writer/, "a stopped run cannot write into the rescue answer")
  assert.match(fs.readFileSync("lib/malik-god-router.ts", "utf8"), /export async function malikRescueAnswer[\s\S]{0,4000}gateAttributionAnswer/, "the rescue keeps the attribution gate")
})

// Regression: a three.js game stopped after 59 lines in 237 s with «Ответ не
// завершён: сервер остановил генерацию по лимиту времени … Нажмите
// «Продолжить»». Large code now streams from the first second, and an
// unfinished answer is carried on by the next model in the same message.
function continueUnfinishedWith(engine) {
  const source = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  const ast = ts.createSourceFile("route-impl.ts", source, ts.ScriptTarget.Latest, true)
  const wanted = new Set(["AUTO_CONTINUE_ROUNDS", "CONTINUE_SYSTEM", "continueUnfinished"])
  const picked = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => wanted.has(d.name.getText(ast))))
  const code = picked.map((node) => node.getText(ast)).join("\n").replace('await import("@/lib/server/malik-max-engine")', "await __engine()")
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const { resumeText } = load("lib/ai/answer-completion.ts")
  return new Function("__engine", "chatAnswerDeadline", "isCodeRequest", "briefNeedsDeep", "chatArtDirection", "resumeText", `${js}\nreturn continueUnfinished`)(
    async () => ({ runMalikMax: engine }), chatAnswerDeadline, () => true, () => false, () => null, resumeText)
}
const unfinished = { content: "```js\nconst a = 1\n", incomplete: { reason: "time", openFence: true } }

await check("an unfinished answer is carried on in the same message — no «Продолжить», no repeated text", async () => {
  const calls = [], shown = []
  const carry = continueUnfinishedWith(async (input) => {
    calls.push(input)
    input.onToken?.(input.resumeFrom)
    input.onToken?.("\nconst b = 2\n```")
    return { content: input.resumeFrom + "\nconst b = 2\n```", provider: "lane-2", model: "m", latencyMs: 1 }
  })
  const result = await carry(unfinished, { prompt: "Создай игру на three.js", allowCatalog: true, onToken: (chunk) => shown.push(chunk), startedAt: Date.now() })
  assert.equal(result.content, "```js\nconst a = 1\nconst b = 2\n```")
  assert.equal(result.incomplete, undefined, "no «Ответ не завершён» note")
  assert.deepEqual(shown, ["\nconst b = 2\n```"], "the text already on screen is not sent again")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].resumeFrom, unfinished.content.trimEnd(), "it resumes from exactly what was written")
  assert.ok(calls[0].wallMs <= 300_000 && calls[0].wallMs > 60_000)
  assert.match(calls[0].systemPrompt, /Never restart, never repeat/)
})

await check("carrying on is bounded: rounds, progress, time, allowance and the person's stop", async () => {
  let rounds = 0
  const endless = continueUnfinishedWith(async (input) => { rounds += 1; return { content: input.resumeFrom + "x".repeat(400), incomplete: { reason: "time" } } })
  const long = await endless(unfinished, { prompt: "игра", allowCatalog: false, startedAt: Date.now() })
  assert.equal(rounds, 4, "at most four rounds")
  assert.equal(long.incomplete.reason, "time", "the note stays honest when every round is spent")
  let stuck = 0
  const flat = continueUnfinishedWith(async (input) => { stuck += 1; return { content: input.resumeFrom + "x", incomplete: { reason: "time" } } })
  await flat(unfinished, { prompt: "игра", allowCatalog: false, startedAt: Date.now() })
  assert.equal(stuck, 1, "a round that adds nothing ends the carrying on")
  let none = 0
  const never = continueUnfinishedWith(async () => { none += 1; return { content: "" } })
  await never(unfinished, { prompt: "игра", allowCatalog: false, startedAt: Date.now() - 60 * 60_000 })
  await never(unfinished, { prompt: "игра", allowCatalog: false, maxOutputTokens: 100, startedAt: Date.now() })
  assert.equal(none, 0, "no round once the deadline or the account allowance is spent")
  const stop = new AbortController()
  const aborting = continueUnfinishedWith(async () => { stop.abort(); throw Object.assign(new Error("stopped"), { name: "AbortError" }) })
  await assert.rejects(aborting(unfinished, { prompt: "игра", allowCatalog: false, signal: stop.signal, startedAt: Date.now() }))
  const failing = continueUnfinishedWith(async () => { throw new Error("all lanes down") })
  assert.equal((await failing(unfinished, { prompt: "игра", allowCatalog: false, startedAt: Date.now() })).content, unfinished.content, "a failed round keeps what was written")
})

await check("large code streams from the first second; code answers get room to be carried on", async () => {
  const engine = fs.readFileSync("lib/server/malik-max-engine.ts", "utf8")
  assert.match(engine, /const largeCode = codeMode && budget >= 6_000/)
  assert.match(engine, /const panel = !resumed && !input\.wallMs && !deps\.lanes && !fastMode && !largeCode && budget >= 2_500/)
  const code = chatAnswerDeadline({ code: true, deep: false })
  assert.ok(code.hardMs - code.rescueAtMs >= 420_000, "several continuation rounds fit before the hard deadline")
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /const carried=await continueUnfinished\(/)
  assert.match(route, /onToken:streamedLive\?streamToken:undefined/, "a continuation streams only after a live first pass")
})

console.log(`\n${checks}/${checks} chat liveness checks passed`)
