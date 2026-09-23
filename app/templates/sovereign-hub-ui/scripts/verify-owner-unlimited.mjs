import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")

const entitlement = read("lib/server/request-entitlement.ts")
assert.match(entitlement, /user\.emailVerified/)
assert.match(entitlement, /isVerifiedOwner\(user\)\s*\?\s*"owner"/)

const clientUsage = read("lib/usage-limits.ts")
assert.match(clientUsage, /isOwnerEmail/)
assert.match(clientUsage, /if\s*\(isOwnerUser\(userEmail\)\)\s*return true/)
assert.doesNotMatch(clientUsage, /type\s*!==\s*"video"/)
assert.doesNotMatch(clientUsage, /anonnommalik79@gmail\.com|admin@malik\.ai/)

const limits = read("lib/limits/rate-limit.ts")
assert.match(limits, /input\.plan === "owner" && isOwnerEmail\(userId\)/)
assert.match(limits, /remaining:\s*Number\.MAX_SAFE_INTEGER/)

const legacyLimits = read("lib/ai/rate-limit.ts")
assert.match(legacyLimits, /input\.plan === "owner" && isOwnerEmail\(userId\)/)

const video = read("app/api/media/video/route.ts")
assert.match(video, /const ownerMode = user\.plan === "owner"/)
assert.match(video, /ownerMode \? null : await getVideoAccountDailyQuota/)
assert.match(video, /if \(!ownerMode && !acquireVideoAccountInFlight/)
assert.match(video, /if \(!ownerMode\) await recordMediaUsage/)
assert.match(video, /unlimited:\s*ownerMode/)

const computeIdentity = read("lib/malik-compute/identity.ts")
assert.match(computeIdentity, /user\.emailVerified && isVerifiedOwner\(user\)/)

const compute = read("lib/malik-compute/runtime.ts")
const bypass = compute.indexOf("if (identity.admin === true)")
const reserve = compute.indexOf("computeService.reserveCompute")
assert.ok(bypass >= 0 && reserve >= 0 && bypass < reserve, "owner bypass must happen before Compute reservation")
assert.match(compute, /if \(identity\.admin === true\) return handler\(request\)/)

const musicQuota = read("lib/server/music-account-quota.ts")
assert.match(musicQuota, /const owner = plan === "owner"/)
assert.match(musicQuota, /dailyLimit = owner[\s\S]*Number\.MAX_SAFE_INTEGER/)
assert.match(musicQuota, /if \(limits\.unlimited\)/)

const musicRoute = read("app/api/media/music/route.ts")
assert.match(musicRoute, /const ownerMode = user\.plan === "owner"/)
assert.match(musicRoute, /if \(!ownerMode && quota\.remaining <= 0\)/)
assert.match(musicRoute, /if \(!ownerMode && !acquireMusicInFlight/)

const musicUi = read("components/sovereign/music-generation/MusicGenerationStudio.tsx")
assert.match(musicUi, /const musicUnlimited = Boolean/)
assert.match(musicUi, /∞ · без лимита/)
assert.match(musicUi, /!musicUnlimited && Number\(config\.limits\.remaining/)

const voice = read("app/api/transcribe/route.ts")
assert.match(voice, /const ownerMode = entitlement\.plan === "owner"/)
assert.match(voice, /getVoiceUsage\(entitlement\.userId, ownerMode\)/)
assert.match(voice, /consumeVoiceUsage\(entitlement\.userId, measuredDuration, ownerMode\)/)

const media = read("lib/media/limits.ts")
assert.match(media, /if \(tier === "owner"\) return Number\.MAX_SAFE_INTEGER/)
assert.match(media, /remaining:\s*tier === "owner" \? Number\.MAX_SAFE_INTEGER/)

const presentations = read("lib/server/presentation-quota.ts")
assert.match(presentations, /case "owner":[\s\S]*unlimited:\s*true/)

console.log("verified founder is unlimited across Malik application quotas")
