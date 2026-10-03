import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildContextualFollowUps } from "../lib/ai/chat-followups.ts"

const labels = (question, answer = "Готово.") => buildContextualFollowUps(question, answer).map((x) => x.label)
assert(labels("Как настроить iPhone?").includes("Пошагово"), "Russian UI guide")
assert(labels("Қалай баптау керек?").includes("Қадамдар"), "Kazakh UI guide")
assert(labels("How to install the app?").includes("Steps"), "English UI guide")
assert(labels("Исправь код TypeScript", "```ts\\nconst x = 1\\n```").includes("Проверь код"), "Code review")
assert(labels("Реши уравнение x² + 3 = 5").includes("Проверь расчёт"), "Numeric check")
assert(labels("Сравни два варианта").includes("Таблицей"), "Comparison")
const factual = buildContextualFollowUps("Расскажи про историю Алматы", "Исторический ответ")
assert(factual.some((x) => x.label === "Проверить факты" && x.research === true), "Fact checking requires research")
for (const question of ["Исправь код Python", "Реши уравнение"]) {
  assert(!buildContextualFollowUps(question, "Ответ").some((x) => x.research), "No redundant web search on code/math")
}
for (const question of ["Сравни", "Compare", "Салыстыр"]) {
  const result = buildContextualFollowUps(question, "Answer")
  assert(result.length >= 5 && result.length <= 6, "Compact controls")
  assert.equal(new Set(result.map((x) => x.label)).size, result.length, "No duplicate action labels")
}
const view = readFileSync(new URL("../components/sovereign/chat-view.tsx", import.meta.url), "utf8")
const extras = readFileSync(new URL("../components/sovereign/chat-extras.tsx", import.meta.url), "utf8")
assert.match(view, /<FollowUpChips onSend=\{onFollowUp\} question=\{question\} answer=\{displayContent\}/, "Context passed from actual response")
assert.match(view, /research: options\?\.research === true \? true : undefined/, "Research routed, not merely relabeled")
assert.match(view, /<AnswerDownloadButton text=\{displayContent\}/, "Completed answer export")
assert.match(extras, /URL\.createObjectURL\(blob\)/, "Export creates a real browser download")
console.log("PASS chat V7: RU/KK/EN, code/math/how-to, researched fact-check, context routing, Markdown export")
