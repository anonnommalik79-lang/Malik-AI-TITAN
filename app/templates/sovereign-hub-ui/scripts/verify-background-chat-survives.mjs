import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const codeOf = (path) => readFileSync(resolve(root, path), "utf8")
let checks = 0
const check = (name, run) => {
  run()
  checks += 1
  console.log(`PASS ${name}`)
}

const account = codeOf("components/sovereign/AccountChatPersistence.tsx")
const proxy = codeOf("app/api/stream/background/route.ts")
const status = codeOf("app/api/stream/background/[turnId]/route.ts")
const store = codeOf("lib/server/background-chat-turns.ts")

console.log("\nbackground chat turns survive navigation and session changes")

check("each /api/stream request is rewritten to a durable background turn", () => {
  assert.match(account, /CHAT_STREAM_PATH[\s\S]*BACKGROUND_STREAM_PATH/)
  assert.match(account, /x-malik-background-turn-id/)
  assert.match(account, /crypto\.randomUUID\(\)/)
})

check("automatic Malik abort signals are protected but explicit Stop still aborts the network controller", () => {
  assert.match(account, /protectedChatSignals\.has\(this\.signal\)/)
  assert.match(account, /closest\("\.malik-runtime-stop"\)/)
  assert.match(account, /originalAbort\.call\(controller/)
})

check("unfinished turns are marked detached and mapped back to the original chat/message", () => {
  assert.match(account, /markAccountDetached/)
  assert.match(account, /chatId/)
  assert.match(account, /assistantMessageId/)
  assert.match(account, /patchRecoveredTurn/)
})

check("server tees the live stream and starts persistence before after() owns the tail", () => {
  assert.match(proxy, /response\.body\.tee\(\)/)
  assert.match(proxy, /const persistence = persistStreamResult/)
  assert.match(proxy, /after\(async \(\) => \{ await persistence \}\)/)
  assert.match(proxy, /streamPOST\(request\)/)
})

check("completed and failed turns are persisted and readable by turn id", () => {
  assert.match(proxy, /completeBackgroundChatTurn/)
  assert.match(proxy, /failBackgroundChatTurn/)
  assert.match(status, /readBackgroundChatTurn/)
})

check("durable storage is encrypted and has a process-memory fallback", () => {
  assert.match(store, /aes-256-gcm/)
  assert.match(store, /S3Client/)
  assert.match(store, /__malikBackgroundChatTurnsV1/)
  assert.match(store, /WORKOS_COOKIE_PASSWORD/)
})

console.log(`\n${checks} background-chat survival checks passed.`)
