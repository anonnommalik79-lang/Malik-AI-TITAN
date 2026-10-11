// Executes production modules with gold fixtures. NOT a benchmark of live models.
import assert from "node:assert/strict"
import fs from "node:fs"
import { performance } from "node:perf_hooks"
import { checkAccuracy, finalizeAccuracy, deterministicGivens, classifyClaim, needsAccuracyGate } from "../lib/ai/accuracy/engine.ts"
import { decimal, evaluateExact, exactText, rounded, convertExact } from "../lib/ai/accuracy/exact.ts"
import { compound, annuityPayment, netPresentValue, percentChange } from "../lib/ai/accuracy/finance.ts"
import { accuracyTokenGate } from "../lib/ai/accuracy/stream.ts"
import { isExplicitImageGenerationRequest, isExplicitImageEditRequest, isTextOnlyMediaDiscussion } from "../lib/ai/image-intent.ts"
import { markdownTableCells } from "../lib/ai/markdown-table.ts"
import { canParseLatex } from "../lib/ai/latex-safety.ts"
import { detectTask } from "../lib/ai/detect-task.ts"
import { analyzeMalikBrainV1 } from "../lib/ai/brain-v1.ts"
import { truthNeedsLiveEvidence, finalizeTruthAnswer } from "../lib/ai/truth-engine.ts"
import { auditAnswerFacts, describeUncheckedAnswer } from "../lib/ai/fact-audit.ts"

