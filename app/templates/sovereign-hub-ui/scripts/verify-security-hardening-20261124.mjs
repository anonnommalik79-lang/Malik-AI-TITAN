import assert from "node:assert/strict"
import fs from "node:fs"
const read = path => fs.readFileSync(path, "utf8")
assert.match(read("lib/auth/admin-policy.ts"), /user\?\.emailVerified === true/)
assert.doesNotMatch(read("lib/server/request-entitlement.ts"), /headers\.get\("user-agent"\)/)
const media = read("app/api/attachments/import-url/route.ts")
assert.match(media, /hostname: address/)
assert.match(media, /family: 4/)
assert.match(media, /total > MAX_REMOTE_BYTES/)
assert.doesNotMatch(media, /await fetch\(/)
for (const path of ["app/api/voice/deepgram-token/route.ts","app/api/voice/gemini-live-token/route.ts","app/api/ai/video/file/route.ts","app/api/ai/execute/route.ts"]) {
  const source = read(path)
  assert.match(source, /!entitlement\.authenticated/, path)
  assert.match(source, /takeSharedRequestFrequency\(/, path)
}
for (const path of ["app/api/ai/video/route.ts","app/api/ai/video/status/route.ts"]) assert.match(read(path), /job\.input\.userId !== entitlement\.userId/)
assert.match(read("app/api/ai/video/file/route.ts"), /job\.input\.userId === entitlement\.userId/)
assert.match(read("lib/server/durable-postgres.ts"), /ON CONFLICT \(key_hash,bucket\) DO UPDATE SET count/)
assert.match(read("lib/server/usage-persistence.ts"), /await incrementPostgresQuota/)
assert.match(read("lib/limits/rate-limit.ts"), /await takeSharedRequestFrequency/)
assert.match(read("next.config.mjs"), /script-src-attr 'none'/)
console.log("Security hardening source contracts passed")
