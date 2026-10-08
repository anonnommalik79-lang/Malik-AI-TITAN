import assert from "node:assert/strict"
import fs from "node:fs"
const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const section = chat.slice(chat.indexOf("// One real queued follow-up"), chat.indexOf("// The row callbacks below"))
assert.ok(section.length > 500, "queue logic is present")
assert.match(section, /const timer = window\.setTimeout/, "queued handoff is deferred")
assert.match(section, /window\.clearTimeout\(timer\)/, "unmount cancels a stale queued request")
assert.match(section, /try\s*\{[\s\S]*onSendMessage\(next\.message, next\.attachments, next\.options\)/, "real chat handler runs")
assert.match(section, /catch \(error\)[\s\S]*setPrompt\(/, "a failed handoff recovers the draft")
assert.match(section, /setAttachments\(/, "a failed handoff recovers files")
assert.match(section, /finally\s*\{[\s\S]*queueDispatchRef\.current = false/, "guard unlocks on success or failure")
assert.doesNotMatch(section, /setQueuedTurn\(null\)[\s\S]*onSendMessage/, "the queued turn is not erased before send")
console.log("PASS queued follow-up: no lost draft, no double dispatch on unmount, no hung lock")
