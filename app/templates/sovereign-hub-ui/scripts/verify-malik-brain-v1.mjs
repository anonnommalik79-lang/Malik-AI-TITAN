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

const arithmetic = analyzeMalikBrainV1({ prompt: "2 + 2" })
assert.equal(arithmetic.task, "quantitative")
assert.equal(arithmetic.needsFreshEvidence, false)
assert.equal(arithmetic.needsVerification, true)
assert.notEqual(arithmetic.depth, "ultra", "Tiny arithmetic must not trigger ultra reasoning")

const equation = analyzeMalikBrainV1({ prompt: "Реши квадратное уравнение x² - 5x + 6 = 0", requestedDepth: "fast" })
assert.equal(equation.task, "quantitative")
assert.equal(equation.depth, "deep", "Multistep math must not be silently downgraded by Fast mode")
assert.equal(equation.preferredModels[0], "malik-reason-753b")
assert.match(buildMalikBrainSystemInstruction(equation), /ORIGINAL equation/)
assert.match(buildMalikBrainSystemInstruction(equation), /exact/i)

const physics = analyzeMalikBrainV1({ prompt: "Физика: вычисли ускорение тела, если скорость изменилась на 20 м/с за 4 секунды" })
assert.equal(physics.task, "quantitative")
assert.match(buildMalikBrainSystemInstruction(physics), /dimensional consistency/)

const chatOnly = analyzeMalikBrainV1({ prompt: "Привет! Как настроение?" })
assert.notEqual(chatOnly.task, "quantitative")
const unrelated = analyzeMalikBrainV1({ prompt: "Расскажи про релиз Next.js 16 и новые API" })
assert.notEqual(unrelated.task, "quantitative")
