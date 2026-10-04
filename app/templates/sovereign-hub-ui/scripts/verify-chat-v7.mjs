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
assert.match(view, /<FollowUpChips onSend=\{onFollowUp\} question=\{question\} answer=\{displayContent\} hasAttachment=\{questionHasAttachment\}/, "Question and attachment context passed from actual response")
assert.match(view, /research: options\?\.research === true \? true : undefined/, "Research routed, not merely relabeled")
assert.match(view, /const actionContent = isUser \? displayContent : stripAnswerPhotoHints\(answerCardsToText\(displayContent\)\)/, "Export strips internal photo metadata and writes cards as text")
assert.match(view, /<AnswerDownloadButton text=\{actionContent\}/, "Completed answer export")
assert.match(extras, /URL\.createObjectURL\(blob\)/, "Export creates a real browser download")
assert(buildContextualFollowUps("Посмотри скриншот", "Ответ", { hasAttachment: true }).some(x => x.label === "Разобрать файл"), "Attachment follow-up in Russian")
assert(buildContextualFollowUps("Файлды қара", "Жауап", { hasAttachment: true }).some(x => x.label === "Файлды талдау"), "Attachment follow-up in Kazakh")
assert(buildContextualFollowUps("Review this image", "Answer", { hasAttachment: true }).some(x => x.label === "Analyze file"), "Attachment follow-up in English")
assert(buildContextualFollowUps("Review this image", "Answer", { hasAttachment: true }).every(x => !x.research), "No unrelated automatic fact-check on attachment")
assert.match(view, /\{onOpenSheet && displayContent\.trim\(\) \? \(/, "Any completed text answer can open the answer sheet")
assert.match(view, /Лист \/ PDF/, "Answer sheet discoverable from toolbar")
const sheet = readFileSync(new URL("../components/sovereign/answer-sheet/AnswerSheet.tsx", import.meta.url), "utf8")
assert.match(sheet, /onClick=\{printPdf\}/, "Answer sheet has real browser print-to-PDF")
console.log("PASS chat V7: RU/KK/EN, code/math/how-to, attachment context, researched fact-check, Markdown and PDF entry points")
