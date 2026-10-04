// Malik Work · math engine: real computation, verified, sandboxed.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/verify-work-math.mjs
import assert from "node:assert/strict"
import { runMath, mathVerified } from "../lib/work/math/engine.ts"
import { detectMathTask } from "../lib/work/math/intent.ts"
import { computeMathForMessage, mathEngineInstruction, mathReceiptText } from "../lib/work/math/skill.ts"

let passed = 0
const results = []
function test(name, fn) {
  try { fn(); passed += 1; results.push(`  ok  ${name}`) } catch (error) { results.push(`  FAIL ${name}\n       ${error.message}`) }
}
const ok = (task) => {
  const outcome = runMath(task)
  assert.equal(outcome.ok, true, outcome.ok ? "" : `${outcome.code}: ${outcome.error}`)
  return outcome
}
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(Number(a) - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`)

console.log("math engine")
test("exact big integers and a 64-digit second opinion", () => {
  const outcome = ok({ op: "evaluate", expression: "2^100" })
  assert.equal(outcome.answer, "1267650600228229401496703205376")
  assert.ok(mathVerified(outcome))
})
test("units and dimensions: 5 kg · 9.81 m/s² is 49.05 N", () => {
  const outcome = ok({ op: "evaluate", expression: "5 kg * 9.81 m/s^2", expectUnit: "N" })
  assert.equal(outcome.answer, "49.05 N")
  assert.ok(outcome.checks.some((check) => check.name === "Размерность" && check.ok))
})
test("unit conversion refuses different dimensions", () => {
  close(ok({ op: "convert", value: "100 km/h", to: "m/s" }).values[0].value.split(" ")[0], 27.7777777778, 1e-10)
  const wrong = runMath({ op: "convert", value: "5 kg", to: "m" })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.code, "DIMENSION")
})
test("quadratic: exact roots with the discriminant", () => {
  const outcome = ok({ op: "solve", equation: "x^2 - 5x + 3 = 0" })
  assert.deepEqual(outcome.values.map((value) => value.exact), ["5/2 − √13/2", "5/2 + √13/2"])
  assert.ok(outcome.steps.some((step) => step.includes("D = b² − 4ac = 13")))
  assert.ok(mathVerified(outcome))
})
test("complex roots are found and substituted back", () => {
  const outcome = ok({ op: "solve", equation: "x^2 + 2x + 5 = 0" })
  assert.match(outcome.answer, /Комплексные корни: −1 − 2i; −1 \+ 2i/)
  assert.ok(mathVerified(outcome))
})
test("cubic and quartic polynomials", () => {
  assert.equal(ok({ op: "solve", equation: "x^3 - 6x^2 + 11x - 6 = 0" }).answer, "x₁ = 1; x₂ = 2; x₃ = 3")
  assert.equal(ok({ op: "solve", equation: "x^4 - 5x^2 + 4 = 0" }).answer, "x₁ = -2; x₂ = -1; x₃ = 1; x₄ = 2")
})
test("an extraneous root is rejected (domain of the original equation)", () => {
  const outcome = ok({ op: "solve", equation: "(x-1)/(x-2) = 1/(x-2)" })
  assert.equal(outcome.answer, "Корней нет")
  assert.ok(outcome.notes.some((note) => note.includes("посторонние")))
})
test("transcendental equations numerically, with π recognised", () => {
  const outcome = ok({ op: "solve", equation: "sin(x) = 0.5" })
  assert.equal(outcome.values[0].exact, "π/6")
  assert.ok(outcome.notes.some((note) => note.includes("периодическое")))
  assert.equal(ok({ op: "solve", equation: "sqrt(x) = x - 2" }).answer, "x = 4")
})
test("an equation with parameters is refused honestly", () => {
  const outcome = runMath({ op: "solve", equation: "a x + b = 0" })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.code, "PARAMETERS")
})
test("linear systems: unique, none, many", () => {
  assert.equal(ok({ op: "system", equations: ["2x + 3y - z = 1", "x - y + 2z = 3", "3x + y + z = 4"] }).answer, "x = 1; y = 0; z = 1")
  assert.match(ok({ op: "system", equations: ["x + y = 1", "2x + 2y = 3"] }).answer, /несовместна/)
  assert.match(ok({ op: "system", equations: ["x + y = 1", "2x + 2y = 2"] }).answer, /Бесконечно много/)
})
test("non-linear system by Newton from a grid", () => {
  assert.equal(ok({ op: "system", equations: ["x^2 + y^2 = 25", "x + y = 7"] }).answer, "(x = 3, y = 4); (x = 4, y = 3)")
})
test("derivatives checked against finite differences", () => {
  const outcome = ok({ op: "derivative", expression: "x^3*sin(x)" })
  assert.equal(outcome.answer, "f′(x) = 3x^2·sin(x) + x^3·cos(x)")
  assert.ok(mathVerified(outcome))
  assert.match(ok({ op: "derivative", expression: "x^4", order: 2, at: 2 }).answer, /12x\^2; при x = 2: 48/)
})
test("integrals: exact for polynomials, two methods otherwise", () => {
  assert.equal(ok({ op: "integrate", expression: "x^2", from: "0", to: "1" }).answer, "1/3 ≈ 0.333333333333")
  const sine = ok({ op: "integrate", expression: "sin(x)", from: "0", to: "pi" })
  assert.equal(sine.answer, "2")
  assert.ok(sine.checks.some((check) => check.name === "Второй метод" && check.ok))
  assert.equal(ok({ op: "integrate", expression: "1/sqrt(x)", from: "0", to: "1" }).answer, "2")
  close(ok({ op: "integrate", expression: "exp(-x^2)", from: "-inf", to: "inf" }).values[0].value, Math.sqrt(Math.PI), 1e-10)
  assert.match(ok({ op: "integrate", expression: "1/(1+x^2)", from: "0", to: "1" }).answer, /^π\/4 ≈/)
  assert.equal(ok({ op: "integrate", expression: "3x^2 + 2x + 1" }).answer, "x^3 + x^2 + x + C")
})
test("divergent and singular integrals are not given a number", () => {
  assert.equal(runMath({ op: "integrate", expression: "1/x", from: "0", to: "1" }).code, "DIVERGES")
  assert.equal(runMath({ op: "integrate", expression: "1/x", from: "-1", to: "1" }).code, "SINGULAR")
})
test("simplification is checked for equivalence", () => {
  const outcome = ok({ op: "simplify", expression: "(x+1)^2 - x^2" })
  assert.equal(outcome.answer, "2x + 1")
  assert.ok(mathVerified(outcome))
})
test("sandbox: no import, property access, ranges, matrix builders or huge input", () => {
  for (const expression of ["import({}, {})", "createUnit('foo')", "a.b", "1:1e9", "ones(10000,10000)", "f(x) = x", "x = 5", '"text"', "evaluate('1')", "x".repeat(700)]) {
    const outcome = runMath({ op: "evaluate", expression })
    assert.equal(outcome.ok, false, expression)
  }
})

console.log("intent detection")
test("explicit requests in Russian become engine tasks", () => {
  const cases = [
    ["реши x² − 5x + 6 = 0", "solve"], ["решите систему: x + y = 5, x - y = 1", "system"], ["найди производную x^3*sin(x)", "derivative"],
    ["вторая производная x^4 в точке x = 2", "derivative"], ["вычисли интеграл от 0 до π sin x dx", "integrate"], ["∫_0^1 x^2 dx", "integrate"],
    ["переведи 100 км/ч в м/с", "convert"], ["сколько будет 5 км в милях", "convert"], ["сколько будет 17×23+5", "evaluate"],
    ["вычисли 5 кг * 9.81 м/с^2", "evaluate"], ["упрости (x+1)^2 - x^2", "simplify"], ["сколько будет 10!", "evaluate"],
  ]
  for (const [text, op] of cases) {
    const intent = detectMathTask(text)
    assert.equal(intent?.task.op, op, text)
    assert.equal(runMath(intent.task).ok, true, text)
  }
})
test("everything else stays with the model", () => {
  for (const text of ["сколько будет стоить доставка в Алматы", "Что значит e=mc^2?", "const x = a + b;", "1/2", "2024-10-05", "+7 701 123 45 67", "привет", "x = 5", "Какая производная у успеха?", "реши задачу: поезд едет 60 км/ч, сколько он проедет за 3 часа"]) {
    assert.equal(computeMathForMessage(text), null, text)
  }
})
test("the model gets program output and rules, the panel gets a receipt", () => {
  const receipt = computeMathForMessage("реши x^2 - 5x + 6 = 0")
  assert.ok(receipt?.outcome.ok)
  const instruction = mathEngineInstruction(receipt)
  assert.match(instruction, /\[MALIK_MATH_ENGINE\]/)
  assert.match(instruction, /RESULT: x₁ = 2; x₂ = 3/)
  assert.match(instruction, /never invent other tool runs/)
  assert.match(mathReceiptText(receipt), /✓ Подстановка/)
  const refused = computeMathForMessage("вычисли интеграл от 0 до 1 1/x dx")
  assert.equal(refused?.outcome.ok, false)
  assert.match(mathEngineInstruction(refused), /did not produce a result/)
})

console.log(results.join("\n"))
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
