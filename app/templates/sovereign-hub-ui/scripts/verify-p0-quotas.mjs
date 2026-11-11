// P0 quota regressions: real quota file operations in a disposable temp folder.
// No provider network and no production storage is touched.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { workTestLoader } from "./work-test-loader.mjs"

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "malik-p0-quota-"))
const load = workTestLoader({
  "@/lib/malik-compute/file-store": { computeDirectory: () => folder },
})
const quota = load("lib/server/daily-text-token-quota.ts")
const frequency = load("lib/server/request-frequency.ts")
const ownerPath = userId => path.join(folder, "text-token-quota", createHash("sha256").update(userId).digest("hex") + ".json")

test.after(() => fs.rmSync(folder, { recursive: true, force: true }))

test("quotas persist exact increments and keep free allowance unchanged", () => {
  const user = "p0-quota-persistence"
  const before = quota.getDailyTextTokenQuota(user, "free")
  assert.equal(before.used, 0)
  assert.equal(before.limit, quota.DAILY_TEXT_TOKEN_LIMIT)
  assert.equal(quota.recordGeneratedTextTokens(user, "free", "abcdef").used, 2)
  assert.equal(quota.recordGeneratedTextTokens(user, "free", "abc").used, 3)
  assert.equal(quota.getDailyTextTokenQuota(user, "free").remaining, before.limit - 3)
})

test("invalid quota JSON fails closed rather than silently refreshing allowance", () => {
  const user = "p0-quota-corrupt"
  quota.recordGeneratedTextTokens(user, "free", "abcdef")
  fs.writeFileSync(ownerPath(user), "{truncated", "utf8")
  assert.throws(() => quota.getDailyTextTokenQuota(user, "free"), /DAILY_TEXT_QUOTA_STORAGE_UNAVAILABLE/)
  assert.throws(() => quota.recordGeneratedTextTokens(user, "free", "abc"), /DAILY_TEXT_QUOTA_STORAGE_UNAVAILABLE/)
})

test("a live owner lock blocks conflicting writers without losing their balance", () => {
  const user = "p0-quota-locked"
  assert.equal(quota.recordGeneratedTextTokens(user, "free", "abcdef").used, 2)
  const file = ownerPath(user), lock = file + ".lock"
  fs.writeFileSync(lock, String(process.pid), { mode: 0o600 })
  try {
    assert.throws(() => quota.recordGeneratedTextTokens(user, "free", "abc"), /DAILY_TEXT_QUOTA_BUSY/)
    assert.equal(quota.getDailyTextTokenQuota(user, "free").used, 2)
  } finally {
    fs.unlinkSync(lock)
  }
  assert.equal(quota.recordGeneratedTextTokens(user, "free", "abc").used, 3)
  assert.equal(fs.existsSync(lock), false)
})

test("per-user request-frequency buckets honor the minute window and scope", () => {
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 1_000), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 1_001), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 1_002), false)
  assert.equal(frequency.takeRequestFrequency("p0-other", "u1", 2, 1_002), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u2", 2, 1_002), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 61_001), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 61_002), true)
  assert.equal(frequency.takeRequestFrequency("p0", "u1", 2, 61_003), false)
})

test("paid and founder allowances are not modified", () => {
  assert.equal(quota.dailyTextTokenLimitFor("owner"), null)
  assert.equal(quota.dailyTextTokenLimitFor("pro"), null)
  assert.equal(quota.dailyTextTokenLimitFor("ultra"), null)
})
