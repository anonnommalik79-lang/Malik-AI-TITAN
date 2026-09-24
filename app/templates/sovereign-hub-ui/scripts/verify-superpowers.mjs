import assert from "node:assert/strict"
import {
  MALIK_SUPERPOWERS,
  buildMalikSuperpowerSystemPrompt,
  detectMalikSuperpowers,
  superpowerOutputBudget,
} from "../lib/ai/superpowers.ts"

assert.ok(MALIK_SUPERPOWERS.length >= 50, "Superpower OS must expose the expanded capability set")
assert.equal(MALIK_SUPERPOWERS.some((power) => /codex/i.test(power.id)), false, "Codex must stay outside Superpower OS")
assert.equal(new Set(MALIK_SUPERPOWERS.map((power) => power.id)).size, MALIK_SUPERPOWERS.length, "Superpower IDs must be unique")

for (const power of MALIK_SUPERPOWERS) {
  assert.ok(power.title.length >= 3, `${power.id}: title is required`)
  assert.ok(power.summary.length >= 24, `${power.id}: substantial summary is required`)
  assert.ok(power.abilities.length >= 4, `${power.id}: each power needs multiple concrete abilities`)
  assert.ok(power.instruction.length >= 60, `${power.id}: each power needs a strong execution contract`)
}

const ids = (prompt, attachments = []) => new Set(detectMalikSuperpowers(prompt, attachments).map((power) => power.id))

const deep = detectMalikSuperpowers("Проведи глубокое исследование последних AI video API и сравни источники")
const deepIds = new Set(deep.map((power) => power.id))
assert.ok(deepIds.has("deep-research"))
assert.ok(deepIds.has("web-search"))
assert.ok(deepIds.has("self-check"))
assert.ok(deepIds.has("adaptive-effort"))
assert.ok(superpowerOutputBudget(deep) >= 12_000)

const vision = ids("Что здесь происходит?", [{
  name: "screen.png",
  mime: "image/png",
  kind: "image",
}])
assert.ok(vision.has("vision"))

const edit = ids("Убери человека с фото и замени фон")
assert.ok(edit.has("image-edit"))

const workflow = ids("Сначала найди данные, потом проанализируй и создай итоговый документ")
assert.ok(workflow.has("long-workflows"))
assert.ok(workflow.has("recovery"))

const science = ids("Проведи научное исследование по PubMed и arXiv и проверь расчёты")
assert.ok(science.has("science"))
assert.ok(science.has("self-check"))
assert.ok(science.has("adaptive-effort"))
assert.ok(science.has("code-execution"))

const context = ids("Проанализируй огромный документ с long context и не обрезай ответ")
assert.ok(context.has("long-context"))
assert.ok(context.has("large-output"))

const fusion = ids("Исследуй интернет и мои данные из Gmail и Google Drive")
assert.ok(fusion.has("context-fusion"))

const execute = ids("Запусти Python и посчитай статистику")
assert.ok(execute.has("code-execution"))

const mcp = ids("Подключи MCP server и покажи его tools")
assert.ok(mcp.has("mcp"))

const prompt = buildMalikSuperpowerSystemPrompt(deep)
assert.match(prompt, /MALIK_SUPERPOWER_OS/)
assert.match(prompt, /Never claim .* external action succeeded/i)
assert.doesNotMatch(prompt, /Codex/i)

console.log(`MALIK Superpower OS verification passed · ${MALIK_SUPERPOWERS.length} powers · Codex excluded`)
