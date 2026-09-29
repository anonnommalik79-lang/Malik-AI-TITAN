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

const stressPrompt = [
  "Ты проходишь комплексный тест. Не пропускай задания.",
  "1. ЛОГИКА — реши расчёт.",
  "2. ТЕКСТ — максимум 120 слов.",
  "3. КОД — дай рабочий компонент.",
  "4. DEBUGGING — найди ошибку.",
  "5. АРХИТЕКТУРА — покажи схему.",
  "6. IMAGE — выполни пункт.",
  "7. VISION — выполни пункт.",
  "8. ФИНАЛ — в самом конце выведи TEST COMPLETE.",
  ...Array.from({ length: 35 }, (_, index) => `- требование ${index + 1}`),
].join("\n")
const stress = analyzeMalikBrainV1({ prompt: stressPrompt, requestedDepth: "fast" })
assert.equal(stress.depth, "ultra", "fast UI preference must not downgrade a dense multi-part prompt")
assert.ok(stress.outputTokenTarget >= 12_000)
assert.ok(stress.reasons.includes("many-requirements"))
assert.ok(stress.reasons.includes("strict-output-contract"))

const instruction = buildMalikBrainSystemInstruction(debug)
assert.match(instruction, /MALIK_BRAIN_V1/)
assert.match(instruction, /acceptance criterion/i)
assert.match(instruction, /acceptance checklist/i)
assert.match(instruction, /completion marker/i)
assert.match(instruction, /verify|verification/i)

console.log("MALIK Brain V1 verification passed")
