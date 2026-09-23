import assert from "node:assert/strict"
import {
  analyzeMalikBrainV1,
  buildMalikBrainSystemInstruction,
} from "../lib/ai/brain-v1.ts"

const casual = analyzeMalikBrainV1({ prompt: "привет" })
assert.equal(casual.task, "casual")
assert.equal(casual.depth, "instant")
assert.equal(casual.preferredModels[0], "malik-fast-120b")

const debug = analyzeMalikBrainV1({
  prompt: "Исправь баг в Next.js API route, проверь типы и build после фикса.",
  historyLength: 12,
})
assert.equal(debug.task, "debug")
assert.equal(debug.depth, "deep")
assert.equal(debug.needsVerification, true)
assert.equal(debug.preferredModels[0], "malik-bonsai-27b")

const research = analyzeMalikBrainV1({
  prompt: "Сравни актуальные API видеогенерации сегодня и проверь источники.",
})
assert.equal(research.task, "research")
assert.equal(research.depth, "deep")
assert.equal(research.needsFreshEvidence, true)
assert.equal(research.preferredModels[0], "malik-reason-753b")

const vision = analyzeMalikBrainV1({
  prompt: "Что происходит в этом видео?",
  attachments: [{
    name: "clip.mp4",
    mime: "video/mp4",
    kind: "video",
    url: "https://example.invalid/clip.mp4",
  }],
})
assert.equal(vision.task, "vision")
assert.equal(vision.needsVerification, true)
assert.equal(vision.preferredModels[0], "malik-vision-k3")

const instruction = buildMalikBrainSystemInstruction(debug)
assert.match(instruction, /MALIK_BRAIN_V1/)
assert.match(instruction, /acceptance criterion/i)
assert.match(instruction, /verify|verification/i)

console.log("MALIK Brain V1 verification passed")
