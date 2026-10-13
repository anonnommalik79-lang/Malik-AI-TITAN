import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  DEFAULT_MALIK_MODEL_ID,
  FREE_MALIK_MODELS,
  GOOGLE_AI_POOL_MODELS,
  MALIK_OIL_1TB_MODEL,
  LING_3_1_FLASH_MODEL,
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
assert.equal(PUBLIC_MALIK_MODELS[1]?.id, "malik-oil-1tb", "Oil BETA must be the second model, directly below MAX")
assert.deepEqual(
  PUBLIC_MALIK_MODELS.slice(2, 2 + GOOGLE_AI_POOL_MODELS.length).map((model) => model.id),
  GOOGLE_AI_POOL_MODELS.map((model) => model.id),
  "Official Google Gemini/Gemma pool must remain below MAX and Oil BETA",
)
assert.deepEqual(
  GOOGLE_AI_POOL_MODELS.map((model) => model.providerModel),
  ["gemini-3.6-flash", "gemini-3.5-flash", "gemma-4-26b-a4b-it", "gemma-4-31b-it", "gemini-3-flash-preview", "gemini-flash-lite-latest"],
)
assert.ok(GOOGLE_AI_POOL_MODELS.every((model) => model.provider === "google-ai" && model.brand === "google" && model.tier === "pro"))

assert.equal(PUBLIC_MALIK_MODELS.length, 133, "Selector must expose MAX + Oil + 6 Google + Ling + 123 router text + LLM7 Default")
// Oil BETA is publicly selectable second, while remaining special provider
// availability is reported by the real runtime rather than promising 3/3.
assert.deepEqual(FREE_MALIK_MODELS.map((model) => model.id), ["malik-max", "malik-oil-1tb"])
assert.equal(PRO_MALIK_MODELS.length, 131, "Other paid model choices must remain gated")
assert.equal(new Set(MALIK_MODELS.map((model) => model.id)).size, MALIK_MODELS.length, "Model IDs must be unique")

for (const model of FREE_MALIK_MODELS) {
  assert.equal(model.hidden, undefined)
  assert.equal(model.tier, "free")
  assert.equal(canUseMalikModel(model.id, "free"), true, `${model.id} must be selectable on Free`)
}
for (const model of PRO_MALIK_MODELS) {
  assert.equal(model.hidden, undefined)
  assert.equal(model.tier, "pro")
  assert.ok(model.access === "catalog" || model.access === "free")
  assert.equal(canUseMalikModel(model.id, "free"), false, `${model.id} must be locked on Free`)
  assert.equal(canUseMalikModel(model.id, "pro"), true, `${model.id} must unlock on MalikAI Plus`)
  assert.equal(canUseMalikModel(model.id, "owner"), true, `${model.id} must unlock for owner`)
}

assert.equal(ROUTER_AUTO_TEXT_CATALOG.length, 47, "xKiro + Nara verified auto-free routes changed unexpectedly")
assert.ok(MAX_ROUTER_MODEL_IDS.includes("router:llm7:default"), "LLM7 free default router must be inside MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.some((id) => id.startsWith("router:xkiro:")), "xKiro pool missing from MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.some((id) => id.startsWith("router:nara:")), "Nara pool missing from MAX")
assert.ok(MAX_ROUTER_MODEL_IDS.includes("malik-20b"), "Existing Malik provider pool must remain a MAX fallback")


