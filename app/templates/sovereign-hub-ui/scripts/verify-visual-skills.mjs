// Visual answer skills: each contract is checked on the real pipeline code.
// Deterministic, no network, no model calls, no credits.
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { workTestLoader } from "./work-test-loader.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const load = workTestLoader({})
const skills = load("lib/ai/visual-answer-skills.ts")
const catalog = load("lib/media/reference-catalog.ts")

const ids = skills.VISUAL_ANSWER_SKILLS.map((skill) => skill.id)
assert.deepEqual(ids, ["visual-intent", "reference-photo-search", "source-verification", "inline-photo-rendering", "visual-context-memory", "mobile-visual-layout", "visual-performance-recovery"])
for (const skill of skills.VISUAL_ANSWER_SKILLS) {
  assert(skill.contract.length > 40, skill.id + " states its contract")
  for (const ref of skill.implementedBy) {
    const [file, symbol] = ref.split("#")
    assert(existsSync(path.join(root, file)), `${skill.id}: ${file} exists`)
    if (symbol) assert(readFileSync(path.join(root, file), "utf8").includes(symbol), `${skill.id}: ${ref} is real code`)
  }
}
console.log("PASS 7 visual skills, each bound to real code")

const none = ["Привет", "Спасибо!", "Напиши функцию на Python для сортировки", "Исправь ошибку React: Cannot read properties of undefined", "Расскажи про Сатурн, только текст без фото", "Реши уравнение 2x + 5 = 11", "Сделай чек-лист переезда"]
for (const question of none) assert.deepEqual(skills.selectVisualSkills({ question }).skills, [], "no photo skills for: " + question)
assert.deepEqual(skills.selectVisualSkills({ question: "Расскажи про Сатурн", hasAttachment: true }).skills, [], "an uploaded image is analysed, not illustrated")
const visual = ["Расскажи про Сатурн", "Покажи красивые места Алматы", "Кто такой Илон Маск", "Сравни iPhone 15 Pro и iPhone 16 Pro"]
for (const question of visual) {
  const selected = skills.selectVisualSkills({ question })
  assert(selected.skills.includes("visual-intent") && selected.skills.includes("inline-photo-rendering"), "photos for: " + question)
  assert(!selected.skills.includes("visual-context-memory"), "no history needed for a standalone question")
}
console.log("PASS visual intent: photos for subjects, none for greetings, code, errors, maths, checklists, uploads and «только текст»")

const followUp = skills.selectVisualSkills({ question: "покажи их фото", previousQuestion: "Расскажи про Медеу и Шымбулак" })
assert(followUp.skills.includes("visual-context-memory"), "a follow-up uses the dialog context")
console.log("PASS visual context memory for follow-ups")

assert.equal(catalog.isSafeVisualUrl("http://upload.wikimedia.org/a.jpg"), false)
assert.equal(catalog.isSafeVisualUrl("data:image/png;base64,AAAA"), false)
assert.equal(catalog.isSafeVisualUrl("javascript:alert(1)"), false)
console.log("PASS source verification refuses non-HTTPS, data and script URLs")