let checks = 0, failures = 0, detected = 0, corrected = 0, falseWarnings = 0
const times = []
function test(name, run) {
  try { run(); checks++; console.log(`PASS ${name}`) }
  catch (error) { checks++; failures++; console.error(`FAIL ${name}: ${error.message}`) }
}
const fix = (answer, question = "") => finalizeAccuracy(answer, question)
const repaired = [
  ["decimal addition", "0.1 + 0.2 = 0.4", "0.1 + 0.2 = 0.3"],
  ["cents below old tolerance", "1.05 - 0.1 = 0.96", "1.05 - 0.1 = 0.95"],
  ["negative result", "3 - 7 = 5", "3 - 7 = -4"],
  ["negative input", "-2 + 5 = 8", "-2 + 5 = 3"],
  ["precedence", "2 + 3 × 4 = 20", "2 + 3 × 4 = 14"],
  ["parentheses", "(2 + 3) × 4 = 14", "(2 + 3) × 4 = 20"],
  ["exact percentage", "45 000 000 × 3% = 900 000", "45 000 000 × 3% = 1350000"],
  ["decimal percentage", "250.50 × 2.5% = 6.27", "250.50 × 2.5% = 6.2625"],
  ["compound growth", "1000 × (1 + 5%)^2 = 1200", "1000 × (1 + 5%)^2 = 1102.5"],
  ["large beyond safe integer", "9007199254740993 + 1 = 9007199254740993", "9007199254740993 + 1 = 9007199254740994"],
  ["comma decimals", "0,1 + 0,2 = 0,4", "0,1 + 0,2 = 0.3"],
  ["exact division", "1 / 3 = 0.33", "1 / 3 = 1/3"],
  ["rounded division", "1 / 3 ≈ 0.34", "1 / 3 ≈ 0.33"],
  ["speed SI", "90 км/ч = 20 м/с", "90 км/ч = 25 м/с"],
  ["length conversion", "2.5 км = 250 м", "2.5 км = 2500 м"],
  ["mass conversion", "0.3 кг = 30 г", "0.3 кг = 300 г"],
  ["time conversion", "2 ч = 120 с", "2 ч = 7200 с"],
  ["volume conversion", "1.5 л = 150 мл", "1.5 л = 1500 мл"],
  ["net salary arithmetic", "250000 - 25000 - 5000 - 9025 = 198000", "250000 - 25000 - 5000 - 9025 = 210975"],
  ["pure answer aligned with prompt", "Ответ: 7", "Ответ: 391", "Реши 17 * 23"],
  ["boxes/train representative", "Всего мячей: 18", "Всего мячей: 12", "В поезде 3 коробки, в каждой 4 мяча. Сколько всего мячей?"],
  ["financial MAU summary", "Платящие пользователи: 3000\nВыручка: 60000 USD", "Платящие пользователи: 200\nВыручка: 4000 USD", "MAU: 10000; Конверсия: 2%; ARPPU: 20 USD"],
  ["math in a Markdown bullet", "- 2 + 2 = 5", "- 2 + 2 = 4"],
  ["math in an ordered Markdown step", "1. 2 + 2 = 5", "1. 2 + 2 = 4"],
  ["math in a star Markdown bullet", "* 2 + 2 = 5", "* 2 + 2 = 4"],
]
for (const [label, answer, expected, question = ""] of repaired) test(label, () => {
  const result = fix(answer, question)
  if (result.report.issues.length) detected++
  if (result.content === expected) corrected++
  assert.equal(result.content, expected)
  assert.ok(result.report.issues.length)
  assert.equal(fix(result.content, question).content, result.content, "bounded repair must be idempotent")
  assert.equal(result.report.repairCalls, 0)
})
const clean = [
  "0.1 + 0.2 = 0.3", "1 / 3 ≈ 0.33", "2 + 3 × 4 = 14", "-2 + 5 = 3", "5 × 20% = 1",
  "90 км/ч = 25 м/с", "2.5 км = 2500 м", "1.5 л = 1500 мл", "17 * 23 = 391", "1 000.50 - 0.50 = 1000",
  "x + 2 = 5", "Версия Next.js 15.2", "Дата: 11/10/2026", "Отчёт: https://example.org/2+2=5",
  "Пример: `2+2=5`", "Цитата: «2+2=5»", "```python\nvalue = 2 + 2 == 5\n```", "~~~js\nx = 2 + 2 == 5\n~~~",
  "На руки: 198000 ₸ (без вычета)\nНа руки: 210975 ₸ (с вычетом)", "Привет! Чем могу помочь?",
  "- 2 + 2 = 4", "- -2 + 5 = 3", "1. 2 + 2 = 4", "* 2 + 2 = 4",
]
for (const [index, answer] of clean.entries()) test(`clean / no false warning ${index + 1}`, () => {
  const result = fix(answer)
  if (result.report.issues.length) falseWarnings++
  assert.equal(result.content, answer)
  assert.equal(result.report.issues.length, 0)
})
test("financial table corrections share one dependency graph", () => {
  const result = fix("| MAU | Конверсия | Платящие | ARPPU | MRR |\n| --- | --- | --- | --- | --- |\n| 10000 | 2% | 3000 | 20 | 60000 |")
  assert.match(result.content, /10000 \| 2% \| 200 \| 20 \| 4000/)
  assert.equal(result.report.issues.filter(i => i.code === "financial").length, 2)
})
test("ARPU is per active user, not per paying user", () => {
  assert.match(fix("Выручка: 60000", "MAU: 10000; Конверсия: 2%; ARPU: 20").content, /200000/)
})
test("financial compact scale is removed after exact replacement", () => {
  assert.equal(fix("Выручка: 60k USD", "MAU: 10000; Конверсия: 2%; ARPPU: 20 USD").content.trim(), "Выручка: 4000 USD")
})
test("table inputs reconcile the conclusion even before the table", () => {
  const result = fix("Выручка: 60000 USD\n| MAU | Конверсия | Платящие | ARPPU | MRR |\n| --- | --- | --- | --- | --- |\n| 10000 | 2% | 3000 | 20 USD | 60000 USD |")
  assert.match(result.content, /^Выручка: 4000 USD/)
  assert.match(result.content, /10000 \| 2% \| 200 \| 20 USD \| 4000 USD/)
})
test("different table profiles never overwrite an ambiguous conclusion", () => {
  const text = "Выручка: 16000\n| MAU | Конверсия | ARPPU | MRR |\n| --- | --- | --- | --- |\n| 10000 | 2% | 20 | 4000 |\n| 20000 | 3% | 20 | 12000 |"
  assert.equal(fix(text).content, text)
})
test("inline code in another column does not bypass financial checking", () => {
  const text = "| MAU | Конверсия | ARPPU | MRR | Код |\n| --- | --- | --- | --- | --- |\n| 10000 | 2% | 20 | 60000 | `a|b` |"
  const result = fix(text)
  assert.match(result.content, /10000 \| 2% \| 20 \| 4000 \| `a\|b`/)
})
test("fractional conversion has no implicit percent scaling", () => {
  assert.equal(deterministicGivens("MAU: 10000; Конверсия: 0.02; ARPPU: 20")[0].value, "200")
})
test("forecast rows may have different periods and inputs", () => {
  const result = fix("| Месяц | MAU | Конверсия | Платящие | ARPPU | MRR |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 10000 | 2% | 200 | 20 | 4000 |\n| 2 | 20000 | 3% | 600 | 20 | 12000 |")
  assert.equal(result.report.issues.length, 0)
})
test("explicit forecast assumption is not overwritten with present input", () => {
  assert.equal(fix("Прогноз выручки: 60000", "MAU: 10000; Конверсия: 2%; ARPPU: 20").content, "Прогноз выручки: 60000")
})
test("ambiguous input is not guessed", () => {
  assert.equal(deterministicGivens("MAU: 10000; MAU: 20000; Конверсия: 2%; ARPPU: 20").length, 0)
})
test("train word problem dimensional receipt", () => {
  const receipt = deterministicGivens("Поезд едет с постоянной скоростью 60 км/ч. Какое расстояние проедет за 3 часа?")
  assert.equal(receipt[0].value, "180000")
})
test("train conclusion is reconciled in its reported length unit", () => {
  assert.equal(fix("Расстояние: 18 км", "Поезд едет 60 км/ч. Какое расстояние проедет за 3 часа?").content, "Расстояние: 180 км (при постоянной скорости).")
})
test("train rational distance is not rounded through decimal conversion", () => {
  assert.equal(fix("Расстояние: 1 м", "Поезд 1 км/ч. Какое расстояние за 1 секунду?").content, "Расстояние: 5/18 м (при постоянной скорости).")
})
test("boxes movement is not guessed by a count parser", () => {
  assert.equal(deterministicGivens("В поезде 3 коробки, в каждой 4 мяча. Достал 2. Сколько всего мячей?").length, 0)
})
test("changing-speed train is not claimed deterministic", () => {
  assert.equal(deterministicGivens("Поезд 60 км/ч, тормозит. Какое расстояние за 3 часа?").length, 0)
})
test("exact compound calculator", () => { assert.equal(exactText(compound("1000", "0.05", 2)), "1102.5") })
test("zero-interest annuity", () => { assert.equal(rounded(annuityPayment("1200", "0", 12)), "100.00") })
test("annuity with explicit monthly rate", () => { assert.equal(rounded(annuityPayment("100000", "0.01", 12)), "8884.88") })
test("NPV exact discounting", () => { assert.equal(rounded(netPresentValue(["-1000", "550", "605"], "0.1")), "0.00") })
test("percent change", () => { assert.equal(exactText(percentChange("80", "100")), "25") })
test("division by zero cannot be a finite calculation", () => { assert.equal(evaluateExact("10/0"), null); assert.throws(() => percentChange("0", "100")) })
test("zero division is withheld, not sent as a finite draft", () => {
  assert.match(fix("10 / (2-2) = 5").content, /не определено: деление на ноль/)
  assert.doesNotMatch(fix("10 / (2-2) = 5").content, /= 5/)
})
test("unary minus follows mathematical exponent precedence", () => {
  assert.equal(exactText(evaluateExact("-2^2")), "-4")
  assert.equal(exactText(evaluateExact("(-2)^2")), "4")
  assert.equal(exactText(evaluateExact("2 * -3")), "-6")
})
test("unsupported precision and huge numeric claims cannot throw", () => {
  const huge = "9".repeat(80)
  assert.doesNotThrow(() => fix(`1 м = ${huge} см`))
  assert.doesNotThrow(() => fix(`Ответ: ${huge}`, "Реши 2+2"))
  assert.doesNotThrow(() => deterministicGivens(`Аннуитет. Сумма: 100; ставка за период: ${huge}%; периоды: 12`))
})
test("ambiguous comma locale is not silently treated as a decimal", () => {
  assert.equal(evaluateExact("1,000 + 2"), null)
  assert.equal(fix("1,000 + 2 = 1002").content, "1,000 + 2 = 1002")
  assert.equal(exactText(evaluateExact("0,125 + 1,25")), "1.375")
})
test("money rounding half away from zero", () => { assert.equal(rounded(decimal("-1.005")), "-1.01") })
test("currency has no implicit FX conversion", () => { assert.equal(convertExact("100", "USD", "KZT"), null) })
test("financial currency mismatch withheld instead of inventing FX", () => {
  const result = fix("Выручка: 60000 EUR", "MAU: 10000; Конверсия: 2%; ARPPU: 20 USD")
  assert.doesNotMatch(result.content, /60000|4000/)
  assert.match(result.content, /курс/)
})
test("different unit dimensions cannot be published as equal", () => {
  assert.match(fix("2 кг = 200 см").content, /разные физические величины/)
})
test("recognized annuity is used in actual preflight and final check", () => {
  const prompt = "Аннуитет. Сумма: 100000; ставка за период: 1%; периоды: 12"
  assert.equal(deterministicGivens(prompt)[0].value, "8884.88")
  assert.equal(fix("Платёж за период: 9000", prompt).content, "Платёж за период: 8884.88")
})
test("unit dimensions cannot be mixed", () => { assert.equal(convertExact("100", "kg", "m"), null) })
test("no executable expression injection", () => {
  for (const input of ["process.exit()", "globalThis.fetch('x')", "2;while(true){}", "2**999999", "1e999", "2^9999"]) assert.equal(evaluateExact(input), null)
})
test("bounded arithmetic depth/input", () => {
  assert.equal(evaluateExact("(".repeat(100) + "1" + ")".repeat(100)), null)
  assert.equal(evaluateExact("1+".repeat(1000) + "1"), null)
  assert.throws(() => compound("1", "0.1", 100000))
})
test("unicorn scientific explanation suppresses unsupported precision", () => {
  const result = fix("Единорогу необходимо ровно 12.734 м² крыла и 2301.8 Вт мощности.", "Научно объясни полёт единорога без генерации изображения")
  assert.equal(result.report.issues[0].code, "scientific-precision")
  assert.doesNotMatch(result.content, /12.734|2301.8/)
})
test("scientific assumption stays labelled", () => {
  const result = fix("Предположим массу 300 кг. Это гипотетическая модель.", "Объясни полёт единорога")
  assert.equal(result.report.issues.length, 0)
  assert.equal(result.report.claims[0].origin, "assumption")
})
test("scientific supplied values do not need a web citation", () => {
  assert.equal(fix("Дано: масса 300 кг.", "Физика: масса 300 кг").report.issues.length, 0)
})
test("scientific sourced number requires existing citation and matching snippet", () => {
  const result = finalizeAccuracy("Скорость потока 12.5 м/с [1].", "Научное объяснение полёта", [{ url: "https://example.org", snippet: "Скорость потока 12.5 м/с" }])
  assert.equal(result.report.issues.length, 0)
  assert.equal(result.report.claims[0].evidence, "source-number-match")
})
test("bad scientific citation does not prove a number", () => {
  assert.equal(finalizeAccuracy("Скорость 12.5 м/с [9].", "Научное объяснение", [{ snippet: "12.5 м/с" }]).report.issues[0].code, "scientific-precision")
})
test("mentioning a formula is not quantitative scientific proof", () => {
  assert.doesNotMatch(fix("По формуле единорогу требуется 2317 Вт.", "Научно объясни полёт единорога").content, /2317/)
})
test("a user mass cannot justify an invented wing area with same number", () => {
  assert.doesNotMatch(fix("Дано: площадь крыла 300 м².", "Физика полёта: масса 300 кг").content, /300/)
})
for (const [label, text] of [
  ["scientific unicorn", "Научно объясни, как летает единорог, без генерации изображения"],
  ["negated creation", "Не генерируй фото единорога"],
  ["quoted creation", "Оцени фразу «создай фото единорога»"],
  ["code instead of image", "Создай код для генерации фото"],
  ["description instead of image", "Напиши описание: сгенерируй фото единорога"],
  ["EN explanation", "Explain how to create an image of a unicorn"],
  ["KK explanation", "Ұшатын бірмүйізді түсіндір, суретсіз"],
  ["media tool comparison", "Сравни модели для генерации фото"],
  ["media capabilities", "Какие модели генерируют изображения?"],
  ["EN tool comparison", "Compare tools that create an image"],
  ["EN capabilities", "Can this model generate images?"],
  ["negative infinitive", "Не нужно генерировать фото, объясни физику"],
]) test(`text route: ${label}`, () => { assert.equal(isExplicitImageGenerationRequest(text), false) })
test("shared provider/task/brain routers cannot turn scientific explanation into media", () => {
  for (const prompt of ["Научно объясни полёт единорога, не генерируй фото", "Объясни как создать видео", "Create code for video generation", "Обоснуй физику единорога без генерации изображения"]) {
    assert.ok(!["image", "video"].includes(detectTask(prompt).task))
    assert.ok(!["image", "video"].includes(analyzeMalikBrainV1({ prompt }).task))
  }
})
for (const text of ["Сгенерируй фото единорога", "Нарисуй иллюстрацию полёта", "Create an image of a unicorn", "Сгененируй фото кота"]) test(`media consent preserved: ${text}`, () => { assert.equal(isExplicitImageGenerationRequest(text), true) })
test("discussion stays text even with selected video mode", () => { assert.equal(isTextOnlyMediaDiscussion("Объясни создание видео, только текст"), true) })
test("quoted lettering remains an authorized uploaded image edit", () => { assert.equal(isExplicitImageEditRequest("Напиши на фото «С днём рождения!»", true), true) })
test("claim classes stay distinct", () => {
  assert.equal(classifyClaim("Дано: 10000 пользователей", ""), "user-data")
  assert.equal(classifyClaim("2 × 3 = 6", ""), "calculation")
  assert.equal(classifyClaim("Предположим 5%", ""), "assumption")
  assert.equal(classifyClaim("Прогноз: 50000", ""), "forecast")
  assert.equal(classifyClaim("Население: 1000000", ""), "external-fact")
})
test("user-rate loan calculation does not force internet", () => { assert.equal(truthNeedsLiveEvidence("Рассчитай кредит 100000 при ставке 12%"), false) })
test("current legal rate still requires evidence", () => { assert.equal(truthNeedsLiveEvidence("Какая действующая налоговая ставка?"), true) })
test("corrected math is not a missing web fact", () => {
  const content = "5000 × 20% = 1000"
  assert.equal(auditAnswerFacts({ answer: content, sources: [{ snippet: "Внешний факт 42%" }], computedLines: [content] }), null)
  assert.equal(describeUncheckedAnswer({ answer: content, computedLines: [content] }), null)
})
test("external fact alongside calculation still checked", () => {
  const content = "5000 × 20% = 1000\nНаселение 9000000 [1]"
  assert.equal(auditAnswerFacts({ answer: content, sources: [{ snippet: "Население 8000000" }], computedLines: [content.split("\n")[0]] }).missing, 1)
})
test("assumptions and forecasts do not demand external citations", () => {
  assert.equal(auditAnswerFacts({ answer: "Предположим 42% конверсии.\nПрогноз: 50000 пользователей", sources: [{ snippet: "Нет чисел" }] }), null)
})
test("no erroneous draft published by truth finalizer", () => {
  assert.equal(finalizeTruthAnswer("2 + 2 = 5", "Посчитай 2+2", []), "2 + 2 = 4")
  assert.doesNotMatch(finalizeTruthAnswer("На руки: 208250 ₸\nНа руки: 198000 ₸", "Налоги Казахстана", []), /208250|198000|Непроверенный черновик/)
})
test("numeric chunks cannot bypass final verification", () => { assert.equal(accuracyTokenGate("Посчитай 0.1+0.2", () => assert.fail()), undefined) })
test("ordinary text still streams until a surprise number", () => {
  let output = ""; const emit = accuracyTokenGate("Привет", chunk => { output += chunk })
  emit("Здравствуйте! "); emit("Итого 2+2=5"); emit("wrong tail")
  assert.equal(output, "Здравствуйте! Итого ")
})
test("code streaming preserved", () => {
  let output = ""; const emit = accuracyTokenGate("Напиши React компонент", chunk => { output += chunk })
  emit("```jsx\nconst x = 10;\n```"); assert.match(output, /10/)
})
test("code with version numbers still streams", () => {
  let output = ""; const emit = accuracyTokenGate("Напиши React 19 компонент", chunk => { output += chunk })
  assert.ok(emit); emit("const x = 19;"); assert.equal(output, "const x = 19;")
})
test("forecast/science/logic without digits gated", () => {
  for (const prompt of ["Финансовый прогноз MAU и конверсии", "Научно объясни полёт единорога", "Логическая задача с коробками"]) assert.equal(needsAccuracyGate(prompt), true)
})
test("table escaped/code/math pipes preserve columns", () => {
  assert.deepEqual(markdownTableCells("| A\\|B | `x|y` | $|x|$ | \\( |x| \\) |"), ["A\\|B", "`x|y`", "$|x|$", "\\( |x| \\)"])
})
test("unpaired currency does not consume columns", () => { assert.deepEqual(markdownTableCells("| $5 | amount |"), ["$5", "amount"]) })
test("LaTex parser hostile depth/size/commands bounded", () => {
  assert.equal(canParseLatex("\\frac{1}{2}"), true)
  assert.equal(canParseLatex("{".repeat(100) + "1" + "}".repeat(100)), false)
  assert.equal(canParseLatex("x".repeat(5000)), false)
  assert.equal(canParseLatex("\\sqrt ".repeat(200)), false)
})
test("verification size and issue caps are explicit", () => {
  assert.equal(checkAccuracy("2+2=5\n".repeat(1000), "").report.status, "limited")
  const result = fix("2+2=5\n".repeat(1000))
  assert.equal(result.report.status, "limited")
  assert.ok(result.report.issues.length <= 32)
  assert.ok(result.report.scannedCharacters <= 60000)
})
test("over-limit tail is retained intact and marked unverified", () => {
  const tail = "x".repeat(70000)
  const result = fix("2+2=5\n" + tail)
  assert.equal(result.content, "2+2 = 4\n" + tail)
  assert.equal(result.report.status, "limited")
})
for (let i = 0; i < 120; i++) {
  const start = performance.now()
  fix(repaired.map(row => row[1]).join("\n"))
  times.push(performance.now() - start)
}
times.sort((a, b) => a - b)
const report = {
  kind: "deterministic-gold-fixtures-not-live-models", cases: checks, passed: checks - failures, failed: failures,
  repairCases: repaired.length, detectedContradictions: detected, repairedContradictions: corrected,
  repairAccuracyPercent: 100 * corrected / repaired.length, detectionPercent: 100 * detected / repaired.length,
  cleanCases: clean.length, falseWarnings, falseWarningPercent: 100 * falseWarnings / clean.length,
  verificationMs: { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)] },
  additionalModelCalls: 0, additionalModelTokens: 0, verificationProviderCostUSD: 0,
  processMemoryMB: { heapUsed: process.memoryUsage().heapUsed / 1024 / 1024, rss: process.memoryUsage().rss / 1024 / 1024 },
  limits: "recognized arithmetic/units/labelled MAU graph only; source number matches are not semantic entailment; live answer quality/cost/latency not measured",
}
console.log(JSON.stringify(report, null, 2))
if (process.env.MALIK_ACCURACY_REPORT) fs.writeFileSync(process.env.MALIK_ACCURACY_REPORT, JSON.stringify(report, null, 2) + "\n")
if (failures) process.exitCode = 1
