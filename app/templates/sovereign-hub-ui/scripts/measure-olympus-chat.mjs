// Measures the request passed to the real model router. The transport and its
// response are fixtures: character counts are exact; no provider tokens or latency are inferred.
import { workTestLoader } from "./work-test-loader.mjs"
import { execFileSync } from "node:child_process"
import path from "node:path"

const calls = []
const routerFile = "lib/malik-god-router.ts"
const baseline = process.argv[2]
const baselineFiles = baseline ? {
  [path.resolve(routerFile)]: execFileSync("git", ["show", `${baseline}:app/templates/sovereign-hub-ui/${routerFile}`], { encoding: "utf8" }),
} : {}
const load = workTestLoader({
  "@/lib/server/malik-model-router": {
    runStrictMalikModel: async (input) => {
      calls.push({ systemChars: input.systemPrompt.length, promptChars: input.prompt.length, maxOutputTokens: input.maxTokens, effort: input.reasoningEffort })
      return { content: "391", model: "fixture", provider: "fixture", selectedModelId: input.modelId, latencyMs: 0 }
    },
  },
  "@/lib/server/context-fusion": { requestedFusionConnectors: () => [] },
  "@/lib/server/science-context": { collectMalikScienceContext: async () => ({ sources: [], context: "", providers: [] }) },
  "@/lib/server/petroleum-eia": { fetchEiaSpotEvidence: async () => ({ context: "" }) },
}, baselineFiles)
const { malikGodAnswer } = load(routerFile)
for (const [name, question, responseDepth] of [
  ["greeting", "Привет", "balanced"],
  ["arithmetic", "Сколько будет 17 × 23?", "balanced"],
  ["arithmetic deep", "Сколько будет 17 × 23?", "ultra"],
  ["simple text", "Назови столицу Казахстана", "balanced"],
]) {
  calls.length = 0
  const started = performance.now()
  await malikGodAnswer({ question, responseDepth, disableResearch: true }, { modelId: "malik-max" })
  console.log(JSON.stringify({ name, elapsedFixtureMs: Math.round(performance.now() - started), calls }))
}
