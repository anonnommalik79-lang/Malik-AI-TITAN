import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { auditTwoContinuumMass, rawStateMemoryBytes, petroleumProxyPhysicsInstruction } from "../lib/work/petroleum/pinn-physics.ts"
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

// Scientific phase conservation must close for oil and water separately, and
// must detect opposite local residuals even when they cancel globally.
const makeMass = (changes = {}) => ({
  matrix: { deltaStorageKg: -50, injectionKg: 100, productionKg: 100, boundaryInKg: 0, boundaryOutKg: 0, ...changes.matrix },
  fracture: { deltaStorageKg: 50, injectionKg: 0, productionKg: 0, boundaryInKg: 0, boundaryOutKg: 0, ...changes.fracture },
  matrixToFractureKg: 50,
})
const balanced = { oil: makeMass(), water: makeMass() }
const audit = auditTwoContinuumMass(balanced)
assert.equal(audit.ok, true)
assert.deepEqual(audit.phases.map(p => p.globalResidualKg), [0, 0])
const localMismatch = auditTwoContinuumMass({
  oil: makeMass({ matrix: { deltaStorageKg: -45 }, fracture: { deltaStorageKg: 45 } }),
  water: makeMass(),
})
assert.equal(localMismatch.ok, false)
assert.equal(localMismatch.phases[0].globalConservation, true)
assert.equal(localMismatch.phases[0].localConservation, false)
const globalMismatch = auditTwoContinuumMass({ oil: makeMass({ fracture: { deltaStorageKg: 55 } }), water: makeMass() })
assert.equal(globalMismatch.phases[0].globalConservation, false)
assert.throws(() => auditTwoContinuumMass({ oil: makeMass({ matrix: { productionKg: -1 } }), water: makeMass() }), RangeError)
assert.throws(() => auditTwoContinuumMass({ oil: makeMass(), water: makeMass(), relativeTolerance: -1 }), RangeError)
assert.equal(rawStateMemoryBytes(10_000_000, 4, 4), 160_000_000)
assert.throws(() => rawStateMemoryBytes(0, 4, 4), RangeError)
assert.throws(() => rawStateMemoryBytes(10_000_000, 0, 4), RangeError)
const pinntask = "Спроектируй PINN и FNO модель карбонатного нефтяного пласта с 10^7 ячеек, 8x H100, 92% обводненности и polymer flood"
const physics = petroleumProxyPhysicsInstruction(pinntask)
assert.match(physics, /T_\{α,m\} = -T_\{α,f\}/)
assert.match(physics, /automatic differentiation does NOT guarantee/)
assert.match(physics, /160,000,000 bytes/)
assert.match(physics, /Temporal rollout cannot simply parallelize/)
assert.match(physics, /salinity compatibility/)
assert.match(physics, /DEMONSTRATED\/NOT DEMONSTRATED/)
assert.match(buildOilGasSkillInstruction(pinntask), /PETROLEUM AI PROXY/)
assert.equal(petroleumProxyPhysicsInstruction("объясни дебит скважины"), "")
const response = readFileSync("lib/ai/response-intelligence.ts", "utf8")
const models = readFileSync("lib/ai/malik-models.ts", "utf8")
const godRouter = readFileSync("lib/malik-god-router.ts", "utf8")
// Both selectable model paths must share the single oil intelligence contract.
assert.match(models, /id: "ling-3\.1-flash"/)
assert.match(models, /id: "malik-max"/)
assert.match(godRouter, /buildMalikResponseSystemPrompt\(/)
assert.match(godRouter, /petroleumKnowledgeInstruction\(\)/)

const stream = readFileSync("app/api/stream/route-impl.ts", "utf8")
assert.match(response, /buildOilGasSkillInstruction\(input\.prompt\)/)
assert.match(stream, /buildOilGasSkillInstruction\(coderPrompt\(body\)\)/)
assert.match(stream, /buildOilGasSkillInstruction\(coderInput\)/)
console.log("MALIK OIL & GAS skill: PASS")
