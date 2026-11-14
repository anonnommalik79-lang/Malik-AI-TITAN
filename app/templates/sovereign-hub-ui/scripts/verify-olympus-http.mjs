import assert from "node:assert/strict"
import http from "node:http"

const base = process.env.MALIK_QA_BASE_URL || "http://127.0.0.1:3017"
const count = { requests: 0 }

if (process.argv.includes("--serve")) {
  // Loopback-only upstream fixture. Next, the production API route, model
  // selection, usage parsing and SSE delivery all run without substitution.
  const server = http.createServer(async (req, res) => {
    if (req.url === "/count") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(count))
      return
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") return res.writeHead(404).end()
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const question = JSON.stringify(body.messages.at(-1).content)
      count.requests++
      if (!question.includes("17 × 23")) return res.writeHead(503).end()
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "17 × 23" }, finish_reason: null }] })}\n\n`)
      setTimeout(() => {
        if (res.destroyed) return
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: " = 391." }, finish_reason: "stop" }] })}\n\n`)
        res.end(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, total_tokens: 129 } })}\n\ndata: [DONE]\n\n`)
      }, 100)
    } catch { if (!res.headersSent) res.writeHead(400).end() }
  })
  server.listen(3018, "127.0.0.1", () => console.log("Olympus fixture provider on 127.0.0.1:3018"))
} else {
  assert.match(base, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u, "this suite only sends requests to a local test app")
  const call = async question => {
    const result = await fetch(`${base}/api/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", cookie: "malik-guest=1" },
      body: JSON.stringify({ originalQuestion: question, model: "malik-max", workspaceMode: "chat", responseDepth: "fast", disableResearch: true, stream: true, metadata: { timeZone: "UTC" } }),
      signal: AbortSignal.timeout(60_000),
    })
    const sse = await result.text()
    assert.equal(result.status, 200, sse.slice(0, 500))
    assert.match(result.headers.get("content-type"), /text\/event-stream/u)
    const events = [...sse.matchAll(/^data: (\{.*\})\r?$/gmu)].map(match => JSON.parse(match[1]))
    const completed = events.filter(event => event.type === "done")
    assert.equal(completed.length, 1, sse.slice(-1500))
    return { events, done: completed[0], content: completed[0].finalContent || events.filter(event => event.type === "content").map(event => event.content).join("") }
  }
  const hello = await call("Привет")
  assert.match(hello.content, /Привет/u)
  assert.equal((await (await fetch("http://127.0.0.1:3018/count")).json()).requests, 0)
  const date = await call("What year is it?")
  assert.match(date.content, new RegExp(String(new Date().getUTCFullYear())))
  assert.equal((await (await fetch("http://127.0.0.1:3018/count")).json()).requests, 0)
  const answer = await call("Сколько будет 17 × 23?")
  assert.match(answer.content, /391/u)
  assert.equal(answer.done.usage?.totalTokens, 129)
  assert.equal((await (await fetch("http://127.0.0.1:3018/count")).json()).requests, 1)
  console.log("PASS browser-test server /api/stream: local greeting, local UTC date, provider SSE and official fixture usage")
}
