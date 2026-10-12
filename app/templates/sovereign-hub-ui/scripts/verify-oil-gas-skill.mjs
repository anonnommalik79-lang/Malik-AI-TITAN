import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  PETROLEUM_BARREL_M3, isOilGasRequest, buildOilGasSkillInstruction,
  convertOilVolume, apiGravity, specificGravity,
} from "../lib/ai/oil-gas-skill.ts"

assert.equal(PETROLEUM_BARREL_M3, 0.158987294928)
assert.equal(convertOilVolume(1000, "bbl", "m3"), 158.987294928)
assert.ok(Math.abs(convertOilVolume(158.987294928, "m3", "bbl") - 1000) < 1e-8)
assert.ok(Math.abs(convertOilVolume(500, "bbl/day", "m3/day") - 79.493647464) < 1e-9)
assert.throws(() => convertOilVolume(5, "bbl/day", "m3"))
assert.throws(() => convertOilVolume(-1, "bbl", "m3"))
assert.throws(() => convertOilVolume(Number.NaN, "bbl", "m3"))
assert.ok(Math.abs(apiGravity(0.85) - 34.9705882353) < 1e-7)
assert.ok(Math.abs(specificGravity(apiGravity(0.85)) - 0.85) < 1e-12)
assert.throws(() => apiGravity(0))
assert.throws(() => specificGravity(-132))
for (const input of ["добыча нефти на Тенгизе", "расчёт дебита скважины", "Қазақ мұнай кен орны", "crude oil reservoir", "well control drilling rig"]) {
  assert.equal(isOilGasRequest(input), true, input)
}
for (const input of ["как приготовить обед", "oil painting", "расскажи про автомобиль", "помоги написать HTML", "газовая плита дома"]) {
  assert.equal(isOilGasRequest(input), false, input)
  assert.equal(buildOilGasSkillInstruction(input), "")
}
assert.match(buildOilGasSkillInstruction("Переведи 1000 баррелей нефти в м³"), /158\.98729493 m3/)
assert.match(buildOilGasSkillInstruction("crude oil SG=0.85; what is API gravity?"), /34\.9706 °API/)
assert.match(buildOilGasSkillInstruction("добыча нефти"), /H2S/)
assert.match(buildOilGasSkillInstruction("oil field design"), /SPE-PRMS/)
assert.doesNotMatch(buildOilGasSkillInstruction("добыча нефти"), /VERIFIED PETROLEUM VOLUME/)

for (const [prompt, expected] of [
  ["Интерпретируй сейсмический разрез нефтяной структуры", "GEOPHYSICS"],
  ["Проанализируй каротаж нефтяной скважины", "PETROPHYSICS"],
  ["Рассчитай PVT для нефти", "PVT/FLUIDS"],
  ["Интерпретируй well test газовой скважины", "WELL TEST"],
  ["Оптимизируй бурение нефтяной скважины", "DRILLING"],
  ["Исследуй waterflood нефтяного пласта", "EOR/INJECTION"],
  ["Проверь коррозию нефтепровода", "PIPELINE/INTEGRITY"],
  ["Рассчитай NPV нефтяного проекта", "ECONOMICS"],
]) assert.ok(buildOilGasSkillInstruction(prompt).includes(expected), prompt)

const response = readFileSync("lib/ai/response-intelligence.ts", "utf8")
const stream = readFileSync("app/api/stream/route-impl.ts", "utf8")
assert.match(response, /buildOilGasSkillInstruction\(input\.prompt\)/)
assert.match(stream, /buildOilGasSkillInstruction\(coderPrompt\(body\)\)/)
assert.match(stream, /buildOilGasSkillInstruction\(coderInput\)/)
console.log("MALIK OIL & GAS skill: PASS")
