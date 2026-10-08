import { auditExtendedArithmetic, auditHeadlineConsistency, checkPrimaryEvidence } from "../lib/ai/truth-engine-v2.ts"
import assert from "node:assert/strict"
import { truthNeedsLiveEvidence, officialTruthQuery, truthSystemInstruction, auditTruthArithmetic, finalizeTruthAnswer } from "../lib/ai/truth-engine.ts"

const prompt = "Проведи аудит по НК РК 2026: рассчитай зарплату 250 000 тенге, КПН и социальный налог ТОО на упрощенке"
assert.equal(truthNeedsLiveEvidence(prompt), true)
assert.match(officialTruthQuery(prompt), /2026/)
assert.match(officialTruthQuery(prompt), /kgd\.gov\.kz/)
assert.equal(truthNeedsLiveEvidence("Привет!"), false)
assert.equal(truthNeedsLiveEvidence("Сделай красивую открытку"), false)
assert.match(truthSystemInstruction(prompt, false), /No verified current official sources/)
assert.deepEqual(auditTruthArithmetic("45 000 000 × 3% = 1 350 000 тенге"), [])
assert.equal(auditTruthArithmetic("45 000 000 × 3% = 900 000 тенге").length, 1)
assert.match(finalizeTruthAnswer("45 000 000 × 3% = 900 000", prompt, 1), /согласованности не пройдена/)
assert.match(finalizeTruthAnswer("Итого 1 350 000 тенге.", prompt, 0), /первоисточники не получены/)
assert.equal(finalizeTruthAnswer("Привет", "Привет", 0), "Привет")

const rules = [
  ["45 000 000 × 3% = 1 350 000 тенге", false],
  ["4 × 250 000 × 6 = 6 000 000", false],
  ["250 000 - 25 000 - 5 000 - 9 025 = 210 975", false],
  ["1 350 000 × 2 / 3 = 900 000", false],
  ["45 000 000 × 3% = 900 000", true],
  ["45 000 000 × 0.03 = 900 000", true],
  ["250 000 - 25 000 - 5 000 - 9 025 = 198 000", true],
]
for (const [sample, wrong] of rules) {
  assert.equal(auditExtendedArithmetic(sample).length > 0, wrong, "Unexpected math judgement: " + sample)
}
assert.deepEqual(auditExtendedArithmetic("Код:\n" + ["\x60\x60\x60python", "x = 500 * 3 / 0", "\x60\x60\x60"].join("\n")), [])
assert.equal(auditHeadlineConsistency("На руки: 208 250 ₸\nНа руки: 198 000 ₸").length, 1)
assert.equal(auditHeadlineConsistency("Общие расходы работодателя: 283 750 ₸\nОбщие расходы работодателя: 288 180 ₸").length, 1)
assert.deepEqual(auditHeadlineConsistency("На руки: 198 000 ₸ (без вычета)\nНа руки: 210 975 ₸ (с вычетом)"), [])
const tax = "Проведи аудит налогов ТОО в Казахстане за 2026 год"
const official = [{ url: "https://kgd.gov.kz/ru", title: "КГД" }]
const fake = [{ url: "https://kgd.gov.kz.evil.example/ru", title: "Не КГД" }]
assert.deepEqual(checkPrimaryEvidence(tax, official), [])
assert.equal(checkPrimaryEvidence(tax, fake).length, 1)
assert.equal(checkPrimaryEvidence(tax, [{ url: "http://kgd.gov.kz/" }]).length, 1)
assert.equal(checkPrimaryEvidence(tax, [{ url: "https://business-news.example/2026" }]).length, 1)
assert.match(finalizeTruthAnswer("КПН: 1 350 000 ₸", tax, fake), /проверку авторитетности/)
assert.equal(finalizeTruthAnswer("КПН: 1 350 000 ₸", tax, official), "КПН: 1 350 000 ₸")
assert.match(finalizeTruthAnswer("250 000 - 25 000 - 5 000 - 9 025 = 198 000", tax, official), /согласованности не пройдена/)
assert.equal(finalizeTruthAnswer("Привет", "Привет", official), "Привет")

console.log("MALIK Truth Engine V1 + V2 PASS")
