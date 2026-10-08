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

console.log(`\n${checks}/${checks} chat liveness checks passed`)
