import assert from "node:assert/strict"
import fs from "node:fs"

function read(path) {
  return fs.readFileSync(path, "utf8")
}

const orchestrator = read("lib/server/malik-coder-orchestrator.ts")
const router = read("lib/server/malik-model-router.ts")
const stream = read("app/api/stream/route-impl.ts")
const quota = read("lib/server/daily-text-token-quota.ts")
const envExample = read(".env.example")
const render = read("../../../../render.yaml")

console.log("\nlong-code runtime invariants")

assert.match(quota, /FREE_DAILY_TEXT_TOKEN_LIMIT \|\| 10_000/)
assert.match(orchestrator, /normalizedBudget\(input\.maxTokens, code \? 10_000 : 4_000\)/)
assert.match(orchestrator, /USER REQUEST:\\n\$\{prompt\}/)
assert.ok(!orchestrator.includes("clip(prompt, 9000)"), "accepted coding prompts must not be silently cut to 9K chars")
assert.match(orchestrator, /remainingBudget = Math\.max\(0, totalBudget - estimateVisibleTokens\(result\)\)/)

assert.match(router, /const CODE_PROVIDER_TIMEOUT_MS = 360_000/)
assert.match(router, /GROQ_TPM_BUDGET/)
assert.match(router, /estimateProviderInputTokens\(messages\)/)
assert.ok(!router.includes("Math.min(requested, 650)"), "Qwen must not be hard-capped to 650 output tokens")
assert.ok(!router.includes("Math.min(requested, 1_600)"), "AIHubMix must not be hard-capped to 1600 output tokens")
assert.ok(!router.includes("Math.min(requested, 2_000)"), "large-code routes must not be hard-capped to 2000 output tokens")

assert.match(stream, /getDailyTextTokenQuota/)
assert.match(stream, /maxTokens: maxOutputTokens/)
assert.match(stream, /runSelectedAnswer\(routedBody, selection, undefined, maxOutputTokens\)/)
assert.match(stream, /setInterval\(\(\) => \{/)

for (const [name, value] of [
  ["FREE_DAILY_TEXT_TOKEN_LIMIT", "10000"],
  ["MAX_OUTPUT_TOKENS", "4000"],
  ["MAX_CODE_OUTPUT_TOKENS", "10000"],
  ["MALIK_MODEL_PROVIDER_TIMEOUT_MS", "360000"],
  ["GROQ_TPM_BUDGET", "8000"],
]) {
  assert.match(envExample, new RegExp(`^${name}=${value}$`, "m"), `${name} missing from .env.example`)
}

for (const [name, value] of [
  ["FREE_DAILY_TEXT_TOKEN_LIMIT", "10000"],
  ["MAX_OUTPUT_TOKENS", "4000"],
  ["MAX_CODE_OUTPUT_TOKENS", "10000"],
  ["MALIK_MODEL_PROVIDER_TIMEOUT_MS", "360000"],
  ["GROQ_TPM_BUDGET", "8000"],
]) {
  const block = new RegExp(`- key: ${name}\\s+value: ["']?${value}["']?`)
  assert.match(render, block, `${name} production value is stale in render.yaml`)
}

console.log("all long-code runtime checks passed")