const oil = getMalikModel("malik-oil-1tb")
assert.deepEqual(oil, MALIK_OIL_1TB_MODEL)
assert.equal(oil.provider, "malik-oil-ensemble")
assert.equal(oil.brand, "malik-oil")
assert.equal(oil.autoEligible, false)
assert.equal(oil.tier, "free")
assert.equal(canUseMalikModel(oil.id, "free"), true)
assert.equal(canUseMalikModel(oil.id, "owner"), true)
assert.ok(!MAX_ROUTER_MODEL_IDS.includes(oil.id), "An ensemble must not recursively auto-route into MAX")
assert.equal(PUBLIC_MALIK_MODELS[1].id, oil.id)
const oilLogo = readFileSync("components/sovereign/MalikModelSelector.tsx", "utf8")
assert.match(oilLogo, /"malik-oil": \{ label: "Malik Oil 1TB.*urls: \[MALIK_MAX_ICON\]/)
assert.match(oilLogo, /model\.id === "malik-oil-1tb"/)
assert.match(oilLogo, /malik-model-selector__beta-badge/)
assert.match(oilLogo, /aria-label="Бета-версия">БЕТА/)
const oilBadgeCss = readFileSync("app/malik-model-selector.css", "utf8")
assert.match(oilBadgeCss, /\.malik-model-selector__beta-badge\s*\{/)
assert.match(oilBadgeCss, /color:\s*#c4b5fd/)
const oilRoute = readFileSync("lib/server/malik-model-router.ts", "utf8")
assert.match(oilRoute, /runMalikOilEnsemble\(input/)
assert.match(oilRoute, /NVIDIA_NIM_ENABLED/)
const ensemble = readFileSync("lib/server/malik-oil-ensemble.ts", "utf8")
assert.match(ensemble, /runMalikOilEnsemble/)
assert.match(ensemble, /"ling-3.1-flash"/)
assert.match(ensemble, /"nvidia-nemotron-ultra-550b"/)
assert.match(ensemble, /"malik-max"/)

const ling = getMalikModel("ling-3.1-flash")
assert.deepEqual(ling, LING_3_1_FLASH_MODEL)
assert.equal(ling.provider, "ling-openrouter")
assert.equal(ling.providerModel, "inclusionai/ling-3.1-flash")
assert.equal(ling.brand, "ling")
assert.equal(ling.tier, "pro")
assert.equal(ling.access, "free")
assert.equal(canUseMalikModel(ling.id, "owner"), true)
assert.equal(canUseMalikModel(ling.id, "free"), false)
assert.equal(PUBLIC_MALIK_MODELS[2 + GOOGLE_AI_POOL_MODELS.length]?.id, ling.id)
assert.ok(!MAX_ROUTER_MODEL_IDS.includes(ling.id), "Ling quota must not be auto-spent")
const lingSelector = readFileSync("components/sovereign/MalikModelSelector.tsx", "utf8")
const selectedRouter = readFileSync("lib/server/malik-model-router.ts", "utf8")
const maxEngine = readFileSync("lib/server/malik-max-engine.ts", "utf8")
assert.match(lingSelector, /ling:\s*\{ label: "InclusionAI/)
assert.match(selectedRouter, /model\.provider === "ling-openrouter"/)
assert.match(selectedRouter, /env\("MALIK_LING_API_KEY"\)/)
assert.match(selectedRouter, /env\("MALIK_LING_MODEL"\)/)
assert.match(maxEngine, /function lingDirectLanes\(\)/)
assert.match(maxEngine, /keys: keysFor\("MALIK_LING_API_KEY"\)/)
assert.match(maxEngine, /model\.provider === "ling-openrouter"/)
assert.doesNotMatch(maxEngine.slice(maxEngine.indexOf("async function directLanes"), maxEngine.indexOf("/** Every lane MAX")), /lingDirectLanes\(/, "Ling must not consume MAX auto quota")

const xkiroMistral = getMalikModel("router:xkiro:mistralai/mistral-small-2603")
assert.equal(xkiroMistral.label, "Mistral Small 4")
assert.equal(xkiroMistral.access, "free")

const llm7Sol = getMalikModel("router:llm7:gpt-5.6-sol")
assert.equal(llm7Sol.label, "gpt-5.6-sol")
assert.equal(llm7Sol.access, "catalog", "Catalog presence must not be mislabeled as free")
assert.equal(llm7Sol.tier, "pro")
assert.equal(canUseMalikModel(llm7Sol.id, "free"), false)
assert.equal(canUseMalikModel(llm7Sol.id, "pro"), true)

const naraNemotron = getMalikModel("router:nara:nemotron-3-ultra-free")
assert.equal(naraNemotron.label, "Nemotron 3 Ultra Free")
assert.equal(naraNemotron.access, "free")
assert.equal(naraNemotron.tier, "pro", "Free provider routes are still MalikAI Plus picks; free users get them through MAX")
assert.equal(canUseMalikModel("malik-max", "free"), true)

console.log(`Verified ${PUBLIC_MALIK_MODELS.length} public text choices, ${MAX_ROUTER_MODEL_IDS.length} MAX failover lanes and 138 router catalogue entries.`)
