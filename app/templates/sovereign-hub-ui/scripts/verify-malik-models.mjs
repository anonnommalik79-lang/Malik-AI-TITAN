import assert from "node:assert/strict"
import {
  DEFAULT_MALIK_MODEL_ID,
  MALIK_MODELS,
  canUseMalikModel,
  getMalikModel,
} from "../lib/ai/malik-models.ts"

const expected = {
  "malik-8b": ["cloudflare", "@cf/meta/llama-3.1-8b-instruct-fast"],
  "malik-20b": ["groq", "openai/gpt-oss-20b"],
  "malik-fast-120b": ["cerebras", "gpt-oss-120b"],
  "malik-27b": ["groq", "qwen/qwen3.8-27b"],
  "malik-30b": ["cloudflare", "@cf/qwen/qwen3-30b-a3b-fp8"],
  "malik-vision-26b": ["cloudflare", "@cf/google/gemma-4-26b-a4b-it"],
  "malik-coder-32b": ["cloudflare", "@cf/qwen/qwen2.5-coder-32b-instruct"],
  "malik-70b": ["cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  "malik-120b": ["groq", "openai/gpt-oss-120b"],
  "malik-agent-120b": ["cloudflare", "@cf/nvidia/nemotron-3-120b-a12b"],
}

assert.equal(MALIK_MODELS.length, 10, "The selector must expose ten live Malik models")
assert.equal(new Set(MALIK_MODELS.map((model) => model.id)).size, 10, "Model IDs must be unique")
assert.equal(new Set(MALIK_MODELS.map((model) => `${model.provider}:${model.providerModel}`)).size, 10, "Provider routes must be unique")
assert.equal(DEFAULT_MALIK_MODEL_ID, "malik-27b", "Qwen 3.8 must be the default text model")

for (const [id, [provider, providerModel]] of Object.entries(expected)) {
  const model = getMalikModel(id)
  assert.equal(model.provider, provider, `${id} provider`)
  assert.equal(model.providerModel, providerModel, `${id} provider model`)
  assert.equal(canUseMalikModel(id, "pro"), true, `${id} must be available to Pro`)
  assert.equal(canUseMalikModel(id, "free"), model.tier === "free", `${id} Free gate`)
  console.log(`${id} -> ${model.provider} -> ${model.providerModel} [${model.tier}]`)
}

assert.deepEqual(
  MALIK_MODELS.filter((model) => canUseMalikModel(model.id, "free")).map((model) => model.id),
  ["malik-20b", "malik-fast-120b", "malik-27b"],
  "Free must expose the three live free text models",
)

for (const model of MALIK_MODELS) {
  assert.match(model.label, /^MalikLLM .*\d+B$/, `${model.id} label must use MalikLLM and end in parameter count`)
}
assert.equal(MALIK_MODELS.some((model) => model.providerModel === "zai-glm-4.7"), false, "Deprecated GLM 4.7 must not be exposed")
assert.equal(MALIK_MODELS.some((model) => model.providerModel.includes("gemini")), false, "Hidden Gemini must never appear in the selector")
console.log("Verified 10 unique live MalikLLM routes, branding, and Free/Plus gates.")
