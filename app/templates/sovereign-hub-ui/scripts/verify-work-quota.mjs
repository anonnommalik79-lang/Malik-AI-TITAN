import assert from "node:assert/strict"
import fs from "node:fs"
import { evaluateWorkQuota } from "../lib/work/quota-windows.ts"

const hour = 3600000
const day = 24 * hour
const now = Date.UTC(2026, 9, 8, 12)
const events = [
  { id: "old", at: now - 8 * day },
  { id: "week", at: now - 6 * day },
  { id: "five", at: now - 4 * hour },
  { id: "recent", at: now - 20 * 60000 },
]
const free = evaluateWorkQuota(events, { fiveHour: null, weekly: 6 }, now)
assert.equal(free.weekly.used, 3)
assert.equal(free.weekly.remaining, 3)
assert.equal(free.fiveHour.limit, null)

const plus = evaluateWorkQuota(events, { fiveHour: 2, weekly: 3 }, now)
assert.equal(plus.fiveHour.used, 2)
assert.equal(plus.fiveHour.remaining, 0)
assert.equal(plus.weekly.remaining, 0)
assert.equal(plus.fiveHour.resetAt, new Date(now + hour).toISOString())
assert.equal(plus.weekly.resetAt, new Date(now + day).toISOString())
assert.equal(evaluateWorkQuota(events, { fiveHour: 2, weekly: 3 }, now + 2 * hour).fiveHour.remaining, 1)
assert.equal(evaluateWorkQuota([], { fiveHour: 20, weekly: 100 }, now).weekly.remaining, 100)
assert.equal(evaluateWorkQuota([], { fiveHour: null, weekly: null }, now).weekly.remaining, null)

const root = "app/api/stream/route-impl.ts"
const stream = fs.readFileSync(root, "utf8")
const chat = fs.readFileSync("app/api/ai/chat/route.ts", "utf8")
const button = fs.readFileSync("components/sovereign/WorkQuotaButton.tsx", "utf8")
const topbar = fs.readFileSync("components/sovereign/TitanTopBar.tsx", "utf8")
const quota = fs.readFileSync("lib/server/work-quota.ts", "utf8")
for (const file of [stream, chat]) {
  assert.match(file, /reserveWorkQuota/)
  assert.match(file, /WORK_QUOTA_EXHAUSTED|quotaAdmission/)
}
assert.match(stream, /refundWorkQuota/)
assert.match(topbar, /<WorkQuotaButton/)
assert.match(button, /\/api\/work\/limits/)
assert.match(quota, /IfMatch/)
assert.match(quota, /IfNoneMatch/)
assert.match(quota, /authenticated/)
console.log("PASS Malik Work quotas: rolling windows, tier limits, server admission, conditional storage and UI wiring")
