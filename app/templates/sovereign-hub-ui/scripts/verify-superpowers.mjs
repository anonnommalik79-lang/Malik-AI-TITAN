import assert from "node:assert/strict"
import {
  MALIK_SUPERPOWERS,
  buildMalikSuperpowerSystemPrompt,
  detectMalikSuperpowers,
  superpowerOutputBudget,
} from "../lib/ai/superpowers.ts"

assert.ok(MALIK_SUPERPOWERS.length >= 30, "Superpower OS must expose the full capability set")
assert.equal(MALIK_SUPERPOWERS.some((power) => /codex/i.test(power.id)), false, "Codex must stay outside Superpower OS")
assert.equal(new Set(MALIK_SUPERPOWERS.map((power) => power.id)).size, MALIK_SUPERPOWERS.length, "Superpower IDs must be unique")

for (const power of MALIK_SUPERPOWERS) {
  assert.ok(power.title.length >= 3, `${power.id}: title is required`)
  assert.ok(power.summary.length >= 24, `${power.id}: substantial summary is required`)
  assert.ok(power.abilities.length >= 4, `${power.id}: each power needs multiple concrete abilities`)
  assert.ok(power.instruction.length >= 60, `${power.id}: each power needs a strong execution contract`)
}

const deep = detectMalikSuperpowers("Проведи глубокое исследование последних AI video API и сравни источники")
assert.ok(deep.some((power) => power.id === "deep-research"))
assert.ok(deep.some((power) => power.id === "web-search"))
assert.ok(superpowerOutputBudget(deep) >= 7000)

const vision = detectMalikSuperpowers("Что здесь происходит?", [{
  name: "screen.png",
  mime: "image/png",
  kind: "image",
}])
assert.ok(vision.some((power) => power.id === "vision"))

const edit = detectMalikSuperpowers("Убери человека с фото и замени фон")
assert.ok(edit.some((power) => power.id === "image-edit"))

const workflow = detectMalikSuperpowers("Сначала найди данные, потом проанализируй и создай итоговый документ")
assert.ok(workflow.some((power) => power.id === "long-workflows"))

const prompt = buildMalikSuperpowerSystemPrompt(deep)
assert.match(prompt, /MALIK_SUPERPOWER_OS/)
assert.match(prompt, /Never claim .* external action succeeded/i)
assert.doesNotMatch(prompt, /Codex/i)

console.log(`MALIK Superpower OS verification passed · ${MALIK_SUPERPOWERS.length} powers · Codex excluded`)
