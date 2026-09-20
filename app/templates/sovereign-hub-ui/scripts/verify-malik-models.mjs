import assert from "node:assert/strict"
import {
  DEFAULT_MALIK_MODEL_ID,
  FREE_MALIK_MODELS,
  MALIK_MODELS,
  MAX_ROUTER_MODEL_IDS,
  PRO_MALIK_MODELS,
  PUBLIC_MALIK_MODELS,
  canUseMalikModel,
  getMalikModel,
} from "../lib/ai/malik-models.ts"
import {
  ROUTER_CATALOG,
  ROUTER_CATALOG_COUNTS,
  ROUTER_AUTO_TEXT_CATALOG,
} from "../lib/ai/router-catalog.ts"

assert.deepEqual(ROUTER_CATALOG_COUNTS, { total: 138, text: 123, image: 9, video: 6 }, "Three-router catalogue must stay 138 = 123 text + 9 image + 6 video")
assert.equal(ROUTER_CATALOG.length, 138)
assert.equal(DEFAULT_MALIK_MODEL_ID, "malik-max", "MalikLLM MAX must be the default")
assert.equal(PUBLIC_MALIK_MODELS[0]?.id, "malik-max", "MalikLLM MAX must be first in the selector")
assert.equal(getMalikModel("malik-max").label, "MalikLLM MAX")
assert.equal(getMalikModel("malik-max").provider, "malik-orchestrator")

assert.equal(PUBLIC_MALIK_MODELS.length, 125, "Selector must expose MAX + 123 router text entries + LLM7 Default")
assert.equal(FREE_MALIK_MODELS.length, PUBLIC_MALIK_MODELS.length, "Every public text model is unlocked in the app")
assert.equal(PRO_MALIK_MODELS.length, 0, "No text models are Pro-gated")
assert.equal(new Set(MALIK_MODELS.map((model) => model.id)).size, MALIK_MODELS.length, "Model IDs must be unique")

for (const model of PUBLIC_MALIK_MODELS) {
  assert.equal(model.hidden, undefined)
  assert.equal(model.tier, "free")
  assert.equal(canUseMalikModel(model.id, "free"), true, `${model.id} must be selectable on Free`)
}

assert.equal(ROUTER_AUTO_TEXT_CATALOG.length, 47, "xKiro + Nara verified auto-free routes changed unexpectedly")
assert.ok(MAX_ROUTER_MODEL_IDS.includes("router:llm7:default"), "LLM7 free default router must be inside MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.some((id) => id.startsWith("router:xkiro:")), "xKiro pool missing from MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.some((id) => id.startsWith("router:nara:")), "Nara pool missing from MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.includes("malik-20b"), "Existing Malik provider pool must remain a MAX fallback")

const xkiroMistral = getMalikModel("router:xkiro:mistralai/mistral-small-2603")
assert.equal(xkiroMistral.label, "Mistral Small 4")
assert.equal(xkiroMistral.access, "free")

const llm7Sol = getMalikModel("router:llm7:gpt-5.6-sol")
assert.equal(llm7Sol.label, "gpt-5.6-sol")
assert.equal(llm7Sol.access, "catalog", "Catalog presence must not be mislabeled as free")

const naraNemotron = getMalikModel("router:nara:nemotron-3-ultra-free")
assert.equal(naraNemotron.label, "Nemotron 3 Ultra Free")
assert.equal(naraNemotron.access, "free")

console.log(`Verified ${PUBLIC_MALIK_MODELS.length} public text choices, ${MAX_ROUTER_MODEL_IDS.length} MAX failover lanes and 138 router catalogue entries.`)
