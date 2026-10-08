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
assert.match(finalizeTruthAnswer("45 000 000 × 3% = 900 000", prompt, 1), /Проверка чисел не пройдена/)
assert.match(finalizeTruthAnswer("Итого 1 350 000 тенге.", prompt, 0), /первоисточники не получены/)
assert.equal(finalizeTruthAnswer("Привет", "Привет", 0), "Привет")
console.log("MALIK Truth Engine PASS")
