import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { addressChatResponse, shouldAddressAccount, withVerifiedComicChatContext } from "../lib/server/account-addressing.ts"

const account = { authenticated: true, userId: "d05585734@gmail.com" }
const other = { authenticated: true, userId: "someone.else@example.com" }
const unverified = { authenticated: false, userId: "d05585734@gmail.com" }
const messages = turns => Array.from({ length: turns }, (_, i) => [
  { role: "user", content: "Hello " + i },
  { role: "assistant", content: "Hi " + i },
]).flat().slice(0, -1)

async function formatted(content, acct, body, contentType = "application/json") {
  const response = new Response(
    contentType === "application/json" ? JSON.stringify({ ok: true, content }) : content,
    { headers: { "content-type": contentType } }
  )
  const result = await addressChatResponse(response, acct, body)
  return contentType === "application/json" ? (await result.json()).content : await result.text()
}

test("only the verified target account is selected", () => {
  assert.equal(shouldAddressAccount(account), true)
  assert.equal(shouldAddressAccount(other), false)
  assert.equal(shouldAddressAccount(unverified), false)
})

test("nicknames rotate by chat turn count without losing the answer", async () => {
  const names = ["ҒЛӘҚРЫН", "Глокрын", "Қарын Серикова", "ҒЛӘҚРЫН"]
  for (let i = 0; i < names.length; i++) {
    const content = await formatted("Выполнено: 2 + 2 = 4.", account, { messages: messages(i + 1) })
    assert.ok(content.startsWith(names[i] + ","), "turn " + (i + 1) + " should use " + names[i])
    assert.ok(content.includes("Выполнено: 2 + 2 = 4."))
  }
})

test("body fields cannot spoof an account and other users remain untouched", async () => {
  const forged = { email: account.userId, userId: account.userId, messages: messages(1) }
  assert.equal(await formatted("Обычный ответ", other, forged), "Обычный ответ")
  assert.equal(await formatted("Обычный ответ", unverified, forged), "Обычный ответ")
  assert.equal(withVerifiedComicChatContext(forged, other), forged)
})

test("model context is attached only to the verified account", () => {
  const source = { messages: [{ role: "user", content: "Сделай сайт" }] }
  const result = withVerifiedComicChatContext(source, account)
  assert.ok(result.history.some(m => m.content.startsWith("PERSONAL COMIC STYLE")))
  assert.equal(result.history.at(-1).content, "Сделай сайт")
  assert.equal(source.history, undefined)
})

test("streaming deltas and final content retain the greeting", async () => {
  const original = [
    'event: content\ndata: {"type":"content","content":"Привет","contentMode":"delta"}',
    'event: content\ndata: {"type":"content","content":" мир","contentMode":"delta"}',
    'event: done\ndata: {"type":"done","finalContent":"Привет мир"}',
  ].join("\n\n") + "\n\n"
  const response = new Response(original, { headers: { "content-type": "text/event-stream" } })
  const result = await addressChatResponse(response, account, { messages: messages(1) })
  const events = (await result.text()).trim().split("\n\n").map(frame => JSON.parse(frame.split("data: ")[1]))
  assert.match(events[0].content, /^ҒЛӘҚРЫН,/)
  assert.equal(events[1].content, " мир")
  assert.match(events[2].finalContent, /^ҒЛӘҚРЫН,/)
  assert.ok(events[2].finalContent.endsWith("Привет мир"))
})

test("raw JSON artifacts are left parseable", async () => {
  assert.equal(await formatted('{"ok":true,"count":1}', account, { messages: messages(1) }), '{"ok":true,"count":1}')
})

test("both public chat entry points and streaming engine are wired", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  for (const path of ["app/api/ai/chat/route.ts", "app/api/stream/route.ts", "app/api/stream/route-impl.ts"]) {
    const file = readFileSync(join(root, path), "utf8")
    assert.ok(file.includes("account-addressing"), path + " must be wired")
  }
})
