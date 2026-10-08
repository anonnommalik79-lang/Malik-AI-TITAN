import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { sharedAnswerCacheKey, mayShareAnswerCache, trimSharedAnswerCache, MAX_SHARED_ANSWER_CACHE_ENTRIES } from "../lib/server/public-answer-cache.ts"

const common = "Same introduction for both long briefs. ".repeat(30)
assert.notEqual(sharedAnswerCacheKey("v1", common + "last requirement A"), sharedAnswerCacheKey("v1", common + "last requirement B"),
  "long briefs that share their first 420 characters must not collide")
assert.notEqual(sharedAnswerCacheKey("v1", " Hello  WORLD "), sharedAnswerCacheKey("v1", "hello world"), "case and whitespace can change code meaning")
assert.equal(sharedAnswerCacheKey("v1", "e\u0301"), sharedAnswerCacheKey("v1", "\u00e9"), "Unicode normalization")
assert.ok(!sharedAnswerCacheKey("v1", "My private query text").includes("private"), "raw prompt is not a cache key")
assert.notEqual(sharedAnswerCacheKey("v1", "const MAX = 1"), sharedAnswerCacheKey("v1", "const max = 1"), "case-sensitive code stays separate")
assert.equal(mayShareAnswerCache({}, "Explain public black holes"), true)
for (const contextual of [
  { history: [{ role: "user", content: "private context" }] },
  { messages: [{ role: "user", content: "private context" }] },
  { attachments: [{ kind: "image", base64: "secret" }] },
  { metadata: { user: "someone" } },
  { client: { product: "account-specific" } },
  { projectId: "project-A" },
  { systemPrompt: "Remember user details" },
  { originalQuestion: "Explain public black holes", question: "Explain public black holes\nPRIVATE INSTRUCTION" },
]) {
  assert.equal(mayShareAnswerCache(contextual, "Explain public black holes"), false, "personal context bypasses shared answer cache")
}
assert.equal(mayShareAnswerCache({}, "A".repeat(10_000)), false, "large prompts are never shared across users")
const now = 200
const stored = new Map()
for (let index = 0; index < 75; index++) stored.set("key-" + index, { value: index, expiresAt: 500 })
trimSharedAnswerCache(stored, now)
assert.equal(stored.size, MAX_SHARED_ANSWER_CACHE_ENTRIES)
assert.equal(stored.has("key-0"), false)
assert.equal(stored.has("key-74"), true)
stored.set("expired", { value: 1, expiresAt: 199 })
trimSharedAnswerCache(stored, now)
assert.equal(stored.has("expired"), false)
const router = readFileSync("lib/malik-god-router.ts", "utf8")
assert.match(router, /sharedAnswerCacheKey\(SEARCH_CACHE_VERSION, prompt\)/, "runtime hashes full query")
assert.match(router, /mayShareAnswerCache\(body, prompt\)/, "runtime prevents contextual reuse")
assert.match(router, /trimSharedAnswerCache\(CACHE\)/, "runtime bounds memory")
assert.doesNotMatch(router, /replace\(\/\\s\+\/g, " "\)\.slice\(0, 420\)/, "old prefix key removed")
console.log("PASS cache safety: full-query key, contextual isolation, bounded memory, expiry and runtime wiring")
