import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")

const privateStore = read("lib/server/private-json-store.ts")
const billing = read("lib/server/billing-store.ts")
const projectStore = read("lib/server/project-artifact-store.ts")
const projectRoute = read("app/api/ai/project/route.ts")
const projectDownload = read("app/api/ai/project/artifacts/[id]/download/route.ts")
const videoJobs = read("lib/media/jobs.ts")
const videoRouter = read("lib/media/video-router.ts")
const videoStatus = read("app/api/media/video/status/route.ts")
const videoFile = read("app/api/media/video/file/route.ts")
const history = read("app/api/ai/history/route.ts")
const modelRouter = read("lib/server/malik-model-router.ts")

assert.match(privateStore, /GetObjectCommand/)
assert.match(privateStore, /PutObjectCommand/)
assert.match(privateStore, /CacheControl:\s*"private, no-store"/)
assert.match(privateStore, /MAX_PRIVATE_JSON_BYTES/)

assert.match(billing, /writePrivateJson\(planKey/)
assert.match(billing, /readPrivateJson<StoredPlanGrant>/)
assert.match(billing, /grantRuntimePlan/)
assert.match(billing, /object-storage/)

assert.match(projectStore, /ownerId:\s*string/)
assert.match(projectStore, /writePrivateJson\(artifactKey/)
assert.match(projectStore, /readPrivateJson<StoredProjectArtifact>/)
assert.match(projectRoute, /resolveRequestEntitlement/)
assert.doesNotMatch(projectRoute, /body\?\.userEmail/)
assert.match(projectDownload, /getProjectArtifact\(id, entitlement\.userId\)/)

assert.match(videoJobs, /readPrivateJson<StoredVideoJob>/)
assert.match(videoJobs, /writePrivateJson\(jobKey/)
assert.match(videoRouter, /await saveVideoJob/)
assert.match(videoRouter, /refreshVideoJobStatus\(taskId: string, providerHint\?: VideoProviderId, userId\?: string\)/)
assert.match(videoStatus, /resolveMediaUser/)
assert.match(videoStatus, /refreshVideoJobStatus\(taskId, provider, user\.userId\)/)
assert.match(videoFile, /refreshVideoJobStatus\(taskId, "magichour", user\.userId\)/)

assert.match(history, /resolveRequestEntitlement/)
assert.doesNotMatch(history, /searchParams\.get\("userId"\)/)

assert.match(modelRouter, /ProviderRuntimeHealth/)
assert.match(modelRouter, /providerFallbackScore/)
assert.match(modelRouter, /recordProviderSuccess/)
assert.match(modelRouter, /recordProviderFailure/)
assert.match(modelRouter, /\.sort\(\(left, right\) => left\.score - right\.score\)/)

console.log("Malik core hardening contracts OK")
